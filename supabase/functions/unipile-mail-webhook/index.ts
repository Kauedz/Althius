import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseRpc } from '../_shared/rpc.ts'
import { createMailWebhookHandler } from '../_shared/unipile-mail-webhook.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(createMailWebhookHandler({
  secret: Deno.env.get('UNIPILE_MAIL_WEBHOOK_SECRET'),
  rpc: supabaseRpc(admin),
  background: (task) => EdgeRuntime.waitUntil(task()),
}))
