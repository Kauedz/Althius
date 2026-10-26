import { assinaturaWhatsAppValida, type AdaptadorCanal, type EventoWhatsApp } from '../_shared/canal/index.ts'

export interface WorkspaceElegivel { id: string; nome: string }
export interface PedidoDeExecucao { workspaceId: string; userId: string; texto: string; eventId: string; novaConversa: boolean }
export interface SessaoWhatsApp { workspaceId: string | null; aguardandoWorkspace: boolean; novaConversa: boolean }
export type AberturaDeExecucao = { kind: 'aberto'; conversationId: string; runId: string } | { kind: 'recusado'; motivo: 'ocupado' | 'nao_elegivel' | 'indisponivel' }

export interface Db {
  reservarEvento(eventId: string, telefone: string): Promise<boolean>
  registrarStatus(evento: Extract<EventoWhatsApp, { tipo: 'status' }>): Promise<void>
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

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

  async function enviarTexto(para: string, texto: string) { await deps.adaptador.enviarTexto({ para, texto }) }

  async function tratar(evento: EventoWhatsApp) {
    if (evento.tipo === 'status') {
      await deps.db.registrarStatus(evento)
      return
    }
    if (!(await deps.db.reservarEvento(evento.id, evento.de))) {
      log({ tipo: 'canal_whatsapp_event', resultado: 'reenvio', eventId: evento.id })
      return
    }
    if (evento.conteudo.tipo !== 'texto') return
    const texto = evento.conteudo.texto.trim()
    const comando = normalizarComando(texto)
    const userId = await deps.db.contaPorTelefone(evento.de)
    if (!userId) {
      if (await deps.db.registrarRecusaDesconhecido(evento.de)) await enviarTexto(evento.de, RESPOSTA_DESCONHECIDO)
      return
    }
    const respostaPendente = await deps.db.respostaPendente(userId)
    if (respostaPendente) await enviarTexto(evento.de, respostaPendente)
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
    if (workspaces.length === 0) return await enviarTexto(evento.de, RESPOSTAS.semWorkspace)
    const sessao = await deps.db.sessao(userId)
    if (comando === 'TROCAR DE WORKSPACE') {
      await deps.db.salvarSessao(userId, { ...sessao, workspaceId: null, aguardandoWorkspace: true })
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
    if (sessao.novaConversa) await deps.db.salvarSessao(userId, { ...sessao, novaConversa: false })
    if (abertura.kind === 'recusado') {
      await enviarTexto(evento.de, abertura.motivo === 'ocupado' ? RESPOSTAS.ocupado : RESPOSTAS.falha)
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
