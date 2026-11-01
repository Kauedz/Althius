import { assinaturaWhatsAppValida, type AdaptadorCanal, type EventoWhatsApp } from '../_shared/canal/index.ts'

export interface WorkspaceElegivel { id: string; nome: string }
export interface PedidoDeExecucao { workspaceId: string; userId: string; texto: string; eventId: string; novaConversa: boolean }
export interface SessaoWhatsApp { workspaceId: string | null; aguardandoWorkspace: boolean; novaConversa: boolean }
export type AberturaDeExecucao = { kind: 'aberto'; conversationId: string; runId: string } | { kind: 'recusado'; motivo: 'ocupado' | 'nao_elegivel' | 'indisponivel' | 'limite' }

export interface Db {
  reservarEvento(eventId: string, telefone: string): Promise<boolean>
  permitirMensagem(telefone: string): Promise<boolean>
  registrarAuditoria(registro: { eventId: string; userId: string | null; workspaceId: string | null; ferramenta: string; resultado: string; hashPayload: string }): Promise<void>
  registrarStatus(evento: Extract<EventoWhatsApp, { tipo: 'status' }>): Promise<800 | 1000 | null>
  contaPorTelefone(telefone: string): Promise<string | null>
  workspacesElegiveis(userId: string): Promise<WorkspaceElegivel[]>
  respostaPendente(userId: string): Promise<string | null>
  sessao(userId: string): Promise<SessaoWhatsApp>
  salvarSessao(userId: string, sessao: SessaoWhatsApp): Promise<void>
  alterarPreferenciaDeAvisos(userId: string, parar: boolean): Promise<void>
  registrarRecusaDesconhecido(telefone: string): Promise<boolean>
  abrirExecucao(pedido: PedidoDeExecucao): Promise<AberturaDeExecucao>
}

export interface Deps {
  db: Db
  adaptador: AdaptadorCanal
  segredoWebhook: string
  esperarDepois: (trabalho: Promise<unknown>) => void
  alertarEquipe: (limite: 800 | 1000) => Promise<void>
  log?: (campos: Record<string, unknown>) => void
}

const RESPOSTA_DESCONHECIDO = 'Não reconheci seu número. Conecte seu telefone em Meu perfil: https://app.althius.com.br/configuracoes/perfil'
const RESPOSTAS = {
  parar: 'Avisos desligados. Envie VOLTAR para religar.',
  voltar: 'Avisos religados.',
  ajuda: 'Acesse a Central de ajuda da Althius: https://app.althius.com.br/configuracoes/ajuda/central',
  semWorkspace: 'Não encontrei um Workspace ativo com o Canal WhatsApp habilitado.',
  escolherWorkspace: (workspaces: WorkspaceElegivel[]) => `Em qual Workspace?\n${workspaces.map((workspace, index) => `${index + 1}. ${workspace.nome}`).join('\n')}\nResponda com o número.`,
  ocupado: 'Ainda estou trabalhando nesta Conversa. Espere a resposta para escrever de novo.',
  falha: 'Não consegui iniciar sua Conversa agora. Tente de novo em instantes.',
} as const

const normalizarComando = (texto: string) => texto.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR')

export function montarEmailAlertaUsoWhatsApp(limite: 800 | 1000, remetente: string) {
  const assunto = `Canal WhatsApp da Althius: ${limite} mensagens no mês`
  const texto = limite === 800
    ? 'O número da Althius atingiu 800 respostas de serviço e templates somados neste mês. O Canal continua enviando; acompanhe o contador mensal.'
    : 'O número da Althius atingiu 1.000 respostas de serviço e templates somados neste mês. O Canal continua enviando e o custo fica com a Althius.'
  return { from: remetente, to: 'althius.relacionamento@gmail.com', subject: assunto, text: texto, html: `<p>${texto}</p>` }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

  async function enviarTexto(para: string, texto: string) { await deps.adaptador.enviarTexto({ para, texto }) }
  async function hashTexto(texto: string) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
    return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }

  async function tratar(evento: EventoWhatsApp) {
    if (evento.tipo === 'status') {
      const limite = await deps.db.registrarStatus(evento)
      if (limite) {
        try {
          await deps.alertarEquipe(limite)
        } catch (erro) {
          log({ tipo: 'canal_whatsapp_status', resultado: 'falha_ao_alertar_equipe', limite, erro: erro instanceof Error ? erro.name : 'desconhecido' })
        }
      }
      return
    }
    if (!(await deps.db.reservarEvento(evento.id, evento.de))) {
      log({ tipo: 'canal_whatsapp_event', resultado: 'reenvio', eventId: evento.id })
      return
    }
    if (!(await deps.db.permitirMensagem(evento.de))) {
      await enviarTexto(evento.de, 'Você atingiu o limite de mensagens. Tente novamente mais tarde.')
      await deps.db.registrarAuditoria({ eventId: evento.id, userId: null, workspaceId: null, ferramenta: 'mensagem', resultado: 'limite_por_numero', hashPayload: await hashTexto(JSON.stringify(evento.conteudo)) })
      log({ tipo: 'canal_whatsapp_event', resultado: 'limite_por_numero', eventId: evento.id })
      return
    }
    if (evento.conteudo.tipo !== 'texto') return
    const texto = evento.conteudo.texto.trim()
    const comando = normalizarComando(texto)
    const userId = await deps.db.contaPorTelefone(evento.de)
    if (!userId) {
      if (await deps.db.registrarRecusaDesconhecido(evento.de)) await enviarTexto(evento.de, RESPOSTA_DESCONHECIDO)
      await deps.db.registrarAuditoria({ eventId: evento.id, userId: null, workspaceId: null, ferramenta: 'mensagem', resultado: 'numero_desconhecido', hashPayload: await hashTexto(texto) })
      log({ tipo: 'canal_whatsapp_event', resultado: 'numero_desconhecido', eventId: evento.id })
      return
    }
    let respostaPendente = await deps.db.respostaPendente(userId)
    while (respostaPendente) {
      await enviarTexto(evento.de, respostaPendente)
      respostaPendente = await deps.db.respostaPendente(userId)
    }
    if (comando === 'PARAR') {
      await deps.db.alterarPreferenciaDeAvisos(userId, true)
      await enviarTexto(evento.de, RESPOSTAS.parar)
      return
    }
    if (comando === 'VOLTAR') {
      await deps.db.alterarPreferenciaDeAvisos(userId, false)
      await enviarTexto(evento.de, RESPOSTAS.voltar)
      return
    }
    if (comando === 'AJUDA') {
      await enviarTexto(evento.de, RESPOSTAS.ajuda)
      return
    }
    const workspaces = await deps.db.workspacesElegiveis(userId)
    if (workspaces.length === 0) {
      await deps.db.registrarAuditoria({ eventId: evento.id, userId, workspaceId: null, ferramenta: 'mensagem', resultado: 'sem_workspace', hashPayload: await hashTexto(texto) })
      log({ tipo: 'canal_whatsapp_event', resultado: 'sem_workspace', eventId: evento.id })
      return await enviarTexto(evento.de, RESPOSTAS.semWorkspace)
    }
    const sessao = await deps.db.sessao(userId)
    if (comando === 'TROCAR DE WORKSPACE') {
      await deps.db.salvarSessao(userId, { ...sessao, workspaceId: null, aguardandoWorkspace: true, novaConversa: true })
      return await enviarTexto(evento.de, RESPOSTAS.escolherWorkspace(workspaces))
    }
    if (sessao.aguardandoWorkspace) {
      const indice = /^\d+$/.test(texto) ? Number(texto) - 1 : -1
      const escolhido = workspaces[indice]
      if (!escolhido) return await enviarTexto(evento.de, RESPOSTAS.escolherWorkspace(workspaces))
      await deps.db.salvarSessao(userId, { workspaceId: escolhido.id, aguardandoWorkspace: false, novaConversa: sessao.novaConversa })
      return await enviarTexto(evento.de, `Workspace *${escolhido.nome}* selecionado. Envie sua pergunta.`)
    }
    if (comando === 'NOVA CONVERSA') {
      await deps.db.salvarSessao(userId, { ...sessao, novaConversa: true })
      return await enviarTexto(evento.de, 'Certo. Sua próxima mensagem começa uma Conversa nova.')
    }
    const workspace = workspaces.find((item) => item.id === sessao.workspaceId) ?? (workspaces.length === 1 ? workspaces[0] : null)
    if (!workspace) {
      await deps.db.salvarSessao(userId, { ...sessao, workspaceId: null, aguardandoWorkspace: true })
      return await enviarTexto(evento.de, RESPOSTAS.escolherWorkspace(workspaces))
    }
    const abertura = await deps.db.abrirExecucao({ workspaceId: workspace.id, userId, texto, eventId: evento.id, novaConversa: sessao.novaConversa })
    await deps.db.registrarAuditoria({ eventId: evento.id, userId, workspaceId: workspace.id, ferramenta: 'mensagem', resultado: abertura.kind === 'aberto' ? 'execucao_aberta' : abertura.motivo, hashPayload: await hashTexto(texto) })
    if (sessao.novaConversa && abertura.kind === 'aberto') await deps.db.salvarSessao(userId, { ...sessao, novaConversa: false })
    if (abertura.kind === 'recusado') {
      await enviarTexto(evento.de, abertura.motivo === 'ocupado' ? RESPOSTAS.ocupado : abertura.motivo === 'limite' ? 'Este Workspace atingiu o limite de Execuções por hora. Tente novamente mais tarde.' : RESPOSTAS.falha)
    }
  }

  return async (req) => {
    if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)
    const corpo = await req.text()
    if (!await assinaturaWhatsAppValida({ corpo, assinatura: req.headers.get('X-Hub-Signature-256'), segredo: deps.segredoWebhook })) {
      return responder({ erro: 'Assinatura inválida.' }, 401)
    }
    let eventos: EventoWhatsApp[]
    try {
      eventos = await deps.adaptador.normalizarWebhook({ corpo, assinatura: req.headers.get('X-Hub-Signature-256'), segredo: deps.segredoWebhook })
    } catch {
      return responder({ erro: 'Webhook inválido.' }, 400)
    }
    deps.esperarDepois(Promise.all(eventos.map(async (evento) => {
      try { await tratar(evento) } catch (erro) {
        log({ tipo: 'canal_whatsapp_event', resultado: 'falha', eventId: evento.id, erro: erro instanceof Error ? erro.name : 'desconhecido' })
      }
    })))
    return responder({ recebido: true })
  }
}
