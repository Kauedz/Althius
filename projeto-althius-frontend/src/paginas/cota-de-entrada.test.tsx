import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CotaDeEntrada } from '@/fonte/contas-remetentes-tipos'
import { FonteDeContasRemetentesProvider } from '@/fonte/contexto'
import type { FonteDeContasRemetentes } from '@/fonte/contas-remetentes-tipos'
import { canaisDosPassos, LinhaDaCotaDeEntrada, textoDaCotaDeEntrada } from '@/paginas/cota-de-entrada'
import { CotasDeEntradaDaSequencia } from '@/paginas/cotas-de-entrada-da-sequencia'

function cota(extra: Partial<CotaDeEntrada> = {}): CotaDeEntrada {
  return {
    id: 'wa',
    canal: 'whatsapp',
    usadasHoje: 5,
    tetoHoje: 5,
    naFilaParaAmanha: 1,
    emAquecimento: false,
    ...extra,
  }
}

function fonteCom(cotas: CotaDeEntrada[]): FonteDeContasRemetentes {
  return {
    observar: () => () => {},
    minhas: async () => [],
    cotasDeEntrada: async () => cotas,
    conectar: async () => {
      throw new Error('fora do teste')
    },
    reconectar: async () => {
      throw new Error('fora do teste')
    },
    desconectar: async () => {},
  }
}

describe('texto da cota de entrada', () => {
  it('escreve X de Y hoje e a fila de amanhã', () => {
    expect(textoDaCotaDeEntrada(cota())).toBe('5 de 5 hoje · 1 na fila para amanhã')
  })

  it('marca o aquecimento e, na Sequência, o nome do Canal', () => {
    expect(textoDaCotaDeEntrada(cota({ emAquecimento: true }), { comCanal: true })).toBe(
      'WhatsApp: 5 de 5 hoje · 1 na fila para amanhã · em aquecimento',
    )
  })

  it('sem teto não há linha', () => {
    expect(textoDaCotaDeEntrada(cota({ tetoHoje: null }))).toBeNull()
  })

  it('a Sequência só pede a cota dos Canais que os passos usam', () => {
    expect(canaisDosPassos([
      { canal: 'whatsapp' },
      { canal: 'tarefa' },
      { canal: 'whatsapp' },
      { canal: 'email' },
    ])).toEqual(['whatsapp', 'email'])
  })
})

describe('cota no topo da Sequência', () => {
  it('mostra a cota do Canal da Sequência e esconde o de outro Canal', async () => {
    render(
      <FonteDeContasRemetentesProvider fonte={fonteCom([
        cota(),
        cota({ id: 'li', canal: 'linkedin', usadasHoje: 2, tetoHoje: 20, naFilaParaAmanha: 0 }),
      ])}
      >
        <CotasDeEntradaDaSequencia canais={['whatsapp']} />
      </FonteDeContasRemetentesProvider>,
    )

    expect(await screen.findByText('WhatsApp: 5 de 5 hoje · 1 na fila para amanhã')).toBeInTheDocument()
    expect(screen.queryByText(/LinkedIn/)).not.toBeInTheDocument()
  })

  it('a linha da Conta remetente não repete o nome do Canal', () => {
    render(<LinhaDaCotaDeEntrada cota={cota({ usadasHoje: 12, tetoHoje: 22, naFilaParaAmanha: 3 })} />)

    expect(screen.getByText('12 de 22 hoje · 3 na fila para amanhã')).toBeInTheDocument()
    expect(screen.queryByText(/WhatsApp/)).not.toBeInTheDocument()
  })
})
