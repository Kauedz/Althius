import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaDescoberta, FonteDeDescobertas, ResultadoDoAceite } from '@/fonte/descobertas-tipos'
import type { FonteDeContas } from '@/fonte/tipos'
import type { FonteDeSinais } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const EXTRA: Partial<ContaDescoberta> = { tags: [], motivos: [], sinais: [], origem: 'busca', motivosDeSinal: [], criadaEm: '2026-10-01T10:00:00.000Z' }

const SEM_SITE: ContaDescoberta = {
  ...EXTRA, id: 'cand-cnpj', state: 'nova', nome: 'Ômega Energia S.A.', cnpj: '04.252.011/0001-10', fitLevel: 'baixo', origem: 'sinal',
  motivosDeSinal: [{ id: 'm1', tipo: 'nova_filial_icp_g', frase: 'Abriu filial em Campinas', fonte: 'Diário Oficial', data: '2026-10-02T12:00:00.000Z', valido: true, mercado: false }],
} as ContaDescoberta

const SEM_NADA: ContaDescoberta = { ...EXTRA, id: 'cand-nada', state: 'nova', nome: 'Pi Serviços Ltda', fitLevel: 'sem_dado' } as ContaDescoberta

const SINCRONIZADA: ContaDescoberta = {
  ...EXTRA, id: 'cand-sync', state: 'nova', nome: 'Rô Sincronizada Ltda', website: 'https://ro.test', dominio: 'ro.test', fitLevel: 'medio', origem: 'sincronizacao',
} as ContaDescoberta

/** A Fonte de Descobertas da Demonstração com uma lista de novas escolhida pelo teste e um aceite que o teste observa. */
function descobertasCom(novas: ContaDescoberta[], resultado: Partial<ResultadoDoAceite> = {}) {
  const aceitar = vi.fn(async (_id: string, _url?: string): Promise<ResultadoDoAceite> => ({
    targetAccountId: 'conta-nova', created: true, sinaisMigrados: 1, comite: 'liberado', ...resultado,
  }))
  const ajuste = (fonte: FonteDeDescobertas): FonteDeDescobertas =>
    Object.assign(Object.create(fonte) as FonteDeDescobertas, {
      listarDescobertas: (estado = 'nova') => Promise.resolve(estado === 'nova' ? novas : []),
      aceitarDescoberta: aceitar,
    })
  return { aceitar, ajuste }
}

function contasComComite(buscar: FonteDeContas['buscarComite']) {
  return (fonte: FonteDeContas): FonteDeContas => Object.assign(Object.create(fonte) as FonteDeContas, { buscarComite: buscar })
}

describe('Descobertas que vieram de um Sinal', () => {
  it('a coluna Motivos / Sinais mostra o Sinal mais recente em linguagem de usuário, com +N, e o detalhe lista todos', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')
    const linha = (await screen.findByText('Órbita Agroindustrial S.A.')).closest('tr')!

    expect(within(linha).getByText('Sinal: abriu filial em Campinas (21/09)')).toBeInTheDocument()
    expect(within(linha).queryByText(/Financiamento aprovado/)).not.toBeInTheDocument()
    await usuario.click(within(linha).getByRole('button', { name: /Mais 2 Sinais de Órbita Agroindustrial S\.A\./ }))

    const detalhe = await screen.findByRole('group', { name: 'Detalhes de Órbita Agroindustrial S.A.' })
    const sinais = within(within(detalhe).getByRole('list', { name: 'Sinais da candidata' })).getAllByRole('listitem')
    expect(sinais).toHaveLength(3)
    expect(sinais[0]).toHaveTextContent('Abriu filial em Campinas')
    expect(sinais[0]).toHaveTextContent('21 de setembro de 2026 · Diário Oficial')
    expect(sinais[1]).toHaveTextContent('Financiamento aprovado para nova linha de produção')
    expect(sinais[1]).toHaveTextContent('vencido')
    expect(detalhe).toHaveTextContent('Origem: Sinal')
    expect(detalhe.textContent).not.toMatch(/apify|actor|harvest|unipile|openai|anthropic/i)
    // Fechar o detalhe.
    await usuario.click(within(linha).getByRole('button', { name: /Ocultar detalhes de Órbita/ }))
    expect(screen.queryByRole('group', { name: 'Detalhes de Órbita Agroindustrial S.A.' })).not.toBeInTheDocument()
  })

  it('uma candidata que voltou por Sinal novo diz isso, com o motivo do descarte anterior', async () => {
    renderizarApp('/contas/descobertas')
    const linha = (await screen.findByText('Vértice Embalagens Ltda')).closest('tr')!
    expect(within(linha).getByText('Voltou por novo Sinal')).toBeInTheDocument()
    expect(within(linha).getByText(/Descarte anterior: Fora do ICP: porte menor que o mínimo/)).toBeInTheDocument()
    expect(within(linha).getByText('Sinal: inaugurou nova planta em Joinville (20/09)')).toBeInTheDocument()
    // Sem +N quando só há um Sinal.
    expect(within(linha).queryByRole('button', { name: /Mais \d+ Sinal/ })).not.toBeInTheDocument()
  })

  it('o filtro Origem separa Sinal e Busca, e Sincronização só aparece quando há dado dessa origem', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')
    expect(await screen.findByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    const origem = screen.getByRole('combobox', { name: 'Origem' })
    expect(within(origem).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Sinal', 'Busca'])

    await usuario.selectOptions(origem, 'Sinal')
    expect(screen.getByText('Órbita Agroindustrial S.A.')).toBeInTheDocument()
    expect(screen.getByText('Vértice Embalagens Ltda')).toBeInTheDocument()
    expect(screen.queryByText('LogiFlow Brasil S.A.')).not.toBeInTheDocument()

    await usuario.selectOptions(origem, 'Busca')
    expect(screen.getByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.queryByText('Órbita Agroindustrial S.A.')).not.toBeInTheDocument()

    await usuario.selectOptions(origem, 'Todas')
    expect(screen.getByText('Órbita Agroindustrial S.A.')).toBeInTheDocument()
    expect(screen.getByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
  })

  it('com dado de sincronização, a opção Sincronização aparece e filtra', async () => {
    const { ajuste } = descobertasCom([SEM_NADA, SINCRONIZADA, SEM_SITE])
    const { usuario } = renderizarAppCom('/contas/descobertas', { descobertas: ajuste })
    expect(await screen.findByText('Rô Sincronizada Ltda')).toBeInTheDocument()
    const origem = screen.getByRole('combobox', { name: 'Origem' })
    expect(within(origem).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Sinal', 'Busca', 'Sincronização'])
    await usuario.selectOptions(origem, 'Sincronização')
    expect(screen.getByText('Rô Sincronizada Ltda')).toBeInTheDocument()
    expect(screen.queryByText('Pi Serviços Ltda')).not.toBeInTheDocument()
    expect(screen.queryByText('Ômega Energia S.A.')).not.toBeInTheDocument()
  })

  it('o nível sem dado aparece com palavras, nunca como número', async () => {
    const { ajuste } = descobertasCom([SEM_NADA])
    renderizarAppCom('/contas/descobertas', { descobertas: ajuste })
    expect(await screen.findByText('Encaixe sem dado')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\bnota\b|\bscore\b/i)
  })

  it('a candidata de Sinal mostra só o nível de Aderência, sem expor uma nota numérica', async () => {
    const { ajuste } = descobertasCom([SEM_SITE])
    renderizarAppCom('/contas/descobertas', { descobertas: ajuste })
    const linha = (await screen.findByText('Ômega Energia S.A.')).closest('tr')!
    expect(within(linha).getByText('Encaixe baixo')).toBeInTheDocument()
    expect(linha.textContent).not.toMatch(/\b(?:score|nota)\s*:?\s*\d+/i)
  })

  it('"Ver candidata" abre a Caixa na aba certa, com o detalhe aberto', async () => {
    renderizarApp('/contas/descobertas?candidata=desc-4')
    expect(await screen.findByRole('group', { name: 'Detalhes de Órbita Agroindustrial S.A.' })).toBeInTheDocument()
  })
})

describe('Aceitar uma candidata que veio de um Sinal', () => {
  it('só com CNPJ, aceita sem pedir o site e dispara o Comitê quando o aceite diz que pode', async () => {
    const { aceitar, ajuste } = descobertasCom([SEM_SITE], { sinaisMigrados: 1, comite: 'liberado' })
    const buscar = vi.fn(async () => ({ encontradas: 4, novas: 3, jaEncontradas: 1 }))
    const { usuario } = renderizarAppCom('/contas/descobertas', { descobertas: ajuste, contas: contasComComite(buscar) })

    const linha = (await screen.findByText('Ômega Energia S.A.')).closest('tr')!
    expect(within(linha).getByText('Sem site')).toBeInTheDocument()
    await usuario.click(within(linha).getByRole('button', { name: /Aceitar/ }))

    expect(screen.queryByText(/Informar site de/)).not.toBeInTheDocument()
    await waitFor(() => expect(aceitar).toHaveBeenCalledWith('cand-cnpj', undefined))
    await waitFor(() => expect(buscar).toHaveBeenCalledWith('conta-nova'))
    const aviso = await screen.findByText(/Comitê de compra: 3 pessoas sugeridas para abordagem/)
    expect(aviso).toHaveTextContent('Ômega Energia S.A. agora é uma Conta-alvo com 1 Sinal.')
  })

  it('sem saldo, não dispara o Comitê e manda para o botão Enriquecer Comitê da Conta', async () => {
    const { ajuste } = descobertasCom([SEM_SITE], { sinaisMigrados: 2, comite: 'sem_saldo' })
    const buscar = vi.fn(async () => ({ encontradas: 0, novas: 0, jaEncontradas: 0 }))
    const { usuario } = renderizarAppCom('/contas/descobertas', { descobertas: ajuste, contas: contasComComite(buscar) })
    await usuario.click(within((await screen.findByText('Ômega Energia S.A.')).closest('tr')!).getByRole('button', { name: /Aceitar/ }))

    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('agora é uma Conta-alvo com 2 Sinais.')
    expect(aviso).toHaveTextContent('Sem créditos suficientes para enriquecer o Comitê agora: use Enriquecer Comitê na Conta')
    expect(buscar).not.toHaveBeenCalled()
  })

  it('no limite do mês, mostra só a mensagem do limite e não dispara o Comitê', async () => {
    const { ajuste } = descobertasCom([SEM_SITE], { sinaisMigrados: 0, comite: 'limite_do_mes' })
    const buscar = vi.fn(async () => ({ encontradas: 0, novas: 0, jaEncontradas: 0 }))
    const { usuario } = renderizarAppCom('/contas/descobertas', { descobertas: ajuste, contas: contasComComite(buscar) })
    await usuario.click(within((await screen.findByText('Ômega Energia S.A.')).closest('tr')!).getByRole('button', { name: /Aceitar/ }))

    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.')
    expect(aviso.textContent).not.toMatch(/US\$/)
    expect(buscar).not.toHaveBeenCalled()
  })

  it('se o Comitê falha depois do aceite, a Conta já existe e a pessoa é mandada ao botão Enriquecer Comitê', async () => {
    const { ajuste } = descobertasCom([SEM_SITE])
    const { usuario } = renderizarAppCom('/contas/descobertas', {
      descobertas: ajuste,
      contas: contasComComite(vi.fn(async () => { throw new Error('falhou') })),
    })
    await usuario.click(within((await screen.findByText('Ômega Energia S.A.')).closest('tr')!).getByRole('button', { name: /Aceitar/ }))
    expect(await screen.findByText(/Não foi possível enriquecer o Comitê agora: use Enriquecer Comitê na Conta/)).toBeInTheDocument()
  })

  it('sem site e sem CNPJ, a pessoa informa o endereço antes de aceitar', async () => {
    const { aceitar, ajuste } = descobertasCom([SEM_NADA])
    const { usuario } = renderizarAppCom('/contas/descobertas', { descobertas: ajuste })
    await usuario.click(within((await screen.findByText('Pi Serviços Ltda')).closest('tr')!).getByRole('button', { name: /Aceitar/ }))
    expect(await screen.findByText('Informar site de Pi Serviços Ltda')).toBeInTheDocument()
    expect(aceitar).not.toHaveBeenCalled()
    await usuario.type(screen.getByPlaceholderText('https://empresa.com.br'), 'https://pi.test')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Aceitar' }))
    await waitFor(() => expect(aceitar).toHaveBeenCalledWith('cand-nada', 'https://pi.test'))
  })
})

describe('Sinais com empresa: Ver Conta e Ver candidata', () => {
  const comEmpresas = (fonte: FonteDeSinais): FonteDeSinais =>
    Object.assign(Object.create(fonte) as FonteDeSinais, {
      cascatas: () => Promise.resolve([]),
      sinaisDeMercado: (icp: string) => Promise.resolve(icp === 'A'
        ? [
          { id: 'm1', tipo: 'licenca_instalacao_dou', nome: 'Licença de instalação', frase: 'Licença publicada para uma empresa', data: '2026-10-01T00:00:00.000Z', empresa: { tipo: 'candidata' as const, id: 'cand-9' } },
          { id: 'm2', tipo: 'licenca_instalacao_dou', nome: 'Licença de instalação', frase: 'Licença publicada para a Alfa', data: '2026-10-02T00:00:00.000Z', empresa: { tipo: 'conta' as const, id: 'conta-9' } },
          { id: 'm3', tipo: 'licenca_instalacao_dou', nome: 'Licença de instalação', frase: 'Licença sem empresa', data: '2026-10-03T00:00:00.000Z' },
        ]
        : []),
      sinaisDeCandidatas: () => Promise.resolve([
        { id: 'sc-1', candidataId: 'cand-9', empresa: 'Ômega Energia S.A.', tipoId: 'qualquer', frase: 'Abriu filial em Campinas', data: '2026-09-22T12:00:00.000Z', fonte: 'Diário Oficial' },
      ]),
    })

  it('em Mercado, o Sinal com empresa leva à candidata ou à Conta; o sem empresa fica só no painel', async () => {
    renderizarAppCom('/sinais/mercado/comex-e-importacao', { sinais: comEmpresas })
    expect(await screen.findByText('Licença publicada para uma empresa')).toBeInTheDocument()
    const candidata = screen.getByText('Licença publicada para uma empresa').closest('li')!
    expect(within(candidata).getByRole('link', { name: 'Ver candidata' })).toHaveAttribute('href', '/contas/descobertas?candidata=cand-9')
    const conta = screen.getByText('Licença publicada para a Alfa').closest('li')!
    expect(within(conta).getByRole('link', { name: 'Ver Conta' })).toHaveAttribute('href', '/sinais/contas/conta-9')
    const semEmpresa = screen.getByText('Licença sem empresa').closest('li')!
    expect(within(semEmpresa).queryByRole('link')).not.toBeInTheDocument()
  })

  it('em Sinais encontrados, as linhas das Contas têm Ver Conta e as das candidatas, Ver candidata', async () => {
    renderizarAppCom('/sinais?vista=encontrados', { sinais: comEmpresas })
    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    const linhaDaCandidata = within(tabela).getByText('Ômega Energia S.A.').closest('tr')!
    expect(within(linhaDaCandidata).getByRole('link', { name: 'Ver candidata' })).toHaveAttribute('href', '/contas/descobertas?candidata=cand-9')
    expect(within(linhaDaCandidata).getByText('Abriu filial em Campinas')).toBeInTheDocument()
    const links = within(tabela).getAllByRole('link', { name: 'Ver Conta' })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute('href')).toMatch(/^\/sinais\/contas\//)
  })
})
