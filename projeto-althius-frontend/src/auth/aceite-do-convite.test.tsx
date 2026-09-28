import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
function bancoComConvite({
  recusarAceite,
  estadoDoConvite = 'pendente',
}: {
  recusarAceite?: { code: string; message: string }
  /** O estado que a prévia do convite devolve; `falha` é uma leitura que não chega (rede, servidor). */
  estadoDoConvite?: 'pendente' | 'aceito' | 'expirado' | 'revogado' | 'falha'
} = {}) {
  const participacoes: Record<string, unknown>[] = []
  const aceites: unknown[] = []
  const previas = { falhas: estadoDoConvite === 'falha' ? 1 : 0 }
  const pessoalDeDiego = { ...PESSOAL_DA_CARLA, id: 'ws-pessoal-diego', name: 'Diego', owner_user_id: DIEGO.id }
  const tabelas = { workspace_memberships: participacoes, workspaces: [PESSOAL_DA_CARLA, pessoalDeDiego, NORTE] }
  /** A Conta de usuário da sessão, como o banco a lê em auth.uid(); ligada ao Supabase falso quando ele nasce. */
  const sessao = { usuarioId: async (): Promise<string | undefined> => CARLA.id }
  const rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {
    // Como a função do banco: sem login, o e-mail, o Workspace e o papel só de um convite pendente; dos demais, só o
    // estado; um token desconhecido não devolve linha.
    workspace_invitation_preview: ({ p_token }) => {
      if (previas.falhas > 0) {
        previas.falhas--
        throw recusa('08006', 'connection reset')
      }
      if (p_token !== TOKEN) return []
      const estado = estadoDoConvite === 'falha' ? 'pendente' : estadoDoConvite
      return estado === 'pendente'
        ? [{ email: CARLA.email, workspace_name: NORTE.name, role: 'member', status: estado }]
        : [{ email: null, workspace_name: null, role: null, status: estado }]
    },
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
  {
    comSessao = true,
    token = TOKEN,
    quem = CARLA,
    carlaTemConta = true,
  }: { comSessao?: boolean; token?: string; quem?: typeof CARLA; /** Sem ela, a Carla ainda não tem Conta de usuário. */ carlaTemConta?: boolean } = {},
) {
  window.history.replaceState(null, '', `/convite/${token}`)
  const supabase = criarSupabaseFalso({
    sessao: comSessao ? sessaoDe(quem) : null,
    tabelas: banco.tabelas,
    rpcs: banco.rpcs,
    contas: [
      ...(carlaTemConta ? [{ ...CARLA, senha: 'senha-longa-da-carla', nome: 'Carla Dias' }] : []),
      { ...DIEGO, senha: 'senha-longa-do-diego', nome: 'Diego' },
    ],
  })
  banco.sessao.usuarioId = async () => (await supabase.cliente.auth.getSession()).data.session?.user.id
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { ...supabase, usuario }
}

/** O campo de e-mail da tela de acesso traz o e-mail convidado, travado e com o aviso; digitar nele não o troca. */
async function emailTravadoDaCarla(usuario: ReturnType<typeof userEvent.setup>) {
  const email = await screen.findByLabelText('E-mail')
  expect(email).toHaveValue(CARLA.email)
  expect(email).toHaveAttribute('readonly')
  expect(email).toHaveAccessibleDescription(`Este convite é para ${CARLA.email}`)
  await usuario.type(email, 'outra@gmail.com')
  expect(email).toHaveValue(CARLA.email)
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
    // Aceito o convite, o roteador leva ao início logo depois de o Workspace abrir.
    await waitFor(() => expect(window.location.pathname).toBe('/'))

    await abrirPessoasEAcesso(usuario)
    const informacoes = within(await screen.findByRole('region', { name: 'Workspace' }))
    expect(await informacoes.findByText('Norte')).toBeInTheDocument()
    expect(informacoes.getByText('Membro')).toBeInTheDocument()
    // O Workspace pessoal continua entre as Participações ativas.
    expect(banco.participacoes.filter((p) => p.active).map((p) => p.workspace_id)).toEqual([PESSOAL_DA_CARLA.id, NORTE.id])
  })

  it('sem sessão, o link leva à entrada com o e-mail convidado travado e, depois de entrar, aceita o convite', async () => {
    const banco = bancoComConvite()
    const { usuario } = abrirOLinkDoConvite(banco, { comSessao: false })

    await usuario.click(await screen.findByRole('link', { name: 'Já tenho conta: entrar' }))
    await emailTravadoDaCarla(usuario)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-longa-da-carla')
    expect(banco.aceites).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
    // Aceito o convite, o roteador leva ao início logo depois de o Workspace abrir.
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('quem se cadastra pelo convite ganha o Workspace pessoal e entra primeiro no Workspace do convite', async () => {
    const banco = bancoComConvite()
    window.history.replaceState(null, '', `/convite/${TOKEN}`)
    const supabase = criarSupabaseFalso({ tabelas: banco.tabelas, rpcs: banco.rpcs, contas: [] })
    const usuario = userEvent.setup()
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    // Sem conta, a pessoa vai do convite ao cadastro, com o e-mail convidado travado e o convite como destino.
    await usuario.click(await screen.findByRole('link', { name: 'Criar conta com este e-mail' }))
    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Dias')
    await emailTravadoDaCarla(usuario)
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
    // A recusa diz qual é o Workspace e com qual e-mail entrar.
    expect(await screen.findByText(/Este convite do Workspace/)).toHaveTextContent(
      `Este convite do Workspace Norte é para ${CARLA.email}. Saia e entre com esse e-mail para aceitá-lo.`,
    )
    expect(screen.getByText(`Você entrou como ${DIEGO.email}.`, { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar sem o convite' })).toBeInTheDocument()
    expect(banco.participacoes.filter((p) => p.workspace_id === NORTE.id)).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))

    // O convite continua no endereço depois de sair, agora com o e-mail convidado travado na entrada.
    await usuario.click(await screen.findByRole('link', { name: 'Já tenho conta: entrar' }))
    await emailTravadoDaCarla(usuario)
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

const DESTINO_DO_CONVITE = new URLSearchParams({ destino: `/convite/${TOKEN}` }).toString()

describe('Entrar por convite', () => {
  it('sem sessão, o link do convite mostra o Workspace, o papel e o e-mail convidado, com criar conta e entrar', async () => {
    abrirOLinkDoConvite(bancoComConvite(), { comSessao: false })

    expect(await screen.findByRole('heading', { name: 'Convite para o Workspace Norte' })).toBeInTheDocument()
    expect(screen.getByText(/Você foi convidado/)).toHaveTextContent(
      'Você foi convidado para o Workspace Norte como Membro. Este convite é para carla@norte.com.br.',
    )
    expect(screen.getByRole('link', { name: 'Criar conta com este e-mail' })).toHaveAttribute('href', `/cadastro?${DESTINO_DO_CONVITE}`)
    expect(screen.getByRole('link', { name: 'Já tenho conta: entrar' })).toHaveAttribute('href', `/entrar?${DESTINO_DO_CONVITE}`)
    // O convite continua no endereço, sem ir à entrada genérica.
    expect(window.location.pathname).toBe(`/convite/${TOKEN}`)
  })

  it.each([
    ['expirado', TOKEN, 'Convite expirado', 'Este convite expirou. Peça um novo convite a um Administrador do Workspace.'],
    ['revogado', TOKEN, 'Convite revogado', 'Este convite foi revogado por um Administrador do Workspace.'],
    ['pendente', 'c'.repeat(64), 'Convite não encontrado', 'Este link de convite não é válido.'],
  ] as const)('um convite %s (token %s) é explicado, sem oferecer cadastro nem entrada pelo convite', async (estadoDoConvite, token, titulo, explicacao) => {
    abrirOLinkDoConvite(bancoComConvite({ estadoDoConvite }), { comSessao: false, token })

    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
    expect(screen.getByText(explicacao, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(CARLA.email, { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar conta com este e-mail' })).not.toBeInTheDocument()
    // Quem já tem conta pode ir à entrada, sem o convite como destino.
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
  })

  it('um convite já aceito oferece entrar, e a entrada abre o Workspace do convite', async () => {
    const banco = bancoComConvite({ estadoDoConvite: 'aceito' })
    const { usuario } = abrirOLinkDoConvite(banco, { comSessao: false })

    expect(await screen.findByRole('heading', { name: 'Convite já aceito' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Entrar' }))
    await usuario.type(await screen.findByLabelText('E-mail'), CARLA.email)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-longa-da-carla')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
  })

  it('"Entrar com código" usa o e-mail convidado e o link do código volta ao convite', async () => {
    const banco = bancoComConvite()
    const { usuario, codigoEnviadoPara, linkEnviadoPara } = abrirOLinkDoConvite(banco, { comSessao: false })

    await usuario.click(await screen.findByRole('link', { name: 'Já tenho conta: entrar' }))
    await emailTravadoDaCarla(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(await screen.findByRole('status')).toHaveTextContent(`Se houver uma conta com ${CARLA.email}`)
    expect(new URL(linkEnviadoPara(CARLA.email)!).pathname).toBe(`/convite/${TOKEN}`)

    await usuario.type(screen.getByLabelText('Código'), codigoEnviadoPara(CARLA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
  })

  it('"Esqueci a senha" pelo convite trava o e-mail convidado e, com a nova senha, aceita o convite', async () => {
    const banco = bancoComConvite()
    const { usuario, codigoEnviadoPara, linkEnviadoPara } = abrirOLinkDoConvite(banco, { comSessao: false })

    await usuario.click(await screen.findByRole('link', { name: 'Já tenho conta: entrar' }))
    await usuario.click(await screen.findByRole('link', { name: 'Esqueci a senha' }))
    expect(await screen.findByRole('heading', { name: 'Esqueci a senha' })).toBeInTheDocument()
    await emailTravadoDaCarla(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))

    // O link do e-mail também volta ao convite depois da nova senha.
    const link = new URL(linkEnviadoPara(CARLA.email)!)
    expect(link.pathname).toBe('/redefinir-a-senha')
    expect(link.searchParams.get('destino')).toBe(`/convite/${TOKEN}`)
    await usuario.type(await screen.findByLabelText('Código de 6 dígitos'), codigoEnviadoPara(CARLA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await usuario.type(await screen.findByLabelText('Nova senha'), 'outra frase bem longa 42')
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova senha' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
  })

  it('o link de confirmação do cadastro, aberto neste navegador, volta ao convite e o aceita', async () => {
    const banco = bancoComConvite()
    const supabase = abrirOLinkDoConvite(banco, { comSessao: false, carlaTemConta: false })
    const { usuario } = supabase

    await usuario.click(await screen.findByRole('link', { name: 'Criar conta com este e-mail' }))
    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Dias')
    await usuario.type(screen.getByLabelText('Senha'), 'correta cavalo bateria')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(CARLA.email)).toBeInTheDocument()
    // Com o e-mail travado, não há e-mail a corrigir.
    expect(screen.queryByRole('button', { name: 'Corrigir e-mail' })).not.toBeInTheDocument()

    // A pessoa abre o link do e-mail: a página carrega de novo no endereço do convite, já com a sessão.
    const link = new URL(supabase.linkEnviadoPara(CARLA.email)!)
    cleanup()
    window.history.replaceState(null, '', link.pathname)
    supabase.abrirLinkDeConfirmacao(CARLA.email)
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
    expect(banco.participacoes.map((p) => p.workspace_id)).toEqual([PESSOAL_DA_CARLA.id, NORTE.id])
  })

  it('atualizar a página na etapa do código do cadastro pelo convite mantém a etapa e o convite', async () => {
    const banco = bancoComConvite()
    const supabase = abrirOLinkDoConvite(banco, { comSessao: false, carlaTemConta: false })
    const { usuario } = supabase

    await usuario.click(await screen.findByRole('link', { name: 'Criar conta com este e-mail' }))
    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Dias')
    await usuario.type(screen.getByLabelText('Senha'), 'correta cavalo bateria')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })

    cleanup()
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Código de 6 dígitos'), supabase.codigoEnviadoPara(CARLA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
  })

  it('quem já tem conta e escolheu criar conta pelo convite volta da etapa do código para entrar, com o convite', async () => {
    const banco = bancoComConvite()
    const { usuario, codigoEnviadoPara } = abrirOLinkDoConvite(banco, { comSessao: false })

    await usuario.click(await screen.findByRole('link', { name: 'Criar conta com este e-mail' }))
    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Dias')
    await usuario.type(screen.getByLabelText('Senha'), 'correta cavalo bateria')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    // A conta já existe: o Auth responde igual e não envia código; a tela oferece entrar, sem revelar nada.
    expect(codigoEnviadoPara(CARLA.email)).toBeUndefined()
    const entrar = screen.getByRole('link', { name: 'Entrar' })
    expect(entrar.closest('p')).toHaveTextContent('Já tem conta? Entrar')
    expect(entrar).toHaveAttribute('href', `/entrar?${DESTINO_DO_CONVITE}`)
    await usuario.click(entrar)

    // A etapa do código não prende mais o cadastro: voltar a ele mostra o formulário.
    await usuario.click(await screen.findByRole('link', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Entrar' }))

    await emailTravadoDaCarla(usuario)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-longa-da-carla')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([TOKEN])
  })

  it('o link do convite com uma barra no fim é o mesmo convite', async () => {
    abrirOLinkDoConvite(bancoComConvite(), { comSessao: false, token: `${TOKEN}/` })

    expect(await screen.findByRole('heading', { name: 'Convite para o Workspace Norte' })).toBeInTheDocument()
  })

  it('um link de convite malformado leva à entrada, sem derrubar a tela', async () => {
    abrirOLinkDoConvite(bancoComConvite(), { comSessao: false, token: '%' })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/entrar')
  })

  it('um destino de convite malformado na entrada não trava o e-mail nem derruba a tela', async () => {
    window.history.replaceState(null, '', '/entrar?destino=%2Fconvite%2F%25')
    const supabase = criarSupabaseFalso({ tabelas: bancoComConvite().tabelas, rpcs: bancoComConvite().rpcs, contas: [] })
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    const email = await screen.findByLabelText('E-mail')
    expect(email).toHaveValue('')
    expect(email).not.toHaveAttribute('readonly')
  })

  it('com sessão, um link de convite malformado não derruba a entrada no Workspace', async () => {
    const banco = bancoComConvite()
    abrirOLinkDoConvite(banco, { token: '%' })

    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(banco.aceites).toEqual([])
  })

  it('sem conseguir carregar o convite, a tela diz e deixa tentar de novo', async () => {
    const { usuario } = abrirOLinkDoConvite(bancoComConvite({ estadoDoConvite: 'falha' }), { comSessao: false })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar o convite.')
    expect(alerta).not.toHaveTextContent('connection reset')
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('heading', { name: 'Convite para o Workspace Norte' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
