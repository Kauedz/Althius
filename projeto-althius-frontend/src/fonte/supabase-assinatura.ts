// A assinatura do Workspace operacional pelo Stripe (creditos-e-planos 05 e 06). O banco diz se o Workspace está
// liberado (workspace_access); assinar, abrir o portal e ajustar os assentos passam pela Edge Function stripe-billing,
// que devolve o endereço do Stripe para onde o navegador vai.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MotivoDoAcesso = 'cobranca_desligada' | 'liberado_manual' | 'ativa' | 'atrasada' | 'sem_assinatura' | 'cancelada'

export interface AcessoAoWorkspace {
  liberado: boolean
  motivo: MotivoDoAcesso
  /** Os assentos pagos na assinatura; nulo sem assinatura. */
  assentosPagos: number | null
  /** Os Participantes ativos, cada um um assento. */
  assentosEmUso: number
}

/**
 * O acesso ao Workspace. Se o banco não responde (ex.: a função ainda não existe no projeto), o Workspace fica aberto:
 * a assinatura só fecha quando o banco diz que não há assinatura, nunca por uma falha de leitura.
 */
export async function lerAcessoAoWorkspace(cliente: SupabaseClient, workspaceId: string): Promise<AcessoAoWorkspace | null> {
  const { data, error } = await cliente.rpc('workspace_access', { p_workspace_id: workspaceId })
  if (error) return null
  const [linha] = (Array.isArray(data) ? data : [data]) as
    | { released: boolean; reason: MotivoDoAcesso; paid_seats: number | null; used_seats: number }[]
    | [null]
  if (!linha) return null
  return {
    liberado: linha.released,
    motivo: linha.reason,
    assentosPagos: linha.paid_seats === null ? null : Number(linha.paid_seats),
    assentosEmUso: Number(linha.used_seats),
  }
}

const ERROS: Record<number, string> = {
  403: 'Só um Administrador do Workspace mexe na assinatura.',
  409: 'A assinatura mudou. Recarregue a página e tente de novo.',
  502: 'O Stripe recusou o pedido. Tente de novo em instantes.',
}

/** Pede à stripe-billing o endereço do checkout ou do portal, ou ajusta os assentos. */
export async function pedirAoStripe(
  cliente: SupabaseClient,
  workspaceId: string,
  action: 'checkout' | 'portal' | 'seats',
): Promise<{ url?: string; seats?: number }> {
  const { data, error } = await cliente.functions.invoke('stripe-billing', { body: { action, workspaceId } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 0
    throw new Error(ERROS[status] ?? 'Não foi possível falar com o Stripe agora. Tente de novo em instantes.')
  }
  return (data ?? {}) as { url?: string; seats?: number }
}
