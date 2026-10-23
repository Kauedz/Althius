// O Plano do Sinal v1: a configuração estruturada e editável que sai do Briefing (ou, depois, de um Modelo ou do
// formulário). Esta é a fonte única do formato; `private.validate_signal_plan` confere o mesmo contrato no banco.
// O Plano nunca escolhe preço, fonte nem limite: só o tipo (entre os que o banco diz que estão disponíveis) e os critérios
// desse tipo. Nada aqui guarda o texto do Briefing.
import { CAMPOS_POR_TIPO, type CampoDoPlano, type Criterios, valorDoCampo } from './campos.ts'
import { LIMITES_DO_PLANO, type OrigemDoPlano, ORIGENS_DO_PLANO, VERSAO_DO_PLANO } from './limites.ts'

export interface EscopoContas {
  tipo: 'contas'
  /** As Contas-alvo escolhidas a dedo (`audience.accountIds` do Monitoramento). */
  contaIds: string[]
}

/** Previsto no esquema; ainda não é oferecido: nenhum tipo é aceito nele até a `vaga_mercado` ser validada. */
export interface EscopoMercado {
  tipo: 'mercado'
}

export type EscopoDoPlano = EscopoContas | EscopoMercado

export interface SinalDoPlano {
  tipo: string
  criterios: Criterios
}

export interface PlanoDoSinal {
  versao: typeof VERSAO_DO_PLANO
  origem: OrigemDoPlano
  escopo: EscopoDoPlano
  sinais: SinalDoPlano[]
  /** Em pt-BR, para a pessoa. */
  explicacao: string
  maxEmpresasPorRodada: number
  /** O id do Modelo de origem, quando `origem` é `modelo` (os Modelos chegam num lote seguinte). */
  modeloId?: string
}

export type ResultadoDoPlano = { ok: true; plano: PlanoDoSinal } | { ok: false; motivo: string }

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const CHAVES_DO_PLANO = new Set(['versao', 'origem', 'escopo', 'sinais', 'explicacao', 'maxEmpresasPorRodada', 'modeloId'])

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

/**
 * Os tipos que o Plano aceita no escopo Contas: os que o banco diz que estão disponíveis (`begin_signal_plan_request`)
 * e dos quais se sabe quais campos o adaptador lê. Um tipo do banco sem campos conhecidos fica de fora.
 */
export function tiposAceitosNoPlano(doBanco: readonly string[]): string[] {
  return [...new Set(doBanco)].filter((tipo) => Object.hasOwn(CAMPOS_POR_TIPO, tipo)).toSorted()
}

export function validarCriterios(tipo: string, entrada: unknown): { ok: true; criterios: Criterios } | { ok: false; motivo: string } {
  const bruto = objeto(entrada)
  const campos = Object.hasOwn(CAMPOS_POR_TIPO, tipo) ? CAMPOS_POR_TIPO[tipo] : undefined
  if (!bruto || !campos) return { ok: false, motivo: 'criterios' }
  const criterios: Criterios = {}
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!campos.includes(chave as CampoDoPlano)) return { ok: false, motivo: `campo_fora_do_tipo:${chave}` }
    const limpo = valorDoCampo(chave as CampoDoPlano, valor)
    if (limpo === null) return { ok: false, motivo: `campo_invalido:${chave}` }
    criterios[chave] = limpo
  }
  return { ok: true, criterios }
}

/** Confere o Plano inteiro contra o esquema v1, os tipos aceitos e os limites; devolve o Plano limpo. */
export function validarPlano(entrada: unknown, tiposAceitos: readonly string[]): ResultadoDoPlano {
  const bruto = objeto(entrada)
  if (!bruto) return { ok: false, motivo: 'plano' }
  if (Object.keys(bruto).some((chave) => !CHAVES_DO_PLANO.has(chave))) return { ok: false, motivo: 'chave_desconhecida' }
  if (bruto.versao !== VERSAO_DO_PLANO) return { ok: false, motivo: 'versao' }
  if (typeof bruto.origem !== 'string' || !(ORIGENS_DO_PLANO as readonly string[]).includes(bruto.origem)) {
    return { ok: false, motivo: 'origem' }
  }
  const origem = bruto.origem as OrigemDoPlano

  const escopoBruto = objeto(bruto.escopo)
  if (!escopoBruto || escopoBruto.tipo !== 'contas') return { ok: false, motivo: 'escopo_nao_oferecido' }
  if (Object.keys(escopoBruto).some((chave) => chave !== 'tipo' && chave !== 'contaIds')) return { ok: false, motivo: 'escopo' }
  const ids = escopoBruto.contaIds
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > LIMITES_DO_PLANO.contasEscolhidasMax) {
    return { ok: false, motivo: 'contas' }
  }
  const contaIds: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, motivo: 'contas' }
    const chave = id.toLowerCase()
    if (contaIds.includes(chave)) return { ok: false, motivo: 'contas' }
    contaIds.push(chave)
  }

  if (!Array.isArray(bruto.sinais) || bruto.sinais.length !== LIMITES_DO_PLANO.sinaisPorPlano) {
    return { ok: false, motivo: 'sinais' }
  }
  const sinais: SinalDoPlano[] = []
  for (const item of bruto.sinais) {
    const s = objeto(item)
    if (!s || Object.keys(s).some((chave) => chave !== 'tipo' && chave !== 'criterios')) return { ok: false, motivo: 'sinais' }
    if (typeof s.tipo !== 'string' || !tiposAceitos.includes(s.tipo)) return { ok: false, motivo: 'tipo_indisponivel' }
    const criterios = validarCriterios(s.tipo, s.criterios ?? {})
    if (!criterios.ok) return criterios
    sinais.push({ tipo: s.tipo, criterios: criterios.criterios })
  }

  if (typeof bruto.explicacao !== 'string') return { ok: false, motivo: 'explicacao' }
  const explicacao = bruto.explicacao.replace(/\s+/g, ' ').trim()
  if (explicacao.length > LIMITES_DO_PLANO.explicacaoMax) return { ok: false, motivo: 'explicacao' }

  const max = bruto.maxEmpresasPorRodada
  if (
    typeof max !== 'number' || !Number.isInteger(max) || max < LIMITES_DO_PLANO.empresasPorRodadaMin ||
    max > LIMITES_DO_PLANO.empresasPorRodadaMax
  ) {
    return { ok: false, motivo: 'max_empresas' }
  }

  let modeloId: string | undefined
  if (bruto.modeloId !== undefined) {
    if (
      origem !== 'modelo' || typeof bruto.modeloId !== 'string' || bruto.modeloId.trim() === '' ||
      bruto.modeloId.length > LIMITES_DO_PLANO.modeloIdMax
    ) {
      return { ok: false, motivo: 'modelo' }
    }
    modeloId = bruto.modeloId.trim()
  }

  const plano: PlanoDoSinal = {
    versao: VERSAO_DO_PLANO,
    origem,
    escopo: { tipo: 'contas', contaIds },
    sinais,
    explicacao,
    maxEmpresasPorRodada: max,
    ...(modeloId ? { modeloId } : {}),
  }
  if (JSON.stringify(plano).length > LIMITES_DO_PLANO.planoMaxCaracteres) return { ok: false, motivo: 'tamanho' }
  return { ok: true, plano }
}
