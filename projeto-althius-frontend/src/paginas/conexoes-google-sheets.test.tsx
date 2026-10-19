import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Google Sheets no Workspace operacional (conector-google-sheets 02): o Acesso pelo OAuth do Google, com a
// conta de quem conectou, e o aviso de que os Agentes precisam da URL da planilha (o servidor não lista planilhas).

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

const CONECTOR_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'google-sheets',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['oauth_mcp'],
}

// A conta vem do app, quando ele a informa.
const CONECTOR_CONECTADO: LinhaDeAcesso = { ...CONECTOR_DESCONECTADO, state: 'conectado', kind: 'oauth_mcp', account_label: "marina@cliente.com.br", connected_at: '2026-10-19T12:00:00Z', connected_count: 2 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'member',
  habilitadas = ['google-sheets'],
  acessos = [CONECTOR_DESCONECTADO],
  ferramentas = () => ({ corpo: { ferramentas: [] } }),
  revogacao = 'revogado',
}: {
  rota?: string
  papel?: 'admin' | 'member'
  habilitadas?: string[]
  acessos?: LinhaDeAcesso[]
  ferramentas?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
  revogacao?: string
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
      // O Google Sheets disponível, como fica depois da validação real.
      list_workspace_integrations: () => {
        const habilitada = banco.habilitadas.find((h) => h.integrationId === 'google-sheets')
        return [{
          id: 'google-sheets',
          name: 'Google Sheets',
          category: 'Conhecimento',
          description: 'Planilhas do Google.',
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
        return { corpo: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=cid-google&state=x' } }
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

describe('O cartão do Google Sheets no Workspace operacional', () => {
  it('um Administrador habilita o Google Sheets e o cartão passa a oferecer o próprio Acesso', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))

    expect(await within(cartao).findByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['google-sheets'])
  })

  it('um Membro vê o Google Sheets não habilitado e que só um Administrador o habilita', async () => {
    abrir({ papel: 'member', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(within(cartao).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar no Google Sheets' })).not.toBeInTheDocument()
  })

  it('sem Acesso, conecta só pela autorização no próprio Google Sheets, sem chave de API e sem Sincronização', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Usar chave de API' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no Google Sheets' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'google-sheets' }])
    expect(indo).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?client_id=cid-google&state=x')
  })

  it('conectado, mostra a conta e as ferramentas do Google Sheets', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [CONECTOR_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'get_values', descricao: 'Lê.', escreve: false },
            { nome: 'update_values', descricao: 'Encontra e enriquece uma pessoa.', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(await within(cartao).findByText("Conectado como marina@cliente.com.br")).toBeInTheDocument()
    expect(within(cartao).getByText('2 participantes conectaram')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Google Sheets' })
    expect(await within(dialogo).findByText('get_values')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(1)
    expect(pedidos.ferramentas).toEqual([{ action: 'listar', workspaceId: NORTE.id, integrationId: 'google-sheets' }])
  })

  it('desconectar passa pela Edge Function, que revoga no Google Sheets, e o cartão volta a "não conectou" sem aviso', async () => {
    const { usuario, pedidos } = abrir({ acessos: [CONECTOR_CONECTADO] })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'google-sheets' }])
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).getByText('1 participante conectou')).toBeInTheDocument()
    expect(screen.queryByText(/não conseguiu avisar/)).not.toBeInTheDocument()
  })

  it('quando o Google Sheets não confirma a revogação, desconecta e avisa', async () => {
    const { usuario } = abrir({ acessos: [CONECTOR_CONECTADO], revogacao: 'falhou' })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Desconectado da Althius, mas a Althius não conseguiu avisar o Google Sheets. Para garantir, remova a autorização da Althius nas configurações do Google Sheets.',
      ),
    ).toBeInTheDocument()
  })

  it('quando o Google Sheets revoga o Acesso, o mesmo botão reconecta', async () => {
    vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir({ acessos: [{ ...CONECTOR_CONECTADO, state: 'precisa_reconectar' }] })

    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(await within(cartao).findByText('Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Ver ferramentas' })).not.toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Reconectar no Google Sheets' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'google-sheets' }])
  })

  it('a volta da autorização confirma o Google Sheets conectado', async () => {
    abrir({ rota: '/conexoes?conexao=ok&integracao=google-sheets', acessos: [CONECTOR_CONECTADO] })

    expect(await screen.findByText('Google Sheets conectado.')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it.each([
    ['recusada', 'Você não autorizou o acesso no Google Sheets. Nada foi conectado.'],
    ['expirada', 'A autorização demorou demais e venceu. Comece de novo.'],
    ['indisponivel', 'Não foi possível falar com o Google Sheets agora. Tente de novo em instantes.'],
  ])('a volta "%s" da autorização avisa e o cartão não finge que conectou', async (motivo, aviso) => {
    abrir({ rota: `/conexoes?conexao=erro&integracao=google-sheets&motivo=${motivo}` })

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
  })

  it('as ferramentas avisam que os Agentes precisam da URL da planilha', async () => {
    const { usuario } = abrir({ acessos: [CONECTOR_CONECTADO] })
    const cartao = await screen.findByRole('article', { name: 'Google Sheets' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Google Sheets' })
    expect(within(dialogo).getByText('O servidor do Google Sheets não lista planilhas: peça aos Agentes com a URL da planilha.')).toBeInTheDocument()
  })
})
