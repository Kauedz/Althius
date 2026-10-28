// Explica a Aderência de uma Descoberta (Fase 6b). A pessoa chama com o JWT dela e o id da Descoberta.
// 1. `get_discovered_account_fit_explanation`, com a sessão da pessoa, confere a Participação e devolve a Descoberta com a
//    nota, os motivos, o ICP, a explicação guardada (só se a nota não mudou desde então) e se ainda cabe IA hoje.
// 2. Explicação guardada e válida: devolve sem chamar o modelo.
// 3. Senão o motor dos Sinais escreve; motor desligado, acima do limite do dia, demora ou saída inválida caem na regra.
// 4. Guarda com `save_discovered_account_fit_explanation` (service_role). A regra só é guardada quando não há motor, para
//    uma falha passageira não prender a Descoberta na explicação simples.
// A nota (nível e número) devolvida é sempre a do banco: nada aqui grava fit_level, fit_score ou reasons. Não cobra
// crédito. Nada de texto cru do modelo, erro de fornecedor ou custo sai daqui.
import { comCors } from '../_shared/cors.ts'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import { type Descoberta, explicacaoPorIa, explicacaoPorRegra } from './explicacao.ts'

export type Origem = 'ia' | 'regra'

export interface LeituraDaDescoberta extends Descoberta {
  explanation: string | null
  explanationSource: Origem | null
  modelAllowed: boolean
}

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** Lê com a sessão da pessoa; nulo quando a Descoberta não existe ou é de outro Workspace. */
  lerDescoberta(a: { id: string; authorization: string; apikey: string }): Promise<LeituraDaDescoberta | null>
  /** Grava só a explicação (service_role). */
  guardarExplicacao(a: { id: string; texto: string; origem: Origem }): Promise<void>
}

export interface Deps {
  db: Db
  llm?: Llm
  appOrigin: string
  esperaDoMotorMs?: number
  log?: (campos: Record<string, unknown>) => void
}

export const MENSAGENS = {
  semSessao: 'Entre na sua Conta de usuário para continuar.',
  corpo: 'Corpo inválido.',
  naoEncontrada: 'Descoberta não encontrada.',
  falha: 'Não deu para explicar a Aderência agora. Tente de novo.',
} as const

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ESPERA_PADRAO_MS = 20_000

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

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {})
  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    if (!authorization.startsWith('Bearer ') || !apikey) return json({ error: MENSAGENS.semSessao }, 401)
    const usuario = await deps.db.userFromJwt(authorization, apikey).catch(() => null)
    if (!usuario) return json({ error: MENSAGENS.semSessao }, 401)

    let corpo: unknown
    try {
      corpo = await req.json()
    } catch {
      return json({ error: MENSAGENS.corpo }, 400)
    }
    const id = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>).discoveredAccountId : undefined
    if (typeof id !== 'string' || !UUID.test(id)) return json({ error: MENSAGENS.corpo }, 400)

    let descoberta: LeituraDaDescoberta | null
    try {
      descoberta = await deps.db.lerDescoberta({ id, authorization, apikey })
    } catch (erro) {
      log({ type: 'account_fit_explanation', outcome: 'leitura_falhou', erro: erro instanceof Error ? erro.name : 'erro' })
      return json({ error: MENSAGENS.falha }, 502)
    }
    if (!descoberta) return json({ error: MENSAGENS.naoEncontrada }, 404)

    const nota = { nivel: descoberta.fitLevel, pontuacao: descoberta.fitScore }
    if (descoberta.explanation && descoberta.explanationSource) {
      log({ type: 'account_fit_explanation', outcome: 'guardada' })
      return json({ explicacao: descoberta.explanation, origem: descoberta.explanationSource, ...nota })
    }

    let texto: string | null = null
    if (deps.llm && descoberta.modelAllowed) {
      try {
        texto = await comPrazo(explicacaoPorIa(deps.llm, descoberta), deps.esperaDoMotorMs ?? ESPERA_PADRAO_MS)
        if (!texto) log({ type: 'account_fit_explanation', outcome: 'saida_invalida' })
      } catch (erro) {
        log({ type: 'account_fit_explanation', outcome: 'motor_falhou', erro: erro instanceof Error ? erro.message.slice(0, 40) : 'erro' })
      }
    } else if (deps.llm) {
      log({ type: 'account_fit_explanation', outcome: 'limite_do_dia' })
    }
    const origem: Origem = texto ? 'ia' : 'regra'
    const explicacao = texto ?? explicacaoPorRegra(descoberta)

    if (origem === 'ia' || !deps.llm) {
      try {
        await deps.db.guardarExplicacao({ id, texto: explicacao, origem })
      } catch (erro) {
        log({ type: 'account_fit_explanation', outcome: 'gravacao_falhou', erro: erro instanceof Error ? erro.name : 'erro' })
      }
    }
    log({ type: 'account_fit_explanation', outcome: origem })
    return json({ explicacao, origem, ...nota })
  })
}
