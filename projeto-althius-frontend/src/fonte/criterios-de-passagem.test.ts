import { describe, expect, it } from 'vitest'
import { criteriosDePassagem, estagioSeguinte } from './criterios-de-passagem'

describe('critérios de passagem do SLA e metas', () => {
  it('pega o critério da linha cuja Definição é o nome de um Estágio, sem olhar acento nem caixa', () => {
    const criterios = criteriosDePassagem([
      { definicao: 'Lead', criterio: 'Veio de um Sinal', prazo: '', meta: '' },
      { definicao: 'em ABORDAGEM', criterio: '3 perfis mapeados e telefone válido', prazo: '', meta: '' },
      { definicao: 'Reunião', criterio: 'Reunião marcada com o decisor', prazo: '', meta: '' },
    ])
    expect(criterios).toEqual({
      em_abordagem: '3 perfis mapeados e telefone válido',
      reuniao: 'Reunião marcada com o decisor',
    })
  })

  it('ignora a linha sem critério ou sem Definição e fica com a primeira de um Estágio repetido', () => {
    expect(
      criteriosDePassagem([
        { definicao: 'Fit', criterio: '  ' },
        { definicao: '', criterio: 'solto' },
        { definicao: 'Quente', criterio: 'Um Sinal válido' },
        { definicao: 'Quente', criterio: 'outro' },
      ]),
    ).toEqual({ quente: 'Um Sinal válido' })
  })

  it('o Estágio seguinte segue o funil e some depois de Descartada e de No CRM', () => {
    expect(estagioSeguinte('descoberta')).toBe('quente')
    expect(estagioSeguinte('reuniao')).toBe('no_crm')
    expect(estagioSeguinte('no_crm')).toBeUndefined()
    expect(estagioSeguinte('descartada')).toBeUndefined()
  })
})
