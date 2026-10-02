// As ferramentas de uma Integração para o navegador (conexoes-funcionais 03, story 21): o participante vê o que o servidor
// do app oferece aos Agentes. O participante pede, com o JWT dele, `{ action, workspaceId, integrationId }`:
//   listar   as ferramentas do servidor (nome, descrição e se escrevem ou gastam), usando o Acesso DELE;
//   chamar   uma ferramenta de LEITURA (`ferramenta`, `argumentos`), sob a Permissão do Agente quando `agentId` vem. O
//            navegador nunca chama uma ferramenta que escreve ou gasta: isso é decisão do Agente, sob Propor/Executar
//            (ADR-0002), e o motor chama `chamarFerramenta` direto, sem passar por aqui.
//   executar_aprovacao  `{ action, approvalId }`: logo depois de um Administrador aprovar na Conversa uma chamada de
//            ferramenta que um Agente propôs (ADR-0022), executa exatamente aquela chamada, uma vez, pelo executor das
//            Aprovações, que confere de novo que quem pede é Administrador ativo do Workspace da Aprovação.
// Tudo passa por `_shared/integration-access.ts`, que renova o token, confere a Permissão e devolve erros tipados sem token.
import { comCors } from '../_shared/cors.ts'
import type { DesfechoDaChamadaAprovada } from '../_shared/executor-de-aprovacoes.ts'
import {
  chamarFerramenta,
  type DepsDeAcesso,
  type ErroDeIntegracao,
  listarFerramentas,
} from '../_shared/integration-access.ts'

export interface Deps {
  acesso: DepsDeAcesso
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string; email: string | null } | null>
  appOrigin: string
  log?: (campos: Record<string, unknown>) => void
  /** O executor das Aprovações de ferramenta; sem ele, `executar_aprovacao` é uma ação desconhecida. */
  executarChamada?: (a: { approvalId: string; administrador: string | null }) => Promise<DesfechoDaChamadaAprovada>
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ID_DA_INTEGRACAO = /^[a-z][a-z0-9-]{0,39}$/
const TETO_DOS_ARGUMENTOS = 50_000

const STATUS_DO_DESFECHO: Record<DesfechoDaChamadaAprovada['status'], number> = {
  executada: 200,
  recusada: 403,
  nao_liberada: 409,
  falhou: 502,
}

const STATUS_DO_ERRO: Record<ErroDeIntegracao['tipo'], number> = {
  precisa_reconectar: 409,
  nao_habilitada: 409,
  permissao_negada: 403,
  indisponivel: 502,
  ferramenta_invalida: 400,
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const falha = (erro: ErroDeIntegracao) => {
    const { tipo, mensagem } = erro
    return responder({
      error: mensagem,
      code: tipo,
      ...(erro.tipo === 'precisa_reconectar' ? { motivo: erro.motivo } : {}),
      ...(erro.tipo === 'permissao_negada' ? { exigida: erro.exigida, atual: erro.atual } : {}),
    }, STATUS_DO_ERRO[tipo])
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.', code: 'metodo' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.userFromJwt(authorization, apikey) : null
    if (!user) return responder({ error: 'Entre na sua Conta de usuário para continuar.', code: 'sem_sessao' }, 401)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: 'Corpo inválido.', code: 'corpo' }, 400)
    }
    if (corpo?.action === 'executar_aprovacao' && deps.executarChamada) {
      const approvalId = typeof corpo.approvalId === 'string' ? corpo.approvalId : ''
      if (!UUID.test(approvalId)) return responder({ error: 'Aprovação obrigatória.', code: 'aprovacao' }, 400)
      const desfecho = await deps.executarChamada({ approvalId, administrador: user.userId })
      log({ type: 'integration_tools', action: 'executar_aprovacao', status: desfecho.status })
      const corpoDaResposta = desfecho.status === 'executada'
        ? { status: desfecho.status, mensagem: desfecho.mensagem }
        : { status: desfecho.status, error: desfecho.mensagem, code: desfecho.status }
      return responder(corpoDaResposta, STATUS_DO_DESFECHO[desfecho.status])
    }

    const workspaceId = typeof corpo?.workspaceId === 'string' ? corpo.workspaceId : ''
    const integrationId = typeof corpo?.integrationId === 'string' ? corpo.integrationId : ''
    if (!UUID.test(workspaceId)) return responder({ error: 'Workspace obrigatório.', code: 'workspace' }, 400)
    if (!ID_DA_INTEGRACAO.test(integrationId)) return responder({ error: 'Integração obrigatória.', code: 'integracao' }, 400)
    const pedido = { workspaceId, userId: user.userId, integrationId }

    if (corpo.action === 'listar') {
      const r = await listarFerramentas(deps.acesso, pedido)
      if (!r.ok) {
        log({ type: 'integration_tools', action: 'listar', integrationId, erro: r.erro.tipo })
        return falha(r.erro)
      }
      return responder({ ferramentas: r.valor.map(({ nome, descricao, escreve }) => ({ nome, descricao, escreve })) })
    }

    if (corpo.action === 'chamar') {
      const ferramenta = typeof corpo.ferramenta === 'string' ? corpo.ferramenta : ''
      const argumentos = corpo.argumentos ?? {}
      const agenteId = typeof corpo.agentId === 'string' ? corpo.agentId : undefined
      if (!ferramenta || ferramenta.length > 100) return responder({ error: 'Ferramenta obrigatória.', code: 'ferramenta' }, 400)
      if (typeof argumentos !== 'object' || argumentos === null || Array.isArray(argumentos) || JSON.stringify(argumentos).length > TETO_DOS_ARGUMENTOS) {
        return responder({ error: 'Argumentos inválidos.', code: 'argumentos' }, 400)
      }
      if (agenteId !== undefined && !UUID.test(agenteId)) return responder({ error: 'Agente inválido.', code: 'agente' }, 400)
      const r = await chamarFerramenta(deps.acesso, {
        ...pedido,
        ferramenta,
        argumentos: argumentos as Record<string, unknown>,
        agenteId,
        somenteLeitura: true,
      })
      if (!r.ok) {
        log({ type: 'integration_tools', action: 'chamar', integrationId, ferramenta, erro: r.erro.tipo })
        return falha(r.erro)
      }
      log({ type: 'integration_tools', action: 'chamar', integrationId, ferramenta, erro: r.valor.erro })
      return responder(r.valor)
    }

    return responder({ error: 'Ação desconhecida.', code: 'acao' }, 400)
  })
}
