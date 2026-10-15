import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Entrega } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// O banco chama sem JWT (verify_jwt = false em config.toml): o segredo interno da entrega é a autenticação.
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(createHandler({
  segredoInterno: required('SLACK_CHANNEL_DELIVERY_SECRET'),
  db: {
    // As migrations 20261025100000 e 20261027100000: marca a Execução como entregue e devolve o que postar.
    async reservarEntrega(runId) {
      const { data, error } = await admin.rpc('claim_slack_channel_delivery', { p_run_id: runId })
      if (error) throw new Error(`claim_slack_channel_delivery: ${error.code ?? ''} ${error.message}`)
      const [linha] = (data ?? []) as {
        status: Entrega['status']
        error_code: string | null
        answer: string | null
        channel_id: string
        thread_ts: string
        bot_token: string | null
        pending_approvals: string[] | null
      }[]
      return linha
        ? {
          status: linha.status,
          codigoDoErro: linha.error_code,
          resposta: linha.answer,
          canal: linha.channel_id,
          threadTs: linha.thread_ts,
          token: linha.bot_token,
          aprovacoesPendentes: linha.pending_approvals ?? [],
        }
        : null
    },
  },
}))
