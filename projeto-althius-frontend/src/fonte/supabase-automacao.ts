// Os interruptores e tetos no Workspace operacional: lidos por `list_automation_settings` e gravados por
// `save_automation_setting`, que confere no servidor que só o Administrador muda, que o automático tem teto e que
// alguém executa o escopo sozinho. `list_runnable_automation_scopes` diz quem executa; os outros escopos aparecem
// travados em confirmar (creditos-e-planos 03).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BloqueioDoTeto, EscopoDeAutomacao, FonteDeAutomacao, ResumoDoLimite } from './automacao-tipos'

interface RegistroDeEscopo {
  scope: string
  kind: EscopoDeAutomacao['tipo']
  name: string
  mode: EscopoDeAutomacao['modo']
  monthly_cap: number | string | null
  month_spent: number | string
  blocked_reason: BloqueioDoTeto | null
}

function converterErro(error: { message: string; code?: string }): Error {
  if (error.message.includes('only administrators can change automation')) {
    return new Error('Só um Administrador muda o automático e os tetos.')
  }
  if (error.message.includes('automatic mode is not available for this scope yet')) {
    return new Error('Este escopo ainda não roda sozinho: fica em Confirmar.')
  }
  if (error.message.includes('automatic mode requires an approved monthly cap')) {
    return new Error('O automático precisa de um teto mensal aprovado.')
  }
  if (error.message.includes('monthly limit above tier')) {
    return new Error('O limite não pode passar dos créditos da faixa.')
  }
  if (error.message.includes('unlimited workspace has no monthly limit')) {
    return new Error('Este Workspace não tem limite mensal.')
  }
  if (error.message.includes('active contract required')) return new Error('É preciso um contrato ativo para definir o limite.')
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
      const [{ data, error }, executados] = await Promise.all([
        cliente.rpc('list_automation_settings', { p_workspace_id: workspaceId() }),
        cliente.rpc('list_runnable_automation_scopes', { p_workspace_id: workspaceId() }),
      ])
      if (error) throw new Error('Não foi possível carregar o automático e os tetos.')
      // Sem a lista de quem executa (a leitura falhou ou o banco ainda não tem a função), a página segue como antes.
      const rodam = executados.error
        ? null
        : new Set(((executados.data ?? []) as { scope: string }[]).map((linha) => linha.scope))
      return ((data ?? []) as RegistroDeEscopo[]).map((linha) => {
        const semExecutor = rodam !== null && !rodam.has(linha.scope)
        return {
          escopo: linha.scope,
          tipo: linha.kind,
          nome: linha.name,
          modo: semExecutor ? 'confirmar' : linha.mode,
          teto: linha.monthly_cap === null ? null : Number(linha.monthly_cap),
          gastoNoMes: Number(linha.month_spent),
          bloqueio: semExecutor ? 'sem_executor' : linha.blocked_reason,
        }
      })
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
    async resumoDoLimite() {
      const { data, error } = await cliente.rpc('automation_limit_summary', { p_workspace_id: workspaceId() })
      if (error) throw new Error('Não foi possível carregar o limite do mês.')
      const linha = ((Array.isArray(data) ? data[0] : data) ?? null) as {
        unlimited: boolean
        monthly_limit: number | string | null
        tier_credits: number | string | null
        month_usage: number | string
        inactive: boolean
      } | null
      if (!linha) throw new Error('Não foi possível carregar o limite do mês.')
      const numero = (valor: number | string | null) => (valor === null ? null : Number(valor))
      const resumo: ResumoDoLimite = {
        ilimitado: linha.unlimited,
        limite: numero(linha.monthly_limit),
        tetoDaFaixa: numero(linha.tier_credits),
        uso: Number(linha.month_usage),
        inativo: linha.inactive,
      }
      return resumo
    },
    async salvarLimite(limite) {
      const { error } = await cliente.rpc('set_workspace_monthly_limit', {
        p_workspace_id: workspaceId(),
        p_limit: limite,
      })
      if (error) {
        if (error.message.includes('invalid monthly cap')) throw new Error('O limite precisa ser maior que zero.')
        throw converterErro(error)
      }
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}
