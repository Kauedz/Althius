// Propõe o Plano do Sinal a partir do Briefing (agente-de-sinal 01). A pessoa chama com o JWT dela; a função NÃO grava o
// Plano: devolve `{ plano, avisos }` para a pessoa revisar, e quem grava é `save_signal_plan`, depois da revisão.
// 1. `begin_signal_plan_request`, com a sessão da pessoa, confere a Participação e o limite de Planos do dia e devolve os
//    tipos que o Plano aceita (os disponíveis no banco).
// 2. O motor dos Sinais (`escolherLlmDosSinais`) monta o Plano; saída inválida, demora ou motor desligado caem no
//    planejador por regra, com um aviso neutro.
// Gerar o Plano não cobra crédito. Nada do texto cru do modelo, de erro de fornecedor, de custo ou de nome de ferramenta
// sai daqui: o erro real fica no log técnico.
import { comCors } from '../_shared/cors.ts'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import { LIMITES_DO_PLANO, type PlanoDoSinal, tiposAceitosNoPlano } from '../_shared/plano-do-sinal/index.ts'
import { planoPorIa, type ContextoIcp } from './planejador-por-ia.ts'
import { AVISO_DO_PLANO_INICIAL, planoPorRegra } from './planejador-por-regra.ts'

export type FalhaDoPedido = 'limite' | 'sem_participacao' | 'indisponivel'

/** Por que o banco recusou abrir o pedido, sem o texto do erro. */
export class ErroDoPedido extends Error {
  readonly motivo: FalhaDoPedido
  constructor(motivo: FalhaDoPedido) {
    super(motivo)
    this.name = 'ErroDoPedido'
    this.motivo = motivo
  }
}

export type ResultadoDoPedido = 'ia' | 'regra' | 'falhou'

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** begin_signal_plan_request, com a sessão da pessoa. Lança ErroDoPedido quando o banco recusa. */
  abrirPedido(a: { workspaceId: string; authorization: string; apikey: string }): Promise<{ pedidoId: string; tipos: string[] }>
  /** ICP vigente, lido com a sessão da pessoa; nulo quando não há ICP preenchido. */
  lerIcp(a: { workspaceId: string; authorization: string; apikey: string }): Promise<ContextoIcp | null>
  /** finish_signal_plan_request: registra como o Plano saiu. Uma falha aqui não derruba a resposta. */
  fecharPedido(a: { workspaceId: string; pedidoId: string; resultado: ResultadoDoPedido; authorization: string; apikey: string }): Promise<void>
}

export interface Deps {
  db: Db
  /** O motor dos Sinais; ausente quando `SIGNALS_LLM_PROVIDER` é `regra` (o padrão) ou está incompleto. */
  llm?: Llm
  appOrigin: string
  /** Quanto esperar o motor antes de cair na regra. */
  esperaDoMotorMs?: number
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export const MENSAGENS = {
  semSessao: 'Entre na sua Conta de usuário para continuar.',
  corpo: 'Corpo inválido.',
  semBriefing: 'Escreva o que você quer acompanhar.',
  briefingLongo: `O briefing tem até ${LIMITES_DO_PLANO.briefingMax} caracteres.`,
  contas: `Escolha de 1 a ${LIMITES_DO_PLANO.contasEscolhidasMax} Contas.`,
  escopo: 'Por enquanto o Sinal vale para as Contas que você escolher.',
  semParticipacao: 'Você não participa deste Workspace.',
  limite: 'Você chegou ao limite de planos de hoje. Tente de novo amanhã.',
  semTipos: 'Ainda não há Sinais disponíveis para montar um plano.',
  falha: 'Não deu para montar o plano agora. Tente de novo.',
} as const

const ESPERA_DA_LEITURA_ICP_MS = 2_000

/** A promessa só vale até o prazo; passou dele, o motor é largado e o chamador usa a regra. */
async function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error('prazo')), ms)
  })
  try {
    return await Promise.race([promessa, prazo])
  } finally {
    clearTimeout(relogio)
  }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const espera = deps.esperaDoMotorMs ?? LIMITES_DO_PLANO.esperaDoMotorMs

  function responder(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const usuario = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!usuario) return responder({ error: MENSAGENS.semSessao }, 401)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: MENSAGENS.corpo }, 400)
    }
    const workspaceId = typeof corpo?.workspaceId === 'string' ? corpo.workspaceId : ''
    if (!UUID.test(workspaceId)) return responder({ error: MENSAGENS.corpo }, 400)
    const briefing = typeof corpo.briefing === 'string' ? corpo.briefing.trim() : ''
    if (!briefing) return responder({ error: MENSAGENS.semBriefing }, 400)
    if (briefing.length > LIMITES_DO_PLANO.briefingMax) return responder({ error: MENSAGENS.briefingLongo }, 400)
    const escopo = corpo.escopo as { tipo?: unknown; contaIds?: unknown } | null | undefined
    if (escopo?.tipo !== 'contas') return responder({ error: MENSAGENS.escopo }, 400)
    const ids = escopo.contaIds
    if (
      !Array.isArray(ids) || ids.length < 1 || ids.length > LIMITES_DO_PLANO.contasEscolhidasMax ||
      !ids.every((id) => typeof id === 'string' && UUID.test(id)) ||
      new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
    ) {
      return responder({ error: MENSAGENS.contas }, 400)
    }
    const contaIds = ids.map((id: string) => id.toLowerCase())

    // O pedido conta no limite do dia desde aqui; um pedido inválido (acima) não conta.
    let pedido: { pedidoId: string; tipos: string[] }
    try {
      pedido = await deps.db.abrirPedido({ workspaceId, authorization, apikey })
    } catch (erro) {
      const motivo = erro instanceof ErroDoPedido ? erro.motivo : 'indisponivel'
      log({ type: 'signal_plan', outcome: 'pedido_recusado', motivo })
      if (motivo === 'limite') return responder({ error: MENSAGENS.limite, codigo: 'limite_diario' }, 429)
      if (motivo === 'sem_participacao') return responder({ error: MENSAGENS.semParticipacao }, 403)
      return responder({ error: MENSAGENS.falha }, 500)
    }

    async function fechar(resultado: ResultadoDoPedido) {
      try {
        await deps.db.fecharPedido({ workspaceId, pedidoId: pedido.pedidoId, resultado, authorization, apikey })
      } catch {
        log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'fechar_pedido_falhou' })
      }
    }

    const tiposAceitos = tiposAceitosNoPlano(pedido.tipos)
    if (!tiposAceitos.length) {
      await fechar('falhou')
      log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'sem_tipos' })
      return responder({ error: MENSAGENS.semTipos, codigo: 'sem_tipos' }, 409)
    }

    const dados = { briefing, contaIds, tiposAceitos }
    let plano: PlanoDoSinal | null = null
    let motivoDaRegra: 'motor_desligado' | 'saida_invalida' | 'motor_falhou' = 'motor_desligado'
    if (deps.llm) {
      try {
        let icp: ContextoIcp | null = null
        try {
          icp = await comPrazo(
            deps.db.lerIcp({ workspaceId, authorization, apikey }),
            ESPERA_DA_LEITURA_ICP_MS,
          )
        } catch {
          log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'icp_indisponivel' })
        }
        plano = await comPrazo(planoPorIa(deps.llm, workspaceId, dados, icp), espera)
        if (!plano) motivoDaRegra = 'saida_invalida'
      } catch (erro) {
        // O erro real fica só no log técnico, sem texto do modelo nem do fornecedor.
        motivoDaRegra = 'motor_falhou'
        log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'motor_falhou', erro: erro instanceof Error ? erro.name : 'erro' })
      }
    }
    if (plano) {
      await fechar('ia')
      log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'ia', tipo: plano.sinais[0].tipo })
      return responder({ plano, avisos: [] })
    }

    const porRegra = planoPorRegra(dados)
    if (!porRegra) {
      await fechar('falhou')
      log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'falhou' })
      return responder({ error: MENSAGENS.falha }, 500)
    }
    await fechar('regra')
    log({ type: 'signal_plan', pedidoId: pedido.pedidoId, outcome: 'regra', motivo: motivoDaRegra, tipo: porRegra.sinais[0].tipo })
    return responder({ plano: porRegra, avisos: [AVISO_DO_PLANO_INICIAL] })
  })
}
