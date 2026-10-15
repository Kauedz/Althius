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
// Menções aos Agentes (nenhum, fora da lista de canais, mais de um). Todas essas respostas vão no thread da mensagem e
// nenhuma cria Execução, Conversa ou consumo de Crédito. Com exatamente um Agente que atende no Slack, a função abre o fio
// (slack-canal 03): pede ao banco a Execução pelo Canal em nome de quem mencionou, no thread da mensagem (o `ts` dela
// quando estava solta), e não posta nada. Quem responde no thread é a entrega (`slack-channel-delivery`), quando a
// Execução termina.
//
// Dentro de um thread que já é um fio (slack-canal 04), quem decide é o fio, lido pela chave antes de tudo: o dono
// continua a Conversa com o Agente do fio sem novo @ (Q19); outra pessoa recebe "este fio é a Conversa de <dono>" (Q13);
// o dono que menciona outro Agente recebe "este fio é do Agente <X>" (Q20); com uma Execução aberta no fio, o banco
// recusa e a pessoa recebe "ainda respondendo". As mensagens de canal sem menção ao bot (`message.channels`) só servem
// para continuar um fio: fora dele, são ignoradas sem resposta e sem ler quem escreveu. A cópia em `message.channels` de
// uma menção ao bot também é ignorada, porque o `app_mention` da mesma mensagem já a trata.
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

/** A chave de um fio: o workspace Slack, o canal (ou o DM) e o `thread_ts`, no Workspace da instalação. */
export interface ChaveDoFio {
  workspaceId: string
  teamId: string
  canal: string
  threadTs: string
}

/** Um fio já aberto (`slack_channel_thread`): o dono, com o nome que a Althius mostra (nulo sem nome), e o Agente. */
export interface FioDoSlack {
  donoId: string
  donoNome: string | null
  agenteId: string
  agenteNome: string
}

/** Por que o Slack retirou o Canal: o app foi desinstalado ou o token do bot foi revogado. */
export type MotivoDaRetirada = 'desinstalado' | 'token_revogado'

/** O pedido de abrir o fio (`start_slack_channel_run`): quem mencionou, o Agente, o fio e o texto. */
export interface PedidoDeFio {
  workspaceId: string
  userId: string
  agentId: string
  teamId: string
  canal: string
  threadTs: string
  texto: string
  /** O `event_id` do Slack: o mesmo evento devolve a mesma Execução. */
  eventId: string
}

/** O banco abriu o fio e guardou a Execução, ou recusou (a recusa já traduzida dos códigos da RPC). */
export type AberturaDoFio =
  | { kind: 'aberto'; conversationId: string; runId: string }
  | {
    kind: 'recusado'
    motivo:
      | 'ocupado'
      | 'sem_contrato'
      | 'nao_reconhecido'
      | 'nao_atende_no_slack'
      | 'fio_de_outra_pessoa'
      | 'fio_de_outro_agente'
      | 'sem_instalacao'
      | 'indisponivel'
  }

export interface Db {
  /** RPC `claim_slack_channel_event`: true na primeira vez, false num reenvio. */
  reservarEvento(eventId: string, teamId: string | null, tipo: string): Promise<boolean>
  instalacaoAtiva(teamId: string): Promise<InstalacaoAtiva | null>
  /** RPC `slack_channel_account_by_email`: a Conta de usuário com Participação ativa, ou nulo. Nunca cria nada. */
  contaPorEmail(workspaceId: string, email: string): Promise<string | null>
  agentes(workspaceId: string): Promise<AgenteDoSlack[]>
  /** RPC `withdraw_slack_channel_by_slack`. */
  retirarPeloSlack(teamId: string, motivo: MotivoDaRetirada): Promise<boolean>
  /** RPC `start_slack_channel_run` (slack-canal 03). Sem ela, a função só registra a decisão de abrir o fio. */
  abrirFio?(pedido: PedidoDeFio): Promise<AberturaDoFio>
  /** RPC `slack_channel_thread` (slack-canal 04): o fio desta chave, ou nulo. Sem ela, nenhum thread é um fio. */
  lerFio?(chave: ChaveDoFio): Promise<FioDoSlack | null>
  /**
   * RPC `slack_channel_usage_limit` (slack-canal 08): se a pessoa ou o Workspace passou do limite de pedidos pelo Canal.
   * Sem ela, não há limite.
   */
  limiteDeUso?(workspaceId: string, userId: string): Promise<'ok' | 'pessoa' | 'workspace'>
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

/** O tamanho máximo do pedido, o mesmo da Conversa na Althius. */
const TAMANHO_MAXIMO = 4000

/** As respostas curtas do bot, que não chamam Agente. */
export const RESPOSTAS = {
  naoReconhecido:
    'Não reconheci você na Althius. Só atendo quem participa deste Workspace com o mesmo e-mail do Slack.',
  mencioneUmAgente: 'Mencione um Agente: @Scopus ou o nome completo de um Agente criado, como na Althius.',
  naoAtendeNoSlack: (agente: string) => `O Agente ${agente} não atende no Slack.`,
  umAgentePorFio: 'Mencione um Agente só: cada fio é com um Agente. Para falar com outro, abra outro thread.',
  soTexto: 'Só leio texto por enquanto.',
  longoDemais: `Mensagem longa demais: escreva até ${TAMANHO_MAXIMO} caracteres.`,
  aindaRespondendo: 'Ainda estou respondendo neste fio. Espere a resposta para escrever de novo.',
  semContrato: 'Não foi possível responder: este Workspace está sem contrato ativo na Althius.',
  fioDeOutraPessoa: 'Este fio é a Conversa de outra pessoa. Abra o seu em outro thread ou no DM com o bot.',
  fioDeOutroAgente: 'Este fio é de outro Agente. Para falar com outro, abra outro thread.',
  fioDaConversaDe: (dono: string) => `Este fio é a Conversa de ${dono}. Abra o seu em outro thread ou no DM com o bot.`,
  fioDoAgente: (agente: string) => `Este fio é do Agente ${agente}. Para falar com outro, abra outro thread.`,
  indisponivel: 'Não consegui abrir este fio agora. Tente de novo em instantes.',
  limiteDaPessoa: 'Você mandou muitos pedidos seguidos pelo Slack. Espere alguns minutos e tente de novo.',
  limiteDoWorkspace: 'Este Workspace chegou ao limite de pedidos pelo Slack nesta hora. Tente de novo mais tarde.',
} as const

type Objeto = Record<string, unknown>

const texto = (valor: unknown) => (typeof valor === 'string' && valor ? valor : null)
const lista = (valor: unknown) => (Array.isArray(valor) ? valor : [])

/**
 * Os subtipos de mensagem tratados: a mensagem comum e a que traz arquivo (para o aviso de "só texto"). Edições, remoções,
 * entradas e mensagens de bot ficam de fora.
 */
const SUBTIPOS_ACEITOS = new Set([undefined, 'file_share'])

/** A menção ao bot no texto do Slack: `<@U…>` ou `<@U…|nome>`. */
const mencaoAoBot = (botUserId: string) => new RegExp(`<@${botUserId}(\\|[^>]*)?>`, 'g')

/** Tira do texto as menções ao bot e desfaz o escape do Slack. */
function textoUtil(bruto: string, botUserId: string): string {
  return bruto
    .replace(mencaoAoBot(botUserId), ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * Uma mensagem que o bot trata, escrita por uma pessoa: a menção num canal, a mensagem no DM ou a resposta num thread de
 * canal (esta só quando o thread é um fio).
 */
interface Mensagem {
  origem: 'mencao' | 'dm' | 'canal'
  usuario: string
  timeDoUsuario: string | null
  canal: string
  /** O thread em que a resposta vai: o de cima, se a mensagem já está num thread, ou o da própria mensagem. */
  threadTs: string
  /** Se a mensagem é uma resposta dentro de um thread, que pode ser um fio. */
  noThread: boolean
  texto: string
  temAnexo: boolean
}

function mensagemTratada(evento: Objeto): Mensagem | null {
  const tipo = evento.type
  const origem = tipo === 'app_mention'
    ? 'mencao'
    : tipo === 'message' && evento.channel_type === 'im'
    ? 'dm'
    : tipo === 'message' && evento.channel_type === 'channel' && texto(evento.thread_ts)
    ? 'canal'
    : null
  if (!origem) return null
  if (!SUBTIPOS_ACEITOS.has(evento.subtype as string | undefined)) return null
  if (evento.bot_id || evento.bot_profile || evento.edited) return null
  const usuario = texto(evento.user)
  const canal = texto(evento.channel)
  const ts = texto(evento.ts)
  if (!usuario || !canal || !ts) return null
  const threadTs = texto(evento.thread_ts) ?? ts
  return {
    origem,
    usuario,
    timeDoUsuario: texto(evento.user_team),
    canal,
    threadTs,
    noThread: threadTs !== ts,
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
    // Num thread de canal, a mensagem que menciona o bot chega também como `app_mention`, que é quem a trata.
    if (m.origem === 'canal' && mencaoAoBot(instalacao.botUserId).test(m.texto)) return registrar(eventId, 'ignorado', { evento: tipo })
    // O fio desta chave, se a mensagem está num thread. Fora de fio, a resposta de canal sem menção ao bot não é com a
    // Althius: nada é reservado nem lido de quem escreveu.
    // Se a leitura do fio falhar, a mensagem não se perde em silêncio: fica no log e, quando a pessoa falou com o bot (menção
    // ou DM), ela recebe "tente de novo" no thread. Uma resposta de canal sem menção pode nem ser de um fio, então só o log.
    let fio: FioDoSlack | null = null
    if (m.noThread && deps.db.lerFio) {
      try {
        fio = await deps.db.lerFio({ workspaceId: instalacao.workspaceId, teamId, canal: m.canal, threadTs: m.threadTs })
      } catch (e) {
        registrar(eventId, 'falha_ao_ler_fio', { evento: tipo, erro: e instanceof Error ? e.name : 'desconhecido' })
        if (m.origem === 'canal') return
        if (!(await deps.db.reservarEvento(eventId, teamId, tipo))) return registrar(eventId, 'reenvio')
        await postarNoThread({ token: instalacao.token, canal: m.canal, threadTs: m.threadTs, texto: RESPOSTAS.indisponivel, fetch: deps.fetch })
        return registrar(eventId, 'indisponivel', { workspaceId: instalacao.workspaceId })
      }
    }
    if (m.origem === 'canal' && !fio) return registrar(eventId, 'ignorado', { evento: tipo })
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

    // Pede ao banco a Execução pelo Canal com o Agente, no thread da mensagem. O banco abre o fio ou continua o que já
    // existe, e recusa com uma Execução aberta no fio ("ainda respondendo").
    const pedirExecucao = async (agente: { id: string; nome: string }, util: string, resultado: 'fio_aberto' | 'fio_continuado') => {
      const pedido = { workspaceId: instalacao.workspaceId, userId, agentId: agente.id, canal: m.canal, threadTs: m.threadTs }
      if (!deps.db.abrirFio) return registrar(eventId, 'abrir_fio', pedido)
      if (util.length > TAMANHO_MAXIMO) return responderNoThread(RESPOSTAS.longoDemais, 'longo_demais')
      // Limite de uso (slack-canal 08): passou, recusa curta, sem Execução nem Crédito. Se a leitura do limite falhar, o
      // pedido segue (o "ainda respondendo" e os Créditos continuam valendo) e a falha fica no log.
      if (deps.db.limiteDeUso) {
        let limite: 'ok' | 'pessoa' | 'workspace' = 'ok'
        try {
          limite = await deps.db.limiteDeUso(instalacao.workspaceId, userId!)
        } catch (e) {
          registrar(eventId, 'falha_ao_ler_limite', { erro: e instanceof Error ? e.name : 'desconhecido' })
        }
        if (limite === 'pessoa') return responderNoThread(RESPOSTAS.limiteDaPessoa, 'limite_da_pessoa')
        if (limite === 'workspace') return responderNoThread(RESPOSTAS.limiteDoWorkspace, 'limite_do_workspace')
      }
      const abertura = await deps.db.abrirFio({ ...pedido, teamId, texto: util, eventId })
      if (abertura.kind === 'aberto') return registrar(eventId, resultado, { ...pedido, runId: abertura.runId })
      if (abertura.motivo === 'sem_instalacao') return registrar(eventId, 'sem_instalacao')
      const recusas: Record<typeof abertura.motivo, string> = {
        ocupado: RESPOSTAS.aindaRespondendo,
        sem_contrato: RESPOSTAS.semContrato,
        nao_reconhecido: RESPOSTAS.naoReconhecido,
        nao_atende_no_slack: RESPOSTAS.naoAtendeNoSlack(agente.nome),
        fio_de_outra_pessoa: RESPOSTAS.fioDeOutraPessoa,
        fio_de_outro_agente: RESPOSTAS.fioDeOutroAgente,
        indisponivel: RESPOSTAS.indisponivel,
      }
      return responderNoThread(recusas[abertura.motivo], abertura.motivo)
    }
    const util = textoUtil(m.texto, instalacao.botUserId)
    const mencionadosNoTexto = async () =>
      reconhecerMencoes(util, (await deps.db.agentes(instalacao.workspaceId)).map((a) => ({ ...a, name: a.nome })))

    // Fio existente: um thread, um dono, um Agente (Q13, Q19, Q20). O dono continua sem novo @; o Agente do fio pode ser
    // mencionado de novo, outro Agente não.
    if (fio) {
      if (userId !== fio.donoId) {
        return responderNoThread(fio.donoNome ? RESPOSTAS.fioDaConversaDe(fio.donoNome) : RESPOSTAS.fioDeOutraPessoa, 'fio_de_outra_pessoa')
      }
      if (!util) return m.temAnexo ? responderNoThread(RESPOSTAS.soTexto, 'so_texto') : registrar(eventId, 'sem_texto')
      if ((await mencionadosNoTexto()).some((a) => a.id !== fio.agenteId)) {
        return responderNoThread(RESPOSTAS.fioDoAgente(fio.agenteNome), 'fio_de_outro_agente')
      }
      return pedirExecucao({ id: fio.agenteId, nome: fio.agenteNome }, util, 'fio_continuado')
    }

    // Conteúdo (Q16): só o texto segue.
    if (!util) return responderNoThread(m.temAnexo ? RESPOSTAS.soTexto : RESPOSTAS.mencioneUmAgente, m.temAnexo ? 'so_texto' : 'sem_agente')

    // Fio novo: as Menções pela mesma regra do app (Q10, Q14, US 18), sobre todos os Agentes, para o que não atende no
    // Slack receber a recusa. Mais de um Agente é recusado antes, mesmo que algum não atenda no Slack: um fio, um Agente.
    const mencionados = await mencionadosNoTexto()
    if (mencionados.length === 0) return responderNoThread(RESPOSTAS.mencioneUmAgente, 'sem_agente')
    if (mencionados.length > 1) return responderNoThread(RESPOSTAS.umAgentePorFio, 'mais_de_um_agente')
    const [agente] = mencionados
    if (!agente.noSlack) return responderNoThread(RESPOSTAS.naoAtendeNoSlack(agente.nome), 'agente_fora_do_slack')

    // Abrir o fio (Q8, Q21): a Conversa de quem mencionou com o Agente, no thread da mensagem.
    return pedirExecucao(agente, util, 'fio_aberto')
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
