import { createClient } from 'npm:@supabase/supabase-js@2'
import { contasDeColeta, type AdminDeColeta, memoriaDasContasDeColeta } from '../_shared/apify-ambiente.ts'
import { type ClienteRpc, criarMotorDeCascata, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { autorizadoComoServidor } from '../signal-scan/autorizacao.ts'
import { createHandler } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem a chave de serviço ou sem conta do Apify, a função não sobe e nenhuma busca é prometida.
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(required('SUPABASE_URL'), SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// O modelo dos passos que classificam texto: SIGNALS_LLM_PROVIDER (hermes, openai ou regra; o padrão é regra, sem modelo).
const llm = escolherLlmDosSinais({
  env: (nome) => Deno.env.get(nome),
  admin: admin as unknown as ClienteRpc,
  log: (campos) => console.log(JSON.stringify(campos)),
})
const contas = contasDeColeta((nome) => Deno.env.get(nome))
const log = (campos: Record<string, unknown>) => console.log(JSON.stringify(campos))
const motor = criarMotorDeCascata({
  admin: admin as unknown as ClienteRpc,
  tokens: contas.map((c) => c.token),
  contas,
  memoria: memoriaDasContasDeColeta(admin as unknown as AdminDeColeta, log),
  ...(llm ? { llm } : {}),
  log,
})

Deno.serve(createHandler({
  motor,
  // Chamada só pelo servidor (o worker do Hermes): a chave de serviço ou um JWT de serviço (o gateway confere a assinatura).
  autorizado: (authorization) => autorizadoComoServidor(authorization, SERVICE_ROLE_KEY),
  // O relógio manda aquecer pelo signal-runner. Se um dia a chamada chegar aqui, o mesmo token só libera essa ação.
  tokenDeRotina: async (token) => {
    const { data, error } = await admin.rpc('signal_runner_token_matches', { p_token: token })
    if (error) {
      log({ type: 'signal_cascade', outcome: 'runner_token_failed', message: error.message })
      return false
    }
    return data === true
  },
}))
