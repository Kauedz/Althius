import { describe, expect, it } from 'vitest'
import { ErroDaAgenda } from './agenda-do-sinal'
import { ErroDoLimite } from './preco-por-rodada'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'

// A estimativa e o limite por dia na Demonstração (agente-de-sinal 04): em memória, com a mesma conta e as mesmas recusas do servidor.

const MONITOR = 'vagas-engenharia-de-dados'
const HOJE = new Date('2026-10-23T21:00:00Z')

async function contasDoMonitor() {
  const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })
  return { fonte, contas: (await fonte.monitoramento(MONITOR)).publico.listas.length }
}

describe('a estimativa da Demonstração', () => {
  it('segue a Agenda proposta: o preço fixo de exemplo (2 créditos por Conta) vezes as Contas, rodadas por dia e por semana', async () => {
    const { fonte, contas } = await contasDoMonitor()

    const e = await fonte.estimarAgenda!(MONITOR, { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] })

    expect(e).toMatchObject({
      porRodada: contas * 2, rodadasPorSemana: 10, porDia: contas * 4, porMesAprox: Math.ceil((10 * 52 * contas * 2) / 12), bloqueio: null,
      limiteSugeridoPorDia: contas * 4,
    })
  })

  it('sem Agenda proposta usa a gravada, e sem nenhuma, uma rodada por dia', async () => {
    const { fonte, contas } = await contasDoMonitor()
    expect((await fonte.estimarAgenda!(MONITOR)).porDia).toBe(contas * 2)

    await fonte.salvarAgenda!(MONITOR, { horarios: ['08:00', '14:00', '18:00'], dias: [1, 2, 3] })

    const gravada = await fonte.estimarAgenda!(MONITOR)
    expect(gravada.porDia).toBe(contas * 6)
    expect(gravada.avisoDeRepeticao).toBe(true)
  })

  it('recusa a Agenda que o servidor recusa', async () => {
    const { fonte } = await contasDoMonitor()

    await expect(fonte.estimarAgenda!(MONITOR, { horarios: ['08:00', '09:00'], dias: [1] })).rejects.toBeInstanceOf(ErroDaAgenda)
  })
})

describe('o limite por dia da Demonstração', () => {
  it('grava de 1 ao máximo de um dia da Agenda e devolve uma cópia', async () => {
    const { fonte, contas } = await contasDoMonitor()
    await fonte.salvarAgenda!(MONITOR, { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] })

    const salvo = await fonte.salvarLimitePorDia!(MONITOR, contas * 3)

    expect(salvo.limitePorDia).toBe(contas * 3)
    salvo.limitePorDia = 1
    expect((await fonte.monitoramento(MONITOR)).limitePorDia).toBe(contas * 3)
  })

  it('só baixa: acima do máximo, zero e fração são recusados com o código', async () => {
    const { fonte, contas } = await contasDoMonitor()
    await fonte.salvarAgenda!(MONITOR, { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] })

    await expect(fonte.salvarLimitePorDia!(MONITOR, contas * 4 + 1)).rejects.toMatchObject({ codigo: 'acima_do_sugerido' })
    await expect(fonte.salvarLimitePorDia!(MONITOR, 0)).rejects.toBeInstanceOf(ErroDoLimite)
    await expect(fonte.salvarLimitePorDia!(MONITOR, 2.5)).rejects.toMatchObject({ codigo: 'limite_invalido' })
    expect((await fonte.monitoramento(MONITOR)).limitePorDia).toBeUndefined()
  })

  it('avisa os observadores, e salvar o formulário do Monitoramento não apaga o limite', async () => {
    const { fonte } = await contasDoMonitor()
    let avisos = 0
    fonte.observar(() => avisos++)

    const salvo = await fonte.salvarLimitePorDia!(MONITOR, 2)
    await fonte.salvarMonitoramento({ ...salvo, nome: 'Outro nome' })

    expect(avisos).toBeGreaterThanOrEqual(1)
    expect((await fonte.monitoramento(MONITOR)).limitePorDia).toBe(2)
  })
})
