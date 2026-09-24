import type {
  ContaAlvo,
  Contato,
  FonteDeContas,
  Interacao,
  NovaInteracao,
  NovoSinal,
  Sinal,
} from './contas-tipos'
import { criarDadosIniciais } from './dados-contas-demo'
import { estaValido, foiDisparado, parseDataDisparo } from './regras-sinais'
import type { FonteDeSequencias } from './sequencias-tipos'

export interface OpcoesFonteDeContasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  fonteDeSequencias?: FonteDeSequencias
}

export interface FonteDeContasSimulada extends FonteDeContas {
  definirHoje(hoje: Date): void
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
  vincularFonteDeSequencias(fonteDeSequencias: FonteDeSequencias): void
}

function projetarConta(conta: ContaAlvo, todosSinais: Sinal[], refHoje: Date): ContaAlvo {
  const sinaisDaConta = todosSinais
    .filter((s) => s.contaId === conta.id)
    .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
  const sinaisDisparados = sinaisDaConta.filter((s) => foiDisparado(s, refHoje))
  const sinaisValidos = sinaisDisparados.filter((s) => estaValido(s, refHoje))
  return {
    ...conta,
    ultimoSinal: sinaisDisparados[0],
    totalSinaisValidos: sinaisValidos.length,
    quente: sinaisValidos.length > 0,
  }
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

    definirHoje(novaData: Date) {
      hoje = novaData
      notificar()
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
      return dados.contas.map((c) => projetarConta(c, dados.sinais, hoje))
    },

    async conta(id: string): Promise<ContaAlvo> {
      await aguardar()
      const encontrada = dados.contas.find((c) => c.id === id)
      if (!encontrada) {
        throw new Error(`Conta-alvo "${id}" não encontrada`)
      }
      return projetarConta(encontrada, dados.sinais, hoje)
    },

    async contatos(): Promise<Contato[]> {
      await aguardar()
      return [...dados.contatos]
    },

    async contatosDaConta(contaId: string): Promise<Contato[]> {
      await aguardar()
      return dados.contatos.filter((c) => c.contaId === contaId)
    },

    async sinais(): Promise<Sinal[]> {
      await aguardar()
      return dados.sinais
        .filter((s) => foiDisparado(s, hoje))
        .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    },

    async sinaisDaConta(contaId: string): Promise<Sinal[]> {
      await aguardar()
      return dados.sinais
        .filter((s) => s.contaId === contaId && foiDisparado(s, hoje))
        .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    },

    async adicionarSinal(novoSinal: NovoSinal): Promise<Sinal> {
      await aguardar()
      const rawData = novoSinal.dataDisparo ?? novoSinal.dataAcontecimento ?? novoSinal.data ?? new Date()
      const dataIso = rawData instanceof Date ? rawData.toISOString() : String(rawData)
      const dataAcontecimento = novoSinal.dataAcontecimento
        ? (novoSinal.dataAcontecimento instanceof Date ? novoSinal.dataAcontecimento.toISOString() : String(novoSinal.dataAcontecimento))
        : dataIso
      const acontecimentoId = novoSinal.acontecimentoId ?? novoSinal.id

      // Deduplicação pelo mesmo acontecimento na Conta-alvo
      const existente = dados.sinais.find((s) => {
        if (s.contaId !== novoSinal.contaId) return false
        const idExistente = s.acontecimentoId ?? s.id
        return acontecimentoId && idExistente === acontecimentoId
      })

      if (existente) {
        // Reencontro: mantém data original e não renova validade
        const vezesAnteriores = existente.reencontrado?.vezes ?? 0
        existente.reencontrado = {
          data: dataIso,
          monitoramentoId: novoSinal.monitoramentoId ?? existente.monitoramentoId,
          fonte: novoSinal.fonte ?? existente.fonte,
          vezes: vezesAnteriores + 1,
        }
        notificar()
        return existente
      }

      const id = novoSinal.id ?? `sinal-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const frase = novoSinal.frase ?? novoSinal.titulo ?? novoSinal.descricao ?? ''
      const descricao = novoSinal.descricao ?? novoSinal.frase ?? novoSinal.titulo
      const titulo = novoSinal.titulo ?? novoSinal.frase
      const sinal: Sinal = {
        id,
        contaId: novoSinal.contaId,
        acontecimentoId: acontecimentoId ?? id,
        tipo: novoSinal.tipo,
        tipoId: novoSinal.tipoId,
        monitoramentoId: novoSinal.monitoramentoId,
        titulo,
        frase,
        descricao,
        data: dataIso,
        dataDisparo: dataIso,
        dataAcontecimento,
        fonte: novoSinal.fonte,
        evidencia: novoSinal.evidencia,
        detectadoPor: novoSinal.detectadoPor,
        reencontrado: novoSinal.reencontrado,
      }

      dados.sinais = [sinal, ...dados.sinais]
      notificar()
      return sinal
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
