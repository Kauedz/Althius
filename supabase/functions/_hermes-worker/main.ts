// Liga o worker do Hermes ao Supabase e ao Hermes. Roda no computador (ou na VPS) onde o Hermes está:
//   npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env \
//     supabase/functions/_hermes-worker/main.ts
// As chaves ficam só no .env local (nunca no repositório): ver README.md desta pasta.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ContaEncontrada, creditosDoBanco, type Reserva, type SecaoDoPlaybookNaExecucao } from '../_shared/orquestracao.ts'
import {
  bancoDoExecutor,
  bancoDoExecutorDeFerramenta,
  executarChamadaAprovada,
  executarEnvioAprovado,
} from '../_shared/executor-de-aprovacoes.ts'
import { buscaDeSinaisPorHttp } from '../_shared/busca-de-sinais.ts'
import { bancoDasFerramentas, type DepsDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import type { DepsDeAcesso } from '../_shared/integration-access.ts'
import { filaDeSinaisPorRpc, processarPedidosDeIa } from './sinais-ia.ts'
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
  custo: async (runId) => {
    await rpc<void>('record_agent_run_cost', { p_run_id: runId })
  },
  playbook: async (runId, specialty) =>
    (await rpc<SecaoDoPlaybookNaExecucao[] | null>('agent_run_playbook', { p_run_id: runId, p_specialty: specialty })) ?? [],
  creditos: creditosDoBanco(rpc),
  usaChaveDoCliente: async (runId) => (await rpc<boolean | null>('agent_run_uses_own_ai_key', { p_run_id: runId })) === true,
}

// As ferramentas dos Agentes (Etapa 5b): o Agente pede em JSON e o worker executa, pelas mesmas RPCs e o mesmo Acesso da
// ponte. HERMES_FERRAMENTAS=off volta ao modo só de conversa.
const rpcDoServico = (nome: string, parametros: Record<string, unknown>) => admin.rpc(nome, parametros)
const acesso: DepsDeAcesso = { banco: bancoDasIntegracoes(rpcDoServico), ambiente: (nome) => Deno.env.get(nome) }
const ferramentas: DepsDasFerramentas | undefined = Deno.env.get('HERMES_FERRAMENTAS') === 'off' ? undefined : {
  banco: bancoDasFerramentas(rpcDoServico),
  acesso,
  // A busca de Sinais por cascata roda na Edge Function signal-cascade, onde estão as contas do Apify: o worker não as tem.
  // HERMES_SINAIS=off desliga só esta ferramenta.
  ...(Deno.env.get('HERMES_SINAIS') === 'off' ? {} : {
    sinais: buscaDeSinaisPorHttp({ baseUrl: required('SUPABASE_URL'), chaveDeServico: required('SUPABASE_SERVICE_ROLE_KEY') }),
  }),
  executarAprovacao: (approvalId) => executarEnvioAprovado({ banco: bancoDoExecutor(rpcDoServico), acesso }, { approvalId }),
  // As Aprovações de ferramenta de conector (ADR-0022) que nascem liberadas saem logo, pelo mesmo Acesso.
  executarChamada: (approvalId) =>
    executarChamadaAprovada({ banco: bancoDoExecutorDeFerramenta(rpcDoServico), acesso }, { approvalId }),
}

const hermes = hermesHttp({ url: Deno.env.get('HERMES_URL') || 'http://127.0.0.1:8642', chave: required('HERMES_API_KEY') })
// Os pedidos de IA dos Sinais (SIGNALS_LLM_PROVIDER=hermes nas Edge Functions): o worker os responde pelo Hermes.
// HERMES_SINAIS_IA=off desliga só isto.
const filaDeSinais = Deno.env.get('HERMES_SINAIS_IA') === 'off' ? null : filaDeSinaisPorRpc(rpc)

const worker = createWorker({
  ferramentas,
  db,
  hermes,
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
    if (filaDeSinais && feitos !== null) {
      const respondidos = await processarPedidosDeIa({ db: filaDeSinais, hermes })
      if (respondidos > 0) console.log(`${respondidos} classificação(ões) de Sinais respondida(s).`)
    }
    if (feitos === null) avisar('O Hermes não respondeu em HERMES_URL. Ele está rodando com o `hermes gateway`?')
    else if (feitos > 0) console.log(`${feitos} pedido(s) respondido(s).`)
    else avisar('Hermes de pé, esperando pedidos.')
  } catch (error) {
    avisar(`Falha na volta do worker: ${String(error)}`)
  }
  await new Promise((resolver) => setTimeout(resolver, 2000))
}
