import { contatoParaRevelar } from './contato-para-revelar.ts'
import { propostaGravada } from './proposta-gravada.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { chamarFerramenta } from '../_shared/integration-access.ts'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import { ApolloProvedorDeContatos } from '../_shared/provedor-de-contatos.ts'
import { type AdminDeColeta, contasDeColeta, memoriaDasContasDeColeta } from '../_shared/apify-ambiente.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { apifyDoEnriquecimento } from './apify-do-enriquecimento.ts'
import {
  criarHandlerEnrichment,
  type DbEnrichment,
  type DadosReceitaFederal,
} from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// O Apify é opcional para inicialização da função, mas se configurado nos segredos, assume como base
let apifyInstance: ReturnType<typeof clienteDoApify> | undefined
try {
  const contas = contasDeColeta((nome) => Deno.env.get(nome))
  if (contas.length > 0) {
    apifyInstance = apifyDoEnriquecimento({
      tokens: contas.map((c) => c.token),
      contas,
      memoria: memoriaDasContasDeColeta(admin as unknown as AdminDeColeta),
    })
  }
} catch {
  // Apify não configurado: a Receita cai na BrasilAPI e a cascata fica sem fornecedor.
}

const db: DbEnrichment = {
  async userFromJwt(authorization, apikey) {
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(token)
    if (error || !data.user) return null
    return { userId: data.user.id }
  },

  async beginCommitteeDiscovery({
    workspaceId,
    targetAccountId,
    requestKey,
    maxResults = 10,
    actorId = 'harvestapi~linkedin-company-employees',
    allowTesting = true,
    authorization,
    apikey,
  }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('begin_committee_discovery', {
      p_workspace_id: workspaceId,
      p_target_account_id: targetAccountId,
      p_request_key: requestKey ?? null,
      p_max_results: maxResults,
      p_actor_id: actorId,
      p_allow_testing: allowTesting,
    })
    if (error) throw error
    const [row] = (data ?? []) as Array<{ run_id: string; reservation_id: string }>
    if (!row) throw new Error('begin_committee_discovery não retornou dados')
    return { runId: row.run_id, reservationId: row.reservation_id }
  },

  async finishCommitteeDiscovery({ runId, success, contactsFound, costUsd, error, apifyRunId }) {
    const { error: err } = await admin.rpc('finish_committee_discovery', {
      p_run_id: runId,
      p_success: success,
      p_contacts_found: contactsFound,
      p_apify_run_id: apifyRunId ?? null,
      p_cost_usd: costUsd ?? null,
      p_error: error ?? null,
    })
    if (err) throw err
  },

  async recordProposedContact(args) {
    const { data, error } = await admin.rpc('record_proposed_contact', {
      p_workspace_id: args.workspaceId,
      p_target_account_id: args.targetAccountId,
      p_discovery_run_id: args.discoveryRunId ?? null,
      p_name: args.name,
      p_role: args.role ?? null,
      p_headline: args.headline ?? null,
      p_linkedin_url: args.linkedinUrl ?? null,
      p_location: args.location ?? null,
      p_photo_url: args.photoUrl ?? null,
      p_persona: args.persona ?? null,
      p_source_actor: args.sourceActor ?? 'harvestapi~linkedin-company-employees',
      p_source_provider: args.sourceProvider ?? 'linkedin_publico',
      p_source_data: args.sourceData ?? null,
    })
    if (error) throw error
    return propostaGravada(data)
  },

  async countKnownCommitteePeople({ workspaceId, targetAccountId }) {
    const { data, error } = await admin.rpc('count_known_committee_people', {
      p_workspace_id: workspaceId,
      p_target_account_id: targetAccountId,
    })
    if (error) throw error
    return Number(data ?? 0)
  },

  async getContactForReveal({ workspaceId, contactId, authorization, apikey }) {
    return await contatoParaRevelar(clienteDaSessao(authorization, apikey), workspaceId, contactId)
  },

  async existingRevealValue({ workspaceId, contactId, channel, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('existing_reveal_value', {
      p_workspace_id: workspaceId,
      p_contact_id: contactId,
      p_channel: channel,
    })
    if (error) throw error
    const [row] = (data ?? []) as Array<{ value: string | null; provider: string | null }>
    return row?.value ? { value: row.value, provider: row.provider ?? undefined } : null
  },

  async beginRevealContact({ workspaceId, contactId, channel, requestKey, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('begin_reveal_contact', {
      p_workspace_id: workspaceId,
      p_contact_id: contactId,
      p_channel: channel,
      p_request_key: requestKey ?? null,
    })
    if (error) throw error
    const [row] = (data ?? []) as Array<{ reservation_id: string }>
    if (!row) throw new Error('begin_reveal_contact não retornou dados')
    return { reservationId: row.reservation_id }
  },

  async finishRevealContact({ reservationId, contactId, channel, value, source }) {
    const { data, error } = await admin.rpc('finish_reveal_contact', {
      p_reservation_id: reservationId,
      p_contact_id: contactId,
      p_channel: channel,
      p_value: value ?? null,
      p_source: source ?? 'linkedin_publico',
    })
    if (error) throw error
    const [row] = (data ?? []) as Array<{ success: boolean; debited_credits: number }>
    return {
      success: row?.success ?? Boolean(value),
      debitedCredits: row?.debited_credits ?? 0,
    }
  },

  async saveReceitaEnrichment({ workspaceId, targetAccountId, cnpj, receitaData, authorization, apikey }) {
    const { error } = await clienteDaSessao(authorization, apikey).rpc('save_account_receita_enrichment', {
      p_workspace_id: workspaceId,
      p_target_account_id: targetAccountId,
      p_cnpj: cnpj,
      p_receita_data: receitaData,
    })
    if (error) throw error
  },

  async beginCnpjReceita({ workspaceId, targetAccountId, requestKey, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('begin_cnpj_receita', {
      p_workspace_id: workspaceId,
      p_target_account_id: targetAccountId,
      p_request_key: requestKey ?? null,
    })
    if (error) throw new Error(error.message)
    const [row] = (data ?? []) as Array<{ reservation_id: string }>
    if (!row) throw new Error('begin_cnpj_receita não retornou dados')
    return { reservationId: row.reservation_id }
  },

  async finishCnpjReceita({ reservationId, found }) {
    const { data, error } = await admin.rpc('finish_cnpj_receita', {
      p_reservation_id: reservationId,
      p_found: found,
    })
    if (error) throw new Error(error.message)
    const [row] = (data ?? []) as Array<{ debited_credits: number | string }>
    return { debitedCredits: Number(row?.debited_credits ?? 0) }
  },

  async recordDiscoveryCost({ workspaceId, actorId, runId, items, costUsd }) {
    const { error } = await admin.rpc('record_discovery_cost', {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_run_id: runId,
      p_items: items,
      p_cost_usd: costUsd,
    })
    if (error) throw new Error(error.message)
  },
}

// O Apollo do Cliente pela camada de Integrações: só entra na cascata quando a pessoa tem um Acesso ao Apollo neste
// Workspace. A própria pessoa pediu o comitê ou o e-mail (decisaoDaPessoa); a regra do Administrador continua valendo.
const acesso = { banco: bancoDasIntegracoes((nome: string, parametros: Record<string, unknown>) => admin.rpc(nome, parametros)), ambiente: (nome: string) => Deno.env.get(nome) }

async function provedoresDoCliente({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const temApollo = await acesso.banco.acessoParaUso({ workspaceId, userId, integrationId: 'apollo' }).then(Boolean, () => false)
  if (!temApollo) return {}
  return {
    apollo: new ApolloProvedorDeContatos(async (ferramenta, argumentos) => {
      const r = await chamarFerramenta(acesso, { workspaceId, userId, integrationId: 'apollo', ferramenta, argumentos, decisaoDaPessoa: true })
      if (!r.ok) throw new Error(r.erro.mensagem)
      if (r.valor.erro) throw new Error('O Apollo recusou a chamada.')
      return r.valor
    }),
  }
}

Deno.serve(
  criarHandlerEnrichment({
    db,
    apify: apifyInstance,
    provedoresDoCliente,
    appOrigin: APP_ORIGIN,
  }),
)
