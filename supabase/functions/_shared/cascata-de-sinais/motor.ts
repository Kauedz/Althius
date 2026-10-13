// O motor da cascata de Sinais (sinais em cascata, fatia 2): um Sinal é UMA execução com N passos. Estima o custo e reserva
// o crédito antes; roda os passos em ordem, a saída normalizada de um como entrada do próximo; confere o teto rígido
// antes de cada passo (nenhum passo começa se o custo acumulado mais a estimativa dele passar do teto, e o
// `maxTotalChargeUsd` de cada run cabe no que resta); grava o rastro de cada tentativa (run id, actor, conta usada, custo
// real, status HTTP, erro real sem segredo); grava os Sinais confirmados com o `record_signal` de sempre; e liquida o
// crédito pelo custo real (a conta é do banco: `finish_cascade_run`). É o MESMO núcleo para a conversa (Hermes) e para os
// Monitoramentos e rotinas (`signal-runner`): nenhum caminho paralelo.
//
// Decisões:
//  - passo sem itens encerra a cascata sem rodar nem cobrar o resto;
//  - se o passo declara `confereConsulta` e o principal devolve itens que não conferem com a consulta nem com a janela,
//    a alternativa assume (o mesmo caminho da falha). Lista vazia de verdade não dispara a alternativa;
//  - sem crédito em todas as contas é falha da fonte inteira: o actor alternativo não é tentado (é a mesma conta);
//  - falha ou aborto DEPOIS de os Sinais estarem confirmados (um enriquecimento que falha, o teto no passo de Receita)
//    grava os Sinais confirmados e a execução fica "parcial"; antes disso, nada é gravado e só o consumido é cobrado;
//  - todo texto de `mensagem` está em palavras do produto: o fornecedor e o actor só aparecem na coluna técnica.
import { MENSAGEM_DA_FONTE } from '../marca.ts'
import { modeloDaExecucao } from './llm-da-execucao.ts'
import { redigir } from './redacao.ts'
import {
  type AlternativaDoPasso,
  type CascataDef,
  type ContaDoWorkspace,
  type ContextoDoPasso,
  type DbDaCascata,
  type Desfecho,
  ErroDaFonte,
  type ClienteDaFonte,
  type Item,
  type Llm,
  type PassoDef,
  type PassoExecutado,
  type PedidoDeCascata,
  type RegistroDePassos,
  type ResultadoDaAbertura,
  type ResultadoDaCascata,
  type SinalConfirmado,
  type SinalDeMercado,
} from './tipos.ts'

export interface DepsDoMotor {
  db: DbDaCascata
  fonte: ClienteDaFonte
  registro: RegistroDePassos
  /** O modelo de linguagem dos passos que classificam ou extraem de texto; sem ele, esses passos usam a regra simples. */
  llm?: Llm
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

/** Os textos de cada resposta que não roda a cascata. */
export const MENSAGENS = {
  sem_cascata: 'Esse tipo de Sinal ainda não existe no catálogo.',
  em_teste: 'Essa busca ainda está em validação e não roda neste Workspace.',
  indisponivel: 'Essa busca está fora do ar no momento.',
  sem_contas: 'O Workspace ainda não tem Contas-alvo para cruzar com essa busca.',
  sem_creditos: 'O Workspace não tem créditos suficientes para essa busca.',
  limite_diario: 'As buscas em várias fontes chegaram ao limite de créditos de hoje neste Workspace; tente amanhã.',
  ja_rodou_hoje: 'Esse Monitoramento já rodou hoje; a próxima rodada é amanhã.',
  automatico_parado:
    'A varredura automática está parada (em "confirmar", sem teto aprovado ou com o teto do mês atingido). Ajuste em Configurações › Automação e tetos.',
  em_andamento: 'Essa busca já está em andamento.',
  ja_concluida: 'Essa busca já foi feita; os Sinais encontrados estão gravados.',
  teto: 'Paramos antes de gastar além do teto da busca; só o que já foi consumido é cobrado.',
  prazo: 'Não deu tempo de terminar essa busca agora; tente de novo em alguns minutos.',
  configuracao: 'Essa busca não está configurada corretamente; avisamos a equipe.',
  nada: 'A busca terminou e não encontrou Sinais nas suas Contas desta vez.',
} as const

const CPF_NO_NOME = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/

/** Até 5 empresas achadas sem Conta: só CNPJ (14 dígitos) e razão social. Nome com CPF fica de fora. */
function amostraDeValidacao(valor: unknown): { cnpj: string | null; nome: string }[] {
  if (!Array.isArray(valor)) return []
  const saida: { cnpj: string | null; nome: string }[] = []
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const nome = typeof o.nome === 'string' ? o.nome.trim() : ''
    const cnpj = typeof o.cnpj === 'string' && /^\d{14}$/.test(o.cnpj) ? o.cnpj : null
    if (!nome || nome.length > 200 || CPF_NO_NOME.test(nome)) continue
    saida.push({ cnpj, nome })
    if (saida.length === 5) break
  }
  return saida
}

const DESFECHO_DA_ABERTURA: Partial<Record<ResultadoDaAbertura['outcome'], [Desfecho, string]>> = {
  em_teste: ['em_teste', MENSAGENS.em_teste],
  indisponivel: ['indisponivel', MENSAGENS.indisponivel],
  sem_cascata: ['sem_cascata', MENSAGENS.sem_cascata],
  no_credits: ['sem_creditos', MENSAGENS.sem_creditos],
  limite_diario: ['limite_diario', MENSAGENS.limite_diario],
  ja_rodou_hoje: ['ja_rodou_hoje', MENSAGENS.ja_rodou_hoje],
  confirmar: ['automatico_parado', MENSAGENS.automatico_parado],
  sem_teto: ['automatico_parado', MENSAGENS.automatico_parado],
  teto_atingido: ['automatico_parado', MENSAGENS.automatico_parado],
  em_andamento: ['em_andamento', MENSAGENS.em_andamento],
  done: ['ja_concluida', MENSAGENS.ja_concluida],
  sem_fonte: ['sem_fonte', ''],
}

const TIMEOUT_MAXIMO_S = 120
const FOLGA_FINAL_MS = 15_000
const arredondar = (n: number) => Math.round(n * 1e6) / 1e6

function vazio(desfecho: Desfecho, mensagem: string): ResultadoDaCascata {
  return {
    desfecho, mensagem, creditosCobrados: 0, custoUsd: null, sinais: [], novos: 0, repetidos: 0, semConta: 0, semContaNomes: [], mercado: [],
    passos: [],
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/** Um item que cumpre o contrato de Sinal de mercado. */
export function comoSinalDeMercado(item: unknown): SinalDeMercado | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const i = item as Record<string, unknown>
  const payload = i.payload && typeof i.payload === 'object' && !Array.isArray(i.payload) ? i.payload as Record<string, unknown> : {}
  const s = { eventKey: texto(i.eventKey), phrase: texto(i.phrase), firedAt: texto(i.firedAt), source: texto(i.source), evidence: texto(i.evidence), payload }
  if (!s.eventKey || !s.phrase || Number.isNaN(Date.parse(s.firedAt))) return null
  return s
}

/** Um item que cumpre o contrato de Sinal confirmado (e é de uma das Contas do pedido). */
export function comoSinal(item: unknown, contas: ContaDoWorkspace[]): SinalConfirmado | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const i = item as Record<string, unknown>
  const s = {
    contaId: texto(i.contaId),
    contaNome: texto(i.contaNome),
    eventKey: texto(i.eventKey),
    phrase: texto(i.phrase),
    firedAt: texto(i.firedAt),
    source: texto(i.source),
    evidence: texto(i.evidence),
  }
  if (!s.contaId || !s.eventKey || !s.phrase || Number.isNaN(Date.parse(s.firedAt))) return null
  if (!contas.some((c) => c.id === s.contaId)) return null
  return s
}

function sinaisDe(itens: Item[], contas: ContaDoWorkspace[]): SinalConfirmado[] {
  return itens.flatMap((i) => {
    const s = comoSinal(i, contas)
    return s ? [s] : []
  })
}

type ResultadoDoPasso =
  | { tipo: 'ok'; saida: Item[]; custoUsd: number }
  | { tipo: 'vazio'; saida: Item[]; custoUsd: number }
  | { tipo: 'pulado'; saida: Item[] }
  | { tipo: 'teto'; custoUsd: number }
  | { tipo: 'prazo'; custoUsd: number }
  | { tipo: 'falhou'; mensagem: string; custoUsd: number }

/** A mensagem ao usuário de uma falha da fonte, pelo tipo dela: nunca o texto que a fonte ou o cliente deram. */
function mensagemDoTipo(tipo: ErroDaFonte['tipo'] | undefined): string {
  if (tipo === 'sem_credito' || tipo === 'sem_credito_em_todas') return MENSAGEM_DA_FONTE.semSaldo
  if (tipo === 'timeout') return MENSAGEM_DA_FONTE.tempo
  return MENSAGEM_DA_FONTE.indisponivel
}

/** O que a execução do passo gastou antes de falhar, quando a fonte informou. */
function custoDoErro(e: unknown): number {
  return e instanceof ErroDaFonte && typeof e.detalhe.custoUsd === 'number' ? e.detalhe.custoUsd : 0
}

export function estimativaDaCascata(def: CascataDef): number {
  return arredondar(def.steps.reduce((soma, p) => soma + p.estFixedUsd + p.estPerItemUsd * p.estItems, 0))
}

export async function rodarCascata(deps: DepsDoMotor, pedido: PedidoDeCascata): Promise<ResultadoDaCascata> {
  const { db, fonte, registro } = deps
  const agora = deps.agora ?? (() => Date.now())
  const log = deps.log ?? ((c: Record<string, unknown>) => console.log(JSON.stringify(c)))

  const def = await db.definicao(pedido.signalType)
  if (!def) return vazio('sem_cascata', MENSAGENS.sem_cascata)
  if (def.state === 'sem_fonte') return vazio('sem_fonte', def.semFonteMotivo ?? 'Esse Sinal não tem uma fonte pública confiável.')
  // Um tipo genérico é um tipo de Conta (o evento é numa empresa do Workspace): cascata de mercado, que não tem Conta, não o atende.
  if (pedido.registrarComo && def.scope !== 'conta') return vazio('indisponivel', MENSAGENS.indisponivel)

  // Toda implementação de passo precisa existir antes de reservar qualquer crédito.
  for (const p of def.steps) {
    const faltando = p.kind === 'fonte_publica' ? !registro.fontes[p.handler] : !registro.passos[p.handler]
    const alternativaSemFonte = p.fallbacks.some((a) => a.kind === 'fonte_publica' && !registro.fontes[a.source ?? ''])
    if (faltando || alternativaSemFonte) {
      log({ type: 'cascata', signalType: def.signalType, outcome: 'handler_missing', handler: p.handler })
      return vazio('falhou', MENSAGENS.configuracao)
    }
  }

  let contas = pedido.contas
  if (def.scope === 'conta' && !contas) {
    contas = await db.contas(pedido.workspaceId, pedido.idsDeContas ?? null, def.maxAccounts)
  }
  contas = (contas ?? []).slice(0, def.maxAccounts)
  if (def.scope === 'conta' && contas.length === 0) return vazio('sem_contas', MENSAGENS.sem_contas)

  const abertura = await db.abrir({
    workspaceId: pedido.workspaceId,
    userId: pedido.userId,
    signalType: def.signalType,
    origem: pedido.origem,
    monitorId: pedido.monitorId ?? null,
    chave: pedido.chave,
    estimativaUsd: estimativaDaCascata(def),
    tetoCreditos: pedido.tetoCreditos ?? null,
    permitirTeste: pedido.permitirTeste ?? false,
  })
  if (abertura.outcome !== 'go' || !abertura.runId) {
    const [desfecho, mensagem] = DESFECHO_DA_ABERTURA[abertura.outcome] ?? ['indisponivel', MENSAGENS.indisponivel]
    return vazio(desfecho, mensagem || (def.semFonteMotivo ?? MENSAGENS.indisponivel))
  }
  const runId = abertura.runId
  const teto = abertura.capUsd

  const ctxBase = {
    workspaceId: pedido.workspaceId,
    snapshots: {
      ler: (chaves: string[], antesDe?: string) =>
        db.lerSnapshots({ workspaceId: pedido.workspaceId, signalType: def.signalType, chaves, antesDe }),
      gravar: (itens: { chave: string; data: Record<string, unknown>; takenAt?: string }[]) =>
        db.gravarSnapshots({ workspaceId: pedido.workspaceId, signalType: def.signalType, itens }),
    },
    // O modelo desta execução: leva o Workspace do pedido e tem circuito e orçamento de tempo (ver llm-da-execucao.ts).
    llm: deps.llm ? modeloDaExecucao(deps.llm, { workspaceId: pedido.workspaceId, agora }) : undefined,
    pedido,
    contas,
    criterios: pedido.criterios ?? {},
    memoria: new Map<string, unknown>(),
  }
  const executados: PassoExecutado[] = []
  let acumulado = 0
  let entrada: Item[] = []
  let confirmados: SinalConfirmado[] = []
  let deMercado: SinalDeMercado[] = []
  let desfechoDaFalha: { estado: 'failed' | 'aborted'; mensagem: string } | null = null

  async function registrar(
    passo: PassoDef,
    tentativa: number,
    handler: string,
    actorId: string | null,
    itensEntrada: number,
    fim: Omit<Parameters<DbDaCascata['fecharPasso']>[0], 'passoId'>,
  ) {
    const passoId = await db.abrirPasso({ runId, ordem: passo.ordem, tentativa, handler, kind: passo.kind, actorId, itensEntrada })
    await db.fecharPasso({ passoId, ...fim })
  }

  function estimarPasso(passo: PassoDef, alt: AlternativaDoPasso | null, entradaDoPasso: Item[], impl: { itensCobrados?: (e: Item[], c: ContextoDoPasso) => number } | undefined, ctx: ContextoDoPasso): number {
    const fixo = alt?.estFixedUsd ?? passo.estFixedUsd
    const porItem = alt?.estPerItemUsd ?? passo.estPerItemUsd
    const previstos = impl?.itensCobrados?.(entradaDoPasso, ctx) ?? (passo.ordem === 1 ? passo.estItems : entradaDoPasso.length)
    return arredondar(fixo + porItem * Math.min(previstos, passo.maxItems ?? Infinity))
  }

  async function executarPasso(passo: PassoDef, entradaDoPasso: Item[]): Promise<ResultadoDoPasso> {
    let extra = 0
    const ctx: ContextoDoPasso = { ...ctxBase, agora: agora(), def: passo, custo: { adicionar: (usd) => { extra = arredondar(extra + Math.max(usd, 0)) } } }
    const impl = registro.passos[passo.handler]

    // Regra interna ou fonte pública como passo: sem custo de actor; o modelo de linguagem, se usado, soma o dele.
    if (passo.kind !== 'actor') {
      const estimativaDoPasso = estimarPasso(passo, null, entradaDoPasso, impl, ctx)
      if (arredondar(acumulado + estimativaDoPasso) > teto + 1e-9) {
        await registrar(passo, 1, passo.handler, null, entradaDoPasso.length, {
          estado: 'aborted_cap', apifyRunId: null, build: null, tokenIndex: null, itensSaida: 0, custoUsd: 0, statusHttp: null,
          erroReal: `Estimativa do passo US$ ${estimativaDoPasso} com US$ ${acumulado} já gastos passaria do teto de US$ ${teto}.`,
        })
        return { tipo: 'teto', custoUsd: 0 }
      }
      try {
        const saida = passo.kind === 'regra'
          ? await impl.executar!(entradaDoPasso, ctx)
          : await registro.fontes[passo.handler].buscar(entradaDoPasso, ctx)
        await registrar(passo, 1, passo.handler, null, entradaDoPasso.length, {
          estado: saida.length ? 'succeeded' : 'empty', apifyRunId: null, build: null, tokenIndex: null,
          itensSaida: saida.length, custoUsd: extra, statusHttp: null, erroReal: null,
        })
        return saida.length ? { tipo: 'ok', saida, custoUsd: extra } : { tipo: 'vazio', saida, custoUsd: extra }
      } catch (e) {
        await registrar(passo, 1, passo.handler, null, entradaDoPasso.length, {
          estado: 'failed', apifyRunId: null, build: null, tokenIndex: null, itensSaida: 0, custoUsd: extra, statusHttp: null,
          erroReal: redigir(e instanceof Error ? `${e.name}: ${e.message}` : e),
        })
        return { tipo: 'falhou', mensagem: MENSAGEM_DA_FONTE.indisponivel, custoUsd: extra }
      }
    }

    // A busca longa do Diário Oficial ignora a consulta e custa caro: não entra como reserva, mesmo que o banco ainda a liste.
    const tentativas: AlternativaDoPasso[] = [
      { kind: 'actor', actorId: passo.actorId ?? undefined },
      ...passo.fallbacks.filter((f) => !(f.kind === 'actor' && f.actorId === 'jenko_systems~diario-oficial-uniao-dou')),
    ]
    let gasto = 0
    let ultimaMensagem: string = MENSAGEM_DA_FONTE.indisponivel
    let proximaTentativa = 1
    const restanteMs = () => (pedido.prazoFinal === undefined ? Infinity : pedido.prazoFinal - agora() - FOLGA_FINAL_MS)
    const timeoutDoLote = (pedidoSegundos?: number) => {
      const peloRelogio = Math.floor(restanteMs() / 1000)
      const tetoSegundos = pedidoSegundos === undefined ? TIMEOUT_MAXIMO_S : Math.min(TIMEOUT_MAXIMO_S, pedidoSegundos)
      return Math.max(10, Math.min(tetoSegundos, peloRelogio))
    }
    for (let i = 0; i < tentativas.length; i++) {
      const alt = tentativas[i]
      const handlerDaTentativa = alt.kind === 'fonte_publica' ? (alt.source ?? passo.handler) : passo.handler
      const actorId = alt.kind === 'actor' ? (alt.actorId ?? null) : null
      const tentativa = proximaTentativa

      // Fonte pública como alternativa de um actor.
      if (alt.kind === 'fonte_publica') {
        proximaTentativa++
        try {
          const saida = await registro.fontes[alt.source ?? ''].buscar(entradaDoPasso, ctx)
          await registrar(passo, tentativa, handlerDaTentativa, null, entradaDoPasso.length, {
            estado: saida.length ? 'succeeded' : 'empty', apifyRunId: null, build: null, tokenIndex: null,
            itensSaida: saida.length, custoUsd: 0, statusHttp: null, erroReal: null,
          })
          const normalizada = impl.normalizar ? impl.normalizar(saida, entradaDoPasso, ctx, handlerDaTentativa) : saida
          return normalizada.length ? { tipo: 'ok', saida: normalizada, custoUsd: gasto } : { tipo: 'vazio', saida: normalizada, custoUsd: gasto }
        } catch (e) {
          await registrar(passo, tentativa, handlerDaTentativa, null, entradaDoPasso.length, {
            estado: 'failed', apifyRunId: null, build: null, tokenIndex: null, itensSaida: 0, custoUsd: 0, statusHttp: null,
            erroReal: redigir(e instanceof Error ? `${e.name}: ${e.message}` : e),
          })
          continue
        }
      }

      const montada = impl.montarEntrada!(entradaDoPasso, ctx, actorId ?? '')
      if ('pular' in montada) {
        proximaTentativa++
        await registrar(passo, tentativa, passo.handler, actorId, entradaDoPasso.length, {
          estado: 'skipped', apifyRunId: null, build: null, tokenIndex: null, itensSaida: entradaDoPasso.length,
          custoUsd: 0, statusHttp: null, erroReal: redigir(montada.pular),
        })
        return { tipo: 'pulado', saida: entradaDoPasso }
      }

      const lotes = 'lotes' in montada ? montada.lotes : [montada]
      // O teto rígido e o prazo: antes de gastar.
      const estimativa = estimarPasso(passo, i === 0 ? null : alt, entradaDoPasso, impl, ctx)
      if (arredondar(acumulado + gasto + estimativa) > teto + 1e-9) {
        proximaTentativa++
        await registrar(passo, tentativa, passo.handler, actorId, entradaDoPasso.length, {
          estado: 'aborted_cap', apifyRunId: null, build: null, tokenIndex: null, itensSaida: 0, custoUsd: 0, statusHttp: null,
          erroReal: `Estimativa do passo US$ ${estimativa} com US$ ${arredondar(acumulado + gasto)} já gastos passaria do teto de US$ ${teto}.`,
        })
        return { tipo: 'teto', custoUsd: gasto }
      }
      if (restanteMs() < 10_000) {
        proximaTentativa++
        await registrar(passo, tentativa, passo.handler, actorId, entradaDoPasso.length, {
          estado: 'aborted_cap', apifyRunId: null, build: null, tokenIndex: null, itensSaida: 0, custoUsd: 0, statusHttp: null,
          erroReal: 'O prazo da função acabou antes deste passo.',
        })
        return { tipo: 'prazo', custoUsd: gasto }
      }

      const brutos: unknown[] = []
      let interrompido = false
      let semCredito = false
      let foraDaConsulta = false
      for (let b = 0; b < lotes.length; b++) {
        const lote = lotes[b]
        const tentativaDoLote = proximaTentativa++
        if (b > 0 && restanteMs() < 10_000) {
          interrompido = true
          break
        }
        const passoId = await db.abrirPasso({
          runId, ordem: passo.ordem, tentativa: tentativaDoLote, handler: passo.handler, kind: passo.kind, actorId, itensEntrada: entradaDoPasso.length,
        })
        try {
          const exec = await fonte.rodar({
            actorId: actorId!,
            input: lote.input,
            maxItems: Math.min(lote.maxItems, passo.maxItems ?? lote.maxItems),
            maxTotalChargeUsd: arredondar(Math.max(teto - acumulado - gasto, 0)),
            timeoutSegundos: timeoutDoLote(lote.timeoutSegundos),
          })
          const custo = exec.custoUsd ?? (lotes.length === 1 ? estimativa : 0)
          gasto = arredondar(gasto + custo)
          const itens = Array.isArray(exec.items) ? exec.items : []
          brutos.push(...itens)
          if (lotes.length > 1) {
            await db.fecharPasso({
              passoId, estado: itens.length ? 'succeeded' : 'empty', apifyRunId: exec.apifyRunId, build: exec.build, tokenIndex: exec.tokenIndex,
              itensSaida: itens.length, custoUsd: exec.custoUsd, statusHttp: null,
              erroReal: exec.custoUsd === null ? 'Não foi possível ler o custo real do run; vale a estimativa do passo.' : null,
            })
            continue
          }
          const saida = impl.normalizar!(itens, entradaDoPasso, ctx, actorId ?? '')
          // Bruto não vazio que não confere com a consulta nem com a janela: a alternativa assume. Lista vazia de verdade não.
          foraDaConsulta = itens.length > 0 && impl.confereConsulta !== undefined &&
            !impl.confereConsulta(itens, saida, ctx, actorId ?? '')
          if (foraDaConsulta) {
            await db.fecharPasso({
              passoId, estado: 'empty', apifyRunId: exec.apifyRunId, build: exec.build, tokenIndex: exec.tokenIndex,
              itensSaida: 0, custoUsd: exec.custoUsd, statusHttp: null,
              erroReal: 'O resultado não confere com a consulta nem com a janela de datas.',
            })
            break
          }
          await db.fecharPasso({
            passoId, estado: saida.length ? 'succeeded' : 'empty', apifyRunId: exec.apifyRunId, build: exec.build, tokenIndex: exec.tokenIndex,
            itensSaida: saida.length, custoUsd: exec.custoUsd, statusHttp: null,
            erroReal: exec.custoUsd === null ? 'Não foi possível ler o custo real do run; vale a estimativa do passo.' : null,
          })
          return saida.length ? { tipo: 'ok', saida, custoUsd: gasto } : { tipo: 'vazio', saida, custoUsd: gasto }
        } catch (e) {
          const erro = e instanceof ErroDaFonte ? e : null
          gasto = arredondar(gasto + custoDoErro(e))
          ultimaMensagem = mensagemDoTipo(erro?.tipo)
          await db.fecharPasso({
            passoId, estado: 'failed', apifyRunId: erro?.detalhe.apifyRunId ?? null, build: erro?.detalhe.build ?? null,
            tokenIndex: erro?.detalhe.tokenIndex ?? null, itensSaida: 0, custoUsd: erro?.detalhe.custoUsd ?? null,
            statusHttp: erro?.detalhe.statusHttp ?? null,
            erroReal: redigir(erro?.detalhe.erroReal ?? (e instanceof Error ? `${e.name}: ${e.message}` : e)),
          })
          log({ type: 'cascata', runId, ordem: passo.ordem, tentativa: tentativaDoLote, outcome: 'step_failed', errorKind: erro?.tipo ?? 'inesperado', status: erro?.detalhe.statusHttp ?? null })
          interrompido = true
          // Sem crédito em todas as contas: o actor alternativo usaria as mesmas contas.
          if (erro?.tipo === 'sem_credito_em_todas') semCredito = true
          break
        }
      }
      if (semCredito) break
      if (lotes.length === 1) {
        if (foraDaConsulta && i < tentativas.length - 1) continue
        if (foraDaConsulta) return { tipo: 'vazio', saida: [], custoUsd: gasto }
        if (interrompido) continue
        continue
      }
      if (interrompido) continue
      const saida = impl.normalizar!(brutos, entradaDoPasso, ctx, actorId ?? '')
      const fora = brutos.length > 0 && impl.confereConsulta !== undefined && !impl.confereConsulta(brutos, saida, ctx, actorId ?? '')
      if (fora) {
        if (i < tentativas.length - 1) continue
        return { tipo: 'vazio', saida: [], custoUsd: gasto }
      }
      return saida.length ? { tipo: 'ok', saida, custoUsd: gasto } : { tipo: 'vazio', saida, custoUsd: gasto }
    }
    return { tipo: 'falhou', mensagem: ultimaMensagem, custoUsd: gasto }
  }

  for (const passo of def.steps) {
    const r = await executarPasso(passo, entrada)
    if ('custoUsd' in r) acumulado = arredondar(acumulado + r.custoUsd)
    const estado: PassoExecutado['estado'] = r.tipo === 'ok' ? 'succeeded'
      : r.tipo === 'vazio' ? 'empty'
      : r.tipo === 'pulado' ? 'skipped'
      : r.tipo === 'falhou' ? 'failed'
      : 'aborted_cap'
    executados.push({ ordem: passo.ordem, handler: passo.handler, estado, itensEntrada: entrada.length, itensSaida: 'saida' in r ? r.saida.length : 0 })

    if (r.tipo === 'falhou') {
      desfechoDaFalha = { estado: 'failed', mensagem: r.mensagem }
      break
    }
    if (r.tipo === 'teto' || r.tipo === 'prazo') {
      desfechoDaFalha = { estado: 'aborted', mensagem: r.tipo === 'teto' ? MENSAGENS.teto : MENSAGENS.prazo }
      break
    }
    if (r.tipo === 'vazio') {
      entrada = []
      break
    }
    entrada = r.saida
    if (def.scope === 'mercado') {
      const sinais = entrada.flatMap((i) => {
        const s = comoSinalDeMercado(i)
        return s ? [s] : []
      })
      if (sinais.length) deMercado = sinais
    } else {
      const sinais = sinaisDe(entrada, contas)
      if (sinais.length) confirmados = sinais
    }
  }

  // Grava os Sinais confirmados (também na falha parcial: já foram pagos) e conta novos e repetidos.
  let novos = 0
  let repetidos = 0
  let gravacoesComFalha = 0
  for (const s of confirmados) {
    try {
      const novo = await db.gravarSinal({
        workspaceId: pedido.workspaceId, contaId: s.contaId, monitorId: pedido.monitorId ?? null, signalType: pedido.registrarComo ?? def.signalType, sinal: s,
      })
      if (novo) novos++
      else repetidos++
    } catch (e) {
      gravacoesComFalha++
      log({ type: 'cascata', runId, outcome: 'record_signal_failed', message: redigir(e instanceof Error ? e.message : e, [], 300) })
    }
  }

  for (const s of deMercado) {
    try {
      const novo = await db.gravarSinalDeMercado({ workspaceId: pedido.workspaceId, signalType: def.signalType, sinal: s })
      if (novo) novos++
      else repetidos++
    } catch (e) {
      gravacoesComFalha++
      log({ type: 'cascata', runId, outcome: 'record_market_signal_failed', message: redigir(e instanceof Error ? e.message : e, [], 300) })
    }
  }

  const temSinais = confirmados.length + deMercado.length > 0
  let desfecho: Desfecho
  let estado: 'succeeded' | 'partial' | 'aborted' | 'failed'
  let mensagem: string
  if (desfechoDaFalha) {
    mensagem = desfechoDaFalha.mensagem
    if (temSinais) {
      estado = 'partial'
      desfecho = 'parcial'
    } else {
      estado = desfechoDaFalha.estado
      desfecho = desfechoDaFalha.estado === 'aborted' ? 'abortada' : 'falhou'
    }
  } else if (gravacoesComFalha > 0) {
    estado = 'partial'
    desfecho = 'parcial'
    mensagem = 'Alguns Sinais não puderam ser gravados agora; tente de novo mais tarde.'
  } else {
    estado = 'succeeded'
    desfecho = 'concluida'
    mensagem = temSinais
      ? `${novos} ${novos === 1 ? 'Sinal novo' : 'Sinais novos'} gravado${novos === 1 ? '' : 's'}${repetidos ? `; ${repetidos} já ${repetidos === 1 ? 'era conhecido' : 'eram conhecidos'}` : ''}.`
      : MENSAGENS.nada
  }

  if (pedido.permitirTeste) {
    const amostra = amostraDeValidacao(ctxBase.memoria.get('semContaAmostra'))
    if (amostra.length) {
      try {
        await db.gravarAmostraValidacao({ runId, amostra })
      } catch (e) {
        log({ type: 'cascata', runId, outcome: 'validation_sample_failed', message: redigir(e instanceof Error ? e.message : e, [], 300) })
      }
    }
  }

  const custo = arredondar(acumulado)
  const fechado = await db.fechar({
    runId, estado, custoUsd: custo, casados: confirmados.length + deMercado.length, novos, repetidos,
    erroAmigavel: estado === 'succeeded' ? null : mensagem,
  })
  log({ type: 'cascata', runId, signalType: def.signalType, outcome: desfecho, novos, repetidos, creditos: fechado.creditosCobrados, costUsd: custo })

  const semConta = Number(ctxBase.memoria.get('semConta') ?? 0)
  const nomes = ctxBase.memoria.get('semContaNomes')
  const semContaNomes = Array.isArray(nomes) ? nomes.filter((n): n is string => typeof n === 'string').slice(0, 10) : []
  return {
    desfecho, mensagem, creditosCobrados: fechado.creditosCobrados, custoUsd: custo,
    sinais: confirmados, novos, repetidos, semConta, semContaNomes, mercado: deMercado, passos: executados,
  }
}
