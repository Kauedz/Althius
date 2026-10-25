import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Google Calendar no Workspace operacional (conector-google-calendar 03): o Acesso pelo OAuth do Google,
// com a conta de quem conectou (userinfo), sem chave de API e sem Sincronização.

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
  integration_id: 'google-calendar',
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
  habilitadas = ['google-calendar'],
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
      // O Google Calendar disponível, como fica depois da validação real.
      list_workspace_integrations: () => {
        const habilitada = banco.habilitadas.find((h) => h.integrationId === 'google-calendar')
        return [{
          id: 'google-calendar',
          name: 'Google Calendar',
          category: 'Agenda',
          description: 'Agenda dos participantes e disponibilidade.',
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

describe('O cartão do Google Calendar no Workspace operacional', () => {
  it('um Administrador habilita o Google Calendar e o cartão passa a oferecer o próprio Acesso', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))

    expect(await within(cartao).findByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['google-calendar'])
  })

  it('um Membro vê o Google Calendar não habilitado e que só um Administrador o habilita', async () => {
    abrir({ papel: 'member', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(within(cartao).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar no Google Calendar' })).not.toBeInTheDocument()
  })

  it('sem Acesso, conecta só pela autorização no próprio Google Calendar, sem chave de API e sem Sincronização', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Usar chave de API' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no Google Calendar' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'google-calendar' }])
    expect(indo).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?client_id=cid-google&state=x')
  })

  it('conectado, mostra a conta e as ferramentas do Google Calendar', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [CONECTOR_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'list_events', descricao: 'Lê.', escreve: false },
            { nome: 'create_event', descricao: 'Encontra e enriquece uma pessoa.', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(await within(cartao).findByText("Seu acesso: Conectado como marina@cliente.com.br")).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 2 participantes conectados')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Google Calendar' })
    expect(await within(dialogo).findByText('list_events')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(1)
    expect(pedidos.ferramentas).toEqual([{ action: 'listar', workspaceId: NORTE.id, integrationId: 'google-calendar' }])
  })

  it('desconectar passa pela Edge Function, que revoga no Google Calendar, e o cartão volta a "não conectou" sem aviso', async () => {
    const { usuario, pedidos } = abrir({ acessos: [CONECTOR_CONECTADO] })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'google-calendar' }])
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 1 participante conectado')).toBeInTheDocument()
    expect(screen.queryByText(/não conseguiu avisar/)).not.toBeInTheDocument()
  })

  it('quando o Google Calendar não confirma a revogação, desconecta e avisa', async () => {
    const { usuario } = abrir({ acessos: [CONECTOR_CONECTADO], revogacao: 'falhou' })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Desconectado da Althius, mas a Althius não conseguiu avisar o Google Calendar. Para garantir, remova a autorização da Althius nas configurações do Google Calendar.',
      ),
    ).toBeInTheDocument()
  })

  it('quando o Google Calendar revoga o Acesso, o mesmo botão reconecta', async () => {
    vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir({ acessos: [{ ...CONECTOR_CONECTADO, state: 'precisa_reconectar' }] })

    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(await within(cartao).findByText('Seu acesso: Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Ver ferramentas' })).not.toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Reconectar no Google Calendar' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'google-calendar' }])
  })

  it('a volta da autorização confirma o Google Calendar conectado', async () => {
    abrir({ rota: '/conexoes?conexao=ok&integracao=google-calendar', acessos: [CONECTOR_CONECTADO] })

    expect(await screen.findByText('Google Calendar conectado.')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it.each([
    ['recusada', 'Você não autorizou o acesso no Google Calendar. Nada foi conectado.'],
    ['expirada', 'A autorização demorou demais e venceu. Comece de novo.'],
    ['indisponivel', 'Não foi possível falar com o Google Calendar agora. Tente de novo em instantes.'],
  ])('a volta "%s" da autorização avisa e o cartão não finge que conectou', async (motivo, aviso) => {
    abrir({ rota: `/conexoes?conexao=erro&integracao=google-calendar&motivo=${motivo}` })

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Google Calendar' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
  })
})
