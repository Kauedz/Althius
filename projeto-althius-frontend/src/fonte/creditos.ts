// O saldo de créditos do Workspace operacional (equipe-althius-ilimitado). A Equipe mostra "Ilimitado":
// o número pode ficar negativo porque o uso continua no extrato, e a tela não trata isso como falta de saldo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SaldoDeCreditos } from './tipos'

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

/** O que a tela escreve no lugar do número: "Ilimitado" ou o disponível formatado. */
export function textoDoSaldo(saldo: SaldoDeCreditos): string {
  if (saldo.ilimitado) return 'Ilimitado'
  return saldo.disponivel.toLocaleString('pt-BR')
}
