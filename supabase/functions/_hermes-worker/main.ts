// Liga o worker do Hermes ao Supabase e ao Hermes. Roda no computador (ou na VPS) onde o Hermes está:
//   npx -y deno@2 run --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env \
//     supabase/functions/_hermes-worker/main.ts
// As chaves ficam só no .env local (nunca no repositório): ver README.md desta pasta.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { ContaEncontrada, Reserva, SecaoDoPlaybookNaExecucao } from '../_shared/orquestracao.ts'
import { createWorker, type FilaDb, hermesHttp } from './worker.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Falta ${name} no .env do worker`)
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw new Error(`${nome}: ${error.code ?? ''} ${error.message}`)
  return data as T
}

const db: FilaDb = {
  listQueued: async (limit) =>
    ((await rpc<{ run_id: string }[] | null>('list_queued_agent_runs', { p_limit: limit })) ?? []).map((l) => l.run_id),
  claim: (runId) => rpc<Reserva | null>('claim_agent_run', { p_run_id: runId }),
  append: (runId, kind, agentId, payload) =>
    rpc<number>('append_agent_run_event', { p_run_id: runId, p_kind: kind, p_agent_id: agentId, p_payload: payload }),
  finish: (runId, status, errorCode, model) =>
    rpc<void>('finish_agent_run', { p_run_id: runId, p_status: status, p_error_code: errorCode, p_model: model }),
  searchAccounts: async (runId, termo) =>
    (await rpc<ContaEncontrada[] | null>('agent_search_target_accounts', { p_run_id: runId, p_query: termo })) ?? [],
  playbook: async (runId, specialty) =>
    (await rpc<SecaoDoPlaybookNaExecucao[] | null>('agent_run_playbook', { p_run_id: runId, p_specialty: specialty })) ?? [],
}

const worker = createWorker({
  db,
  hermes: hermesHttp({ url: Deno.env.get('HERMES_URL') || 'http://127.0.0.1:8642', chave: required('HERMES_API_KEY') }),
  // Cada Agente numa chamada própria, na sua vez e em rodadas. HERMES_UMA_CHAMADA=true volta ao modo de uma chamada só.
  porAgente: Deno.env.get('HERMES_UMA_CHAMADA') !== 'true',
})

console.log('Worker do Hermes ligado. Ctrl+C para parar.')
let ultimoAviso = ''
const avisar = (texto: string) => {
  if (texto !== ultimoAviso) console.log(texto)
  ultimoAviso = texto
}
for (;;) {
  try {
    const feitos = await worker.rodada()
    if (feitos === null) avisar('O Hermes não respondeu em HERMES_URL. Ele está rodando com o `hermes gateway`?')
    else if (feitos > 0) console.log(`${feitos} pedido(s) respondido(s).`)
    else avisar('Hermes de pé, esperando pedidos.')
  } catch (error) {
    avisar(`Falha na volta do worker: ${String(error)}`)
  }
  await new Promise((resolver) => setTimeout(resolver, 2000))
}
