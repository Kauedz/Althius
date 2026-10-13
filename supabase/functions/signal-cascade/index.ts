import { createClient } from 'npm:@supabase/supabase-js@2'
import { tokensDoApify } from '../_shared/apify-ambiente.ts'
import { type ClienteRpc, criarMotorDeCascata, llmDaAnthropic } from '../_shared/cascata-de-sinais/index.ts'
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

const chaveDaIa = Deno.env.get('ANTHROPIC_API_KEY')
const motor = criarMotorDeCascata({
  admin: admin as unknown as ClienteRpc,
  tokens: tokensDoApify((nome) => Deno.env.get(nome)),
  ...(chaveDaIa ? { llm: llmDaAnthropic({ apiKey: chaveDaIa }) } : {}),
})

Deno.serve(createHandler({
  motor,
  // Chamada só pelo servidor (o worker do Hermes): a chave de serviço ou um JWT de serviço (o gateway confere a assinatura).
  autorizado: (authorization) => autorizadoComoServidor(authorization, SERVICE_ROLE_KEY),
}))
