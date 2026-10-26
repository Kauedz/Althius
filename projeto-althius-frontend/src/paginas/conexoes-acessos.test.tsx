import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  acessos,
  conectar = () => ({ corpo: { url: 'https://app.hubspot.com/oauth/authorize?state=x' } }),
  ferramentas = () => ({ corpo: { ferramentas: [] } }),
}: {
  rota?: string
  acessos: LinhaDeAcesso[]
  conectar?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
  ferramentas?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-01T12:00:00Z' })
  const pedidos: { conectar: Record<string, unknown>[]; desconectar: Record<string, unknown>[] } = { conectar: [], desconectar: [] }
  let linhas = acessos

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: 'member', user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(banco),
      integration_access_status: () => linhas,
    },
    funcoes: {
      'integration-connect': (corpo) => {
        // Desconectar passa pela Edge Function, que revoga o token no app antes de apagar o Acesso (conector-clay 02).
        if (corpo.action === 'desconectar') {
          pedidos.desconectar.push(corpo)
          linhas = linhas.map((l) => (l.integration_id === corpo.integrationId ? { ...l, state: 'desconectado', kind: null, account_label: null } : l))
          return { corpo: { desconectado: true, revogacao: 'revogado' } }
        }
        pedidos.conectar.push(corpo)
        const resposta = conectar(corpo)
        if ((resposta.status ?? 200) < 400 && corpo.action === 'chave') {
          linhas = linhas.map((l) => (l.integration_id === corpo.integrationId ? { ...l, state: 'conectado', kind: 'api_key', account_label: 'marina@cliente.com.br' } : l))
        }
        return resposta
      },
      'integration-tools': ferramentas,
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, pedidos }
}

const HUBSPOT_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'hubspot',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 2,
  kinds: ['oauth_mcp', 'api_key'],
}

describe('O próprio Acesso a uma Integração habilitada', () => {
  it('mostra quantos participantes conectaram e leva à autorização no app', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir({ acessos: [HUBSPOT_DESCONECTADO] })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 2 participantes conectados')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no HubSpot' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'hubspot' }])
    expect(indo).toHaveBeenCalledWith('https://app.hubspot.com/oauth/authorize?state=x')
  })

  it('conecta pela chave de API sem mostrar a chave depois', async () => {
    const { usuario, pedidos } = abrir({ acessos: [HUBSPOT_DESCONECTADO] })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o HubSpot com chave de API' })
    await usuario.type(within(dialogo).getByLabelText('Chave de API'), 'pat-na1-chave-secreta')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Conectar' }))

    expect(pedidos.conectar).toEqual([
      { action: 'chave', workspaceId: NORTE.id, integrationId: 'hubspot', chave: 'pat-na1-chave-secreta' },
    ])
    expect(await within(cartao).findByText('Seu acesso: Conectado como marina@cliente.com.br')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('pat-na1-chave-secreta')).not.toBeInTheDocument()
  })

  it('mostra a recusa do app e não finge que conectou', async () => {
    const { usuario } = abrir({
      acessos: [HUBSPOT_DESCONECTADO],
      conectar: () => ({ status: 422, corpo: { error: 'O HubSpot recusou a chave. Confira se copiou a chave inteira e se ela está ativa.', code: 'chave_recusada' } }),
    })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Usar chave de API' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar o HubSpot com chave de API' })
    await usuario.type(within(dialogo).getByLabelText('Chave de API'), 'pat-na1-errada')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Conectar' }))

    expect(await within(dialogo).findByText('O HubSpot recusou a chave. Confira se copiou a chave inteira e se ela está ativa.')).toBeInTheDocument()
    expect(within(cartao).getByText('Seu acesso: não conectado')).toBeInTheDocument()
  })

  it('pede para reconectar quando o app revogou o Acesso', async () => {
    abrir({
      acessos: [{ ...HUBSPOT_DESCONECTADO, state: 'precisa_reconectar', kind: 'oauth_mcp', account_label: 'marina@cliente.com.br' }],
    })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText('Seu acesso: Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Reconectar no HubSpot' })).toBeInTheDocument()
  })

  it('desconecta só o próprio Acesso e lista as ferramentas do servidor', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [{ ...HUBSPOT_DESCONECTADO, state: 'conectado', kind: 'oauth_mcp', account_label: 'marina@cliente.com.br' }],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'search_companies', descricao: 'Busca empresas no CRM.', escreve: false },
            { nome: 'create_note', descricao: 'Cria uma nota no registro.', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText('Seu acesso: Conectado como marina@cliente.com.br')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do HubSpot' })
    expect(await within(dialogo).findByText('search_companies')).toBeInTheDocument()
    expect(within(dialogo).getByText('Escreve ou gasta')).toBeInTheDocument()
    await usuario.keyboard('{Escape}')

    await usuario.click(within(cartao).getByRole('button', { name: 'Desconectar' }))
    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'hubspot' }])
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
  })

  it('avisa o resultado da volta da autorização e limpa o endereço', async () => {
    abrir({
      rota: '/conexoes?conexao=erro&integracao=hubspot&motivo=portal_diferente',
      acessos: [HUBSPOT_DESCONECTADO],
    })

    expect(
      await screen.findByText('Esta conta é de outro portal do HubSpot. O Workspace já usa um portal; fale com um Administrador.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('confirma a conexão concluída na volta da autorização', async () => {
    abrir({
      rota: '/conexoes?conexao=ok&integracao=hubspot',
      acessos: [{ ...HUBSPOT_DESCONECTADO, state: 'conectado', kind: 'oauth_mcp', account_label: 'marina@cliente.com.br' }],
    })

    expect(await screen.findByText('HubSpot conectado.')).toBeInTheDocument()
  })
})
