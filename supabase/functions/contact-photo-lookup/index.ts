import { createClient } from 'npm:@supabase/supabase-js@2'
import { apifyPhotoActor, montarEntrada } from './apify.ts'
import { createHandler, type Db, type Reserva } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem o token do Apify, a função não sobe e nenhuma busca é prometida.
const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const APIFY_TOKEN = required('APIFY_TOKEN')
const ACTOR_ID = Deno.env.get('APIFY_PHOTO_ACTOR_ID') || undefined
const ENTRADA = Deno.env.get('APIFY_PHOTO_INPUT') || undefined
const TETO = Number(Deno.env.get('APIFY_PHOTO_MAX_CHARGE_USD'))

// Um modelo de entrada que não é JSON derruba a função na subida, não a cada busca.
if (ENTRADA) montarEntrada(ENTRADA, 'https://www.linkedin.com/in/teste')

const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Um cliente com a sessão de quem pede: o banco aplica as regras dela, sem a chave de serviço. */
function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async beginLookup({ contactId, authorization, apikey }): Promise<Reserva> {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('begin_contact_photo_lookup', {
      p_contact_id: contactId,
    })
    // P0002/42501: o Contato não é deste usuário; 22023: sem perfil /in/; 55000: foto manual; 55006: em andamento;
    // 54000: limite do Contato ou do Workspace.
    if (error?.code === 'P0002' || error?.code === '42501') return { kind: 'not_found' }
    if (error?.code === '22023') return { kind: 'no_profile' }
    if (error?.code === '55000') return { kind: 'manual_photo' }
    if (error?.code === '55006') return { kind: 'in_flight' }
    if (error?.code === '54000') {
      return { kind: 'limit_reached', scope: error.hint === 'workspace' ? 'workspace' : 'contact' }
    }
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as { lookup_id?: string; linkedin_url?: string }[]
    if (!linha?.lookup_id || !linha.linkedin_url) throw new Error('begin_contact_photo_lookup não devolveu a reserva')
    return { kind: 'reserved', lookupId: linha.lookup_id, linkedinUrl: linha.linkedin_url }
  },
  async finishLookup(resultado) {
    const { error } = await admin.rpc('finish_contact_photo_lookup', {
      p_lookup_id: resultado.lookupId,
      p_outcome: resultado.outcome,
      p_photo_url: resultado.photoUrl ?? null,
      p_photo_url_expires_at: resultado.photoUrlExpiresAt ?? null,
      p_actor_id: resultado.actorId,
      p_run_id: resultado.runId ?? null,
      p_error_code: resultado.errorCode ?? null,
    })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
  },
}

const actor = apifyPhotoActor({
  token: APIFY_TOKEN,
  actorId: ACTOR_ID,
  entrada: ENTRADA,
  ...(TETO > 0 ? { maxTotalChargeUsd: TETO } : {}),
})

Deno.serve(createHandler({ db, actor, appOrigin: APP_ORIGIN }))
