// O agente único (Fase 3). Ver handler.ts. O modelo vem pela fila do Hermes (ADR-0018): a função não tem chave de IA.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroDoAgente, modeloPelaFila } from '../_shared/agente/modelo.ts'
import { ferramentasDoAgente, type ServicosDoAgente } from '../_shared/agente/ferramentas.ts'
import type { TurnoReservado } from '../_shared/agente/orquestrador.ts'
import { createHandler, type DbDoAgente, ErroDoBanco, type PassoDoUsuario } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')

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

function erroDoBanco(nome: string, error: { code?: string; message?: string }): ErroDoBanco {
  return new ErroDoBanco(error.code ?? 'erro', `${nome}: ${error.message ?? 'falhou'}`)
}

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw erroDoBanco(nome, error)
  return data as T
}

const db: DbDoAgente = {
  async userFromJwt({ authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async iniciarTurno({ authorization, apikey }, a) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('agente_iniciar_turno', {
      p_workspace_id: a.workspaceId,
      p_conversa_id: a.conversaId,
      p_pedido: a.texto,
      p_client_request_id: a.clientRequestId,
    })
    if (error) throw erroDoBanco('agente_iniciar_turno', error)
    const l = (data as { conversa_id: string; turno_id: string; status: string }[] | null)?.[0]
    if (!l) throw new ErroDoBanco('erro', 'agente_iniciar_turno: sem retorno')
    return { conversaId: l.conversa_id, turnoId: l.turno_id, status: l.status }
  },
  async reservarTurno(turnoId) {
    try {
      return await rpc<TurnoReservado | null>('agente_reservar_turno', { p_turno_id: turnoId })
    } catch (e) {
      // Outro processo já pegou o turno (ou ele não está mais na fila): nada a fazer.
      if ((e as ErroDoBanco).code === '55000' || (e as ErroDoBanco).code === 'P0002') return null
      throw e
    }
  },
  gravarPasso: (a) =>
    rpc<string>('agente_gravar_passo', {
      p_turno_id: a.turnoId,
      p_ferramenta: a.ferramenta,
      p_titulo: a.titulo,
      p_estado: a.estado,
      p_motivo: a.motivo ?? null,
      p_entrada: a.entrada ?? {},
    }),
  async atualizarPasso(a) {
    await rpc('agente_atualizar_passo', {
      p_passo_id: a.passoId,
      p_estado: a.estado,
      p_resultado: a.resultado ?? null,
      p_resumo: a.resumo ?? null,
      p_custo: a.custo ?? 0,
      p_externo: a.externo ?? null,
      p_erro: a.erro ?? null,
    })
  },
  async fecharTurno(a) {
    await rpc('agente_fechar_turno', {
      p_turno_id: a.turnoId, p_status: a.status, p_resposta: a.resposta, p_error_code: a.errorCode ?? null,
    })
  },
  assumirPasso: (passoId, userId, decisao) =>
    rpc<{ turnoId: string; conversaId: string }>('agente_assumir_passo', { p_passo_id: passoId, p_user_id: userId, p_decisao: decisao }),
  passoDoUsuario: (passoId, userId) => rpc<PassoDoUsuario>('agente_passo_do_usuario', { p_passo_id: passoId, p_user_id: userId }),
  async trocarResultado(passoId, resultado) {
    await rpc('agente_trocar_resultado', { p_passo_id: passoId, p_resultado: resultado })
  },
}

const servicos: ServicosDoAgente = {
  async rpc(ctx, nome, args) {
    const { data, error } = await clienteDaSessao(ctx.authorization, ctx.apikey).rpc(nome, args)
    if (error) throw erroDoBanco(nome, error)
    return data
  },
  async funcao(ctx, nome, corpo) {
    const resposta = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
      method: 'POST',
      headers: { Authorization: ctx.authorization, apikey: ctx.apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const json = await resposta.json().catch(() => null) as Record<string, unknown> | null
    if (!resposta.ok) {
      const msg = typeof json?.error === 'string' ? json.error : `${nome} respondeu ${resposta.status}`
      throw new Error(msg)
    }
    return json ?? {}
  },
  async lerConta(ctx, contaId) {
    const { data, error } = await clienteDaSessao(ctx.authorization, ctx.apikey).from('target_accounts')
      .select('id, name, domain, linkedin_url')
      .eq('id', contaId).eq('workspace_id', ctx.workspaceId).is('archived_at', null).maybeSingle()
    if (error) throw erroDoBanco('target_accounts', error)
    if (!data) return null
    return { id: data.id as string, nome: data.name as string, dominio: (data.domain as string | null) ?? null, linkedinUrl: (data.linkedin_url as string | null) ?? null }
  },
}

function modeloDoTurno(turnoId: string) {
  return modeloPelaFila({
    fila: {
      async enfileirar({ sistema, usuario, maxTokens }) {
        try {
          return await rpc<string>('enqueue_agente_llm_request', { p_turno_id: turnoId, p_system: sistema, p_user: usuario, p_max_tokens: maxTokens })
        } catch (e) {
          const code = (e as ErroDoBanco).code
          if (code === '53400') throw new ErroDoAgente('model_rate_limited', 'fila cheia')
          throw e
        }
      },
      async ler(id) {
        const linhas = await rpc<{ status: 'queued' | 'running' | 'done' | 'failed'; result_text: string | null }[] | null>(
          'get_signal_llm_request', { p_id: id },
        )
        const l = linhas?.[0]
        if (!l) throw new Error('get_signal_llm_request: pedido não encontrado')
        return { status: l.status, texto: l.result_text }
      },
    },
  })
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para o turno terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  modelo: modeloDoTurno,
  ferramentas: ferramentasDoAgente(servicos),
  ultimoSinalDoMotor: () => rpc<string | null>('agent_engine_last_heartbeat', {}),
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : (work) => void work,
  appOrigin: APP_ORIGIN,
}))
