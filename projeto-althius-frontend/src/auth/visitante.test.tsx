import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { carregarDemonstracaoDoVisitante } from '@/auth/carregar-demonstracao'
import { AplicativoDoVisitante, VISITANTE_VE_DEMONSTRACAO } from '@/auth/visitante'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'

// O `import()` da Demonstração vira espião, sem mudar o que ele carrega: os testes conferem se o visitante a pede.
vi.mock('@/auth/carregar-demonstracao', async (original) => {
  const modulo = await original<typeof import('@/auth/carregar-demonstracao')>()
  return {
    carregarDemonstracaoDaEquipe: vi.fn(modulo.carregarDemonstracaoDaEquipe),
    carregarDemonstracaoDoVisitante: vi.fn(modulo.carregarDemonstracaoDoVisitante),
    carregarDemonstracaoSemLogin: vi.fn(modulo.carregarDemonstracaoSemLogin),
  }
})

const EVA = { id: 'usuario-eva', email: 'eva@visitante.com.br' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

/** O app aberto por quem entrou e não participa de nenhum Workspace contratado. */
function abrirComoVisitante({
  pedidosEnviados = [] as Record<string, unknown>[],
  avisos = [] as Record<string, unknown>[],
  falhaNoPedido,
  tabelas = {},
  criacoes = [] as unknown[],
}: {
  pedidosEnviados?: Record<string, unknown>[]
  avisos?: Record<string, unknown>[]
  falhaNoPedido?: { code: string; message: string }
  tabelas?: Record<string, Record<string, unknown>[]>
  /** Cada vez que alguém tenta criar um Workspace da empresa. */
  criacoes?: unknown[]
} = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(EVA),
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: () => ({ id: null, kind: null, name: null, owner_user_id: null }),
      list_my_contracted_workspaces: () => [],
      create_company_workspace: (parametros) => {
        criacoes.push(parametros)
        throw new Error('permission denied')
      },
      submit_access_request: (parametros) => {
        if (falhaNoPedido) throw Object.assign(new Error(falhaNoPedido.message), { code: falhaNoPedido.code })
        pedidosEnviados.push(parametros)
        return 'a0000000-0000-4000-8000-000000000001'
      },
    },
    funcoes: {
      'access-request-notify': (corpo) => {
        avisos.push(corpo)
        return { corpo: { sent: true } }
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, usuario, pedidosEnviados, avisos, criacoes }
}

describe('Workspace visitante', () => {
  beforeEach(() => {
    vi.mocked(carregarDemonstracaoDoVisitante).mockClear()
  })

  it('por padrão (VISITANTE_VE_DEMONSTRACAO), o visitante vê a Demonstração, carregada só para ele', async () => {
    expect(VISITANTE_VE_DEMONSTRACAO).toBe(true)
    abrirComoVisitante()
    expect(await screen.findByText('Você está vendo uma demonstração')).toBeInTheDocument()
    expect(carregarDemonstracaoDoVisitante).toHaveBeenCalled()
  })

  it('quem entra sem Participação num Workspace contratado vê a demonstração, com o banner fixo, e nenhum Workspace é criado', async () => {
    const { criacoes } = abrirComoVisitante()

    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('Você está vendo uma demonstração')
    expect(banner.parentElement).toHaveClass('sticky')
    // São os dados da Demonstração que já existem.
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(screen.queryByText('Nenhum Workspace ativo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar Workspace da empresa' })).not.toBeInTheDocument()
    expect(criacoes).toEqual([])
  })

  it('o banner continua ao navegar para outra tela da demonstração', async () => {
    const { usuario } = abrirComoVisitante()
    await screen.findByText('Você está vendo uma demonstração')
    const navegacao = await screen.findByRole('complementary', { name: 'Navegação' })
    await usuario.click(within(navegacao).getByRole('link', { name: /Contas/ }))
    expect(await screen.findByText('Você está vendo uma demonstração')).toBeInTheDocument()
  })

  it('o Workspace pessoal e os de teste, sem contrato, não tiram a pessoa do visitante', async () => {
    abrirComoVisitante({
      tabelas: {
        workspace_memberships: [{ workspace_id: 'ws-pessoal-eva', role: 'admin', user_id: EVA.id, active: true }],
        workspaces: [{ id: 'ws-pessoal-eva', name: 'Eva', kind: 'pessoal' }],
      },
    })
    expect(await screen.findByText('Você está vendo uma demonstração')).toBeInTheDocument()
  })

  it('"Fale com a equipe Althius" no banner abre o modal; o envio grava o pedido e avisa a equipe', async () => {
    const { usuario, pedidosEnviados, avisos } = abrirComoVisitante()
    await usuario.click(await screen.findByRole('button', { name: 'Fale com a equipe Althius' }))

    const modal = within(await screen.findByRole('dialog', { name: 'Fale com a equipe Althius' }))
    await usuario.click(modal.getByRole('button', { name: 'Enviar' }))
    expect(modal.getByRole('alert')).toHaveTextContent('Preencha nome, empresa, telefone e mensagem.')
    expect(pedidosEnviados).toEqual([])

    await usuario.type(modal.getByLabelText('Nome'), 'Eva Dias')
    await usuario.type(modal.getByLabelText('Empresa'), 'Cliente SA')
    await usuario.type(modal.getByLabelText('Telefone'), '11 99999-0000')
    await usuario.type(modal.getByLabelText('Mensagem'), 'Quero conhecer a Althius.')
    await usuario.click(modal.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByText('Recebemos seu pedido')).toBeInTheDocument()
    expect(pedidosEnviados).toEqual([
      { p_name: 'Eva Dias', p_company: 'Cliente SA', p_phone: '11 99999-0000', p_message: 'Quero conhecer a Althius.' },
    ])
    expect(avisos).toEqual([{ requestId: 'a0000000-0000-4000-8000-000000000001' }])
  })

  it('uma ação paga, como pedir algo a um Agente, abre o modal em vez de rodar', async () => {
    window.history.replaceState(null, '', '/conversa')
    const { usuario, pedidosEnviados } = abrirComoVisitante()
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), 'Quais Contas temos?{Enter}')

    expect(await screen.findByRole('dialog', { name: 'Fale com a equipe Althius' })).toBeInTheDocument()
    expect(pedidosEnviados).toEqual([])
  })

  it('passado o limite de pedidos, o modal diz para tentar amanhã', async () => {
    const { usuario } = abrirComoVisitante({ falhaNoPedido: { code: 'P0001', message: 'too many access requests' } })
    await usuario.click(await screen.findByRole('button', { name: 'Fale com a equipe Althius' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Fale com a equipe Althius' }))
    await usuario.type(modal.getByLabelText('Nome'), 'Eva Dias')
    await usuario.type(modal.getByLabelText('Empresa'), 'Cliente SA')
    await usuario.type(modal.getByLabelText('Telefone'), '11 99999-0000')
    await usuario.type(modal.getByLabelText('Mensagem'), 'Oi')
    await usuario.click(modal.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(modal.getByRole('alert')).toHaveTextContent('tente de novo amanhã'))
  })

  it('o e-mail e o "Sair" ficam no banner', async () => {
    abrirComoVisitante()
    const banner = (await screen.findByRole('status')).parentElement!
    expect(within(banner).getByText(EVA.email)).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })
})

describe('Workspace visitante sem a Demonstração (VISITANTE_VE_DEMONSTRACAO = false)', () => {
  beforeEach(() => {
    vi.mocked(carregarDemonstracaoDoVisitante).mockClear()
  })

  function abrirSemDemonstracao() {
    const pedidosEnviados: Record<string, unknown>[] = []
    const avisos: Record<string, unknown>[] = []
    const supabase = criarSupabaseFalso({
      sessao: sessaoDe(EVA),
      rpcs: {
        submit_access_request: (parametros) => {
          pedidosEnviados.push(parametros)
          return 'a0000000-0000-4000-8000-000000000001'
        },
      },
      funcoes: {
        'access-request-notify': (corpo) => {
          avisos.push(corpo)
          return { corpo: { sent: true } }
        },
      },
    })
    const usuario = userEvent.setup()
    render(
      <AplicativoDoVisitante
        cliente={supabase.cliente}
        email={EVA.email}
        sair={<button type="button">Sair</button>}
        veDemonstracao={false}
      />,
    )
    return { usuario, pedidosEnviados, avisos }
  }

  it('vê só "Fale com a equipe Althius", sem nada da Demonstração, que nem é carregada', async () => {
    abrirSemDemonstracao()

    expect(await screen.findByRole('heading', { name: 'Fale com a equipe Althius' })).toBeInTheDocument()
    expect(screen.getByText(`Você entrou como ${EVA.email}.`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.queryByText(/demonstra/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
    expect(carregarDemonstracaoDoVisitante).not.toHaveBeenCalled()
  })

  it('o pedido à equipe grava o pedido de acesso e avisa a equipe, sem mencionar a Demonstração', async () => {
    const { usuario, pedidosEnviados, avisos } = abrirSemDemonstracao()
    await usuario.click(await screen.findByRole('button', { name: 'Fale com a equipe Althius' }))

    const modal = within(await screen.findByRole('dialog', { name: 'Fale com a equipe Althius' }))
    expect(modal.queryByText(/demonstra/i)).not.toBeInTheDocument()
    await usuario.type(modal.getByLabelText('Nome'), 'Eva Dias')
    await usuario.type(modal.getByLabelText('Empresa'), 'Cliente SA')
    await usuario.type(modal.getByLabelText('Telefone'), '11 99999-0000')
    await usuario.type(modal.getByLabelText('Mensagem'), 'Quero conhecer a Althius.')
    await usuario.click(modal.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByText('Recebemos seu pedido')).toBeInTheDocument()
    expect(pedidosEnviados).toEqual([
      { p_name: 'Eva Dias', p_company: 'Cliente SA', p_phone: '11 99999-0000', p_message: 'Quero conhecer a Althius.' },
    ])
    expect(avisos).toEqual([{ requestId: 'a0000000-0000-4000-8000-000000000001' }])
  })
})
