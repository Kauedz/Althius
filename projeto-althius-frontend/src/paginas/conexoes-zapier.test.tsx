import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Zapier no Workspace operacional (conector-zapier 02): dois caminhos, a autorização no próprio Zapier (OAuth,
// primeiro) e o token de conexão criado em mcp.zapier.com, validado no servidor MCP; toda ferramenta conta como gasto
// (2 tasks do plano Zapier por chamada), com o aviso nas ferramentas.

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

const ZAPIER_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'zapier',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['oauth_mcp', 'api_key'],
}

// O Zapier identifica pelo userinfo; aqui, sem conta, como a conta (sem endpoint documentado): o cartão mostra só "Conectado".
const ZAPIER_CONECTADO: LinhaDeAcesso = { ...ZAPIER_DESCONECTADO, state: 'conectado', kind: 'oauth_mcp', connected_at: '2026-10-19T12:00:00Z', connected_count: 2 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'member',
  habilitadas = ['zapier'],
  acessos = [ZAPIER_DESCONECTADO],
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
      // O Zapier disponível, como fica depois do teste real (conector-zapier 03), e marcado como Integração que gasta.
      list_workspace_integrations: () => {
        const habilitada = banco.habilitadas.find((h) => h.integrationId === 'zapier')
        return [{
          id: 'zapier',
          name: 'Zapier',
          category: 'Automação',
          description: 'Ações dos apps ligados ao Zapier.',
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
        if (corpo.action === 'iniciar') return { corpo: { url: 'https://mcp.zapier.com/oauth/authorize?client_id=cid-zap&state=x' } }
        const resposta = chave(corpo)
        if ((resposta.status ?? 200) < 400 && corpo.action === 'chave') {
          linhas = linhas.map((l) =>
            l.integration_id === corpo.integrationId ? { ...l, state: 'conectado', kind: 'oauth_mcp', connected_count: l.connected_count + 1 } : l,
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

describe('O cartão do Zapier no Workspace operacional', () => {
  it('um Administrador habilita o Zapier e um Membro vê que só um Administrador habilita', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['zapier'])
    cleanup()

    abrir({ papel: 'member', habilitadas: [] })
    const doMembro = await screen.findByRole('article', { name: 'Zapier' })
    expect(within(doMembro).getByText('Só um Administrador habilita.')).toBeInTheDocument()
  })

  it('sem Acesso, oferece a autorização no Zapier e o token de API, sem Sincronização', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    expect(await within(cartao).findByRole('button', { name: 'Usar chave de API' })).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no Zapier' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'zapier' }])
    expect(indo).toHaveBeenCalledWith('https://mcp.zapier.com/oauth/authorize?client_id=cid-zap&state=x')
  })

  it('a chave pede o token de conexão criado em mcp.zapier.com', async () => {
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o Zapier com chave de API' })
    expect(within(dialogo).getByText('Use o token de conexão criado em mcp.zapier.com com a sua própria conta do Zapier.', { exact: false })).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Chave de API'), 'token-conexao-zapier-1')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Conectar' }))

    expect(pedidos.conectar).toEqual([{ action: 'chave', workspaceId: NORTE.id, integrationId: 'zapier', chave: 'token-conexao-zapier-1' }])
    expect(await within(cartao).findByText('Conectado')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('token-conexao-zapier-1')).not.toBeInTheDocument()
  })

  it('no Zapier, o aviso do token substitui o aviso genérico', async () => {
    const { usuario } = abrir()
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o Zapier com chave de API' })
    expect(within(dialogo).queryByText('Use uma chave da sua própria conta.', { exact: false })).not.toBeInTheDocument()
  })

  it('conectado, mostra as ferramentas do Zapier, todas como gasto, com o aviso das tasks', async () => {
    const { usuario } = abrir({
      acessos: [ZAPIER_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'gmail_send_email', descricao: 'Busca pessoas.', escreve: true },
            { nome: 'slack_send_channel_message', descricao: 'Enriquece uma pessoa (gasta créditos).', escreve: true },
          ],
        },
      }),
    })
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Zapier' })
    expect(await within(dialogo).findByText('slack_send_channel_message')).toBeInTheDocument()
    expect(within(dialogo).getByText('Cada chamada que dá certo gasta 2 tasks do seu plano no Zapier.')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(2)
  })

  it('precisa reconectar mostra os dois caminhos de novo', async () => {
    abrir({ acessos: [{ ...ZAPIER_CONECTADO, state: 'precisa_reconectar' }] })
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    expect(await within(cartao).findByText('Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Reconectar no Zapier' })).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Usar chave de API' })).toBeInTheDocument()
  })

  it.each([
    ['recusada', 'Você não autorizou o acesso no Zapier. Nada foi conectado.'],
    ['expirada', 'A autorização demorou demais e venceu. Comece de novo.'],
    ['indisponivel', 'Não foi possível falar com o Zapier agora. Tente de novo em instantes.'],
  ])('a volta "%s" da autorização avisa e o cartão não finge que conectou', async (motivo, aviso) => {
    abrir({ rota: `/conexoes?conexao=erro&integracao=zapier&motivo=${motivo}` })
    expect(await screen.findByText(aviso)).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
  })

  it('desconectar passa pela Edge Function e avisa quando o Zapier não confirma a revogação', async () => {
    const { usuario, pedidos } = abrir({ acessos: [ZAPIER_CONECTADO], revogacao: 'falhou' })
    const cartao = await screen.findByRole('article', { name: 'Zapier' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))
    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'zapier' }])
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(await screen.findByText(/não conseguiu avisar o Zapier/)).toBeInTheDocument()
  })
})
