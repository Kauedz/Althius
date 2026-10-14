// O contrato do Workspace (acesso-e-planos): quais Workspaces da pessoa são contratados, o resumo do contrato para a
// tela Plano e o pedido "Fale com a equipe Althius" do visitante. As decisões são do banco; aqui só se lê e se envia.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResumoDoContrato } from './tipos'

/**
 * Os Workspaces com contrato ativo em que a pessoa participa. Lança numa falha de leitura: quem decide entre o
 * Workspace operacional e o visitante não pode adivinhar.
 */
export async function lerWorkspacesContratados(cliente: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await cliente.rpc('list_my_contracted_workspaces')
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as { workspace_id: string }[]).map((linha) => linha.workspace_id))
}

/** O resumo do contrato do Workspace. Nulo sem contrato, ou se o banco não responde. */
export async function lerResumoDoContrato(cliente: SupabaseClient, workspaceId: string): Promise<ResumoDoContrato | null> {
  const { data, error } = await cliente.rpc('get_contract_summary', { p_workspace_id: workspaceId })
  if (error) return null
  const [linha] = (Array.isArray(data) ? data : [data]) as
    | {
        status: ResumoDoContrato['estado']
        billing_mode: ResumoDoContrato['modo']
        tier_name: string
        max_users: number | string | null
        active_users: number | string
        monthly_credits: number | string
        monthly_credit_limit: number | string
        month_usage: number | string
        unlimited: boolean
      }[]
    | [null]
  if (!linha) return null
  return {
    estado: linha.status,
    modo: linha.billing_mode,
    faixa: linha.tier_name,
    maximoDeUsuarios: linha.max_users === null ? null : Number(linha.max_users),
    usuariosAtivos: Number(linha.active_users),
    creditosMensais: Number(linha.monthly_credits),
    limiteMensal: Number(linha.monthly_credit_limit),
    usoDoMes: Number(linha.month_usage),
    ilimitado: linha.unlimited === true,
  }
}

export interface PedidoDeAcesso {
  nome: string
  empresa: string
  telefone: string
  mensagem: string
}

export const ERRO_DO_PEDIDO_DE_ACESSO = 'Não foi possível enviar agora. Tente de novo em instantes.'
export const ERRO_DO_LIMITE_DE_PEDIDOS = 'Você já enviou vários pedidos hoje. A equipe Althius responde o quanto antes; tente de novo amanhã.'

/**
 * Grava o pedido e avisa a equipe Althius por e-mail. O pedido gravado vale mesmo se o e-mail não sair: a equipe também
 * o lê no banco. Lança com texto para a pessoa quando o pedido não foi gravado.
 */
export async function enviarPedidoDeAcesso(cliente: SupabaseClient, pedido: PedidoDeAcesso): Promise<void> {
  const { data, error } = await cliente.rpc('submit_access_request', {
    p_name: pedido.nome,
    p_company: pedido.empresa,
    p_phone: pedido.telefone,
    p_message: pedido.mensagem,
  })
  if (error) {
    if (error.code === 'P0001' && error.message.includes('too many access requests')) throw new Error(ERRO_DO_LIMITE_DE_PEDIDOS)
    if (error.code === '22023') throw new Error('Confira os campos: nome, empresa, telefone (com DDD) e mensagem são obrigatórios.')
    throw new Error(ERRO_DO_PEDIDO_DE_ACESSO)
  }
  try {
    await cliente.functions.invoke('access-request-notify', { body: { requestId: data as string } })
  } catch {
    // O pedido já está gravado. O aviso por e-mail pode sair depois.
  }
}
