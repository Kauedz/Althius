// Os eventos do Canal Slack (slack-canal 02). O Slack entrega aqui, sem JWT (`verify_jwt = false`), os eventos do app
// @Althius: a menção ao app num canal (`app_mention`), a mensagem no DM com o app (`message.im`), as mensagens dos canais
// em que o bot está (`message.channels`) e os avisos de desinstalação (`app_uninstalled`) e de token revogado
// (`tokens_revoked`). Quem autentica é a assinatura do Slack (HMAC-SHA256 de `v0:{timestamp}:{corpo}` com o segredo de
// assinatura do app, janela de 5 minutos). A função confirma com 200 logo depois de conferir a assinatura e processa
// depois da confirmação, porque o Slack espera no máximo 3 segundos. Cada `event_id` é reservado uma vez no banco, então
// um reenvio não responde de novo.
//
// Do evento à decisão, nesta ordem: instalação ativa do `team_id` (sem ela, nada); quem escreveu (convidado, Slack Connect
// ou e-mail sem Participação ativa recebem "não reconhecido"); só texto (só arquivo, áudio ou canvas recebem o aviso); e as
// Menções aos Agentes (nenhum, fora da lista de canais, mais de um). Todas as respostas vão no thread da mensagem e nenhuma
// cria Execução, Conversa ou consumo de Crédito. Com exatamente um Agente que atende no Slack, a decisão é abrir o fio:
// isso é o ticket 03, e aqui a função para e registra a decisão no log. As mensagens de canal sem menção ao bot só
// continuam um fio já aberto (ticket 04); por ora são ignoradas sem resposta.
//
// O banco, o Slack e o relógio entram por injeção de dependência, para o teste ir da requisição à resposta sem rede. O log
// nunca traz o e-mail, o texto da mensagem nem o token.
import { reconhecerMencoes } from '../_shared/mencoes.ts'
import { assinaturaDoSlackValida, ErroDoSlack, lerUsuarioDoSlack, postarNoThread } from '../_shared/slack-api.ts'

/** A instalação ativa de um workspace Slack (`slack_channel_active_installation`). */
export interface InstalacaoAtiva {
  workspaceId: string
  botUserId: string
  token: string
}

/** Um Agente do Workspace e se ele tem o Slack na lista de canais da Personalização (`slack_channel_agents`). */
export interface AgenteDoSlack {
  id: string
  nome: string
  noSlack: boolean
}

/** Por que o Slack retirou o Canal: o app foi desinstalado ou o token do bot foi revogado. */
export type MotivoDaRetirada = 'desinstalado' | 'token_revogado'

export interface Db {
  /** RPC `claim_slack_channel_event`: true na primeira vez, false num reenvio. */
  reservarEvento(eventId: string, teamId: string | null, tipo: string): Promise<boolean>
  instalacaoAtiva(teamId: string): Promise<InstalacaoAtiva | null>
  /** RPC `slack_channel_account_by_email`: a Conta de usuário com Participação ativa, ou nulo. Nunca cria nada. */
  contaPorEmail(workspaceId: string, email: string): Promise<string | null>
  agentes(workspaceId: string): Promise<AgenteDoSlack[]>
  /** RPC `withdraw_slack_channel_by_slack`. */
  retirarPeloSlack(teamId: string, motivo: MotivoDaRetirada): Promise<boolean>
}

export interface Deps {
  db: Db
  segredoDeAssinatura: string
  /** Relógio em segundos, para a janela de 5 minutos da assinatura. */
  agora?: () => number
  fetch?: typeof fetch
  /** Continua o trabalho depois da resposta (EdgeRuntime.waitUntil). */
  esperarDepois: (trabalho: Promise<unknown>) => void
  log?: (campos: Record<string, unknown>) => void
}

/** As respostas curtas do bot, que não chamam Agente. */
export const RESPOSTAS = {
  naoReconhecido:
    'Não reconheci você na Althius. Só atendo quem participa deste Workspace com o mesmo e-mail do Slack.',
  mencioneUmAgente: 'Mencione um Agente: @Scopus ou o nome completo de um Agente criado, como na Althius.',
  naoAtendeNoSlack: (agente: string) => `O Agente ${agente} não atende no Slack.`,
  umAgentePorFio: 'Mencione um Agente só: cada fio é com um Agente. Para falar com outro, abra outro thread.',
  soTexto: 'Só leio texto por enquanto.',
} as const

type Objeto = Record<string, unknown>

const texto = (valor: unknown) => (typeof valor === 'string' && valor ? valor : null)
const lista = (valor: unknown) => (Array.isArray(valor) ? valor : [])

/**
 * Os subtipos de mensagem tratados: a mensagem comum e a que traz arquivo (para o aviso de "só texto"). Edições, remoções,
 * entradas e mensagens de bot ficam de fora.
 */
const SUBTIPOS_ACEITOS = new Set([undefined, 'file_share'])

/** Tira do texto as menções ao bot (`<@U…>` ou `<@U…|nome>`) e desfaz o escape do Slack. */
function textoUtil(bruto: string, botUserId: string): string {
  return bruto
    .replace(new RegExp(`<@${botUserId}(\\|[^>]*)?>`, 'g'), ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Uma mensagem que o bot trata: a menção num canal ou a mensagem no DM, escrita por uma pessoa. */
interface Mensagem {
  usuario: string
  timeDoUsuario: string | null
  canal: string
  /** O thread em que a resposta vai: o de cima, se a mensagem já está num thread, ou o da própria mensagem. */
  threadTs: string
  texto: string
  temAnexo: boolean
}

function mensagemTratada(evento: Objeto): Mensagem | null {
  const tipo = evento.type
  const noDm = tipo === 'message' && evento.channel_type === 'im'
  if (tipo !== 'app_mention' && !noDm) return null
  if (!SUBTIPOS_ACEITOS.has(evento.subtype as string | undefined)) return null
  if (evento.bot_id || evento.bot_profile || evento.edited) return null
  const usuario = texto(evento.user)
  const canal = texto(evento.channel)
  const ts = texto(evento.ts)
  if (!usuario || !canal || !ts) return null
  return {
    usuario,
    timeDoUsuario: texto(evento.user_team),
    canal,
    threadTs: texto(evento.thread_ts) ?? ts,
    texto: typeof evento.text === 'string' ? evento.text : '',
    temAnexo: lista(evento.files).length > 0 || lista(evento.attachments).length > 0 || evento.subtype === 'file_share',
  }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const agora = deps.agora ?? (() => Math.floor(Date.now() / 1000))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

  const registrar = (eventId: string, resultado: string, extra: Record<string, unknown> = {}) =>
    log({ type: 'slack_channel_event', eventId, resultado, ...extra })

  async function retirar(teamId: string, eventId: string, tipo: string, motivo: MotivoDaRetirada) {
    if (!(await deps.db.reservarEvento(eventId, teamId, tipo))) return registrar(eventId, 'reenvio')
    const retirada = await deps.db.retirarPeloSlack(teamId, motivo)
    registrar(eventId, retirada ? 'retirado' : 'ja_retirado', { motivo })
  }

  async function tratarMensagem(teamId: string, eventId: string, tipo: string, m: Mensagem) {
    // 1. Sem instalação ativa não há bot para responder, e nada é reservado.
    const instalacao = await deps.db.instalacaoAtiva(teamId)
    if (!instalacao) return registrar(eventId, 'sem_instalacao')
    if (m.usuario === instalacao.botUserId) return
    if (!(await deps.db.reservarEvento(eventId, teamId, tipo))) return registrar(eventId, 'reenvio')
    const responderNoThread = async (resposta: string, resultado: string) => {
      await postarNoThread({ token: instalacao.token, canal: m.canal, threadTs: m.threadTs, texto: resposta, fetch: deps.fetch })
      registrar(eventId, resultado, { workspaceId: instalacao.workspaceId })
    }

    // Identidade (Q9, Q18): convidado, Slack Connect e quem não tem Participação ativa não são reconhecidos. Nada da pessoa
    // é gravado.
    if (m.timeDoUsuario && m.timeDoUsuario !== teamId) return responderNoThread(RESPOSTAS.naoReconhecido, 'nao_reconhecido')
    let userId: string | null = null
    try {
      const usuario = await lerUsuarioDoSlack({ token: instalacao.token, usuario: m.usuario, fetch: deps.fetch })
      if (usuario.bot) return
      const deCasa = !usuario.convidado && !usuario.deFora && !usuario.apagado && usuario.teamId === teamId
      if (deCasa && usuario.email) userId = await deps.db.contaPorEmail(instalacao.workspaceId, usuario.email)
    } catch (e) {
      if (!(e instanceof ErroDoSlack && e.tipo === 'recusado')) throw e
    }
    if (!userId) return responderNoThread(RESPOSTAS.naoReconhecido, 'nao_reconhecido')

    // Conteúdo (Q16): só o texto segue.
    const util = textoUtil(m.texto, instalacao.botUserId)
    if (!util) return responderNoThread(m.temAnexo ? RESPOSTAS.soTexto : RESPOSTAS.mencioneUmAgente, m.temAnexo ? 'so_texto' : 'sem_agente')

    // Fio novo: as Menções pela mesma regra do app (Q10, Q14, US 18), sobre todos os Agentes, para o que não atende no
    // Slack receber a recusa. Mais de um Agente é recusado antes, mesmo que algum não atenda no Slack: um fio, um Agente.
    const mencionados = reconhecerMencoes(util, (await deps.db.agentes(instalacao.workspaceId)).map((a) => ({ ...a, name: a.nome })))
    if (mencionados.length === 0) return responderNoThread(RESPOSTAS.mencioneUmAgente, 'sem_agente')
    if (mencionados.length > 1) return responderNoThread(RESPOSTAS.umAgentePorFio, 'mais_de_um_agente')
    const [agente] = mencionados
    if (!agente.noSlack) return responderNoThread(RESPOSTAS.naoAtendeNoSlack(agente.nome), 'agente_fora_do_slack')

    // Abrir o fio é o ticket 03.
    registrar(eventId, 'abrir_fio', {
      workspaceId: instalacao.workspaceId,
      userId,
      agentId: agente.id,
      canal: m.canal,
      threadTs: m.threadTs,
    })
  }

  async function processar(evento: Objeto, eventId: string, teamId: string | null) {
    const interno = (evento.event ?? {}) as Objeto
    const tipo = texto(interno.type) ?? ''
    const mensagem = mensagemTratada(interno)
    const retirada: MotivoDaRetirada | null = tipo === 'app_uninstalled'
      ? 'desinstalado'
      : tipo === 'tokens_revoked' && lista((interno.tokens as Objeto | undefined)?.bot).length > 0
      ? 'token_revogado'
      : null
    if (!teamId) return registrar(eventId, 'ignorado', { evento: tipo })
    if (retirada) return await retirar(teamId, eventId, tipo, retirada)
    if (mensagem) return await tratarMensagem(teamId, eventId, tipo, mensagem)
    registrar(eventId, 'ignorado', { evento: tipo })
  }

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'method not allowed' }, 405)
    const corpo = await req.text()
    const valida = await assinaturaDoSlackValida({
      corpo,
      timestamp: req.headers.get('X-Slack-Request-Timestamp'),
      assinatura: req.headers.get('X-Slack-Signature'),
      segredo: deps.segredoDeAssinatura,
      agoraEmSegundos: agora(),
    })
    if (!valida) return responder({ error: 'invalid signature' }, 401)

    let evento: Objeto
    try {
      evento = JSON.parse(corpo)
    } catch {
      return responder({ error: 'invalid body' }, 400)
    }
    if (evento.type === 'url_verification') return responder({ challenge: texto(evento.challenge) ?? '' })
    if (evento.type !== 'event_callback') return responder({ ok: true, ignored: true })
    const eventId = texto(evento.event_id)
    if (!eventId) return responder({ error: 'invalid event' }, 400)

    deps.esperarDepois(
      processar(evento, eventId, texto(evento.team_id)).catch((e) => {
        registrar(eventId, 'falha', { erro: e instanceof ErroDoSlack ? e.message : e instanceof Error ? e.name : 'desconhecido' })
      }),
    )
    return responder({ ok: true })
  }
}
