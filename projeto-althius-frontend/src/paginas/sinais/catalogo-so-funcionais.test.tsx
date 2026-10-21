import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { ACTORS_DE_20_10, CATALOGO_DE_20_10, FUNCIONAIS_EM_20_10 } from '@/test/estados-dos-coletores'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { CATALOGO_VISIVEL, cardPorId } from './catalogo-visivel'

// O catálogo que o cliente vê (catalogo-so-funcionais 01): no Workspace operacional, só os Sinais que rodam de verdade.
// A equipe Althius vê os 26, com os não funcionais marcados como internos. A Demonstração continua com o catálogo inteiro.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'

const NOMES_FUNCIONAIS = FUNCIONAIS_EM_20_10.map((id) => cardPorId(id)!.nome)
const ESCONDIDOS = CATALOGO_VISIVEL.filter((card) => !FUNCIONAIS_EM_20_10.includes(card.id))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

function abrir(
  rota: string,
  opcoes: {
    staff?: boolean
    monitores?: Record<string, unknown>[]
    falhaNosEstados?: boolean
    falhaSoNo?: 'actors' | 'catalogo'
  } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  // A falha vem depois da primeira leitura: com nenhum estado lido, o módulo Sinais inteiro já fica indisponível.
  const leituras = { actors: 0, catalogo: 0 }
  const depoisDaPrimeira = <T,>(chave: keyof typeof leituras, linhas: T) => () => {
    leituras[chave] += 1
    if ((opcoes.falhaNosEstados || opcoes.falhaSoNo === chave) && leituras[chave] > 1) throw new Error('permission denied')
    return linhas
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: 'admin', user_id: MARINA.id, active: true },
      ],
      target_accounts: [],
      sales_responsibilities: [],
      account_interactions: [],
      target_contacts: [],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_signal_actors: depoisDaPrimeira('actors', ACTORS_DE_20_10),
      list_signal_catalog: depoisDaPrimeira('catalogo', CATALOGO_DE_20_10),
      list_signal_monitors: () => opcoes.monitores ?? [],
      list_signals: () => [],
      list_account_signals: () => [],
      // Sem `staff`, o teste não responde: a função ausente vale `false`, como antes da migração.
      ...(opcoes.staff ? { viewer_is_althius_staff: () => true } : {}),
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario }
}

const nomesNaGrade = async () => {
  const grade = await screen.findByRole('region', { name: 'Catálogo de sinais' })
  return within(grade).getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent)
}

/** Os ids de todos os cards que a página liga, nas prateleiras, no Sinal da semana e na grade. */
const idsLigados = () =>
  [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/sinais/tipos/"]')]
    .map((link) => link.getAttribute('href')!.split('/')[3])
    .filter((id) => cardPorId(id))

describe('Catálogo do cliente no Workspace operacional', () => {
  it('mostra só os 15 Sinais funcionais na grade, nas prateleiras e no Sinal da semana', async () => {
    abrir('/sinais')

    expect(await nomesNaGrade()).toEqual(NOMES_FUNCIONAIS)
    expect(screen.getByText(/^15 Sinais ·/)).toBeInTheDocument()
    const ligados = new Set(idsLigados())
    expect([...ligados].every((id) => FUNCIONAIS_EM_20_10.includes(id))).toBe(true)
    for (const escondido of ESCONDIDOS) expect(ligados.has(escondido.id)).toBe(false)

    const destaque = screen.getByRole('region', { name: /^Sinal da semana: / })
    const nome = destaque.getAttribute('aria-label')!.replace('Sinal da semana: ', '')
    expect(NOMES_FUNCIONAIS).toContain(nome)

    expect(screen.queryByText('Interno')).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
  })

  it('não mostra a prateleira Lançamentos', async () => {
    abrir('/sinais')

    await nomesNaGrade()
    expect(screen.getByRole('heading', { name: 'Novos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lançamentos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Avise-me/ })).not.toBeInTheDocument()
  })

  it('a busca e o filtro de família só olham os funcionais', async () => {
    const { usuario } = abrir('/sinais')
    await nomesNaGrade()

    const familias = screen.getByRole('group', { name: 'Filtrar por família' })
    expect(within(familias).queryByRole('button', { name: 'Regulação' })).not.toBeInTheDocument()
    expect(within(familias).queryByRole('button', { name: 'Energia' })).not.toBeInTheDocument()
    expect(within(familias).getByRole('button', { name: 'Histórico comercial' })).toBeInTheDocument()

    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'Entrada de sócio')
    expect(screen.getByText(/Nenhum tipo de sinal corresponde a “Entrada de sócio”/)).toBeInTheDocument()

    await usuario.clear(busca)
    await usuario.type(busca, 'Nova cooperativa')
    expect(await nomesNaGrade()).toEqual(['Nova cooperativa'])
  })

  it('o endereço direto de um card não funcional volta ao catálogo', async () => {
    abrir('/sinais/tipos/entrada-de-socio')

    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Entrada de sócio' })).not.toBeInTheDocument()
  })

  it('o endereço direto de um lançamento também volta ao catálogo', async () => {
    abrir('/sinais/tipos/anuncios-google')

    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Anunciando no Google' })).not.toBeInTheDocument()
  })

  it('o card funcional abre e oferece Ativar Monitoramento', async () => {
    abrir('/sinais/tipos/nova-empresa-aberta')

    expect(await screen.findByRole('link', { name: 'Ativar Monitoramento' })).toHaveAttribute('href', '/sinais/tipos/nova-empresa-aberta/novo')
  })

  it('um erro ao ler os estados mostra o erro, e não o catálogo inteiro', async () => {
    abrir('/sinais', { falhaNosEstados: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os sinais.')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Catálogo de sinais' })).not.toBeInTheDocument()
  })

  it.each(['actors', 'catalogo'] as const)(
    'se só a leitura de %s falha, mostra o erro em vez de esconder os cards dela',
    async (falhaSoNo) => {
      abrir('/sinais', { falhaSoNo })

      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os sinais.')
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Catálogo de sinais' })).not.toBeInTheDocument()
    },
  )
})

describe('Monitoramento num card que deixou de ser funcional', () => {
  const monitor = {
    id: MONITOR,
    signal_type: 'entrada_de_socio',
    name: 'Sócios novos',
    state: 'ativo',
    audience: { accountIds: [] },
    criteria: {},
    last_error: null,
  }

  it('o card continua no catálogo do Workspace, com o selo Em teste e sem Interno', async () => {
    abrir('/sinais', { monitores: [monitor] })

    const grade = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    const socio = (await within(grade).findByRole('heading', { level: 3, name: 'Entrada de sócio' })).closest('li') as HTMLElement
    expect(within(socio).getByText('Em teste')).toBeInTheDocument()
    expect(within(socio).queryByText('Interno')).not.toBeInTheDocument()
    expect(await screen.findByText(/^16 Sinais ·/)).toBeInTheDocument()
  })

  it('a página do card mostra o Monitoramento, mas não deixa criar outro', async () => {
    abrir('/sinais/tipos/entrada-de-socio', { monitores: [monitor] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrada de sócio' })).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(lista).getByRole('link', { name: 'Sócios novos' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ativar Monitoramento' })).not.toBeInTheDocument()
    expect(screen.getByText(/Este Sinal ainda não roda de verdade/)).toBeInTheDocument()
  })

  it('o formulário de um Monitoramento novo nesse card volta para a página dele', async () => {
    abrir('/sinais/tipos/entrada-de-socio/novo', { monitores: [monitor] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrada de sócio' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Novo monitoramento' })).not.toBeInTheDocument()
  })
})

describe('Catálogo da equipe Althius', () => {
  it('vê os 26 cards, com os não funcionais marcados como internos', async () => {
    abrir('/sinais', { staff: true })

    expect(await screen.findByText(/^26 Sinais ·/)).toBeInTheDocument()
    expect(await nomesNaGrade()).toEqual(CATALOGO_VISIVEL.map((card) => card.nome))
    const grade = screen.getByRole('region', { name: 'Catálogo de sinais' })
    for (const escondido of ESCONDIDOS) {
      const cartao = within(grade).getByRole('heading', { level: 3, name: escondido.nome }).closest('li') as HTMLElement
      expect(within(cartao).getByText('Interno')).toBeInTheDocument()
      expect(within(cartao).getByText(/^(Em teste|Em breve)$/)).toBeInTheDocument()
    }
    const vagas = within(grade).getByRole('heading', { level: 3, name: 'Abertura de vagas' }).closest('li') as HTMLElement
    expect(within(vagas).queryByText('Interno')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument()
    // O Sinal da semana é sempre um que roda, também para a equipe.
    const destaque = screen.getByRole('region', { name: /^Sinal da semana: / })
    expect(NOMES_FUNCIONAIS).toContain(destaque.getAttribute('aria-label')!.replace('Sinal da semana: ', ''))
  })

  it('abre a página de um card interno, sem Ativar Monitoramento', async () => {
    abrir('/sinais/tipos/entrada-de-socio', { staff: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrada de sócio' })).toBeInTheDocument()
    expect(screen.getByText('Interno')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ativar Monitoramento' })).not.toBeInTheDocument()
  })
})

describe('Demonstração', () => {
  it('continua com os 26 cards e a prateleira Lançamentos, sem selo de estado', async () => {
    renderizarApp('/sinais')

    expect(await nomesNaGrade()).toEqual(CATALOGO_VISIVEL.map((card) => card.nome))
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument()
    expect(screen.queryByText('Interno')).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
  })
})
