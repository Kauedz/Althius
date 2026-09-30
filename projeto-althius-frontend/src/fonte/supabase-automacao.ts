// Os interruptores e tetos no Workspace operacional: lidos por `list_automation_settings` e gravados por
// `save_automation_setting`, que confere no servidor que só o Administrador muda e que o automático tem teto.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BloqueioDaAutomacao, EscopoDeAutomacao, FonteDeAutomacao } from './automacao-tipos'

interface RegistroDeEscopo {
  scope: string
  kind: EscopoDeAutomacao['tipo']
  name: string
  mode: EscopoDeAutomacao['modo']
  monthly_cap: number | string | null
  month_spent: number | string
  blocked_reason: BloqueioDaAutomacao | null
}

function converterErro(error: { message: string; code?: string }): Error {
  if (error.message.includes('only administrators can change automation')) {
    return new Error('Só um Administrador muda o automático e os tetos.')
  }
  if (error.message.includes('automatic mode requires an approved monthly cap')) {
    return new Error('O automático precisa de um teto mensal aprovado.')
  }
  if (error.message.includes('invalid monthly cap')) return new Error('O teto precisa ser maior que zero.')
  return new Error('Não foi possível salvar. Tente de novo.')
}

export function criarFonteDeAutomacaoSupabase(cliente: SupabaseClient, workspaceId: () => string): FonteDeAutomacao {
  const ouvintes = new Set<() => void>()
  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async escopos() {
      const { data, error } = await cliente.rpc('list_automation_settings', { p_workspace_id: workspaceId() })
      if (error) throw new Error('Não foi possível carregar o automático e os tetos.')
      return ((data ?? []) as RegistroDeEscopo[]).map((linha) => ({
        escopo: linha.scope,
        tipo: linha.kind,
        nome: linha.name,
        modo: linha.mode,
        teto: linha.monthly_cap === null ? null : Number(linha.monthly_cap),
        gastoNoMes: Number(linha.month_spent),
        bloqueio: linha.blocked_reason,
      }))
    },
    async salvar(escopo, modo, teto) {
      const { error } = await cliente.rpc('save_automation_setting', {
        p_workspace_id: workspaceId(),
        p_scope: escopo,
        p_mode: modo,
        p_monthly_cap: teto,
      })
      if (error) throw converterErro(error)
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}
