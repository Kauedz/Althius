import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AchadoDaRodada,
  BloqueioDaRodada,
  HistoricoDeRodadas,
  PedidoDeRodada,
  PreviaDaRodada,
  RodadaRegistrada,
} from '@/fonte/rodadas-do-sinal'
import { ErroDaRodada } from '@/fonte/rodadas-do-sinal'
import type { FonteDeSinais } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// Rodar agora, Rodadas e Sinais encontrados (agente-de-sinal 02): a prévia em créditos antes de rodar, o bloqueio em texto
// neutro, a fila que vira "Rodando" e depois Rodada (conferida a cada 30 segundos, sem consultar sem parar), a lista de
// Rodadas com a origem e o motivo da parada e os Sinais encontrados com o "por que apareceu". Sobre a Fonte da Demonstração,
// com as respostas que cada teste quer; a ligação com o banco é testada à parte (rodar-agora-no-operacional.test.tsx).

const ROTA = '/sinais/tipos/abertura-de-vagas/vagas-engenharia-de-dados'
const MONITOR = 'vagas-engenharia-de-dados'

const PREVIA: PreviaDaRodada = {
  contas: 12, contasSemDado: 0, creditosPorConta: 2, ateCreditos: 24, saldo: 180, ilimitado: false, bloqueio: null,
}

const rodada = (o: Partial<RodadaRegistrada> = {}): RodadaRegistrada => ({
  id: 'rodada-1',
  origem: 'manual',
  estado: 'concluida',
  iniciadaEm: '2026-10-20T13:00:00.000Z',
  terminouEm: '2026-10-20T13:04:00.000Z',
  contasNoEscopo: 12,
  contasVerificadas: 12,
  contasSemDado: 0,
  sinaisNovos: 3,
  sinaisRepetidos: 0,
  creditos: 24,
  motivoDaParada: 'concluida',
  versaoDoPlano: 1,
  observacao: null,
  ...o,
})

const achado = (o: Partial<AchadoDaRodada> = {}): AchadoDaRodada => ({
  id: 'sinal-1',
  contaId: 'nubank',
  contaNome: 'Nubank',
  tipo: 'vaga_linkedin',
  frase: 'Abriu vaga: Head de RevOps',
  data: '2026-10-18T10:00:00.000Z',
  fonte: 'LinkedIn',
  evidencia: 'https://exemplo.com.br/vagas/head-de-revops',
  situacao: 'novo',
  porQue: 'Combina com o Plano: Abertura de vagas (função: RevOps e GTM; período: Últimos 30 dias)',
  ...o,
})

interface Banco {
  previa: PreviaDaRodada
  rodadas: RodadaRegistrada[]
  pedidos: PedidoDeRodada[]
  achados: Record<string, AchadoDaRodada[]>
  rodarAgora: () => Promise<void>
}

function bancoFalso(parcial: Partial<Banco> = {}) {
  const banco: Banco = {
    previa: PREVIA,
    rodadas: [],
    pedidos: [],
    achados: {},
    rodarAgora: () => Promise.resolve(),
    ...parcial,
  }
  const chamadas = { previa: 0, rodadas: 0, achados: [] as string[], rodarAgora: 0 }
  const sinais = (fonte: FonteDeSinais): FonteDeSinais => ({
    ...fonte,
    previaDaRodada: () => (chamadas.previa++, Promise.resolve({ ...banco.previa })),
    rodarAgora: () => (chamadas.rodarAgora++, banco.rodarAgora()),
    rodadas: (): Promise<HistoricoDeRodadas> => (chamadas.rodadas++, Promise.resolve({ rodadas: [...banco.rodadas], pedidos: [...banco.pedidos] })),
    achadosDaRodada: (id) => (chamadas.achados.push(id), Promise.resolve([...(banco.achados[id] ?? [])])),
  })
  return { banco, chamadas, sinais }
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('Rodar agora: a prévia em créditos', () => {
  it('a confirmação diz as Contas, o máximo de créditos, o saldo e que a Conta sem dado não é cobrada', async () => {
    const { sinais } = bancoFalso()
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(
      'Vai verificar até 12 Contas. Até 24 créditos (2 por Conta). Seu saldo: 180 créditos. Contas sem dado suficiente não são cobradas.',
    )).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Rodar' })).toBeEnabled()
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    // Só créditos: nada de dólar, de Teto nem de fornecedor.
    expect(dialogo.textContent).not.toMatch(/US\$|\$|teto|apify|actor/i)
  })

  it('no singular e com as Contas que devem ficar de fora', async () => {
    const { sinais } = bancoFalso({ previa: { ...PREVIA, contas: 1, ateCreditos: 2, saldo: 1, contasSemDado: 1 } })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(
      'Vai verificar até 1 Conta. Até 2 créditos (2 por Conta). Seu saldo: 1 crédito. Contas sem dado suficiente não são cobradas.',
    )).toBeInTheDocument()
    expect(within(dialogo).getByText('Pelo que sabemos, 1 Conta não tem dado suficiente e deve ficar de fora.')).toBeInTheDocument()
  })

  it('a Equipe Althius, ilimitada, vê "Ilimitado" no lugar do saldo', async () => {
    const { sinais } = bancoFalso({ previa: { ...PREVIA, ilimitado: true, saldo: -40 } })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))

    expect(within(await screen.findByRole('dialog')).getByText(/Seu saldo: Ilimitado\./)).toBeInTheDocument()
  })

  it('Cancelar fecha a confirmação sem pedir nada', async () => {
    const { sinais, chamadas } = bancoFalso()
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chamadas.rodarAgora).toBe(0)
  })
})

describe('Rodar agora: o bloqueio em texto neutro', () => {
  const FRASES: [BloqueioDaRodada, string][] = [
    ['sem_creditos', 'Sem créditos suficientes. Fale com o responsável pelo plano.'],
    ['ja_na_fila', 'Já tem uma rodada na fila.'],
    ['contrato_inativo', 'Contrato inativo. Fale com a equipe Althius para reativar.'],
    ['limite_do_mes', 'Limite do mês atingido. Ele volta na renovação ou fale com a equipe Althius.'],
    ['limite_do_participante', 'Você chegou ao seu limite mensal de créditos. Fale com o responsável pelo plano.'],
    ['sem_permissao', 'Só quem criou o Sinal, ou um Administrador, pode rodá-lo.'],
    ['sem_contas', 'Escolha ao menos uma Conta-alvo para rodar.'],
  ]

  it.each(FRASES)('%s: o botão fica desabilitado e diz o motivo', async (bloqueio, frase) => {
    const { sinais, chamadas } = bancoFalso({ previa: { ...PREVIA, bloqueio } })
    renderizarAppCom(ROTA, { sinais })

    const botao = await screen.findByRole('button', { name: 'Rodar agora' })
    expect(botao).toBeDisabled()
    expect(screen.getByText(frase)).toBeInTheDocument()
    expect(botao).toHaveAccessibleDescription(frase)
    expect(chamadas.rodarAgora).toBe(0)
  })

  it('o intervalo mínimo diz depois de que horas (horário de Brasília) tentar de novo', async () => {
    const { sinais } = bancoFalso({ previa: { ...PREVIA, bloqueio: 'intervalo_minimo', liberadoEm: '2026-10-23T17:30:00.000Z' } })
    renderizarAppCom(ROTA, { sinais })

    expect(await screen.findByText('Este Sinal rodou há pouco. Tente de novo depois das 14:30.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rodar agora' })).toBeDisabled()
  })

  it('o Sinal sem fonte por Conta não oferece o botão, mas o histórico continua', async () => {
    const { sinais } = bancoFalso({ previa: { ...PREVIA, bloqueio: 'sem_fonte' }, rodadas: [rodada({ origem: 'agenda' })] })
    renderizarAppCom(ROTA, { sinais })

    expect(await screen.findByRole('region', { name: 'Rodadas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rodar agora' })).not.toBeInTheDocument()
  })

  it('a recusa na hora de pedir (outra pessoa pediu primeiro) fica na confirmação, em palavras do produto', async () => {
    const { sinais } = bancoFalso({ rodarAgora: () => Promise.reject(new ErroDaRodada('ja_na_fila')) })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Já tem uma rodada na fila.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('uma falha qualquer do servidor vira a mensagem recuperável, sem texto técnico', async () => {
    const { sinais } = bancoFalso({ rodarAgora: () => Promise.reject(new Error('')) })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não foi possível pedir a rodada. Tente de novo.')
  })
})

describe('Rodar agora: da fila à Rodada', () => {
  it('na fila, rodando e feita: conferida a cada 30 segundos, sem consultar sem parar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { sinais, chamadas, banco } = bancoFalso({
      rodarAgora: () => {
        banco.pedidos = [{ id: 'pedido-1', estado: 'pendente', pedidoEm: '2026-10-23T12:00:00.000Z', ateCreditos: 24, rodadaId: null }]
        return Promise.resolve()
      },
    })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    // Sem Rodada na fila, a tela não confere de tempos em tempos.
    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    const dialogo = await screen.findByRole('dialog')
    const consultasAntes = chamadas.rodadas
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(chamadas.rodadas).toBe(consultasAntes)

    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))
    expect(await screen.findByText('Na fila. Começa em até 10 minutos.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rodar agora' })).toBeDisabled()
    expect(chamadas.rodarAgora).toBe(1)

    // O relógio pegou o pedido: a Rodada abriu. A tela só sabe 30 segundos depois.
    banco.pedidos = [{ id: 'pedido-1', estado: 'rodando', pedidoEm: '2026-10-23T12:00:00.000Z', ateCreditos: 24, rodadaId: 'rodada-1' }]
    banco.rodadas = [rodada({ estado: 'rodando', terminouEm: null, contasVerificadas: 4, sinaisNovos: 1, creditos: 8, motivoDaParada: null })]
    const consultasNaFila = chamadas.rodadas
    await act(async () => { vi.advanceTimersByTime(29_000) })
    expect(chamadas.rodadas).toBe(consultasNaFila)
    expect(screen.getByText('Na fila. Começa em até 10 minutos.')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(await screen.findByText('Rodando.', { selector: '[role="status"]' })).toBeInTheDocument()
    expect(chamadas.rodadas).toBe(consultasNaFila + 1)
    expect(screen.getByRole('button', { name: 'Rodar agora' })).toBeDisabled()

    // A Rodada terminou: o pedido sai da fila, o botão volta e a Rodada aparece na lista.
    banco.pedidos = []
    banco.rodadas = [rodada()]
    await act(async () => { vi.advanceTimersByTime(30_000) })
    const lista = await screen.findByRole('list', { name: 'Rodadas do Sinal' })
    expect(within(lista).getByText('Concluída.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rodar agora' })).toBeEnabled()
    expect(screen.queryByText('Rodando.')).not.toBeInTheDocument()

    // Terminou: a tela volta a não consultar.
    const consultasNoFim = chamadas.rodadas
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(chamadas.rodadas).toBe(consultasNoFim)
  })

  it('uma Rodada agendada que está rodando também é acompanhada', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { sinais, chamadas, banco } = bancoFalso({
      rodadas: [rodada({ origem: 'agenda', estado: 'rodando', terminouEm: null, motivoDaParada: 'prazo' })],
    })
    renderizarAppCom(ROTA, { sinais })

    expect(await screen.findByText('Rodando.', { selector: '[role="status"]' })).toBeInTheDocument()
    expect(screen.getByText('Rodando. Continua na próxima volta.')).toBeInTheDocument()
    const antes = chamadas.rodadas
    banco.rodadas = [rodada({ origem: 'agenda' })]
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(await screen.findByText('Concluída.')).toBeInTheDocument()
    expect(chamadas.rodadas).toBeGreaterThan(antes)
  })
})

describe('Rodadas e Sinais encontrados', () => {
  it('lista a data e a hora em Brasília, a origem, as Contas verificadas, os Sinais novos, os créditos e o motivo da parada', async () => {
    const { sinais } = bancoFalso({
      rodadas: [
        rodada({ id: 'r-manual' }),
        rodada({
          id: 'r-agendada', origem: 'agenda', iniciadaEm: '2026-10-19T09:30:00.000Z', contasVerificadas: 1, sinaisNovos: 0, creditos: 2,
          motivoDaParada: 'sem_creditos', contasSemDado: 2,
        }),
        rodada({ id: 'r-teto', iniciadaEm: '2026-10-18T09:30:00.000Z', motivoDaParada: 'teto' }),
        rodada({ id: 'r-contrato', iniciadaEm: '2026-10-17T09:30:00.000Z', motivoDaParada: 'contrato_inativo' }),
        rodada({ id: 'r-erro', iniciadaEm: '2026-10-16T09:30:00.000Z', estado: 'falhou', motivoDaParada: 'erro', observacao: 'Não foi possível varrer: Alfa.' }),
      ],
    })
    renderizarAppCom(ROTA, { sinais })

    const lista = await screen.findByRole('list', { name: 'Rodadas do Sinal' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(5)
    // 13:00 UTC é 10:00 em Brasília.
    expect(itens[0]).toHaveTextContent('20/10/2026 10:00')
    expect(itens[0]).toHaveTextContent('Manual')
    expect(itens[0]).toHaveTextContent('12 Contas verificadas · 3 Sinais novos · 24 créditos')
    expect(itens[0]).toHaveTextContent('Concluída.')
    expect(itens[1]).toHaveTextContent('19/10/2026 06:30')
    expect(itens[1]).toHaveTextContent('Agendada')
    expect(itens[1]).toHaveTextContent('1 Conta verificada · 0 Sinais novos · 2 créditos · 2 Contas sem dado suficiente')
    expect(itens[1]).toHaveTextContent('Parou: acabaram os créditos.')
    expect(itens[2]).toHaveTextContent('Parou: limite do mês ou da automação.')
    expect(itens[3]).toHaveTextContent('Parou: contrato inativo.')
    expect(itens[4]).toHaveTextContent('Terminou com erro.')
    expect(itens[4]).toHaveTextContent('Não foi possível varrer: Alfa.')
    expect(lista.textContent).not.toMatch(/US\$|apify|actor/i)
  })

  it('sem Rodada nenhuma, diz como começar', async () => {
    const { sinais } = bancoFalso()
    renderizarAppCom(ROTA, { sinais })

    expect(await screen.findByText('Nenhuma rodada ainda. Use Rodar agora para ver o que o Sinal encontra.')).toBeInTheDocument()
  })

  it('clicar numa Rodada abre os Sinais encontrados, cada um com a Conta, a frase, o "por que apareceu" e a evidência', async () => {
    const { sinais, chamadas } = bancoFalso({
      rodadas: [rodada()],
      achados: {
        'rodada-1': [
          achado(),
          achado({
            id: 'sinal-2', contaId: 'stripe', contaNome: 'Stripe', frase: 'Abriu vaga: SDR', situacao: 'visto_de_novo',
            evidencia: 'texto sem link', fonte: null,
          }),
        ],
      },
    })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    const rodadaDaLista = await screen.findByRole('button', { name: /20\/10\/2026 10:00/ })
    expect(rodadaDaLista).toHaveAttribute('aria-expanded', 'false')
    expect(chamadas.achados).toEqual([])
    await usuario.click(rodadaDaLista)

    expect(rodadaDaLista).toHaveAttribute('aria-expanded', 'true')
    const cartoes = within(await screen.findByRole('list', { name: 'Sinais encontrados' })).getAllByRole('listitem')
    expect(chamadas.achados).toEqual(['rodada-1'])
    expect(cartoes).toHaveLength(2)

    expect(within(cartoes[0]).getByRole('link', { name: 'Nubank' })).toHaveAttribute('href', '/contas/nubank')
    expect(cartoes[0]).toHaveTextContent('Abertura de vagas')
    expect(cartoes[0]).toHaveTextContent('Abriu vaga: Head de RevOps')
    expect(cartoes[0]).toHaveTextContent(
      'Por que apareceuCombina com o Plano: Abertura de vagas (função: RevOps e GTM; período: Últimos 30 dias)',
    )
    expect(cartoes[0]).toHaveTextContent('LinkedIn · 18/10/2026')
    expect(within(cartoes[0]).getByRole('link', { name: 'Ver evidência' })).toHaveAttribute('href', 'https://exemplo.com.br/vagas/head-de-revops')
    expect(cartoes[0]).not.toHaveTextContent('Visto de novo')

    expect(within(cartoes[1]).getByRole('link', { name: 'Stripe' })).toHaveAttribute('href', '/contas/stripe')
    expect(cartoes[1]).toHaveTextContent('Visto de novo')
    expect(within(cartoes[1]).queryByRole('link', { name: 'Ver evidência' })).not.toBeInTheDocument()
    expect(cartoes[1]).toHaveTextContent('texto sem link')

    // Clicar de novo recolhe.
    await usuario.click(rodadaDaLista)
    expect(screen.queryByRole('list', { name: 'Sinais encontrados' })).not.toBeInTheDocument()
  })

  it('a Rodada sem novidade diz que não houve Sinal novo', async () => {
    const { sinais } = bancoFalso({ rodadas: [rodada({ sinaisNovos: 0 })], achados: { 'rodada-1': [] } })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: /20\/10\/2026 10:00/ }))

    expect(await screen.findByText('Nenhum Sinal novo nesta rodada.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Sinais encontrados' })).not.toBeInTheDocument()
  })

  it('só Sinais vistos de novo também é uma Rodada sem Sinal novo, e os reencontros aparecem', async () => {
    const { sinais } = bancoFalso({
      rodadas: [rodada({ sinaisNovos: 0, sinaisRepetidos: 1 })],
      achados: { 'rodada-1': [achado({ situacao: 'visto_de_novo' })] },
    })
    const { usuario } = renderizarAppCom(ROTA, { sinais })

    await usuario.click(await screen.findByRole('button', { name: /20\/10\/2026 10:00/ }))

    expect(await screen.findByText('Nenhum Sinal novo nesta rodada.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Sinais encontrados' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('uma falha ao carregar as Rodadas ou os Sinais dá para tentar de novo', async () => {
    let falhar = true
    const { sinais, banco } = bancoFalso({ rodadas: [rodada()], achados: { 'rodada-1': [achado()] } })
    const { usuario } = renderizarAppCom(ROTA, {
      sinais: (fonte) => ({
        ...sinais(fonte),
        achadosDaRodada: (id) => (falhar ? Promise.reject(new Error('banco fora do ar')) : Promise.resolve(banco.achados[id])),
      }),
    })

    await usuario.click(await screen.findByRole('button', { name: /20\/10\/2026 10:00/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar os Sinais desta rodada.')
    expect(alerta).not.toHaveTextContent(/banco fora do ar/)
    falhar = false
    await usuario.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('list', { name: 'Sinais encontrados' })).toBeInTheDocument()
  })
})

describe('Na Demonstração', () => {
  it('a Fonte simulada devolve uma Rodada fixa: prévia, pedido na fila, histórico e Sinais encontrados', async () => {
    const { usuario } = renderizarApp(ROTA)

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(
      'Vai verificar até 12 Contas. Até 24 créditos (2 por Conta). Seu saldo: 180 créditos. Contas sem dado suficiente não são cobradas.',
    )).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))
    expect(await screen.findByText('Na fila. Começa em até 10 minutos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rodar agora' })).toBeDisabled()

    const lista = await screen.findByRole('list', { name: 'Rodadas do Sinal' })
    expect(within(lista).getByText('Manual')).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: /20\/10\/2026 10:00/ }))
    const cartoes = within(await screen.findByRole('list', { name: 'Sinais encontrados' })).getAllByRole('listitem')
    expect(cartoes).toHaveLength(2)
    expect(cartoes[0]).toHaveTextContent('Por que apareceu')
  })

  it('o que já existia na página do Monitoramento continua lá', async () => {
    renderizarApp(ROTA)

    expect(await screen.findByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Vagas de engenharia de dados')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
    expect(MONITOR).toBeTruthy()
  })
})
