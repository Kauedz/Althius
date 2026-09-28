import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, type RespostaDaFuncao, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@norte.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte', owner_user_id: null, created_at: '2026-09-01T12:00:00Z' }
const PESSOAL_DA_MARINA = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id, created_at: '2026-09-02T12:00:00Z' }
const TOKEN = 'a'.repeat(64)

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

type Papel = 'admin' | 'member'
interface ParticipanteNoBanco { user_id: string; email: string; name: string | null; role: Papel; is_owner: boolean }
interface ConviteNoBanco { id: string; email: string; role: Papel; status: string; created_at: string; expires_at: string; token: string | null }

/** Uma recusa do banco, com o SQLSTATE e a mensagem que a função levanta. */
function recusa(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

/**
 * O Workspace Norte como o banco o devolve às funções de participantes e convites, com a Marina na sessão. As regras
 * de papel são do banco (pgTAP); aqui ele só guarda o que as funções mudariam, para a tela mostrar o resultado.
 */
function bancoDoNorte({
  papelDaMarina = 'admin',
  workspace = NORTE,
  participantes: iniciais,
  convites: convitesIniciais = [],
}: {
  papelDaMarina?: Papel
  workspace?: typeof NORTE | typeof PESSOAL_DA_MARINA
  participantes?: ParticipanteNoBanco[]
  convites?: ConviteNoBanco[]
} = {}) {
  const participantes: ParticipanteNoBanco[] = iniciais ?? [
    { user_id: MARINA.id, email: MARINA.email, name: 'Marina Souza', role: papelDaMarina, is_owner: false },
    { user_id: 'usuario-bruno', email: 'bruno@norte.com.br', name: 'Bruno Reis', role: 'member', is_owner: false },
    { user_id: 'usuario-sem-nome', email: 'sem.nome@norte.com.br', name: null, role: 'member', is_owner: false },
  ]
  const convites = [...convitesIniciais]
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [
      { workspace_id: PESSOAL_DA_MARINA.id, user_id: MARINA.id, role: 'admin', active: true },
      ...(workspace.id === NORTE.id ? [{ workspace_id: NORTE.id, user_id: MARINA.id, role: papelDaMarina, active: true }] : []),
    ],
    workspaces: [NORTE, PESSOAL_DA_MARINA],
  }
  const rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {
    bootstrap_personal_workspace: () => PESSOAL_DA_MARINA,
    list_workspace_participants: ({ p_workspace_id }) => {
      if (p_workspace_id !== workspace.id) throw recusa('42501', 'active workspace membership required')
      return participantes
    },
    list_workspace_invitations: () => convites,
    invite_to_workspace: ({ p_email, p_role }) => {
      const convite = {
        id: `convite-${convites.length + 1}`,
        email: String(p_email).trim().toLowerCase(),
        role: p_role as Papel,
        status: 'pendente',
        created_at: '2026-09-27T12:00:00Z',
        expires_at: '2026-10-04T12:00:00Z',
        token: TOKEN,
      }
      convites.unshift(convite)
      return [convite]
    },
    revoke_workspace_invitation: ({ p_invitation_id }) => {
      convites.find((c) => c.id === p_invitation_id)!.status = 'revogado'
      return null
    },
    change_participant_role: ({ p_user_id, p_role }) => {
      participantes.find((p) => p.user_id === p_user_id)!.role = p_role as Papel
      return null
    },
    remove_participant: ({ p_user_id }) => {
      participantes.splice(participantes.findIndex((p) => p.user_id === p_user_id), 1)
      return null
    },
  }
  // O e-mail do Convite (Edge Function workspace-invitation-email): por padrão o provedor confirma o envio.
  const emails: Record<string, unknown>[] = []
  const funcoes: Record<string, (corpo: Record<string, unknown>) => RespostaDaFuncao> = {
    'workspace-invitation-email': (corpo) => {
      emails.push(corpo)
      const convite = convites.find((c) => c.id === corpo.invitationId)
      return { corpo: { sent: true, email: convite?.email } }
    },
  }
  return { tabelas, rpcs, funcoes, emails, participantes, convites }
}

/** Abre Configurações / Workspace no Workspace operacional escolhido, com a sessão da Marina. */
function abrirPessoasEAcesso(banco: ReturnType<typeof bancoDoNorte>, workspaceId = NORTE.id) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', workspaceId)
  window.history.replaceState(null, '', '/configuracoes/workspace')
  const supabase = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas: banco.tabelas, rpcs: banco.rpcs, funcoes: banco.funcoes })
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario }
}

const linhaDe = (nome: string) => within(screen.getByRole('row', { name: nome }))

describe('Pessoas e acesso no Workspace operacional', () => {
  it('mostra os participantes ativos guardados no banco, com o papel de cada um, sem dados da Demonstração', async () => {
    abrirPessoasEAcesso(bancoDoNorte())

    expect(await screen.findByRole('row', { name: 'Marina Souza' })).toBeInTheDocument()
    expect(linhaDe('Marina Souza').getByText('Você')).toBeInTheDocument()
    expect(linhaDe('Bruno Reis').getByRole('combobox', { name: 'Papel de Bruno Reis' })).toHaveValue('membro')
    // Sem nome no cadastro, a pessoa aparece pelo e-mail.
    expect(screen.getByRole('row', { name: 'sem.nome@norte.com.br' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Workspace' })).getByText('Norte')).toBeInTheDocument()
    expect(screen.queryByText(/Databricks|Lucas Moreira/)).not.toBeInTheDocument()
    // As informações gerais ainda não se editam no Workspace operacional.
    expect(screen.queryByRole('button', { name: 'Editar informações' })).not.toBeInTheDocument()
  })

  it('o Administrador convida com papel; o convite fica pendente, o e-mail sai pelo provedor e o link segue para copiar', async () => {
    const banco = bancoDoNorte()
    const { usuario } = abrirPessoasEAcesso(banco)

    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    expect(dialogo.getByText(/a Althius envia o convite por e-mail/i)).toBeInTheDocument()
    await usuario.type(dialogo.getByRole('textbox', { name: 'E-mail' }), 'Carla@Norte.com.br')
    await usuario.click(dialogo.getByRole('radio', { name: 'Administrador' }))
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))

    const resultado = await screen.findByText(/Convite registrado para carla@norte.com.br como Administrador/)
    expect(resultado).toHaveTextContent('E-mail do convite enviado para carla@norte.com.br.')
    expect(resultado).not.toHaveTextContent('Demonstração')
    expect(banco.emails).toEqual([{ workspaceId: NORTE.id, invitationId: 'convite-1' }])
    const convite = within(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByRole('listitem', { name: 'carla@norte.com.br' }))
    expect(convite.getByText('Convite pendente')).toBeInTheDocument()
    expect(convite.getByText(/link vale até 4 de outubro de 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /carla/i })).not.toBeInTheDocument()

    await usuario.click(convite.getByRole('button', { name: 'Copiar link do convite' }))
    expect(await screen.findByText('Link do convite para carla@norte.com.br copiado.')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/convite/${TOKEN}`)
  })

  it('se o provedor não aceitar o e-mail, o convite fica registrado e a tela diz que o e-mail não saiu', async () => {
    const banco = bancoDoNorte()
    banco.funcoes['workspace-invitation-email'] = () => ({
      status: 502,
      corpo: { error: 'O provedor de e-mail não aceitou o envio. O convite continua valendo: copie o link e envie à pessoa.' },
    })
    const { usuario } = abrirPessoasEAcesso(banco)

    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    await usuario.type(dialogo.getByRole('textbox', { name: 'E-mail' }), 'carla@norte.com.br')
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))

    const resultado = await screen.findByText(/Convite registrado para carla@norte.com.br como Membro/)
    expect(resultado).toHaveTextContent('mas o e-mail não foi enviado: O provedor de e-mail não aceitou o envio.')
    expect(resultado).not.toHaveTextContent('E-mail do convite enviado')
    const convite = within(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByRole('listitem', { name: 'carla@norte.com.br' }))
    expect(convite.getByRole('button', { name: 'Copiar link do convite' })).toBeInTheDocument()
  })

  it('o Administrador reenvia o e-mail de um convite pendente', async () => {
    const banco = bancoDoNorte({
      convites: [{
        id: 'convite-carla', email: 'carla@norte.com.br', role: 'member', status: 'pendente',
        created_at: '2026-09-27T12:00:00Z', expires_at: '2026-10-04T12:00:00Z', token: TOKEN,
      }],
    })
    const { usuario } = abrirPessoasEAcesso(banco)

    const convite = within(await screen.findByRole('listitem', { name: 'carla@norte.com.br' }))
    await usuario.click(convite.getByRole('button', { name: 'Reenviar e-mail' }))

    expect(await screen.findByText('E-mail do convite enviado para carla@norte.com.br.')).toBeInTheDocument()
    expect(banco.emails).toEqual([{ workspaceId: NORTE.id, invitationId: 'convite-carla' }])
  })

  it('mostra os convites aceitos, expirados e revogados, e o Administrador revoga um pendente', async () => {
    const convite = (id: string, email: string, status: string) => ({
      id, email, role: 'member' as const, status, created_at: '2026-09-20T12:00:00Z', expires_at: '2026-09-27T12:00:00Z', token: status === 'pendente' ? TOKEN : null,
    })
    const banco = bancoDoNorte({
      convites: [
        convite('c1', 'pendente@norte.com.br', 'pendente'),
        convite('c2', 'aceito@norte.com.br', 'aceito'),
        convite('c3', 'expirado@norte.com.br', 'expirado'),
        convite('c4', 'revogado@norte.com.br', 'revogado'),
      ],
    })
    const { usuario } = abrirPessoasEAcesso(banco)

    const historico = within(await screen.findByRole('list', { name: 'Convites encerrados' }))
    expect(within(historico.getByRole('listitem', { name: 'aceito@norte.com.br' })).getByText('Aceito')).toBeInTheDocument()
    expect(within(historico.getByRole('listitem', { name: 'expirado@norte.com.br' })).getByText('Expirado')).toBeInTheDocument()
    expect(within(historico.getByRole('listitem', { name: 'revogado@norte.com.br' })).getByText('Revogado')).toBeInTheDocument()
    expect(historico.queryByRole('button')).not.toBeInTheDocument()

    const pendente = within(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByRole('listitem', { name: 'pendente@norte.com.br' }))
    await usuario.click(pendente.getByRole('button', { name: 'Cancelar convite' }))
    expect(await screen.findByText('Convite para pendente@norte.com.br revogado. O link deixou de valer.')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Convites encerrados' })).getByRole('listitem', { name: 'pendente@norte.com.br' })).toHaveTextContent('Revogado'),
    )
    expect(screen.getByText('nenhum convite esperando resposta')).toBeInTheDocument()
  })

  it('o Administrador muda o papel e remove uma Participação; a Conta de usuário continua', async () => {
    const { usuario } = abrirPessoasEAcesso(bancoDoNorte())

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Papel de Bruno Reis' }), 'Administrador')
    expect(await screen.findByText('Bruno Reis agora é Administrador neste Workspace.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Papel de Bruno Reis' })).toHaveValue('administrador'))

    await usuario.click(linhaDe('Bruno Reis').getByRole('button', { name: 'Remover do Workspace' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Remover do Workspace' }))
    expect(dialogo.getByText(/Workspace pessoal/)).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Remover do Workspace' }))

    expect(await screen.findByText(/O acesso de Bruno Reis ao Workspace Norte foi encerrado. A Conta de usuário continua ativa/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('row', { name: 'Bruno Reis' })).not.toBeInTheDocument())
  })

  it('mostra a recusa do banco quando a regra impede a mudança, como rebaixar o último Administrador', async () => {
    const banco = bancoDoNorte()
    banco.rpcs.change_participant_role = () => {
      throw recusa('42501', 'the last administrator cannot be removed or demoted')
    }
    // A tela ainda não sabe que o Bruno deixou de ser Administrador noutra aba.
    banco.participantes[1].role = 'admin'
    const { usuario } = abrirPessoasEAcesso(banco)

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Papel de Marina Souza' }), 'Membro')

    expect(await screen.findByRole('alert')).toHaveTextContent('O Workspace precisa de pelo menos um Administrador. Torne outra pessoa Administrador antes.')
  })

  it('um Membro consulta quem participa e os convites, sem ações administrativas', async () => {
    abrirPessoasEAcesso(bancoDoNorte({ papelDaMarina: 'member' }))

    expect(await screen.findByText(/Você é Membro/)).toBeInTheDocument()
    expect(linhaDe('Bruno Reis').getByText('Membro')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Papel de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover do Workspace' })).not.toBeInTheDocument()
  })

  it('quem perdeu o papel de Administrador recebe a recusa do banco ao convidar', async () => {
    const banco = bancoDoNorte()
    banco.rpcs.invite_to_workspace = () => {
      throw recusa('42501', 'only administrators can manage participants')
    }
    const { usuario } = abrirPessoasEAcesso(banco)

    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    await usuario.type(dialogo.getByRole('textbox', { name: 'E-mail' }), 'carla@norte.com.br')
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))

    expect(await dialogo.findByRole('alert')).toHaveTextContent('Só Administradores do Workspace podem fazer isso.')
    expect(banco.convites).toHaveLength(0)
  })

  it('sem conseguir ler os participantes, a seção diz que falhou e tenta de novo, em vez de carregar para sempre', async () => {
    const banco = bancoDoNorte()
    const listar = banco.rpcs.list_workspace_participants
    let tentativas = 0
    banco.rpcs.list_workspace_participants = (p) => {
      tentativas += 1
      if (tentativas === 1) throw new Error('connection reset')
      return listar(p)
    }
    const { usuario } = abrirPessoasEAcesso(banco)

    const falha = await screen.findByRole('alert')
    expect(falha).toHaveTextContent('Não foi possível carregar as pessoas do Workspace.')
    expect(falha).not.toHaveTextContent('connection reset')
    await usuario.click(within(falha).getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('row', { name: 'Bruno Reis' })).toBeInTheDocument()
  })

  it('no Workspace pessoal, o Titular aparece protegido: ninguém o rebaixa nem o remove pela interface', async () => {
    const banco = bancoDoNorte({
      workspace: PESSOAL_DA_MARINA,
      participantes: [
        { user_id: MARINA.id, email: MARINA.email, name: 'Marina Souza', role: 'admin', is_owner: true },
        { user_id: 'usuario-fabio', email: 'fabio@gmail.com', name: 'Fabio', role: 'admin', is_owner: false },
      ],
    })
    abrirPessoasEAcesso(banco, PESSOAL_DA_MARINA.id)

    const marina = within(await screen.findByRole('row', { name: 'Marina Souza' }))
    expect(marina.getByText('Titular do Workspace pessoal')).toBeInTheDocument()
    expect(marina.getByRole('combobox', { name: 'Papel de Marina Souza' })).toBeDisabled()
    expect(linhaDe('Fabio').getByRole('combobox', { name: 'Papel de Fabio' })).toBeEnabled()
    expect(linhaDe('Fabio').getByRole('button', { name: 'Remover do Workspace' })).toBeEnabled()
  })
})
