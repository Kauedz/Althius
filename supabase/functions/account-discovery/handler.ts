// A busca de Contas pelo ICP (enriquecimento-em-cascata). O navegador pede, com a sessão de quem clicou:
//   - `capability`: a função está no ar e tem o token do Apify (senão nem sobe);
//   - `prepare`: os filtros que o Contexto da empresa vigente sugere, por perfil, para a pessoa conferir antes de gastar
//     Créditos (contexto-da-empresa 04). A ação antiga `criteria`, que lia o ICP do Playbook, saiu no ticket 07;
//   - `search`: roda a busca. O banco abre a busca com a sessão de quem pede (`begin_account_discovery`): confere a
//     Participação, o Actor do registro, o modo de teste, uma busca por vez e reserva o saldo. Só então o Actor roda, em
//     segundo plano, com o token que fica só aqui; as empresas são normalizadas, avaliadas contra os filtros (critérios
//     determinísticos; a IA não pontua) e gravadas na Caixa de Descobertas com a chave de serviço, e a busca se fecha
//     (o crédito só é debitado se veio empresa). A resposta é 202 na hora: a tela acompanha pelo banco.
//   - `run`: confirma uma busca que um Agente propôs (fatia 6): mesmos passos, com os filtros do pedido.
// Nenhuma empresa vira Conta-alvo aqui: quem decide é a pessoa, na Caixa. Banco, Apify e relógio entram por injeção de
// dependência, para o teste ir da requisição à resposta sem rede.
import { comCors } from '../_shared/cors.ts'
import { ApifyRequestError, ApifyTimeoutError, type Apify } from '../signal-scan/handler.ts'
import { faltaParaBuscar, normalizarCriterios } from './criterios.ts'
import { ACTOR_RECEITA, candidatasDaReceita, candidatasDoLinkedin } from './normalizar.ts'
import { type Avaliacao, avaliar, type CandidataBruta, type Motivo } from './pontuacao.ts'
import { type ChamadaDoActor, MAX_COMBINACOES, montarPlano } from './plano.ts'
import type { CriteriosDeBusca } from './criterios.ts'
import { mensagemDaFalhaDaFonte } from '../_shared/marca.ts'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import {
  CONCEITOS,
  type Conceito,
  type CriterioDoTexto,
  LIMITES_DA_PREPARACAO,
  type MotivoDaPendencia,
  NOMES_DOS_CONCEITOS,
  prepararBusca,
  textoCurto,
} from './preparacao.ts'
import { normalizar } from '../signal-runner/adaptadores/comum.ts'

export interface ActorRegistrado {
  actorId: string
  state: 'available' | 'testing' | 'out'
  version: string | null
  maxCostUsd: number
}

export interface InicioDaBusca {
  runId: string
  /** `go`: a busca começou e o saldo está reservado; `existing`: essa chave já tinha busca, nada roda de novo. */
  outcome: 'go' | 'existing'
  state: string
  actorVersion: string | null
}

/** Um critério do texto que a fonte não aplicou: vai para o registro da busca e para os motivos, "a verificar". */
export interface PendenteDaBusca extends CriterioDoTexto {
  motivo: MotivoDaPendencia
}

const MOTIVOS: readonly MotivoDaPendencia[] = ['sem_suporte_na_fonte', 'ambiguo', 'faixa_aproximada', 'local_desconhecido', 'valor_invalido']

/** Um recorte da busca: um perfil do Contexto da empresa (ou os filtros avulsos, sem nome). */
export interface Recorte {
  nome: string | null
  criterios: CriteriosDeBusca
  /** De que trecho do texto veio cada filtro preparado. */
  aplicados: CriterioDoTexto[]
  pendentes: PendenteDaBusca[]
}

/** O que fica gravado de uma busca pelo Contexto da empresa: os filtros executados de cada perfil, a fonte e a versão. */
export interface RegistroPorPerfis {
  origem: 'contexto_da_empresa'
  contexto: { versao: number }
  fonte: CriteriosDeBusca['fonte']
  perfis: { nome: string; criterios: CriteriosDeBusca; aplicados: CriterioDoTexto[]; pendentes: PendenteDaBusca[] }[]
}

/** Um erro do banco com o código SQLSTATE e a mensagem, para o handler traduzir. */
export class ErroDoBanco extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ErroDoBanco'
  }
}

export interface CandidataParaGravar {
  name: string
  website?: string
  cnpj?: string
  linkedinUrl?: string
  location?: string
  uf?: string
  city?: string
  country?: string
  sector?: string
  sizeLabel?: string
  employeeCount?: number
  description?: string
  tags: string[]
  sourceRef?: string
  sourceActor: string
  sourceRunId?: string
  score: number
  level: Avaliacao['level']
  reasons: Avaliacao['reasons']
  signals: CandidataBruta['signals']
}

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /**
   * O Contexto da empresa vigente (get_company_context), com a sessão de quem pede: a versão (nula sem contexto) e o
   * texto do Perfil de cliente ideal. Lança ErroDoBanco 42501 para quem não participa do Workspace.
   */
  lerContexto?(args: { workspaceId: string; authorization: string; apikey: string }): Promise<{ versao: number | null; icp: string }>
  /** Os Actors de busca de empresas do registro, na ordem da cascata. */
  actoresDeBusca(): Promise<ActorRegistrado[]>
  /** begin_account_discovery, com a sessão de quem pede. Lança ErroDoBanco quando o banco recusa. */
  iniciar(args: {
    workspaceId: string
    requestKey: string
    /** Os filtros avulsos, ou o registro dos perfis do Contexto da empresa. */
    criterios: CriteriosDeBusca | RegistroPorPerfis
    maxResults: number
    actorId: string
    icpVersion: number | null
    allowTesting: boolean
    runId?: string
    authorization: string
    apikey: string
  }): Promise<InicioDaBusca>
  /** O pedido que um Agente propôs (get_discovery_proposal), com a sessão de quem confirma. Nulo se não existe. */
  lerProposta?(args: { runId: string; authorization: string; apikey: string }): Promise<
    { workspaceId: string; criterios: CriteriosDeBusca; maxResults: number; icpVersion: number | null } | null
  >
  /** record_discovered_accounts, com a chave de serviço. */
  gravarCandidatas(runId: string, candidatas: CandidataParaGravar[]): Promise<{ added: number; duplicates: number; ignored: number }>
  /** record_discovery_cost: o custo real de uma execução do Apify, só para medir. */
  gravarCusto(args: { workspaceId: string; actorId: string; runId: string; items: number; costUsd: number | null }): Promise<void>
  /** finish_account_discovery: fecha a busca; o crédito é debitado só se ela trouxe empresa. */
  encerrar(args: { runId: string; success: boolean; apifyRunId: string | null; costUsd: number | null; error: string | null }): Promise<void>
}

export interface Deps {
  db: Db
  apify: Apify
  /** A IA que lê o Perfil de cliente ideal; sem ela, a preparação é falha de tradução. */
  llm?: Llm
  appOrigin: string
  /** Continua um trabalho depois da resposta (EdgeRuntime.waitUntil). */
  waitUntil: (trabalho: Promise<unknown>) => void
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const MAX_EMPRESAS = 100
const PADRAO_DE_EMPRESAS = 50
const MAX_CRITERIOS_GRAVADOS = 15
/** O teto do registro da busca no banco (discovery_runs.criteria) é 20.000 caracteres. */
const MAX_REGISTRO = 19_000

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

/** O que o banco recusou, em palavras do produto. */
function recusaDoBanco(erro: ErroDoBanco): Response {
  const m = erro.message
  if (erro.code === 'P0001' && m.includes('insufficient credits')) {
    return responder({ code: 'sem_creditos', error: 'O Workspace não tem créditos suficientes para esta busca.' }, 402)
  }
  if (erro.code === 'P0001' && m.includes('monthly credit limit')) {
    return responder({ code: 'limite_mensal', error: 'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.' }, 429)
  }
  if (erro.code === '55006') {
    return responder({ code: 'busca_em_andamento', error: 'Já existe uma busca em andamento neste Workspace. Espere ela terminar.' }, 409)
  }
  if (erro.code === '55000' && m.includes('testing')) {
    return responder({
      code: 'actor_em_teste',
      error: 'A fonte desta busca ainda está em teste. Só um Administrador roda em modo de teste.',
    }, 403)
  }
  if (erro.code === '55000' && m.includes('is out')) {
    return responder({ code: 'actor_fora', error: 'A fonte desta busca está fora do ar.' }, 503)
  }
  if (erro.code === '55000') {
    return responder({ code: 'pedido_invalido', error: 'Este pedido não está esperando confirmação.' }, 409)
  }
  if (erro.code === 'P0002') {
    return responder({ code: 'nao_encontrado', error: 'A fonte desta busca não está no registro.' }, 404)
  }
  if (erro.code === '42501') {
    return responder({ code: 'sem_participacao', error: 'Você não participa deste Workspace.' }, 403)
  }
  if (erro.code === '22023') {
    return responder({ code: 'filtros_invalidos', error: 'Os filtros da busca não são válidos.' }, 400)
  }
  return responder({ code: 'erro', error: 'Não foi possível abrir a busca agora.' }, 500)
}

function codigoDaFalha(erro: unknown): string {
  if (erro instanceof ApifyTimeoutError) return 'timeout'
  if (erro instanceof ApifyRequestError) return `apify_http_${erro.status}`
  return 'apify_unreachable'
}

function mensagemDaFalha(codigos: string[]): string {
  return mensagemDaFalhaDaFonte(codigos[0])
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const agora = deps.agora ?? (() => Date.now())

  /** Roda a busca e, se algo inesperado quebrar, fecha como falha: a busca nunca fica aberta por um erro nosso. */
  async function executar(a: Parameters<typeof rodar>[0]): Promise<void> {
    try {
      await rodar(a)
    } catch (erro) {
      log({ type: 'account_discovery', runId: a.runId, outcome: 'unexpected', message: String(erro) })
      await encerrar(a.runId, false, null, null, 'A busca parou por um erro inesperado.')
    }
  }

  /**
   * Roda as chamadas de cada recorte, avalia cada empresa contra o recorte que a trouxe, junta as repetidas, grava na
   * Caixa e fecha a busca.
   */
  async function rodar(a: {
    runId: string
    workspaceId: string
    actorId: string
    chamadas: (ChamadaDoActor & { recorte: number })[]
    recortes: Recorte[]
    porRecorte: number
    maxResults: number
    actor: ActorRegistrado
  }): Promise<void> {
    const { runId, workspaceId, actorId, chamadas, recortes, porRecorte, maxResults, actor } = a
    const falhas: string[] = []
    const brutas: { candidata: CandidataBruta; recorte: number }[] = []
    let apifyRunId: string | null = null
    let custo = 0
    let custoDesconhecido = false
    let rodou = 0
    // O teto do registro vale para a busca inteira: cada chamada leva a sua parte.
    const teto = actor.maxCostUsd / chamadas.length

    for (const chamada of chamadas) {
      if (brutas.filter((b) => b.recorte === chamada.recorte).length >= porRecorte) continue
      let execucao
      try {
        execucao = await deps.apify.run({
          actorId,
          input: chamada.input,
          maxItems: chamada.maxItems,
          maxTotalChargeUsd: teto,
        })
      } catch (erro) {
        falhas.push(codigoDaFalha(erro))
        log({ type: 'account_discovery', runId, actorId, outcome: 'apify_failed', errorCode: codigoDaFalha(erro) })
        continue
      }
      rodou++
      apifyRunId ??= execucao.runId
      let custoDaExecucao: number | null = null
      try {
        custoDaExecucao = execucao.runId ? (await deps.apify.custoDaExecucao?.(execucao.runId)) ?? null : null
      } catch {
        custoDaExecucao = null
      }
      if (custoDaExecucao === null) custoDesconhecido = true
      else custo += custoDaExecucao
      try {
        await deps.db.gravarCusto({
          workspaceId,
          actorId,
          runId: execucao.runId ?? `account-discovery:${crypto.randomUUID()}`,
          items: execucao.items.length,
          costUsd: custoDaExecucao,
        })
      } catch (erro) {
        log({ type: 'account_discovery', runId, outcome: 'cost_failed', message: String(erro) })
      }
      const novas = actorId === ACTOR_RECEITA
        ? candidatasDaReceita(execucao.items, agora(), execucao.runId ?? undefined)
        : candidatasDoLinkedin(execucao.items, execucao.runId ?? undefined)
      brutas.push(...novas.map((candidata) => ({ candidata, recorte: chamada.recorte })))
    }

    if (rodou === 0) {
      await encerrar(runId, false, null, null, mensagemDaFalha(falhas))
      return
    }

    const avaliadas = juntarRepetidas(
      brutas
        .map(({ candidata, recorte }) => ({ candidata, recorte, avaliacao: avaliar(candidata, recortes[recorte].criterios) }))
        .filter(({ avaliacao }) => !avaliacao.excluida),
      recortes,
    )
      .sort((x, y) =>
        y.avaliacao.score - x.avaliacao.score ||
        y.avaliacao.reasons.filter((m) => m.atende !== null).length - x.avaliacao.reasons.filter((m) => m.atende !== null).length
      )
      .slice(0, maxResults)
    try {
      const gravadas = await deps.db.gravarCandidatas(runId, avaliadas.map(paraGravar))
      log({ type: 'account_discovery', runId, outcome: 'recorded', ...gravadas, excluded: brutas.length - avaliadas.length })
    } catch (erro) {
      log({ type: 'account_discovery', runId, outcome: 'record_failed', message: String(erro) })
      await encerrar(runId, false, apifyRunId, custoDesconhecido ? null : custo, 'Não foi possível guardar as empresas encontradas.')
      return
    }
    await encerrar(
      runId,
      true,
      apifyRunId,
      custoDesconhecido ? null : custo,
      falhas.length ? `Parte da busca falhou: ${mensagemDaFalha(falhas).toLowerCase()}` : null,
    )
  }

  async function encerrar(runId: string, success: boolean, apifyRunId: string | null, costUsd: number | null, error: string | null) {
    try {
      await deps.db.encerrar({ runId, success, apifyRunId, costUsd, error })
    } catch (erro) {
      // A busca presa vence sozinha (15 minutos) e solta o saldo.
      log({ type: 'account_discovery', runId, outcome: 'finish_failed', message: String(erro) })
    }
  }

  /** Abre a busca no banco e, se ela começou, deixa o Actor rodando depois da resposta. */
  async function abrir(a: {
    workspaceId: string
    /** Um recorte por perfil; os filtros avulsos são um recorte sem nome. Todos da mesma fonte. */
    recortes: Recorte[]
    /** O que fica gravado como os filtros da busca. */
    registro: CriteriosDeBusca | RegistroPorPerfis
    maxResults: number
    requestKey: string
    icpVersion: number | null
    allowTesting: boolean
    runId?: string
    authorization: string
    apikey: string
  }): Promise<Response> {
    for (const recorte of a.recortes) {
      const falta = faltaParaBuscar(recorte.criterios)
      if (falta) return responder({ code: 'filtros_insuficientes', error: recorte.nome ? `${recorte.nome}: ${falta}` : falta }, 422)
    }
    // Cada recorte leva a sua parte do limite de empresas e das execuções: a busca não fica maior nem mais cara.
    const porRecorte = Math.ceil(a.maxResults / a.recortes.length)
    const combinacoes = Math.max(1, Math.floor(MAX_COMBINACOES / a.recortes.length))
    const planos = a.recortes.map((r) => montarPlano(r.criterios, porRecorte, combinacoes))
    const plano = {
      actorId: planos[0].actorId,
      chamadas: planos.flatMap((p, recorte) => p.chamadas.map((c) => ({ ...c, recorte }))),
    }

    let actor: ActorRegistrado | undefined
    try {
      actor = (await deps.db.actoresDeBusca()).find((x) => x.actorId === plano.actorId)
    } catch (erro) {
      log({ type: 'account_discovery', outcome: 'registry_failed', message: String(erro) })
      return responder({ code: 'erro', error: 'Não foi possível consultar o registro de fontes.' }, 500)
    }
    if (!actor) return responder({ code: 'actor_nao_registrado', error: 'A fonte desta busca não está no registro.' }, 503)
    if (actor.state === 'out') return responder({ code: 'actor_fora', error: 'A fonte desta busca está fora do ar.' }, 503)
    if (actor.state === 'testing' && !a.allowTesting) {
      return responder({
        code: 'actor_em_teste',
        error: 'A fonte desta busca ainda está em teste. Só um Administrador roda em modo de teste.',
      }, 403)
    }

    let inicio: InicioDaBusca
    try {
      inicio = await deps.db.iniciar({
        workspaceId: a.workspaceId,
        requestKey: a.requestKey,
        criterios: a.registro,
        maxResults: a.maxResults,
        actorId: plano.actorId,
        icpVersion: a.icpVersion,
        allowTesting: a.allowTesting,
        runId: a.runId,
        authorization: a.authorization,
        apikey: a.apikey,
      })
    } catch (erro) {
      if (erro instanceof ErroDoBanco) return recusaDoBanco(erro)
      log({ type: 'account_discovery', outcome: 'begin_failed', message: String(erro) })
      return responder({ code: 'erro', error: 'Não foi possível abrir a busca agora.' }, 500)
    }
    if (inicio.outcome === 'existing') {
      return responder({ runId: inicio.runId, state: inicio.state, existing: true })
    }
    log({ type: 'account_discovery', runId: inicio.runId, workspaceId: a.workspaceId, actorId: plano.actorId, outcome: 'started' })
    deps.waitUntil(executar({
      runId: inicio.runId,
      workspaceId: a.workspaceId,
      actorId: plano.actorId,
      chamadas: plano.chamadas,
      recortes: a.recortes,
      porRecorte,
      maxResults: a.maxResults,
      actor,
    }))
    return responder({ runId: inicio.runId, state: inicio.state }, 202)
  }

  /** O contexto vigente com a sessão de quem pede, ou a resposta de recusa. */
  async function contextoVigente(
    a: { workspaceId: string; authorization: string; apikey: string },
  ): Promise<{ versao: number | null; icp: string } | Response> {
    if (!deps.db.lerContexto) return responder({ error: 'Ação indisponível.' }, 400)
    try {
      return await deps.db.lerContexto(a)
    } catch (erro) {
      if (erro instanceof ErroDoBanco && erro.code === '42501') return recusaDoBanco(erro)
      log({ type: 'account_discovery', outcome: 'context_failed', message: String(erro) })
      return responder({ code: 'erro', error: 'Não foi possível ler o Contexto da empresa agora.' }, 500)
    }
  }

  /**
   * A busca pelos perfis que a preparação montou do Contexto da empresa, já ajustados na tela. Só roda com a versão
   * vigente: filtros de uma versão antiga precisam ser preparados de novo.
   */
  async function buscarPorPerfis(a: {
    corpo: Record<string, unknown>
    workspaceId: string
    maxResults: number
    requestKey: string
    authorization: string
    apikey: string
  }): Promise<Response> {
    const { corpo, workspaceId, authorization, apikey } = a
    const perfis = corpo.perfis as unknown[]
    if (!perfis.length || perfis.length > LIMITES_DA_PREPARACAO.perfis) {
      return responder({ code: 'filtros_invalidos', error: `A busca tem de 1 a ${LIMITES_DA_PREPARACAO.perfis} perfis.` }, 400)
    }
    const versao = Number.isInteger(corpo.contextoVersao) && (corpo.contextoVersao as number) > 0 ? corpo.contextoVersao as number : null
    if (versao === null) {
      return responder({ code: 'filtros_invalidos', error: 'Prepare a busca pelo Contexto da empresa de novo.' }, 400)
    }
    const vigente = await contextoVigente({ workspaceId, authorization, apikey })
    if (vigente instanceof Response) return vigente
    if (vigente.versao !== versao) {
      return responder({
        code: 'contexto_mudou',
        error: 'O Contexto da empresa mudou desde que estes filtros foram preparados. Prepare a busca de novo com a versão atual.',
      }, 409)
    }
    const recortes = perfis.map(recorteDoPedido)
    if (recortes.some((r) => r.criterios.fonte !== recortes[0].criterios.fonte)) {
      return responder({ code: 'filtros_invalidos', error: 'Todos os perfis de uma busca usam a mesma fonte.' }, 422)
    }
    const registro: RegistroPorPerfis = {
      origem: 'contexto_da_empresa',
      contexto: { versao },
      fonte: recortes[0].criterios.fonte,
      perfis: recortes.map((r) => ({ nome: r.nome!, criterios: r.criterios, aplicados: r.aplicados, pendentes: r.pendentes })),
    }
    if (JSON.stringify(registro).length > MAX_REGISTRO) {
      return responder({ code: 'filtros_invalidos', error: 'Os filtros desta busca são grandes demais. Remova alguns termos e tente de novo.' }, 422)
    }
    return await abrir({
      workspaceId,
      recortes,
      registro,
      maxResults: a.maxResults,
      requestKey: a.requestKey,
      icpVersion: null,
      allowTesting: corpo.allowTesting === true,
      authorization,
      apikey,
    })
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return responder({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: 'Corpo inválido.' }, 400)
    }
    const acao = typeof corpo?.action === 'string' ? corpo.action : ''

    if (acao === 'capability') return responder({ available: true })

    if (acao === 'run') {
      const runId = typeof corpo.runId === 'string' ? corpo.runId : ''
      if (!UUID.test(runId)) return responder({ error: 'Pedido obrigatório.' }, 400)
      if (!deps.db.lerProposta) return responder({ error: 'Ação indisponível.' }, 400)
      const proposta = await deps.db.lerProposta({ runId, authorization, apikey }).catch((erro) => {
        log({ type: 'account_discovery', runId, outcome: 'proposal_failed', message: String(erro) })
        return null
      })
      if (!proposta) return responder({ code: 'nao_encontrado', error: 'Pedido não encontrado neste Workspace.' }, 404)
      return await abrir({
        workspaceId: proposta.workspaceId,
        recortes: [{ nome: null, criterios: proposta.criterios, aplicados: [], pendentes: [] }],
        registro: proposta.criterios,
        maxResults: proposta.maxResults,
        requestKey: `confirmar:${runId}`,
        icpVersion: proposta.icpVersion,
        allowTesting: corpo.allowTesting === true,
        runId,
        authorization,
        apikey,
      })
    }

    const workspaceId = typeof corpo.workspaceId === 'string' ? corpo.workspaceId : ''
    if (!UUID.test(workspaceId)) return responder({ error: 'Workspace obrigatório.' }, 400)

    if (acao === 'prepare') {
      const contexto = await contextoVigente({ workspaceId, authorization, apikey })
      if (contexto instanceof Response) return contexto
      const preparacao = await prepararBusca({ contexto, llm: deps.llm, workspaceId })
      log({ type: 'account_discovery', outcome: 'prepared', estado: preparacao.estado, perfis: preparacao.perfis.length })
      return responder(preparacao)
    }

    if (acao === 'search') {
      const maxResults = corpo.maxResults === undefined ? PADRAO_DE_EMPRESAS : Number(corpo.maxResults)
      if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_EMPRESAS) {
        return responder({ error: `A busca traz de 1 a ${MAX_EMPRESAS} empresas.` }, 400)
      }
      const chave = typeof corpo.requestKey === 'string' ? corpo.requestKey.trim() : ''
      if (chave.length > 100) return responder({ error: 'Chave do pedido inválida.' }, 400)
      if (Array.isArray(corpo.perfis)) {
        return await buscarPorPerfis({ corpo, workspaceId, maxResults, requestKey: chave || crypto.randomUUID(), authorization, apikey })
      }
      const icpVersion = Number.isInteger(corpo.icpVersion) && (corpo.icpVersion as number) > 0 ? corpo.icpVersion as number : null
      const criterios = normalizarCriterios(corpo.criteria)
      return await abrir({
        workspaceId,
        recortes: [{ nome: null, criterios, aplicados: [], pendentes: [] }],
        registro: criterios,
        maxResults,
        requestKey: chave || crypto.randomUUID(),
        icpVersion,
        allowTesting: corpo.allowTesting === true,
        authorization,
        apikey,
      })
    }

    return responder({ error: 'Ação desconhecida.' }, 400)
  })
}

function paraGravar(x: { candidata: CandidataBruta; avaliacao: Avaliacao }): CandidataParaGravar {
  const { candidata: c, avaliacao: a } = x
  return {
    name: c.name,
    website: c.website,
    cnpj: c.cnpj,
    linkedinUrl: c.linkedinUrl,
    location: c.location,
    uf: c.uf,
    city: c.city,
    country: c.country,
    sector: c.sector,
    sizeLabel: c.sizeLabel,
    employeeCount: c.employeeCount,
    description: c.description,
    tags: c.tags,
    sourceRef: c.sourceRef,
    sourceActor: c.sourceActor,
    sourceRunId: c.sourceRunId,
    score: a.score,
    level: a.level,
    reasons: a.reasons,
    signals: c.signals,
  }
}

/** Um critério do texto que chega do navegador: conceito conhecido e valor presente, cortado; nulo se não serve. */
function criterioDoPedido(cru: unknown): (CriterioDoTexto & { motivo?: unknown }) | null {
  const c = cru && typeof cru === 'object' ? cru as Record<string, unknown> : {}
  if (!(CONCEITOS as readonly unknown[]).includes(c.conceito)) return null
  const valor = textoCurto(c.valor, LIMITES_DA_PREPARACAO.valor)
  if (!valor) return null
  return { conceito: c.conceito as Conceito, valor, trecho: textoCurto(c.trecho, LIMITES_DA_PREPARACAO.trecho), motivo: c.motivo }
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

/** Um perfil que chega do navegador: nome, filtros limpos, a origem no texto e os pendentes, com motivo conhecido. */
function recorteDoPedido(bruto: unknown, indice: number): Recorte {
  const perfil = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
  const aplicados = lista(perfil.aplicados).map(criterioDoPedido).flatMap((c) =>
    c ? [{ conceito: c.conceito, valor: c.valor, trecho: c.trecho }] : []
  )
  const pendentes = lista(perfil.pendentes).map(criterioDoPedido).flatMap((c): PendenteDaBusca[] =>
    c && MOTIVOS.includes(c.motivo as MotivoDaPendencia)
      ? [{ conceito: c.conceito, valor: c.valor, trecho: c.trecho, motivo: c.motivo as MotivoDaPendencia }]
      : []
  )
  return {
    nome: textoCurto(perfil.nome, LIMITES_DA_PREPARACAO.nome) || `Perfil ${indice + 1}`,
    criterios: normalizarCriterios(perfil.criterios),
    aplicados: aplicados.slice(0, MAX_CRITERIOS_GRAVADOS),
    pendentes: pendentes.slice(0, MAX_CRITERIOS_GRAVADOS),
  }
}

/** O que falta para conferir cada pendência na qualificação, sem prometer um dado que a fonte não tem. */
const O_QUE_FALTA: Record<MotivoDaPendencia, string> = {
  sem_suporte_na_fonte: 'a fonte não traz esse dado',
  ambiguo: 'o texto não define um valor',
  faixa_aproximada: 'a fonte só filtra por faixa',
  local_desconhecido: 'local não reconhecido pela fonte',
  valor_invalido: 'valor não aceito pela fonte',
}

/** Quem é a mesma empresa: o LinkedIn, o CNPJ, o site ou, sem nada disso, o nome. */
function chaveDaEmpresa(c: CandidataBruta): string {
  if (c.linkedinUrl) return `li:${c.linkedinUrl.toLowerCase().replace(/\/+$/, '')}`
  if (c.cnpj) return `cnpj:${c.cnpj.replace(/\D/g, '')}`
  if (c.website) return `site:${c.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')}`
  return `nome:${normalizar(c.name)}`
}

/**
 * A empresa que mais de um recorte trouxe fica uma vez, com a melhor avaliação. Os motivos dizem de qual perfil ela
 * veio e o que o perfil pede e a fonte não verificou: isso fica "a verificar", sem pesar na nota.
 */
function juntarRepetidas(
  avaliadas: { candidata: CandidataBruta; recorte: number; avaliacao: Avaliacao }[],
  recortes: Recorte[],
): { candidata: CandidataBruta; avaliacao: Avaliacao }[] {
  const grupos = new Map<string, { melhor: (typeof avaliadas)[number]; recortes: Set<number> }>()
  for (const item of avaliadas) {
    const chave = chaveDaEmpresa(item.candidata)
    const grupo = grupos.get(chave)
    if (!grupo) {
      grupos.set(chave, { melhor: item, recortes: new Set([item.recorte]) })
      continue
    }
    grupo.recortes.add(item.recorte)
    if (item.avaliacao.score > grupo.melhor.avaliacao.score) grupo.melhor = item
  }
  return [...grupos.values()].map(({ melhor, recortes: deOnde }) => {
    const nomes = [...deOnde].sort().map((i) => recortes[i].nome).filter((n): n is string => !!n)
    const extras: Motivo[] = []
    if (nomes.length) {
      extras.push({ criterio: 'perfil', atende: null, texto: `${nomes.length > 1 ? 'Perfis' : 'Perfil'}: ${nomes.join(', ')}.` })
    }
    for (const p of recortes[melhor.recorte].pendentes) {
      extras.push({
        criterio: 'pendente',
        atende: null,
        texto: `A verificar na qualificação: ${NOMES_DOS_CONCEITOS[p.conceito]} ${p.valor} (${O_QUE_FALTA[p.motivo]}).`,
      })
    }
    return { candidata: melhor.candidata, avaliacao: { ...melhor.avaliacao, reasons: [...melhor.avaliacao.reasons, ...extras] } }
  })
}
