import { describe, expect, it, vi } from 'vitest'
import { criarAmbienteDeDemonstracao } from './composicao-da-demonstracao'
import { criarArmazenamentoDoVisitante, ErroDeAcaoDoVisitante, protegerAmbienteDoVisitante } from './protecao-do-visitante'
import {
  BLOQUEIOS_DA_RODADA,
  dataEHoraEmBrasilia,
  ErroDaRodada,
  frasesDoBloqueio,
  horaEmBrasilia,
  textoDaParada,
  textoDaPrevia,
  type MotivoDaParada,
} from './rodadas-do-sinal'

describe('as frases da Rodada', () => {
  it('a data e a hora saem no horário de Brasília', () => {
    expect(dataEHoraEmBrasilia('2026-10-20T13:00:00.000Z')).toBe('20/10/2026 10:00')
    expect(dataEHoraEmBrasilia('2026-10-21T02:30:00.000Z')).toBe('20/10/2026 23:30')
    expect(horaEmBrasilia('2026-10-23T17:30:00.000Z')).toBe('14:30')
  })

  it('todo bloqueio tem uma frase neutra, só em créditos, sem dólar, Teto nem fornecedor', () => {
    for (const bloqueio of BLOQUEIOS_DA_RODADA) {
      const frase = frasesDoBloqueio(bloqueio, '2026-10-23T17:30:00.000Z')
      expect(frase.length).toBeGreaterThan(10)
      expect(frase).not.toMatch(/US\$|\$|teto|apify|actor|fornecedor/i)
      expect(new ErroDaRodada(bloqueio).message).toBe(frasesDoBloqueio(bloqueio))
    }
  })

  it('a prévia fala em Contas e créditos, no singular e no plural, e a Equipe vê "Ilimitado"', () => {
    const base = { contas: 12, contasSemDado: 0, creditosPorConta: 2, ateCreditos: 24, saldo: 180, ilimitado: false, bloqueio: null }
    expect(textoDaPrevia(base)).toBe(
      'Vai verificar até 12 Contas. Até 24 créditos (2 por Conta). Seu saldo: 180 créditos. Contas sem dado suficiente não são cobradas.',
    )
    expect(textoDaPrevia({ ...base, contas: 1, ateCreditos: 1, creditosPorConta: 1, saldo: 1 })).toBe(
      'Vai verificar até 1 Conta. Até 1 crédito (1 por Conta). Seu saldo: 1 crédito. Contas sem dado suficiente não são cobradas.',
    )
    expect(textoDaPrevia({ ...base, ilimitado: true })).toContain('Seu saldo: Ilimitado.')
  })

  it('a prévia conta o lote: com mais Contas no Sinal que o lote, diz o lote e o total', () => {
    const lote = { contas: 25, contasSemDado: 0, creditosPorConta: 2, ateCreditos: 50, saldo: 180, ilimitado: false, bloqueio: null }
    expect(textoDaPrevia(lote, 60)).toBe(
      'Vai verificar até 25 Contas nesta rodada (de 60 no Sinal). Até 50 créditos (2 por Conta). Seu saldo: 180 créditos. Contas sem dado suficiente não são cobradas.',
    )
    // Sem Contas além do lote, o texto é o de sempre.
    expect(textoDaPrevia(lote, 25)).toBe(textoDaPrevia(lote))
    expect(textoDaPrevia(lote)).toContain('Vai verificar até 25 Contas. ')
  })

  it('cada motivo da parada tem a sua frase', () => {
    const motivos: [MotivoDaParada | null, 'rodando' | 'concluida' | 'falhou', string][] = [
      ['concluida', 'concluida', 'Concluída.'],
      [null, 'concluida', 'Concluída.'],
      ['sem_creditos', 'concluida', 'Parou: acabaram os créditos.'],
      ['teto', 'concluida', 'Parou: limite do mês ou da automação.'],
      ['contrato_inativo', 'concluida', 'Parou: contrato inativo.'],
      ['prazo', 'concluida', 'Parou: o tempo da rodada acabou.'],
      ['perdida', 'concluida', 'Não rodou no horário. Rodadas perdidas não são compensadas.'],
      ['erro', 'falhou', 'Terminou com erro.'],
      [null, 'falhou', 'Terminou com erro.'],
      [null, 'rodando', 'Rodando.'],
      ['prazo', 'rodando', 'Rodando. Continua na próxima volta.'],
    ]
    for (const [motivoDaParada, estado, frase] of motivos) expect(textoDaParada({ estado, motivoDaParada })).toBe(frase)
  })
})

describe('Rodar agora para o Workspace visitante', () => {
  it('pedir a Rodada abre o modal e recusa; ver a prévia e o histórico continua livre', async () => {
    const aoBloquear = vi.fn()
    const original = criarAmbienteDeDemonstracao({ armazenamento: criarArmazenamentoDoVisitante() })
    const ambiente = protegerAmbienteDoVisitante(original, aoBloquear)
    const rodar = vi.spyOn(original.fonteDeSinais, 'rodarAgora' as never)

    await expect(ambiente.fonteDeSinais.rodarAgora!('qualquer')).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    expect(aoBloquear).toHaveBeenCalledTimes(1)
    expect(rodar).not.toHaveBeenCalled()

    expect((await ambiente.fonteDeSinais.previaDaRodada!('qualquer')).ateCreditos).toBe(24)
    expect((await ambiente.fonteDeSinais.rodadas!('qualquer')).rodadas).toHaveLength(1)
    expect(aoBloquear).toHaveBeenCalledTimes(1)
  })
})
