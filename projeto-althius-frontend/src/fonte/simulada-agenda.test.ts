import { describe, expect, it } from 'vitest'
import { ErroDaAgenda } from './agenda-do-sinal'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'

// A Agenda na Demonstração (agente-de-sinal 03): fica em memória, com as mesmas recusas do servidor, e não roda nada.

const MONITOR = 'vagas-engenharia-de-dados'
const HOJE = new Date('2026-10-23T21:00:00Z') // sexta 18:00 em Brasília

describe('a Fonte de Sinais da Demonstração guarda a Agenda em memória', () => {
  it('o Monitoramento de exemplo começa sem Agenda', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })

    expect((await fonte.monitoramento(MONITOR)).agenda).toBeUndefined()
  })

  it('grava em ordem, devolve uma cópia e o Monitoramento passa a ter a Agenda', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })
    const agenda = { horarios: ['14:00', '08:00'], dias: [5, 1, 3] }

    const salvo = await fonte.salvarAgenda!(MONITOR, agenda)

    expect(salvo.agenda).toEqual({ horarios: ['08:00', '14:00'], dias: [1, 3, 5] })
    expect(agenda.horarios).toEqual(['14:00', '08:00'])
    salvo.agenda!.horarios.push('20:00')
    expect((await fonte.monitoramento(MONITOR)).agenda?.horarios).toEqual(['08:00', '14:00'])
  })

  it('avisa os observadores, para a tela recarregar', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })
    let avisos = 0
    fonte.observar(() => avisos++)

    await fonte.salvarAgenda!(MONITOR, { horarios: ['08:00'], dias: [1] })

    expect(avisos).toBe(1)
  })

  it('salvar o formulário do Monitoramento não apaga a Agenda', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })
    const salvo = await fonte.salvarAgenda!(MONITOR, { horarios: ['08:00'], dias: [1, 2] })

    await fonte.salvarMonitoramento({ ...salvo, nome: 'Outro nome' })

    expect((await fonte.monitoramento(MONITOR)).agenda).toEqual({ horarios: ['08:00'], dias: [1, 2] })
  })

  it('recusa o que o servidor recusa, com o código', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })

    await expect(fonte.salvarAgenda!(MONITOR, { horarios: ['08:00', '08:45'], dias: [1] })).rejects.toMatchObject({
      name: 'ErroDaAgenda', codigo: 'intervalo_curto',
    })
    await expect(fonte.salvarAgenda!(MONITOR, { horarios: [], dias: [1] })).rejects.toBeInstanceOf(ErroDaAgenda)
    await expect(fonte.salvarAgenda!(MONITOR, { horarios: ['08:00'], dias: [] })).rejects.toMatchObject({ codigo: 'sem_dia' })
    expect((await fonte.monitoramento(MONITOR)).agenda).toBeUndefined()
  })

  it('o Monitoramento que não existe é recusado', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })

    await expect(fonte.salvarAgenda!('nao-existe', { horarios: ['08:00'], dias: [1] })).rejects.toThrow('não encontrado')
  })

  it('os próximos horários saem de "hoje" da Fonte, no cálculo do servidor', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })

    expect(await fonte.proximasRodadas!({ horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] }, 3, 3)).toEqual([
      '2026-10-26T11:00:00.000Z',
      '2026-10-26T17:00:00.000Z',
      '2026-10-27T11:00:00.000Z',
    ])
  })

  it('a prévia recusa a Agenda inválida, mas não recusa mais a de uma lista grande', async () => {
    const fonte = criarFonteDeSinaisSimulada({ hoje: HOJE })

    await expect(fonte.proximasRodadas!({ horarios: ['08:00', '08:45'], dias: [1] }, 3, 3)).rejects.toMatchObject({ codigo: 'intervalo_curto' })
    expect(await fonte.proximasRodadas!({ horarios: ['08:00', '14:00'], dias: [1] }, 500, 3)).toHaveLength(3)
    expect(await fonte.proximasRodadas!({ horarios: ['08:00', '09:00'], dias: [1] }, 3, 3)).toHaveLength(3)
  })
})
