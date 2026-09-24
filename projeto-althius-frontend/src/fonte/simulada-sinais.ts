import { TIPOS, TIPO_PERSONALIZADO } from '@/paginas/sinais/catalogo'
import { MONITORAMENTOS_INICIAIS, SINAIS_MOCK, publicoInicial } from '@/paginas/sinais/dados-mock'
import type { FonteDeContas } from './contas-tipos'
import type {
  EstadoDoMonitoramento,
  FonteDeSinais,
  Monitoramento,
  NovoMonitoramento,
  SinalEncontrado,
  TipoDeSinal,
} from './sinais-tipos'

export interface OpcoesFonteDeSinaisSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  fonteDeContas?: FonteDeContas
}

export interface FonteDeSinaisSimulada extends FonteDeSinais {
  definirHoje(hoje: Date): void
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
  vincularFonteDeContas(fonte: FonteDeContas): void
}

function clonarMonitoramento(m: Monitoramento): Monitoramento {
  return {
    ...m,
    publico: {
      ...m.publico,
      listas: [...m.publico.listas],
      perfil: m.publico.perfil
        ? {
            ...m.publico.perfil,
            estados: m.publico.perfil.estados ? [...m.publico.perfil.estados] : undefined,
            ufs: m.publico.perfil.ufs ? [...m.publico.perfil.ufs] : undefined,
            cidades: m.publico.perfil.cidades ? [...m.publico.perfil.cidades] : undefined,
            cnaes: m.publico.perfil.cnaes ? [...m.publico.perfil.cnaes] : undefined,
          }
        : undefined,
    },
    criterios: { ...m.criterios },
    criteriosLivres: m.criteriosLivres ? [...m.criteriosLivres] : undefined,
  }
}

/**
 * Cria a implementação simulada da FonteDeSinais (ADR 0003 e Ticket 03).
 * Suporta opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeSinaisSimulada(
  opcoes: OpcoesFonteDeSinaisSimulada = {},
): FonteDeSinaisSimulada {
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false, fonteDeContas } = opcoes
  let fonteDeContasVinculada: FonteDeContas | undefined = fonteDeContas
  const ouvintes = new Set<() => void>()

  let monitoramentos: Monitoramento[] = vazia
    ? []
    : MONITORAMENTOS_INICIAIS.map(clonarMonitoramento)

  let sinais: SinalEncontrado[] = [...SINAIS_MOCK]

  function notificar(): void {
    for (const ouvinte of ouvintes) {
      ouvinte()
    }
  }

  async function aguardar(): Promise<void> {
    if (falha) {
      throw new Error('Falha ao carregar dados de sinais')
    }
    if (atrasoMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    }
  }

  return {
    hoje() {
      return fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje
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
      monitoramentos = vazia ? [] : MONITORAMENTOS_INICIAIS.map(clonarMonitoramento)
      notificar()
    },

    vincularFonteDeContas(fonte: FonteDeContas) {
      fonteDeContasVinculada = fonte
    },

    observar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async tipos(): Promise<TipoDeSinal[]> {
      await aguardar()
      return [...TIPOS]
    },

    async tipo(id: string): Promise<TipoDeSinal> {
      await aguardar()
      if (id === TIPO_PERSONALIZADO.id) {
        return TIPO_PERSONALIZADO
      }
      const encontrado = TIPOS.find((t) => t.id === id)
      if (!encontrado) {
        throw new Error(`Tipo de sinal "${id}" não encontrado`)
      }
      return encontrado
    },

    async monitoramentos(): Promise<Monitoramento[]> {
      await aguardar()
      return monitoramentos.map(clonarMonitoramento)
    },

    async monitoramentosDoTipo(tipoId: string): Promise<Monitoramento[]> {
      await aguardar()
      return monitoramentos
        .filter((m) => m.tipoId === tipoId)
        .map(clonarMonitoramento)
    },

    async monitoramento(id: string): Promise<Monitoramento> {
      await aguardar()
      const encontrado = monitoramentos.find((m) => m.id === id)
      if (!encontrado) {
        throw new Error(`Monitoramento "${id}" não encontrado`)
      }
      return clonarMonitoramento(encontrado)
    },

    async salvarMonitoramento(
      novoOuExistente: Monitoramento | NovoMonitoramento,
    ): Promise<Monitoramento> {
      await aguardar()
      const ehNovo = !novoOuExistente.id || novoOuExistente.id.startsWith('novo-')
      const id = ehNovo
        ? `mon-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        : novoOuExistente.id!

      const salvo: Monitoramento = {
        id,
        tipoId: novoOuExistente.tipoId,
        nome: novoOuExistente.nome,
        estado: novoOuExistente.estado ?? 'rascunho',
        publico: novoOuExistente.publico ?? publicoInicial(true),
        criterios: novoOuExistente.criterios ?? {},
        descricao: novoOuExistente.descricao,
        fonte: novoOuExistente.fonte,
        origem: novoOuExistente.origem,
        criteriosLivres: novoOuExistente.criteriosLivres,
      }

      const index = monitoramentos.findIndex((m) => m.id === id)
      if (index >= 0) {
        monitoramentos[index] = salvo
      } else {
        monitoramentos.push(salvo)
      }
      notificar()
      return clonarMonitoramento(salvo)
    },

    async mudarEstado(
      id: string,
      estado: EstadoDoMonitoramento,
    ): Promise<Monitoramento> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === id)
      if (!m) {
        throw new Error(`Monitoramento "${id}" não encontrado`)
      }
      m.estado = estado
      notificar()
      return clonarMonitoramento(m)
    },

    async excluirMonitoramento(id: string): Promise<void> {
      await aguardar()
      monitoramentos = monitoramentos.filter((m) => m.id !== id)
      notificar()
    },

    async sinaisEncontrados(): Promise<SinalEncontrado[]> {
      await aguardar()
      return [...sinais]
    },
  }
}
