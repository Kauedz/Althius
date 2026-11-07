// A explicação da Aderência de uma Descoberta (Fase 6b), pela função account-fit-explanation. A nota não muda: o nível
// devolvido é o mesmo que a Descoberta já tem; o texto só explica os motivos.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextoDaAvaliacao, CriteriosDaAderencia, SituacaoDaAderencia } from './aderencia-pelos-criterios'

export type ExplicacaoDeAderencia = {
  explicacao: string
  origem: 'ia' | 'regra'
  nivel: string | null
  /** Os critérios em grupos e a situação (contexto-da-empresa 05); a Demonstração não traz. */
  situacao?: SituacaoDaAderencia
  criterios?: CriteriosDaAderencia
  contexto?: ContextoDaAvaliacao
}

const SITUACOES: readonly SituacaoDaAderencia[] = ['atende', 'nao_atende', 'nao_confirmada', 'sem_dado']

function textosPreenchidos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : []
}

function criteriosDa(valor: unknown): CriteriosDaAderencia | undefined {
  if (!valor || typeof valor !== 'object') return undefined
  const c = valor as Record<string, unknown>
  return { atendidos: textosPreenchidos(c.atendidos), naoAtendidos: textosPreenchidos(c.naoAtendidos), semDado: textosPreenchidos(c.semDado), aVerificar: textosPreenchidos(c.aVerificar) }
}

function contextoDa(valor: unknown): ExplicacaoDeAderencia['contexto'] {
  if (!valor || typeof valor !== 'object') return undefined
  const c = valor as Record<string, unknown>
  if (!Number.isInteger(c.versao)) return undefined
  return { versao: c.versao as number, perfis: textosPreenchidos(c.perfis), trechos: textosPreenchidos(c.trechos) }
}

const ERROS: Record<number, string> = {
  401: 'Entre na sua Conta de usuário para continuar.',
  404: 'Descoberta não encontrada.',
}
const ERRO_PADRAO = 'Não deu para explicar a Aderência agora. Tente de novo.'

export async function explicarAderencia(cliente: SupabaseClient, discoveredAccountId: string): Promise<ExplicacaoDeAderencia> {
  const { data, error } = await cliente.functions.invoke('account-fit-explanation', { body: { discoveredAccountId } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 0
    throw new Error(ERROS[status] ?? ERRO_PADRAO)
  }
  const corpo = (data ?? {}) as Partial<ExplicacaoDeAderencia>
  if (typeof corpo.explicacao !== 'string' || (corpo.origem !== 'ia' && corpo.origem !== 'regra')) throw new Error(ERRO_PADRAO)
  const situacao = SITUACOES.includes(corpo.situacao as SituacaoDaAderencia) ? corpo.situacao : undefined
  const criterios = criteriosDa(corpo.criterios)
  const contexto = contextoDa(corpo.contexto)
  return {
    explicacao: corpo.explicacao,
    origem: corpo.origem,
    nivel: corpo.nivel ?? null,
    ...(situacao ? { situacao } : {}),
    ...(criterios ? { criterios } : {}),
    ...(contexto ? { contexto } : {}),
  }
}
