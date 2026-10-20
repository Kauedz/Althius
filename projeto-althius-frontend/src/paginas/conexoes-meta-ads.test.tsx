import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Meta Ads no Workspace operacional (conector-meta-ads 02): o Acesso pelo Facebook Login for Business com o app
// Meta da Althius (sem chave de API), toda ferramenta contando como gasto de verba, "Precisa configurar" sem o App ID, e
// desconectar sem aviso (a Meta não oferece revogação).

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

const META_DESCONECTADO: LinhaDeAcesso = {
  integration_id: 'meta-ads',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['oauth_mcp'],
}

// A conta de anúncio não está identificada (não confirmado): o cartão mostra só "Conectado".
const META_CONECTADO: LinhaDeAcesso = { ...META_DESCONECTADO, state: 'conectado', kind: 'oauth_mcp', connected_at: '2026-10-19T12:00:00Z', connected_count: 2 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'member',
  habilitadas = ['meta-ads'],
  acessos = [META_DESCONECTADO],
  ferramentas = () => ({ corpo: { ferramentas: [] } }),
  revogacao = 'revogado',
  iniciar = () => ({ corpo: { url: 'https://www.facebook.com/v26.0/dialog/oauth?client_id=123456789012345&state=x' } }),
}: {
  rota?: string
  papel?: 'admin' | 'member'
  habilitadas?: string[]
  acessos?: LinhaDeAcesso[]
  ferramentas?: (corpo: Record<string, unknown>) => { status?: number; corpo: unknown }
  revogacao?: string
  iniciar?: () => { status?: number; corpo: unknown }
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
      // O Meta Ads disponível, como fica depois do teste real (conector-meta-ads 04).
      list_workspace_integrations: () => {
        const habilitada = banco.habilitadas.find((h) => h.integrationId === 'meta-ads')
        return [{
          id: 'meta-ads',
          name: 'Meta Ads',
          category: 'Mídia paga',
          description: 'Campanhas no Facebook e no Instagram.',
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
        return iniciar()
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

describe('O cartão do Meta Ads no Workspace operacional', () => {
  it('um Administrador habilita o Meta Ads e o cartão passa a oferecer o próprio Acesso', async () => {
    const { usuario, banco } = abrir({ papel: 'admin', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(within(cartao).getByText('Não habilitada')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar' }))

    expect(await within(cartao).findByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(banco.habilitadas.map((h) => h.integrationId)).toEqual(['meta-ads'])
  })

  it('um Membro vê o Meta Ads não habilitado e que só um Administrador o habilita', async () => {
    abrir({ papel: 'member', habilitadas: [] })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(within(cartao).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar no Meta Ads' })).not.toBeInTheDocument()
  })

  it('sem Acesso, conecta só pela autorização no Facebook Login, sem chave de API e sem Sincronização', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Usar chave de API' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: /Sincroniz/ })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar no Meta Ads' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'meta-ads' }])
    expect(indo).toHaveBeenCalledWith('https://www.facebook.com/v26.0/dialog/oauth?client_id=123456789012345&state=x')
  })

  it('conectado, mostra "Conectado" e as ferramentas do Meta Ads, todas como gasto', async () => {
    const { usuario, pedidos } = abrir({
      acessos: [META_CONECTADO],
      ferramentas: () => ({
        corpo: {
          ferramentas: [
            { nome: 'get_insights', descricao: 'Relatório de campanhas.', escreve: true },
            { nome: 'create_campaign', descricao: 'Cria uma campanha (gasta verba).', escreve: true },
          ],
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(await within(cartao).findByText('Conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('2 participantes conectaram')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Ver ferramentas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ferramentas do Meta Ads' })
    expect(await within(dialogo).findByText('get_insights')).toBeInTheDocument()
    expect(within(dialogo).getAllByText('Escreve ou gasta')).toHaveLength(2)
    expect(pedidos.ferramentas).toEqual([{ action: 'listar', workspaceId: NORTE.id, integrationId: 'meta-ads' }])
  })

  it('desconectar passa pela Edge Function, e o cartão volta a "não conectou" sem aviso', async () => {
    const { usuario, pedidos } = abrir({ acessos: [META_CONECTADO] })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(pedidos.desconectar).toEqual([{ action: 'desconectar', workspaceId: NORTE.id, integrationId: 'meta-ads' }])
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(within(cartao).getByText('1 participante conectou')).toBeInTheDocument()
    expect(screen.queryByText(/não conseguiu avisar/)).not.toBeInTheDocument()
  })

  it('sem revogação na Meta, desconectar não mostra aviso', async () => {
    const { usuario } = abrir({ acessos: [META_CONECTADO], revogacao: 'nao_suportado' })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Desconectar' }))

    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
    expect(screen.queryByText(/não conseguiu avisar/)).not.toBeInTheDocument()
  })

  it('sem o App ID do app Meta, conectar mostra "Precisa configurar" e não sai da tela', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario } = abrir({
      iniciar: () => ({
        status: 503,
        corpo: {
          error: 'Precisa configurar: o app de autorização do Meta Ads ainda não foi cadastrado na Althius. Fale com quem administra a Althius.',
          code: 'nao_configurada',
        },
      }),
    })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Conectar no Meta Ads' }))

    expect(
      await screen.findByText('Precisa configurar: o app de autorização do Meta Ads ainda não foi cadastrado na Althius. Fale com quem administra a Althius.'),
    ).toBeInTheDocument()
    expect(indo).not.toHaveBeenCalled()
    expect(within(cartao).getByText('Você ainda não conectou')).toBeInTheDocument()
  })

  it('quando a Meta revoga o Acesso, o mesmo botão reconecta', async () => {
    vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir({ acessos: [{ ...META_CONECTADO, state: 'precisa_reconectar' }] })

    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(await within(cartao).findByText('Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Ver ferramentas' })).not.toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Reconectar no Meta Ads' }))

    expect(pedidos.conectar).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'meta-ads' }])
  })

  it('a volta da autorização confirma o Meta Ads conectado', async () => {
    abrir({ rota: '/conexoes?conexao=ok&integracao=meta-ads', acessos: [META_CONECTADO] })

    expect(await screen.findByText('Meta Ads conectado.')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it.each([
    ['recusada', 'Você não autorizou o acesso no Meta Ads. Nada foi conectado.'],
    ['expirada', 'A autorização demorou demais e venceu. Comece de novo.'],
    ['indisponivel', 'Não foi possível falar com o Meta Ads agora. Tente de novo em instantes.'],
  ])('a volta "%s" da autorização avisa e o cartão não finge que conectou', async (motivo, aviso) => {
    abrir({ rota: `/conexoes?conexao=erro&integracao=meta-ads&motivo=${motivo}` })

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Meta Ads' })
    expect(await within(cartao).findByText('Você ainda não conectou')).toBeInTheDocument()
  })
})
