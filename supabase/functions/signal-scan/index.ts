import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDoApify } from './apify.ts'
import { type ActorDoRegistro, createHandler, type Db } from './handler.ts'

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

const codificar = new TextEncoder()

/** Compara a chave de serviço sem vazar, pelo tempo, quantos caracteres batem: compara os resumos, de mesmo tamanho. */
async function iguais(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', codificar.encode(a)),
    crypto.subtle.digest('SHA-256', codificar.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diferenca = 0
  for (let i = 0; i < va.length; i++) diferenca |= va[i] ^ vb[i]
  return diferenca === 0
}

const db: Db = {
  async actorForScan(actorId) {
    const { data, error } = await admin.rpc('signal_actor_for_scan', { p_actor_id: actorId })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as {
      actor_id: string
      signal_type: string
      state: ActorDoRegistro['state']
      version: string | null
      max_cost_usd: number | string
    }[]
    if (!linha) return null
    return {
      actorId: linha.actor_id,
      signalType: linha.signal_type,
      state: linha.state,
      version: linha.version,
      maxCostUsd: Number(linha.max_cost_usd),
    }
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
  apify: clienteDoApify({ token: required('APIFY_TOKEN') }),
  // A função é chamada só pelo servidor: o cabeçalho Authorization tem que ser a chave de serviço.
  autorizado: (authorization) => iguais(authorization, `Bearer ${SERVICE_ROLE_KEY}`),
})

Deno.serve(handler)
