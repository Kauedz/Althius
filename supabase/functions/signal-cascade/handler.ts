// A porta da conversa para a cascata de Sinais (sinais em cascata, fatia 2). O worker do Hermes, que roda fora do
// Supabase e não tem as contas do Apify, pede aqui a busca de Sinais de um tipo do catálogo; a função roda o MESMO motor do
// Monitoramento (`_shared/cascata-de-sinais`), com as contas do Apify que só existem nos segredos desta função. Só o
// servidor chama (a chave de serviço). A resposta é só o que o Hermes pode repetir ao usuário: itens normalizados, créditos
// cobrados e uma mensagem em palavras do produto. Custo em dólar, actor, run id e erro real nunca saem daqui.
import type { EntradaDoCatalogo } from '../_shared/cascata-de-sinais/index.ts'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'

export interface ResultadoDoAquecimento {
  desfecho: 'concluida' | 'adiado' | 'falhou'
  mensagem: string
}

export interface MotorDaConversa {
  rodar(pedido: PedidoDeCascata): Promise<ResultadoDaCascata>
  catalogo(): Promise<EntradaDoCatalogo[]>
  /** Opcional: quem não aquece o cache mensal simplesmente não declara. */
  aquecer?(): Promise<ResultadoDoAquecimento>
}

export interface Deps {
  motor: MotorDaConversa
  autorizado(authorization: string): boolean | Promise<boolean>
  /** O token do relógio. Só autoriza a ação `aquecer`, nunca uma busca. */
  tokenDeRotina?(token: string): Promise<boolean>
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const TIPO = /^[a-z][a-z0-9_]{1,60}$/
const MAX_CONTAS = 100
const MAX_TETO_EM_CREDITOS = 50
const MAX_TAMANHO_DOS_CRITERIOS = 4_000
// O tempo da função é de 150 s; a busca termina antes disso.
const PRAZO_EM_MS = 140_000

const ESTADO_PARA_O_USUARIO: Record<string, string> = {
  available: 'disponivel',
  testing: 'em_validacao',
  sem_fonte: 'sem_fonte',
  disabled: 'fora_do_ar',
}

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((c) => console.log(JSON.stringify(c)))
  const agora = deps.agora ?? (() => Date.now())

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: 'Corpo inválido.' }, 400)
    }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return responder({ error: 'Corpo inválido.' }, 400)
    const acao = corpo.action === undefined ? 'buscar' : corpo.action
    const servico = await deps.autorizado(req.headers.get('Authorization') ?? '')
    const rotina = !servico && acao === 'aquecer' && deps.tokenDeRotina
      ? await deps.tokenDeRotina(req.headers.get('x-runner-token') ?? '')
      : false
    if (!servico && !rotina) return responder({ error: 'Não autorizado.' }, 401)
    if (acao !== 'buscar' && acao !== 'catalogo' && acao !== 'aquecer') return responder({ error: 'Ação inválida.' }, 400)

    if (acao === 'aquecer') {
      if (!deps.motor.aquecer) {
        return responder({ desfecho: 'falhou', mensagem: 'Não foi possível guardar a estatística de comércio exterior agora.' }, 500)
      }
      try {
        const r = await deps.motor.aquecer()
        return responder({ desfecho: r.desfecho, mensagem: r.mensagem })
      } catch (e) {
        log({ type: 'signal_cascade', outcome: 'warm_failed', message: String(e) })
        return responder({ desfecho: 'falhou', mensagem: 'Não foi possível guardar a estatística de comércio exterior agora.' }, 500)
      }
    }

    if (acao === 'catalogo') {
      try {
        const sinais = (await deps.motor.catalogo()).map((c) => ({
          sinal: c.signalType,
          icp: c.icp,
          nome: c.name,
          estado: ESTADO_PARA_O_USUARIO[c.state] ?? 'fora_do_ar',
          escopo: c.scope,
          motivo: c.semFonteMotivo,
        }))
        return responder({ sinais })
      } catch (e) {
        log({ type: 'signal_cascade', outcome: 'catalog_failed', message: String(e) })
        return responder({ mensagem: 'Não foi possível ler o catálogo agora.' }, 500)
      }
    }

    const workspaceId = typeof corpo.workspaceId === 'string' ? corpo.workspaceId : ''
    const userId = corpo.userId === undefined || corpo.userId === null ? null : typeof corpo.userId === 'string' ? corpo.userId : ''
    const sinal = typeof corpo.sinal === 'string' ? corpo.sinal : ''
    if (!UUID.test(workspaceId)) return responder({ error: 'Workspace obrigatório.' }, 400)
    if (userId !== null && !UUID.test(userId)) return responder({ error: 'Usuário inválido.' }, 400)
    if (!TIPO.test(sinal)) return responder({ error: 'Tipo de Sinal inválido.' }, 400)
    const contas = corpo.contas
    if (contas !== undefined && (!Array.isArray(contas) || contas.length > MAX_CONTAS || !contas.every((c) => typeof c === 'string' && UUID.test(c)))) {
      return responder({ error: 'Contas inválidas.' }, 400)
    }
    const teto = corpo.tetoCreditos
    if (teto !== undefined && (!Number.isInteger(teto) || (teto as number) < 1 || (teto as number) > MAX_TETO_EM_CREDITOS)) {
      return responder({ error: `O teto de créditos vai de 1 a ${MAX_TETO_EM_CREDITOS}.` }, 400)
    }
    const criterios = corpo.criterios
    if (criterios !== undefined && (typeof criterios !== 'object' || criterios === null || Array.isArray(criterios) || JSON.stringify(criterios).length > MAX_TAMANHO_DOS_CRITERIOS)) {
      return responder({ error: 'Critérios inválidos.' }, 400)
    }
    // A segunda passagem compara na hora com a base já guardada. Só a validação da equipe liga isso;
    // um critério mandado pelo cliente é ignorado.
    let criteriosPedido: Record<string, unknown> | undefined
    if (criterios !== undefined) {
      criteriosPedido = { ...(criterios as Record<string, unknown>) }
      delete criteriosPedido.segundaPassagem
    }
    if (corpo.validacao === true) criteriosPedido = { ...(criteriosPedido ?? {}), segundaPassagem: true }
    const chave = typeof corpo.chave === 'string' && corpo.chave.trim() && corpo.chave.length <= 200 ? corpo.chave.trim() : `conversa:${crypto.randomUUID()}`

    try {
      const r = await deps.motor.rodar({
        workspaceId,
        userId,
        signalType: sinal,
        origem: 'conversa',
        chave,
        ...(contas ? { idsDeContas: contas as string[] } : {}),
        ...(criteriosPedido && Object.keys(criteriosPedido).length ? { criterios: criteriosPedido } : {}),
        ...(teto !== undefined ? { tetoCreditos: teto as number } : {}),
        // Só a equipe, com a chave de serviço, valida um Sinal ainda em teste; o Hermes nunca envia este campo.
        permitirTeste: corpo.validacao === true,
        prazoFinal: agora() + PRAZO_EM_MS,
      })
      return responder({
        desfecho: r.desfecho,
        mensagem: r.mensagem,
        creditos: r.creditosCobrados,
        novos: r.novos,
        repetidos: r.repetidos,
        empresasSemConta: r.semConta,
        ...(r.mercado.length
          ? { mercado: r.mercado.map((m) => ({ frase: m.phrase, quando: m.firedAt, fonte: m.source, evidencia: m.evidence, numeros: m.payload })) }
          : {}),
        sinais: r.sinais.map((s) => ({
          conta: s.contaNome, contaId: s.contaId, frase: s.phrase, quando: s.firedAt, fonte: s.source, evidencia: s.evidence,
        })),
      })
    } catch (e) {
      // O erro real fica no log da função; ao Hermes vai só a mensagem neutra.
      log({ type: 'signal_cascade', workspaceId, signalType: sinal, outcome: 'failed', message: String(e) })
      return responder({ desfecho: 'falhou', mensagem: 'Não foi possível fazer a busca agora. Tente de novo em alguns minutos.' }, 500)
    }
  }
}
