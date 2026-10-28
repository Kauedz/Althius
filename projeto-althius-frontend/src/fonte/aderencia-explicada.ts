// A explicação da Aderência de uma Descoberta (Fase 6b), pela função account-fit-explanation. A nota não muda: o nível
// devolvido é o mesmo que a Descoberta já tem; o texto só explica os motivos.
import type { SupabaseClient } from '@supabase/supabase-js'

export type ExplicacaoDeAderencia = {
  explicacao: string
  origem: 'ia' | 'regra'
  nivel: string | null
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
  return { explicacao: corpo.explicacao, origem: corpo.origem, nivel: corpo.nivel ?? null }
}
