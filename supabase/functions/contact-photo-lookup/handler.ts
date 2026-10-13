// A foto pública do Contato (CRM-12). O navegador pede `{ contactId }` numa ação do Contato, nunca ao desenhar a lista.
// A função reserva a consulta no banco com a sessão de quem pede (begin_contact_photo_lookup): o banco confere a
// Participação no Workspace do Contato, o perfil LinkedIn, a consulta em andamento e os limites de custo. Só então o
// Actor do Apify roda, com o token que fica só aqui, e a resposta é gravada com a chave de serviço
// (finish_contact_photo_lookup). O único dado de perfil que sai do Actor é a URL da imagem: nome, cargo e o resto do
// perfil não são lidos nem guardados. Banco e Actor entram por injeção de dependência, para o teste ir da requisição
// à resposta sem rede.
import { comCors } from '../_shared/cors.ts'

export type Reserva =
  | { kind: 'reserved'; lookupId: string; linkedinUrl: string }
  /** O Contato não existe no Workspace de quem pede, ou quem pede não participa dele. */
  | { kind: 'not_found' }
  /** O LinkedIn do Contato falta ou não é um perfil de pessoa (/in/). */
  | { kind: 'no_profile' }
  /** Já há uma consulta deste Contato em andamento. */
  | { kind: 'in_flight' }
  /** O Contato (um por minuto, três por dia) ou o Workspace (cinquenta por dia) passou do limite. */
  | { kind: 'limit_reached'; scope: 'contact' | 'workspace' }
  /** A foto foi informada por uma pessoa, e a consulta não a substitui sem confirmação. */
  | { kind: 'manual_photo' }

export interface Resultado {
  lookupId: string
  outcome: 'found' | 'not_found' | 'failed'
  photoUrl?: string
  photoUrlExpiresAt?: string
  actorId: string
  runId?: string
  errorCode?: string
}

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC begin_contact_photo_lookup, com a sessão de quem pede. Lança quando o banco falha por outro motivo. */
  beginLookup(args: { contactId: string; authorization: string; apikey: string }): Promise<Reserva>
  /** RPC finish_contact_photo_lookup, com a chave de serviço. Lança quando o banco falha. */
  finishLookup(resultado: Resultado): Promise<void>
  /**
   * RPC record_apify_lookup_cost, com a chave de serviço: grava o custo real da busca (creditos-e-planos, ticket 01).
   * Opcional; o valor é nulo quando o Apify não o informou.
   */
  recordCost?(args: { lookupId: string; costUsd: number | null }): Promise<void>
}

export interface FotoDoPerfil {
  /** A URL da imagem que o Actor devolveu; null quando o perfil não tem foto pública ou o Actor não o achou. */
  photoUrl: string | null
  runId: string | null
}

export interface Actor {
  /** Identifica o Actor nos registros. */
  actorId: string
  /** Roda o Actor para o perfil. Lança ActorRequestError quando o Apify recusa e ActorTimeoutError no prazo. */
  fetchPhoto(linkedinUrl: string): Promise<FotoDoPerfil>
  /** O custo em dólar que o Apify informa para a execução, ou null quando não informa ou não responde. Só medida. */
  custoDaExecucao?(runId: string): Promise<number | null>
}

/** O Apify respondeu, mas recusou ou falhou: a execução não deu resultado. */
export class ActorRequestError extends Error {
  constructor(readonly status: number, readonly detail = '') {
    super(`A fonte pública respondeu HTTP ${status}`)
    this.name = 'ActorRequestError'
  }
}

/** O Actor não terminou no prazo. */
export class ActorTimeoutError extends Error {
  constructor() {
    super('Nossa busca não respondeu a tempo.')
    this.name = 'ActorTimeoutError'
  }
}

export interface Deps {
  db: Db
  actor: Actor
  appOrigin: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const TAMANHO_MAXIMO_DA_URL = 2048

/**
 * A URL da imagem só vale se for https e de tamanho razoável: a tela a usa como `src` e o banco a recusa fora disso.
 * Devolve a URL como o Actor a mandou, ou null.
 */
export function urlDaFotoValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const url = valor.trim()
  if (!url || url.length > TAMANHO_MAXIMO_DA_URL) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * A validade que a URL do LinkedIn declara no parâmetro `e` (segundos desde 1970), ISO 8601; null quando não declara
 * ou o valor não é uma data plausível.
 */
export function validadeDaUrl(url: string): string | null {
  const e = new URL(url).searchParams.get('e')
  if (!e || !/^\d{9,11}$/.test(e)) return null
  const data = new Date(Number(e) * 1000)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const contactId = typeof body?.contactId === 'string' ? body.contactId : ''
    if (!UUID.test(contactId)) return respond({ error: 'Contato obrigatório.' }, 400)

    let reserva: Reserva
    try {
      reserva = await deps.db.beginLookup({ contactId, authorization, apikey })
    } catch (error) {
      log({ type: 'contact_photo', contactId, outcome: 'begin_failed', message: String(error) })
      return respond({ error: 'Não foi possível consultar o Contato agora.' }, 500)
    }
    switch (reserva.kind) {
      case 'not_found':
        return respond({ error: 'Contato não encontrado neste Workspace.' }, 404)
      case 'no_profile':
        return respond({
          error: 'O Contato precisa de um perfil do LinkedIn (linkedin.com/in/...) para buscar a foto.',
        }, 422)
      case 'in_flight':
        return respond({ error: 'A foto deste Contato já está sendo buscada. Aguarde um instante.' }, 409)
      case 'manual_photo':
        return respond({ error: 'Este Contato tem uma foto informada por uma pessoa, e a busca não a substitui.' }, 409)
      case 'limit_reached':
        return respond(
          {
            error: reserva.scope === 'workspace'
              ? 'O Workspace atingiu o limite diário de buscas de foto. Tente de novo amanhã.'
              : 'Este Contato já teve buscas de foto há pouco. Espere alguns minutos, ou até amanhã, para tentar de novo.',
          },
          429,
        )
    }

    const base = { lookupId: reserva.lookupId, actorId: deps.actor.actorId }
    let resultado: Resultado
    try {
      const { photoUrl, runId } = await deps.actor.fetchPhoto(reserva.linkedinUrl)
      const url = urlDaFotoValida(photoUrl)
      const execucao = runId ? { runId } : {}
      resultado = url
        ? { ...base, ...execucao, outcome: 'found', photoUrl: url, ...validade(url) }
        // Sem foto pública, ou uma URL que não serve: o Contato fica com as iniciais, sem foto inventada.
        : { ...base, ...execucao, outcome: 'not_found', ...(photoUrl ? { errorCode: 'invalid_photo_url' } : {}) }
    } catch (error) {
      const timeout = error instanceof ActorTimeoutError
      resultado = {
        ...base,
        outcome: 'failed',
        errorCode: timeout
          ? 'timeout'
          : error instanceof ActorRequestError
          ? `actor_http_${error.status}`
          : 'actor_unreachable',
      }
    }

    try {
      await deps.db.finishLookup(resultado)
    } catch (error) {
      log({ type: 'contact_photo', lookupId: reserva.lookupId, outcome: 'finish_failed', message: String(error) })
      return respond({ error: 'A busca terminou, mas não foi possível gravar o resultado.' }, 500)
    }
    log({
      type: 'contact_photo',
      lookupId: reserva.lookupId,
      outcome: resultado.outcome,
      errorCode: resultado.errorCode,
    })
    // O custo real da execução, só para medir: se não der para ler ou gravar, a foto já foi entregue e nada muda.
    if (resultado.runId && deps.db.recordCost) {
      try {
        const costUsd = (await deps.actor.custoDaExecucao?.(resultado.runId)) ?? null
        await deps.db.recordCost({ lookupId: reserva.lookupId, costUsd })
      } catch (error) {
        log({ type: 'contact_photo', lookupId: reserva.lookupId, outcome: 'cost_failed', message: String(error) })
      }
    }

    if (resultado.outcome === 'found') return respond({ status: 'found' })
    if (resultado.outcome === 'not_found') return respond({ status: 'not_found' })
    if (resultado.errorCode === 'timeout') {
      return respond({ error: 'Nossa busca não respondeu a tempo. Tente de novo em alguns minutos.' }, 504)
    }
    return respond({ error: 'A fonte pública está indisponível agora. Tente de novo em alguns minutos.' }, 502)
  })
}

function validade(url: string): { photoUrlExpiresAt?: string } {
  const expiraEm = validadeDaUrl(url)
  return expiraEm ? { photoUrlExpiresAt: expiraEm } : {}
}
