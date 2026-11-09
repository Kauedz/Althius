// A Aderência de uma empresa encontrada pelos critérios avaliados na busca (contexto-da-empresa, ticket 05). Cada motivo
// gravado pela busca (`{ criterio, atende, texto }`) cai num grupo: atende, não atende, sem dado (a fonte não informou)
// ou a verificar (o perfil pede e a fonte não aplicou). Dado ausente nunca conta como atendido, e qualquer critério sem
// verificação deixa a Aderência não confirmada. O motivo "perfil" só diz de onde a empresa veio, e Sinais de compra não
// são motivos de encaixe. Espelha `avaliarAderencia` da função account-fit-explanation.

/** atende: tudo verificado e batendo; nao_atende: algum critério verificado não bate; nao_confirmada: nada falhou, mas
 * algum critério está sem dado ou a verificar; sem_dado: nenhum critério avaliado. */
export type SituacaoDaAderencia = 'atende' | 'nao_atende' | 'nao_confirmada' | 'sem_dado'

export interface CriteriosDaAderencia {
  atendidos: string[]
  naoAtendidos: string[]
  semDado: string[]
  aVerificar: string[]
}

/** O Contexto da empresa que a busca usou: versão, perfis que trouxeram a empresa e trechos dos filtros aplicados. */
export interface ContextoDaAvaliacao {
  versao: number
  perfis: string[]
  trechos: string[]
}

export interface AderenciaPelosCriterios extends CriteriosDaAderencia {
  situacao: SituacaoDaAderencia
}

interface MotivoGravado {
  criterio: string
  atende: boolean | null
  texto: string
}

function motivoGravado(m: unknown): MotivoGravado | null {
  if (!m || typeof m !== 'object') return null
  const { criterio, atende, texto } = m as Record<string, unknown>
  if (typeof criterio !== 'string' || typeof texto !== 'string' || !texto.trim()) return null
  return { criterio, atende: atende === true ? true : atende === false ? false : null, texto: texto.trim() }
}

function situacaoDosCriterios(c: CriteriosDaAderencia): SituacaoDaAderencia {
  if (c.naoAtendidos.length) return 'nao_atende'
  if (c.semDado.length || c.aVerificar.length) return 'nao_confirmada'
  return c.atendidos.length ? 'atende' : 'sem_dado'
}

/**
 * A Aderência pelos motivos da busca; indefinida quando os motivos não dizem o critério (linhas antigas, só texto, ou
 * empresas que nenhuma busca avaliou), para a tela seguir como antes.
 */
export function aderenciaPelosCriterios(motivos: unknown): AderenciaPelosCriterios | undefined {
  if (!Array.isArray(motivos)) return undefined
  const gravados = motivos.map(motivoGravado).filter((m): m is MotivoGravado => m !== null && m.criterio !== 'perfil')
  if (!gravados.length) return undefined
  const avaliados = gravados.filter((m) => m.criterio !== 'pendente')
  const criterios: CriteriosDaAderencia = {
    atendidos: avaliados.filter((m) => m.atende === true).map((m) => m.texto),
    naoAtendidos: avaliados.filter((m) => m.atende === false).map((m) => m.texto),
    semDado: avaliados.filter((m) => m.atende === null).map((m) => m.texto),
    aVerificar: gravados.filter((m) => m.criterio === 'pendente').map((m) => m.texto),
  }
  return { situacao: situacaoDosCriterios(criterios), ...criterios }
}
