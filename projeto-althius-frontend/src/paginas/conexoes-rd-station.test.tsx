import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do RD Station CRM no Workspace operacional (conector-rd-station 02): o Acesso pela chave (token) da própria
// conta, validada na API do RD Station e guardada só no backend, sem autorização no app (o MCP oficial ainda não foi
// sondado, conector-rd-station 01) e sem Sincronização. As ferramentas são as REST da Althius, com a escrita marcada.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

interface LinhaDeAcesso {
  integration_id: string
  state: string
  kind: string | null
  account_label: string | null
  app_portal: string | null
  failure: string | null
  connected_at: string | null
  connected_count: number
  kinds: string[]
}

const RD_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'rd-station',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['api_key'],
}

// A conta vem da validação da chave, quando o RD Station a informa.
const RD_CONECTADO: LinhaDeAcesso = { ...RD_DESCONECTADO, state: 'conectado', kind: 'api_key', connected_at: '2026-10-19T12:00:00Z', connected_count: 2 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'member',
  habilitadas = ['rd-station'],
  acessos = [RD_DESCONECTADO],
  ferramentas = () => ({ corpo: { ferramentas: [] } }),
  revogacao = 'revogado',
  chave = () => ({ corpo: { ok: true, conta: null, portal: null } }),
}: {
  rota?: string
  papel?: 'admin' | 'member'
  habilitadas?: string[]
  acessos?: LinhaDeAcesso[]
  ferramentas?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
  revogacao?: string
  chave?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
} = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const banco = criarBancoDeConexoes()
  for (const id of habilitadas) {
    banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: id, enabledBy: MARINA.id, enabledAt: '2026-10-01T12:00:00Z' })
  }
  const pedidos = {
    conectar: [] as Record<string, unknown>[],
    desconectar: [] as Record<string, unknown>[],
    ferramentas: [] as Record<string, unknown>[],
  }
  let linhas = acessos
  const conexoes = rpcsDeConexoes(banco)

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...conexoes,
      // O RD Station disponível, como fica depois da validação real.
      list_workspace_integrations: () => {
        const habilitada = banco.habilitadas.find((h) => h.integrationId === 'rd-station')
        return [{
          id: 'rd-station',
          name: 'RD Station CRM',
          category: 'CRM',
          description: 'Contatos, empresas e negociações do RD Station CRM.',
          writes: true,
          status: habilitada ? 'habilitada' : 'nao_habilitada',
          enabled_at: habilitada?.enabledAt ?? null,
          enabled_by: habilitada?.enabledBy ?? null,
          app_portal: null,
        }]
      },
      enable_workspace_integration: (parametros) => {
        banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: parametros.p_integration_id as string, enabledBy: MARINA.id, enabledAt: '2026-10-19T12:00:00Z' })
        return null
      },
      integration_access_status: () => linhas.filter((l) => banco.habilitadas.some((h) => h.integrationId === l.integration_id)),
    },
    funcoes: {
      'integration-connect': (corpo) => {
        if (corpo.action === 'desconectar') {
          pedidos.desconectar.push(corpo)
          linhas = linhas.map((l) =>
            l.integration_id === corpo.integrationId
              ? { ...l, state: 'desconectado', kind: null, account_label: null, connected_count: l.connected_count - 1 }
              : l,
          )
          return { corpo: { desconectado: true, revogacao } }
        }
        pedidos.conectar.push(corpo)
        const resposta = chave(corpo)
        if ((resposta.status ?? 200) < 400 && corpo.action === 'chave') {
          linhas = linhas.map((l) =>
            l.integration_id === corpo.integrationId ? { ...l, state: 'conectado', kind: 'api_key', connected_count: l.connected_count + 1 } : l,
          )
        }
        return resposta
      },
      'integration-tools': (corpo) => {
        pedidos.ferramentas.push(corpo)
        return ferramentas(corpo)
      },
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, pedidos, banco }
}

describe('O cartão do RD Station CRM no Workspace operacional', () => {
  it('um Administrador habilita o RD Station e o cartão passa a oferecer o próprio Acesso', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))

    expect(await within(cartao).findByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['rd-station'])
  })

  it('um Membro vê o RD Station não habilitado e que só um Administrador o habilita', async () => {
    abrir({ papel: 'member', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    expect(within(cartao).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Usar chave de API' })).not.toBeInTheDocument()
  })

  it('sem Acesso, conecta só pela chave de API, sem autorização no app e sem Sincronização', async () => {
    abrir()

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Usar chave de API' })).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar no RD Station CRM' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()
  })

  it('conecta pela chave da própria conta, que vai só ao backend e não volta à tela', async () => {
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o RD Station CRM com chave de API' })
    await usuario.type(within(dialogo).getByLabelText('Chave de API'), 'token-rd-secreto-123')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Conectar' }))

    expect(pedidos.conectar).toEqual([{ action: 'chave', workspaceId: NORTE.id, integrationId: 'rd-station', chave: 'token-rd-secreto-123' }])
    expect(await within(cartao).findByText('Conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('1 participante conectou')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('token-rd-secreto-123')).not.toBeInTheDocument()
  })

  it('a chave recusada pelo RD Station mostra o motivo e não conecta', async () => {
    const { usuario } = abrir({
      chave: () => ({ status: 422, corpo: { error: 'O RD Station CRM recusou a chave. Confira se copiou a chave inteira e se ela está ativa.', code: 'chave_recusada' } }),
    })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o RD Station CRM com chave de API' })
    await usuario.type(within(dialogo).getByLabelText('Chave de API'), 'chave-errada-123')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Conectar' }))

    expect(await within(dialogo).findByText('O RD Station CRM recusou a chave. Confira se copiou a chave inteira e se ela está ativa.')).toBeInTheDocument()
    expect(within(cartao).getByText('Você ainda não conectou')).toBeInTheDocument()
  })

  it('conectado, mostra as ferramentas REST do RD Station, com a escrita marcada', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [RD_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'buscar_contatos', descricao: 'Busca contatos no RD Station CRM.', escreve: false },
            { nome: 'criar_empresa', descricao: 'Cria uma empresa no RD Station CRM.', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    expect(await within(cartao).findByText('Conectado')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do RD Station CRM' })
    expect(await within(dialogo).findByText('buscar_contatos')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(1)
    expect(pedidos.ferramentas).toEqual([{ action: 'listar', workspaceId: NORTE.id, integrationId: 'rd-station' }])
  })

  it('a chave revogada no RD Station deixa o Acesso em "Precisa reconectar", com a chave de novo como saída', async () => {
    abrir({ acessos: [{ ...RD_CONECTADO, state: 'precisa_reconectar' }] })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    expect(await within(cartao).findByText('Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Ver ferramentas' })).not.toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Usar chave de API' })).toBeInTheDocument()
  })

  it('desconectar apaga só o próprio Acesso pela Edge Function, sem aviso (a chave não tem revogação no app)', async () => {
    const { usuario, pedidos } = abrir({ acessos: [RD_CONECTADO], revogacao: 'nao_se_aplica' })

    const cartao = await screen.findByRole('article', { name: 'RD Station CRM' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'rd-station' }])
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).getByText('1 participante conectou')).toBeInTheDocument()
    expect(screen.queryByText(/não conseguiu avisar/)).not.toBeInTheDocument()
  })
})
