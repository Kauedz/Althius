// O saldo de créditos do Workspace operacional (equipe-althius-ilimitado). A Equipe mostra "Ilimitado":
// o número pode ficar negativo porque o uso continua no extrato, e a tela não trata isso como falta de saldo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LancamentoDeCredito, PrecoDeCredito, SaldoDeCreditos } from './tipos'

export async function lerSaldoDeCreditos(cliente: SupabaseClient, workspaceId: string): Promise<SaldoDeCreditos | null> {
  const { data, error } = await cliente.rpc('get_credit_balance', { p_workspace_id: workspaceId })
  if (error) return null
  const [linha] = (Array.isArray(data) ? data : [data]) as
    | { balance: number | string; reserved: number | string; available: number | string; unlimited: boolean }[]
    | [null]
  if (!linha) return null
  return {
    lancado: Number(linha.balance),
    reservado: Number(linha.reserved),
    disponivel: Number(linha.available),
    ilimitado: linha.unlimited === true,
  }
}

/** O nome de cada ação do catálogo em pt-BR; a chave interna nunca chega à tela. */
const ACAO: Record<string, string> = {
  account_discovery: 'Busca de Contas pelo ICP',
  account_scan: 'Conta varrida por Sinal',
  agent_round: 'Rodada do agente',
  cascata_de_sinais: 'Busca de Sinais',
  cnpj_receita: 'Consulta de CNPJ na Receita',
  email_revealed: 'E-mail revelado',
  person_collected: 'Pessoa do comitê coletada',
  phone_revealed: 'Telefone revelado',
}
export const nomeDaAcao = (acao: string | null) => (acao ? (ACAO[acao] ?? 'Outra ação') : 'Crédito lançado')

const ENTRADA: Record<string, string> = { plano: 'Crédito do contrato', pacote: 'Pacote de créditos', ajuste: 'Ajuste' }
/** Uma linha do extrato: a entrada pelo tipo (contrato, pacote, ajuste); o uso pela ação. */
export const nomeDoLancamento = (l: Pick<LancamentoDeCredito, 'tipo' | 'acao'>) => ENTRADA[l.tipo] ?? nomeDaAcao(l.acao)

/** Os preços em créditos por ação (`list_credit_action_prices`). Falha vira lista vazia: a tela diz que não há preço. */
export async function lerPrecosDeCreditos(cliente: SupabaseClient): Promise<PrecoDeCredito[]> {
  const { data, error } = await cliente.rpc('list_credit_action_prices')
  if (error || !Array.isArray(data)) return []
  return data.map((item) => ({ acao: item.action, creditos: Number(item.credits), descricao: item.description }))
}
/** O extrato do Workspace (`list_credit_entries`): o Administrador vê tudo; o Membro, as entradas e as próprias ações. */
export async function lerExtratoDeCreditos(cliente: SupabaseClient, workspaceId: string): Promise<LancamentoDeCredito[]> {
  const { data, error } = await cliente.rpc('list_credit_entries', { p_workspace_id: workspaceId, p_limit: 500 })
  if (error || !Array.isArray(data)) return []
  return data.map((item) => ({ id: item.id, creditos: Number(item.amount), tipo: item.kind, acao: item.action, sinal: null, criadoEm: item.created_at }))
}

/** O que a tela escreve no lugar do número: "Ilimitado" ou o disponível formatado. */
export function textoDoSaldo(saldo: SaldoDeCreditos): string {
  if (saldo.ilimitado) return 'Ilimitado'
  return saldo.disponivel.toLocaleString('pt-BR')
}
