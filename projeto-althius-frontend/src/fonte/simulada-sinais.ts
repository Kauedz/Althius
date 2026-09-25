import { TIPOS, TIPO_PERSONALIZADO } from '@/paginas/sinais/catalogo'
import { MONITORAMENTOS_INICIAIS, SINAIS_MOCK, publicoInicial } from '@/paginas/sinais/dados-mock'
import type { FonteDeContas } from './contas-tipos'
import type {
  EstadoDoMonitoramento,
  FonteDeSinais,
  Monitoramento,
  NovoMonitoramento,
  ParametrosSimulacaoDisparo,
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
 * Cria a implementação simulada da FonteDeSinais (ADR 0003 e Ticket 03/04).
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

  if (fonteDeContasVinculada) {
    fonteDeContasVinculada.observar(() => {
      notificar()
    })
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
      fonte.observar(() => {
        notificar()
      })
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

    async simularDisparo(parametros: ParametrosSimulacaoDisparo): Promise<SinalEncontrado> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === parametros.monitoramentoId)
      if (!m) {
        throw new Error(`Monitoramento "${parametros.monitoramentoId}" não encontrado`)
      }
      if (m.estado !== 'ativo') {
        throw new Error(
          `Não é possível produzir disparos para o Monitoramento "${m.nome}", pois ele está ${m.estado}. Apenas Monitoramentos Ativos produzem disparos.`,
        )
      }

      // Escolhe contaId se não fornecido
      let contaId = parametros.contaId
      if (!contaId) {
        if (m.publico.modo === 'descoberta') {
          // Descoberta: sempre contas recomendadas (que possuem Fit)
          contaId = 'stripe'
        } else if (m.publico.modo === 'listas') {
          // Listas: pode ser importada com qualquer aderência (ex: rappi = não fit, bbva-mexico = sem avaliação)
          contaId = m.publico.listas.includes('fintechs-brasil') ? 'rappi' : 'bbva-mexico'
        } else {
          contaId = 'openai'
        }
      }

      const refHoje = fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje
      const rawData = parametros.data ?? refHoje
      const dataIso = rawData instanceof Date ? rawData.toISOString().slice(0, 10) : String(rawData)
      const acontecimentoId =
        parametros.acontecimentoId ?? parametros.id ?? `acont-${m.tipoId}-${contaId}-${dataIso}`

      // Verifica reencontro / duplicata existente
      const existente = sinais.find(
        (s) =>
          s.contaId === contaId &&
          (s.id === acontecimentoId || s.acontecimentoId === acontecimentoId),
      )

      if (existente) {
        // Reencontro: mantém data original e não renova validade
        existente.reencontrado = {
          data: dataIso,
          monitoramentoId: m.id,
        }
        if (fonteDeContasVinculada) {
          await fonteDeContasVinculada.adicionarSinal({
            id: existente.id,
            contaId,
            acontecimentoId,
            tipoId: m.tipoId,
            monitoramentoId: m.id,
            frase: existente.frase,
            data: dataIso,
            dataDisparo: dataIso,
            fonte: parametros.fonte ?? existente.fonte,
            evidencia: parametros.evidencia ?? existente.evidencia,
          })
        }
        notificar()
        return { ...existente }
      }

      const id = parametros.id ?? `sinal-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const frase = parametros.frase ?? `Disparo simulado de ${m.nome}`
      const fonte =
        parametros.fonte ??
        (m.fonte ? (m.fonte.includes('simulad') ? m.fonte : `${m.fonte} (simulada)`) : 'Página de carreiras (simulada)')
      const evidencia =
        parametros.evidencia ??
        `Evidência observada em ${dataIso} (simulada). Não constitui garantia de compra.`

      const novoSinal: SinalEncontrado = {
        id,
        contaId,
        acontecimentoId,
        tipoId: m.tipoId,
        monitoramentoId: m.id,
        frase,
        data: dataIso,
        fonte,
        evidencia,
      }

      sinais = [novoSinal, ...sinais]

      if (fonteDeContasVinculada) {
        await fonteDeContasVinculada.adicionarSinal({
          id,
          contaId,
          acontecimentoId,
          tipoId: m.tipoId,
          monitoramentoId: m.id,
          frase,
          descricao: frase,
          data: dataIso,
          dataDisparo: dataIso,
          fonte,
          evidencia,
        })
      }

      notificar()
      return { ...novoSinal }
    },
  }
}

