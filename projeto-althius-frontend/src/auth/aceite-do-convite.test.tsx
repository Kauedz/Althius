import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const CARLA = { id: 'usuario-carla', email: 'carla@norte.com.br' }
/** Outra Conta de usuário do mesmo domínio, sem convite. */
const DIEGO = { id: 'usuario-diego', email: 'diego@norte.com.br' }
const PESSOAL_DA_CARLA = { id: 'ws-pessoal-carla', kind: 'pessoal', name: 'Carla Dias', owner_user_id: CARLA.id, created_at: '2026-09-27T12:00:00Z' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte', owner_user_id: null, created_at: '2026-09-01T12:00:00Z' }
const TOKEN = 'b'.repeat(64)

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** Uma recusa do banco, com o SQLSTATE e a mensagem que a função levanta. */
function recusa(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

/**
 * O banco com o convite da Carla para o Workspace Norte, como Membro. O bootstrap garante o Workspace pessoal dela; o
 * aceite cria a Participação no Norte. As regras do aceite (e-mail, estado, prazo) são do banco e têm pgTAP; aqui ele
 * só responde como a função responderia a cada caso.
 */
function bancoComConvite({ recusarAceite }: { recusarAceite?: { code: string; message: string } } = {}) {
  const participacoes: Record<string, unknown>[] = []
  const aceites: unknown[] = []
  const pessoalDeDiego = { ...PESSOAL_DA_CARLA, id: 'ws-pessoal-diego', name: 'Diego', owner_user_id: DIEGO.id }
  const tabelas = { workspace_memberships: participacoes, workspaces: [PESSOAL_DA_CARLA, pessoalDeDiego, NORTE] }
  /** A Conta de usuário da sessão, como o banco a lê em auth.uid(); ligada ao Supabase falso quando ele nasce. */
  const sessao = { usuarioId: async (): Promise<string | undefined> => CARLA.id }
  const rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {
    bootstrap_personal_workspace: async () => {
      const usuarioId = await sessao.usuarioId()
      const pessoal = usuarioId === DIEGO.id ? pessoalDeDiego : PESSOAL_DA_CARLA
      if (!participacoes.some((p) => p.workspace_id === pessoal.id)) {
        participacoes.push({ workspace_id: pessoal.id, user_id: usuarioId, role: 'admin', active: true })
      }
      return pessoal
    },
    accept_workspace_invitation: async ({ p_token }) => {
      aceites.push(p_token)
      const usuarioId = await sessao.usuarioId()
      // O aceite só acontece depois do Workspace pessoal.
      if (!participacoes.some((p) => p.user_id === usuarioId)) throw new Error('aceite antes do bootstrap')
      if (recusarAceite) throw recusa(recusarAceite.code, recusarAceite.message)
      if (usuarioId !== CARLA.id) throw recusa('42501', 'invitation is for another email')
      if (p_token !== TOKEN) throw recusa('P0002', 'invitation not found')
      participacoes.push({ workspace_id: NORTE.id, user_id: CARLA.id, role: 'member', active: true })
      return NORTE
    },
    list_workspace_participants: ({ p_workspace_id }) => {
      if (p_workspace_id !== NORTE.id) throw recusa('42501', 'active workspace membership required')
      return [
        { user_id: 'usuario-ana', email: 'ana@norte.com.br', name: 'Ana Lima', role: 'admin', is_owner: false },
        { user_id: CARLA.id, email: CARLA.email, name: 'Carla Dias', role: 'member', is_owner: false },
      ]
    },
    list_workspace_invitations: () => [],
  }
  return { tabelas, rpcs, participacoes, aceites, sessao }
}

function abrirOLinkDoConvite(
  banco: ReturnType<typeof bancoComConvite>,
  { comSessao = true, token = TOKEN, quem = CARLA }: { comSessao?: boolean; token?: string; quem?: typeof CARLA } = {},
) {
  window.history.replaceState(null, '', `/convite/${token}`)
  const supabase = criarSupabaseFalso({
    sessao: comSessao ? sessaoDe(quem) : null,
    tabelas: banco.tabelas,
    rpcs: banco.rpcs,
    contas: [
      { ...CARLA, senha: 'senha-longa-da-carla', nome: 'Carla Dias' },
      { ...DIEGO, senha: 'senha-longa-do-diego', nome: 'Diego' },
    ],
  })
  banco.sessao.usuarioId = async () => (await supabase.cliente.auth.getSession()).data.session?.user.id
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { ...supabase, usuario }
}

/** Abre Configurações / Workspace pela navegação, para ver em qual Workspace a pessoa está. */
async function abrirPessoasEAcesso(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(within(await screen.findByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: 'Configurações' }))
  await usuario.click(await screen.findByRole('link', { name: 'Workspace' }))
}

describe('Aceite do convite', () => {
  it('com a sessão do e-mail convidado, o link aceita o convite e abre o Workspace do convite, mantendo o pessoal', async () => {
    const banco = bancoComConvite()
    const { usuario } = abrirOLinkDoConvite(banco)

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
    expect(window.location.pathname).toBe('/')

    await abrirPessoasEAcesso(usuario)
    const informacoes = within(await screen.findByRole('region', { name: 'Workspace' }))
    expect(await informacoes.findByText('Norte')).toBeInTheDocument()
    expect(informacoes.getByText('Membro')).toBeInTheDocument()
    // O Workspace pessoal continua entre as Participações ativas.
    expect(banco.participacoes.filter((p) => p.active).map((p) => p.workspace_id)).toEqual([PESSOAL_DA_CARLA.id, NORTE.id])
  })

  it('sem sessão, o link leva à entrada e, depois de entrar com o e-mail convidado, aceita o convite', async () => {
    const banco = bancoComConvite()
    const { usuario } = abrirOLinkDoConvite(banco, { comSessao: false })

    await usuario.type(await screen.findByLabelText('E-mail'), CARLA.email)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-longa-da-carla')
    expect(banco.aceites).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
    expect(window.location.pathname).toBe('/')
  })

  it('quem se cadastra pelo convite ganha o Workspace pessoal e entra primeiro no Workspace do convite', async () => {
    const banco = bancoComConvite()
    window.history.replaceState(null, '', `/convite/${TOKEN}`)
    const supabase = criarSupabaseFalso({ tabelas: banco.tabelas, rpcs: banco.rpcs, contas: [] })
    const usuario = userEvent.setup()
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    // Sem conta, a pessoa vai da entrada ao cadastro, e o convite continua como destino.
    await usuario.click(await screen.findByRole('link', { name: 'Criar conta' }))
    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Dias')
    await usuario.type(screen.getByLabelText('E-mail'), CARLA.email)
    await usuario.type(screen.getByLabelText('Senha'), 'correta cavalo bateria')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
    // O link de confirmação volta ao convite.
    expect(new URL(supabase.linkEnviadoPara(CARLA.email)!).pathname).toBe(`/convite/${TOKEN}`)

    await usuario.type(screen.getByLabelText('Código de 6 dígitos'), supabase.codigoEnviadoPara(CARLA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))

    await abrirPessoasEAcesso(usuario)
    expect(await within(await screen.findByRole('region', { name: 'Workspace' })).findByText('Norte')).toBeInTheDocument()
    expect(banco.participacoes.map((p) => p.workspace_id)).toEqual([PESSOAL_DA_CARLA.id, NORTE.id])
  })

  it.each([
    ['42501', 'invitation is for another email', 'Este convite é para outro e-mail.'],
    ['22023', 'invitation revoked', 'Este convite foi cancelado por um Administrador do Workspace.'],
    ['22023', 'invitation expired', 'Este convite expirou.'],
    ['22023', 'invitation already used', 'Este convite já foi usado.'],
    ['P0002', 'invitation not found', 'Este link de convite não é válido.'],
  ])('uma recusa do aceite (%s %s) é explicada, sem criar Participação; a pessoa segue para o próprio Workspace', async (code, message, explicacao) => {
    const banco = bancoComConvite({ recusarAceite: { code, message } })
    const { usuario } = abrirOLinkDoConvite(banco)

    expect(await screen.findByRole('alert')).toHaveTextContent(explicacao)
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(banco.participacoes.map((p) => p.workspace_id)).toEqual([PESSOAL_DA_CARLA.id])

    await usuario.click(screen.getByRole('button', { name: 'Continuar sem o convite' }))
    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar de Workspace' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('quem abriu o convite com outra Conta de usuário sai, entra com o e-mail convidado e o convite é aceito', async () => {
    const banco = bancoComConvite()
    const { usuario } = abrirOLinkDoConvite(banco, { quem: DIEGO })

    expect(await screen.findByRole('alert')).toHaveTextContent('Este convite é para outro e-mail.')
    expect(banco.participacoes.filter((p) => p.workspace_id === NORTE.id)).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))

    // O convite continua como destino depois de sair.
    await usuario.type(await screen.findByLabelText('E-mail'), CARLA.email)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-longa-da-carla')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN, TOKEN])
    expect(banco.participacoes.filter((p) => p.workspace_id === NORTE.id).map((p) => p.user_id)).toEqual([CARLA.id])
    expect(window.location.pathname).toBe('/')
  })

  it('uma falha ao aceitar não é confundida com recusa: a pessoa pode abrir o link de novo', async () => {
    const banco = bancoComConvite({ recusarAceite: { code: '08006', message: 'connection reset' } })
    abrirOLinkDoConvite(banco)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível aceitar o convite agora.')
    expect(alerta).not.toHaveTextContent('connection reset')
  })
})
