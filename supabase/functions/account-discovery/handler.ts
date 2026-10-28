// A busca de Contas pelo ICP (enriquecimento-em-cascata). O navegador pede, com a sessão de quem clicou:
//   - `capability`: a função está no ar e tem o token do Apify (senão nem sobe);
//   - `criteria`: os filtros que o ICP do Playbook sugere, para a pessoa conferir antes de gastar Créditos;
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
import {
  type ConteudoDoIcp,
  criteriosDoIcp,
  criteriosVazios,
  faltaParaBuscar,
  normalizarCriterios,
} from './criterios.ts'
import { ACTOR_RECEITA, candidatasDaReceita, candidatasDoLinkedin } from './normalizar.ts'
import { type Avaliacao, avaliar, type CandidataBruta } from './pontuacao.ts'
import { montarPlano, type PlanoDaBusca } from './plano.ts'
import type { CriteriosDeBusca } from './criterios.ts'
import { mensagemDaFalhaDaFonte } from '../_shared/marca.ts'

export interface ActorRegistrado {
  actorId: string
  state: 'available' | 'testing' | 'out'
  version: string | null
  maxCostUsd: number
}

export interface IcpLido {
  /** A versão vigente da seção ICP; nulo quando ela ainda não foi escrita. */
  version: number | null
  conteudo: ConteudoDoIcp
}

export interface IcpEstruturadoLido {
  version: number | null
  sector: string
  companySize: string
  geography: string
}

export interface InicioDaBusca {
  runId: string
  /** `go`: a busca começou e o saldo está reservado; `existing`: essa chave já tinha busca, nada roda de novo. */
  outcome: 'go' | 'existing'
  state: string
  actorVersion: string | null
}

export function criteriosComIcpEstruturado(icp: IcpLido | null, estruturado: IcpEstruturadoLido | null) {
  const playbook = icp ? criteriosDoIcp(icp.conteudo) : criteriosVazios()
  const estruturadoCriterios = estruturado
    ? criteriosDoIcp({
      // O Porte estruturado é uma lista ("1-10, 11-50, EPP"): cada item vira uma linha, para cada faixa ser lida inteira.
      texto: [
        `Setor: ${estruturado.sector}`,
        ...estruturado.companySize.split(/\s*[,;]\s*/).filter(Boolean).map((porte) => `Porte: ${porte}`),
        `Região: ${estruturado.geography}`,
      ].join('\n'),
    })
    : criteriosVazios()
  const texto = icp ? textoDoIcp(icp.conteudo) : ''
  return {
    temIcp: Boolean(texto.length || (Array.isArray(icp?.conteudo.linhas) && icp!.conteudo.linhas.length) || estruturado?.sector.trim() || estruturado?.companySize.trim() || estruturado?.geography.trim()),
    icpVersion: icp?.version ?? estruturado?.version ?? null,
    criteria: normalizarCriterios({ ...playbook,
      setores: [...playbook.setores, ...estruturadoCriterios.setores],
      palavrasChave: [...playbook.palavrasChave, ...estruturadoCriterios.palavrasChave],
      portes: [...playbook.portes, ...estruturadoCriterios.portes],
      regioes: [...playbook.regioes, ...estruturadoCriterios.regioes],
    }),
  }
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
  /** A seção ICP do Playbook, com a sessão de quem pede (só Participação ativa lê). Nulo se não há ICP escrito. */
  lerIcp(args: { workspaceId: string; authorization: string; apikey: string }): Promise<IcpLido | null>
  lerIcpEstruturado?(args: { workspaceId: string; authorization: string; apikey: string }): Promise<IcpEstruturadoLido | null>
  /** Os Actors de busca de empresas do registro, na ordem da cascata. */
  actoresDeBusca(): Promise<ActorRegistrado[]>
  /** begin_account_discovery, com a sessão de quem pede. Lança ErroDoBanco quando o banco recusa. */
  iniciar(args: {
    workspaceId: string
    requestKey: string
    criterios: CriteriosDeBusca
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
  appOrigin: string
  /** Continua um trabalho depois da resposta (EdgeRuntime.waitUntil). */
  waitUntil: (trabalho: Promise<unknown>) => void
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const MAX_EMPRESAS = 100
const PADRAO_DE_EMPRESAS = 50
const RESUMO_DO_ICP = 1500

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function textoDoIcp(conteudo: ConteudoDoIcp): string {
  return typeof conteudo.texto === 'string' ? conteudo.texto.trim() : ''
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

  /** Roda as chamadas do plano, avalia as empresas, grava na Caixa e fecha a busca. */
  async function rodar(a: {
    runId: string
    workspaceId: string
    plano: PlanoDaBusca
    criterios: CriteriosDeBusca
    maxResults: number
    actor: ActorRegistrado
  }): Promise<void> {
    const { runId, workspaceId, plano, criterios, maxResults, actor } = a
    const falhas: string[] = []
    const brutas: CandidataBruta[] = []
    let apifyRunId: string | null = null
    let custo = 0
    let custoDesconhecido = false
    let rodou = 0
    // O teto do registro vale para a busca inteira: cada chamada leva a sua parte.
    const teto = actor.maxCostUsd / plano.chamadas.length

    for (const chamada of plano.chamadas) {
      if (brutas.length >= maxResults) break
      let execucao
      try {
        execucao = await deps.apify.run({
          actorId: plano.actorId,
          input: chamada.input,
          maxItems: chamada.maxItems,
          maxTotalChargeUsd: teto,
        })
      } catch (erro) {
        falhas.push(codigoDaFalha(erro))
        log({ type: 'account_discovery', runId, actorId: plano.actorId, outcome: 'apify_failed', errorCode: codigoDaFalha(erro) })
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
          actorId: plano.actorId,
          runId: execucao.runId ?? `account-discovery:${crypto.randomUUID()}`,
          items: execucao.items.length,
          costUsd: custoDaExecucao,
        })
      } catch (erro) {
        log({ type: 'account_discovery', runId, outcome: 'cost_failed', message: String(erro) })
      }
      brutas.push(...(plano.actorId === ACTOR_RECEITA
        ? candidatasDaReceita(execucao.items, agora(), execucao.runId ?? undefined)
        : candidatasDoLinkedin(execucao.items, execucao.runId ?? undefined)))
    }

    if (rodou === 0) {
      await encerrar(runId, false, null, null, mensagemDaFalha(falhas))
      return
    }

    const avaliadas = brutas
      .map((candidata) => ({ candidata, avaliacao: avaliar(candidata, criterios) }))
      .filter(({ avaliacao }) => !avaliacao.excluida)
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
    criterios: CriteriosDeBusca
    maxResults: number
    requestKey: string
    icpVersion: number | null
    allowTesting: boolean
    runId?: string
    authorization: string
    apikey: string
  }): Promise<Response> {
    const falta = faltaParaBuscar(a.criterios)
    if (falta) return responder({ code: 'filtros_insuficientes', error: falta }, 422)
    const plano = montarPlano(a.criterios, a.maxResults)

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
        criterios: a.criterios,
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
      plano,
      criterios: a.criterios,
      maxResults: a.maxResults,
      actor,
    }))
    return responder({ runId: inicio.runId, state: inicio.state }, 202)
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
        criterios: proposta.criterios,
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

    if (acao === 'criteria') {
      let icp: IcpLido | null
      try {
        icp = await deps.db.lerIcp({ workspaceId, authorization, apikey })
      } catch (erro) {
        if (erro instanceof ErroDoBanco && erro.code === '42501') return recusaDoBanco(erro)
        log({ type: 'account_discovery', outcome: 'icp_failed', message: String(erro) })
        return responder({ code: 'erro', error: 'Não foi possível ler o ICP do Playbook agora.' }, 500)
      }
      let estruturado: IcpEstruturadoLido | null = null
      try {
        estruturado = await deps.db.lerIcpEstruturado?.({ workspaceId, authorization, apikey }) ?? null
      } catch (erro) {
        log({ type: 'account_discovery', outcome: 'structured_icp_failed', message: String(erro) })
      }
      const combinado = criteriosComIcpEstruturado(icp, estruturado)
      return responder({
        temIcp: combinado.temIcp,
        icpVersion: combinado.icpVersion,
        icpResumo: (icp ? textoDoIcp(icp.conteudo) : '').slice(0, RESUMO_DO_ICP),
        criteria: combinado.temIcp ? combinado.criteria : criteriosVazios(),
      })
    }

    if (acao === 'search') {
      const maxResults = corpo.maxResults === undefined ? PADRAO_DE_EMPRESAS : Number(corpo.maxResults)
      if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_EMPRESAS) {
        return responder({ error: `A busca traz de 1 a ${MAX_EMPRESAS} empresas.` }, 400)
      }
      const chave = typeof corpo.requestKey === 'string' ? corpo.requestKey.trim() : ''
      if (chave.length > 100) return responder({ error: 'Chave do pedido inválida.' }, 400)
      const icpVersion = Number.isInteger(corpo.icpVersion) && (corpo.icpVersion as number) > 0 ? corpo.icpVersion as number : null
      return await abrir({
        workspaceId,
        criterios: normalizarCriterios(corpo.criteria),
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
