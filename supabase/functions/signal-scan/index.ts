import { createClient } from 'npm:@supabase/supabase-js@2'
import { actorDoRegistro, type LinhaDoActor, tokensDoApify } from '../_shared/apify-ambiente.ts'
import { clienteDoApify } from './apify.ts'
import { autorizadoComoServidor } from './autorizacao.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem o token do Apify, a função não sobe e nenhuma varredura é prometida.
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(required('SUPABASE_URL'), SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: Db = {
  async actorForScan(actorId) {
    const { data, error } = await admin.rpc('signal_actor_for_scan', { p_actor_id: actorId })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as LinhaDoActor[]
    return linha ? actorDoRegistro(linha) : null
  },
  async recordCost({ workspaceId, actorId, runId, items, costUsd }) {
    const { error } = await admin.rpc('record_signal_scan_cost', {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_run_id: runId,
      p_items: items,
      p_cost_usd: costUsd,
    })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
  },
}

const handler = createHandler({
  db,
  apify: clienteDoApify({ tokens: tokensDoApify((nome) => Deno.env.get(nome)) }),
  // A função é chamada só pelo servidor: a chave de serviço ou um JWT de serviço (o gateway confere a assinatura).
  autorizado: (authorization) => autorizadoComoServidor(authorization, SERVICE_ROLE_KEY),
})

Deno.serve(handler)
