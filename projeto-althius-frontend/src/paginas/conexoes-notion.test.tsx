import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Notion no Workspace operacional (conexoes-funcionais 08): o mesmo Acesso do HubSpot, só pela autorização
// no Notion (registro dinâmico, sem chave de API) e sem Sincronização.

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

const NOTION_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'notion',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['oauth_mcp'],
}

const NOTION_CONECTADO: LinhaDeAcesso = {
  ...NOTION_DESCONECTADO,
  state: 'conectado',
  kind: 'oauth_mcp',
  account_label: 'marina@cliente.com.br',
  connected_at: '2026-10-08T12:00:00Z',
  connected_count: 2,
}

const HUBSPOT_CONECTADO: LinhaDeAcesso = {
  ...NOTION_CONECTADO,
  integration_id: 'hubspot',
  account_label: 'marina@norte-crm.com.br',
  app_portal: '4321',
  kinds: ['oauth_mcp', 'api_key'],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'member',
  habilitadas = ['notion'],
  acessos = [NOTION_DESCONECTADO],
  ferramentas = () => ({ corpo: { ferramentas: [] } }),
}: {
  rota?: string
  papel?: 'admin' | 'member'
  habilitadas?: string[]
  acessos?: LinhaDeAcesso[]
  ferramentas?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
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

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(banco),
      // Como no banco: o estado do Acesso só existe para as Integrações habilitadas no Workspace.
      integration_access_status: () => linhas.filter((l) => banco.habilitadas.some((h) => h.integrationId === l.integration_id)),
    },
    funcoes: {
      'integration-connect': (corpo) => {
        // Desconectar passa pela Edge Function, que revoga o token no app antes de apagar o Acesso (conector-clay 02).
        if (corpo.action === 'desconectar') {
          pedidos.desconectar.push(corpo)
          linhas = linhas.map((l) =>
            l.integration_id === corpo.integrationId
              ? { ...l, state: 'desconectado', kind: null, account_label: null, connected_count: l.connected_count - 1 }
              : l,
          )
          return { corpo: { desconectado: true, revogacao: 'revogado' } }
        }
        pedidos.conectar.push(corpo)
        return { corpo: { url: 'https://mcp.notion.com/authorize?client_id=cid-notion&state=x' } }
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

describe('O cartão do Notion no Workspace operacional', () => {
  it('um Administrador habilita o Notion e o cartão passa a oferecer o próprio Acesso', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))

    expect(await within(cartao).findByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['notion'])
  })

  it('um Membro vê o Notion não habilitado e que só um Administrador o habilita', async () => {
    abrir({ papel: 'member', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    expect(within(cartao).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar no Notion' })).not.toBeInTheDocument()
  })

  it('sem Acesso, conecta só pela autorização no próprio Notion, sem chave de API e sem Sincronização', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 0 participantes conectados')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Usar chave de API' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no Notion' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'notion' }])
    expect(indo).toHaveBeenCalledWith('https://mcp.notion.com/authorize?client_id=cid-notion&state=x')
  })

  it('conectado, mostra a conta e as ferramentas do servidor do Notion, sem Sincronização', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [NOTION_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'notion-search', descricao: 'Busca páginas e bases.', escreve: false },
            { nome: 'notion-create-pages', descricao: 'Cria páginas.', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(await within(cartao).findByText('Seu acesso: Conectado como marina@cliente.com.br')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 2 participantes conectados')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Notion' })
    expect(await within(dialogo).findByText('notion-search')).toBeInTheDocument()
    expect(within(dialogo).getByText('notion-create-pages')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(1)
    expect(pedidos.ferramentas).toEqual([{ action: 'listar', workspaceId: NORTE.id, integrationId: 'notion' }])
  })

  it('desconectar o Notion apaga só esse Acesso: o do HubSpot continua conectado', async () => {
    const { usuario, pedidos } = abrir({ habilitadas: ['hubspot', 'notion'], acessos: [HUBSPOT_CONECTADO, NOTION_CONECTADO] })

    const notion = await screen.findByRole('article', { name: 'Notion' })
    await usuario.click(await within(notion).findByRole('button', { name: 'Desconectar' }))

    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'notion' }])
    expect(await within(notion).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(notion).getByText('No Workspace: 1 participante conectado')).toBeInTheDocument()
    const hubspot = screen.getByRole('article', { name: 'HubSpot' })
    expect(within(hubspot).getByText('Seu acesso: Conectado como marina@norte-crm.com.br')).toBeInTheDocument()
  })

  it('quando o Notion revoga o Acesso ou ele vence, o mesmo botão reconecta', async () => {
    vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir({ acessos: [{ ...NOTION_CONECTADO, state: 'precisa_reconectar' }] })

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(await within(cartao).findByText('Seu acesso: Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Ver ferramentas' })).not.toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Reconectar no Notion' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'notion' }])
  })

  it('a volta da autorização confirma o Notion conectado', async () => {
    abrir({ rota: '/conexoes?conexao=ok&integracao=notion', acessos: [NOTION_CONECTADO] })

    expect(await screen.findByText('Notion conectado.')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it.each([
    ['recusada', 'Você não autorizou o acesso no Notion. Nada foi conectado.'],
    ['expirada', 'A autorização demorou demais e venceu. Comece de novo.'],
    ['indisponivel', 'Não foi possível falar com o Notion agora. Tente de novo em instantes.'],
  ])('a volta "%s" da autorização avisa e o cartão não finge que conectou', async (motivo, aviso) => {
    abrir({ rota: `/conexoes?conexao=erro&integracao=notion&motivo=${motivo}` })

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
  })
})
