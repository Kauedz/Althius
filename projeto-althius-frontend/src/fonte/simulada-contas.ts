import type {
  ContaAlvo,
  Contato,
  FonteDeContas,
  Interacao,
  NovaInteracao,
  Sinal,
} from './contas-tipos'
import { criarDadosIniciais } from './dados-contas-demo'
import type { FonteDeSequencias } from './sequencias-tipos'

export interface OpcoesFonteDeContasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  fonteDeSequencias?: FonteDeSequencias
}

export interface FonteDeContasSimulada extends FonteDeContas {
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
  vincularFonteDeSequencias(fonteDeSequencias: FonteDeSequencias): void
}

/**
 * Cria a implementação simulada da FonteDeContas.
 * Aceita opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeContasSimulada(
  opcoes: OpcoesFonteDeContasSimulada = {},
): FonteDeContasSimulada {
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false, fonteDeSequencias } = opcoes
  let fonteDeSequenciasVinculada: FonteDeSequencias | undefined = fonteDeSequencias
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

    vincularFonteDeSequencias(fonte: FonteDeSequencias) {
      fonteDeSequenciasVinculada = fonte
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

    async registrarInteracao(nova: NovaInteracao): Promise<Interacao> {
      await aguardar()
      const dataIso = nova.data ?? hoje.toISOString()
      const novaId = `interacao-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const interacao: Interacao = {
        id: novaId,
        contaId: nova.contaId,
        contatoId: nova.contatoId,
        tipo: nova.tipo,
        data: dataIso,
        participanteCliente: nova.participanteCliente ?? 'Marina Costa',
        origem: nova.origem ?? 'Demonstração',
      }

      dados.interacoes = [interacao, ...dados.interacoes]

      const conta = dados.contas.find((c) => c.id === nova.contaId)
      if (conta) {
        conta.ultimoContatoEm = dataIso
      }
      notificar()

      // Regra account-first do produto: qualquer resposta na Conta-alvo (positiva ou negativa)
      // pausa a sequência inteira da empresa para análise humana.
      if (
        fonteDeSequenciasVinculada &&
        (nova.tipo === 'email-recebido' || nova.tipo === 'reuniao')
      ) {
        const seq = await fonteDeSequenciasVinculada.sequenciaPorConta(nova.contaId)
        if (seq && seq.status === 'ativa') {
          const contato = dados.contatos.find((c) => c.id === nova.contatoId)
          const nomeContato = contato?.nome ?? 'Contato'
          const canal = nova.origem ?? (nova.tipo === 'reuniao' ? 'Reunião' : 'E-mail')
          const novoStatus = nova.tipo === 'reuniao' ? 'reuniao' : 'pausada'
          const motivo =
            nova.tipo === 'reuniao'
              ? `Reunião marcada com ${nomeContato}.`
              : `${nomeContato} respondeu via ${canal} hoje.`
          await fonteDeSequenciasVinculada.atualizarDocumento(seq.id, {
            status: novoStatus,
            motivoPause: motivo,
          })
        }
      }

      return interacao
    },
  }
}
