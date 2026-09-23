import type {
  ContaAlvo,
  Contato,
  FonteDeContas,
  Interacao,
  Sinal,
} from './contas-tipos'
import { criarDadosIniciais } from './dados-contas-demo'

export interface OpcoesFonteDeContasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
}

export interface FonteDeContasSimulada extends FonteDeContas {
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
}

/**
 * Cria a implementação simulada da FonteDeContas.
 * Aceita opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeContasSimulada(
  opcoes: OpcoesFonteDeContasSimulada = {},
): FonteDeContasSimulada {
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false } = opcoes
  const ouvintes = new Set<() => void>()

  let dados = vazia
    ? { contas: [], contatos: [], sinais: [], interacoes: [] }
    : criarDadosIniciais(hoje)

  function notificar(): void {
    for (const ouvinte of ouvintes) {
      ouvinte()
    }
  }

  async function aguardar(): Promise<void> {
    if (atrasoMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    }
    if (falha) {
      throw new Error('Falha ao carregar dados de contas')
    }
  }

  return {
    hoje() {
      return hoje
    },

    definirFalha(novaFalha: boolean) {
      falha = novaFalha
      notificar()
    },

    definirVazia(novaVazia: boolean) {
      vazia = novaVazia
      dados = vazia
        ? { contas: [], contatos: [], sinais: [], interacoes: [] }
        : criarDadosIniciais(hoje)
      notificar()
    },

    observar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async contas(): Promise<ContaAlvo[]> {
      await aguardar()
      return [...dados.contas]
    },

    async conta(id: string): Promise<ContaAlvo> {
      await aguardar()
      const encontrada = dados.contas.find((c) => c.id === id)
      if (!encontrada) {
        throw new Error(`Conta-alvo "${id}" não encontrada`)
      }
      return encontrada
    },

    async contatos(): Promise<Contato[]> {
      await aguardar()
      return [...dados.contatos]
    },

    async contatosDaConta(contaId: string): Promise<Contato[]> {
      await aguardar()
      return dados.contatos.filter((c) => c.contaId === contaId)
    },

    async sinaisDaConta(contaId: string): Promise<Sinal[]> {
      await aguardar()
      return dados.sinais
        .filter((s) => s.contaId === contaId)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    },

    async interacoesDaConta(contaId: string): Promise<Interacao[]> {
      await aguardar()
      return dados.interacoes
        .filter((i) => i.contaId === contaId)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    },
  }
}
