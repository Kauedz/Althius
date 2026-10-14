// A vitrine de Sinais: Sinal da semana, Meus Sinais, prateleiras, Avise-me e a página do Sinal. Só a camada visual
// mudou; as rotas e o catálogo são os do PR-A.
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CardSobPedido, FonteDeSinais, PedidoDeSinal } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const EMOJI = /\p{Extended_Pictographic}/u

const EXCLUSIVO: CardSobPedido = {
  id: 'hospitais-com-ala-nova',
  nome: 'Hospitais com ala nova',
  frase: 'Avisa quando um hospital anuncia uma ala nova.',
  familiaId: 'expansao-e-registros',
  fonte: 'Publicações oficiais',
  custoRotulo: 'Dentro do teto',
  nichos: ['corretoras-de-beneficios'],
  coletores: ['ala_nova_hospital'],
}

const EM_CONSTRUCAO: PedidoDeSinal = {
  id: 'pedido-portos',
  evento: 'Portos com fila de navios',
  empresasOuNicho: 'Comex e importação',
  urgencia: 'este_mes',
  contato: { nome: 'Marina Alves', email: 'marina.alves@databricks.com' },
  status: 'em_construcao',
  criadoEm: '2026-09-20T12:00:00Z',
}

const comExclusivos = (fonte: FonteDeSinais): FonteDeSinais =>
  Object.assign(Object.create(fonte) as FonteDeSinais, {
    catalogoDoWorkspace: () => Promise.resolve([EXCLUSIVO]),
    pedidosDeSinal: () => Promise.resolve([EM_CONSTRUCAO]),
  })

describe('Vitrine de Sinais', () => {
  it('mostra o Sinal da semana, Meus Sinais, as prateleiras e o pedido à equipe, sem emoji nem letra de ICP', async () => {
    renderizarApp('/sinais')
    const destaque = await screen.findByRole('region', { name: /^Sinal da semana: / })
    expect(within(destaque).getByRole('link', { name: 'Conhecer o Sinal' })).toHaveAttribute('href', expect.stringMatching(/^\/sinais\/tipos\//))
    expect(within(destaque).getByText('Ao vivo')).toBeInTheDocument()

    for (const titulo of [
      'Meus Sinais',
      'Para o seu nicho',
      'Mais ativados',
      'Novos',
      'Movimento de equipe',
      'Mídia e anúncios',
      'Exclusivos do seu Workspace',
      'Lançamentos',
    ]) {
      expect(screen.getByRole('region', { name: titulo })).toBeInTheDocument()
    }

    const meus = screen.getByRole('region', { name: 'Meus Sinais' })
    expect(within(meus).getByText('Monitoramentos ativos')).toBeInTheDocument()
    expect(within(meus).getByRole('link', { name: /Contas Quentes/ })).toHaveAttribute('href', '/contas')
    expect(within(meus).getByRole('link', { name: /^Sequências/ })).toHaveAttribute('href', '/sequencias')

    const lancamentos = screen.getByRole('region', { name: 'Lançamentos' })
    expect(within(lancamentos).getByText('Anunciando no Google')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mídia e anúncios' })).queryByText('Anunciando no Google')).not.toBeInTheDocument()

    expect(screen.getByRole('region', { name: 'Pedir um Sinal' })).toHaveTextContent('Precisa de outro Sinal?')
    expect(screen.getByRole('link', { name: 'Falar com a equipe Althius' })).toHaveAttribute('href', '/sinais/pedidos')
    expect(document.body.textContent).not.toMatch(EMOJI)
    expect(document.body.textContent).not.toMatch(/ICP [A-H]\b|\b[A-H] ·/)
  })

  it('a prévia do Sinal da semana lista as empresas detectadas, ou diz que ainda não há nenhuma', async () => {
    renderizarApp('/sinais')
    const destaque = await screen.findByRole('region', { name: /^Sinal da semana: / })
    const lista = await within(destaque).findByRole('list', { name: 'Últimas empresas detectadas' })
    expect(within(lista).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('sem disparos, a prévia mostra o estado vazio', async () => {
    renderizarApp('/sinais', {}, {}, {}, { vazia: true })
    const destaque = await screen.findByRole('region', { name: /^Sinal da semana: / })
    expect(within(destaque).getByText('Nenhuma empresa detectada ainda neste Workspace.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mais ativados' })).getByText('Nenhum Monitoramento ativo ainda.')).toBeInTheDocument()
  })

  it('as prateleiras são um Cover Flow: um card no centro, as setas trocam o centro e o card do lado vem para o centro', async () => {
    const { usuario } = renderizarApp('/sinais')
    const prateleira = await screen.findByRole('region', { name: 'Movimento de equipe' })
    // Só os cards da faixa (os filhos diretos): dentro de cada card há outras listas, como a dos nichos.
    const cards = Array.from(within(prateleira).getByRole('list', { name: 'Movimento de equipe' }).children) as HTMLElement[]
    const noCentro = () => cards.findIndex((card) => card.getAttribute('aria-current') === 'true')
    expect(cards.length).toBeGreaterThan(2)
    expect(cards.filter((card) => card.getAttribute('aria-current') === 'true')).toHaveLength(1)

    const inicio = noCentro()
    await usuario.click(within(prateleira).getByRole('button', { name: 'Avançar em Movimento de equipe' }))
    expect(noCentro()).toBe(inicio + 1)
    await usuario.click(within(prateleira).getByRole('button', { name: 'Voltar em Movimento de equipe' }))
    expect(noCentro()).toBe(inicio)

    // O card do lado não abre o Sinal no primeiro toque: vem para o centro. No centro, abre.
    const vizinho = cards[inicio + 1]
    const nome = within(vizinho).getByRole('heading', { level: 3 }).textContent ?? ''
    await usuario.click(within(vizinho).getByRole('link'))
    expect(noCentro()).toBe(inicio + 1)
    expect(await screen.findByRole('region', { name: 'Movimento de equipe' })).toBeInTheDocument()
    await usuario.click(within(vizinho).getByRole('link'))
    expect(await screen.findByRole('heading', { level: 1, name: nome })).toBeInTheDocument()
  })

  it('o filtro mostra só a grade, sem o destaque e sem as prateleiras', async () => {
    const { usuario } = renderizarApp('/sinais')
    await screen.findByRole('region', { name: /^Sinal da semana: / })
    await usuario.click(within(screen.getByRole('group', { name: 'Filtrar por nicho' })).getByRole('button', { name: 'Agro B2B' }))
    expect(screen.queryByRole('region', { name: /^Sinal da semana: / })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Novos' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Pedir um Sinal' })).toBeInTheDocument()
  })

  it('Avise-me num lançamento pede o aviso à equipe e não vira um exclusivo em produção', async () => {
    const { usuario } = renderizarApp('/sinais')
    const lancamentos = await screen.findByRole('region', { name: 'Lançamentos' })
    await usuario.click(within(lancamentos).getByRole('button', { name: 'Avise-me quando Anunciando no Google lançar' }))
    expect(await within(lancamentos).findByText('Você será avisado')).toBeInTheDocument()
    const exclusivos = screen.getByRole('region', { name: 'Exclusivos do seu Workspace' })
    expect(within(exclusivos).queryByText(/Anunciando no Google/)).not.toBeInTheDocument()
    expect(within(exclusivos).getByText('Nenhum Sinal exclusivo ainda.')).toBeInTheDocument()
  })

  it('Exclusivos do seu Workspace mostra o card feito sob pedido e o pedido em produção', async () => {
    renderizarAppCom('/sinais', { sinais: comExclusivos })
    const exclusivos = await screen.findByRole('region', { name: 'Exclusivos do seu Workspace' })
    expect(await within(exclusivos).findByRole('link', { name: /Hospitais com ala nova/ })).toHaveAttribute(
      'href',
      '/sinais/tipos/hospitais-com-ala-nova',
    )
    expect(within(exclusivos).getAllByText('Exclusivo')).toHaveLength(2)
    expect(within(exclusivos).getByText('Portos com fila de navios')).toBeInTheDocument()
    expect(within(exclusivos).getByText('Em produção pela equipe Althius')).toBeInTheDocument()
  })
})

describe('Página do Sinal na vitrine', () => {
  it('tem capa, prévia, fonte, frequência, custo em créditos, resultado e um único Ativar Monitoramento', async () => {
    renderizarApp('/sinais/tipos/nova-lideranca')
    const capa = await screen.findByRole('region', { name: 'Capa do Sinal' })
    expect(within(capa).getByRole('link', { name: 'Ativar Monitoramento' })).toHaveAttribute('href', '/sinais/tipos/nova-lideranca/novo')
    expect(screen.getAllByRole('link', { name: 'Ativar Monitoramento' })).toHaveLength(1)
    expect(screen.getByText('Prévia: últimas empresas detectadas')).toBeInTheDocument()
    expect(screen.getByText('Movimentação pública de cargos de liderança')).toBeInTheDocument()
    expect(screen.getByText('Varredura diária de cada Conta do público')).toBeInTheDocument()
    expect(screen.getByText('2 créditos por Conta varrida')).toBeInTheDocument()
    expect(screen.getByText('Conta Quente por 30 dias, nas suas Contas-alvo')).toBeInTheDocument()
    expect(screen.getByText('Candidata na Descoberta, quando a empresa ainda não é Conta-alvo')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(EMOJI)
  })

  it('o Sinal interno não gasta crédito', async () => {
    renderizarApp('/sinais/tipos/sem-resposta')
    expect(await screen.findByText('Não gasta crédito')).toBeInTheDocument()
  })

  it('um lançamento troca o Ativar Monitoramento pelo Avise-me', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/anuncios-google')
    const capa = await screen.findByRole('region', { name: 'Capa do Sinal' })
    expect(screen.queryByRole('link', { name: 'Ativar Monitoramento' })).not.toBeInTheDocument()
    expect(within(capa).getByText('Lançamento')).toBeInTheDocument()
    await usuario.click(within(capa).getByRole('button', { name: 'Avise-me quando Anunciando no Google lançar' }))
    expect(await within(capa).findByText('Você será avisado')).toBeInTheDocument()
  })
})
