// O cliente do Apify da varredura de Sinais: roda um actor pelo endpoint síncrono
// `POST /v2/acts/{actor}/run-sync-get-dataset-items`, com o token no cabeçalho Authorization (fora da URL e dos logs), e
// lê o custo da execução em `GET /v2/actor-runs/{id}`. Os parâmetros da chamada e o campo `usageTotalUsd` seguem a API
// do Apify como a função contact-photo-lookup já os usa. Na execução real de 30/09/2026 o endpoint síncrono não devolveu o
// cabeçalho `x-apify-run-id`; sem ele, o id vem da última execução do actor na mesma conta
// (`GET /v2/acts/{actor}/runs/last`, o `lastRun` do cliente oficial apify-client), aceita só se começou depois da chamada.
import {
  type Apify,
  ApifyRequestError,
  ApifyTimeoutError,
  type Execucao,
} from "./handler.ts";

export interface OpcoesDoApify {
  /** As contas do Apify, na ordem de uso. Quando os créditos de uma acabam, a próxima assume. */
  tokens: string[];
  fetchFn?: typeof fetch;
  /** Prazo da execução no Apify, em segundos. */
  runTimeoutSeconds?: number;
  /** Prazo da chamada HTTP; um pouco maior que o da execução. */
  timeoutMs?: number;
  /**
   * Espera antes de ler o custo de novo quando o actor cobra por evento: o Apify fecha a conta da execução alguns
   * segundos depois de ela terminar. Zero (o padrão) lê uma vez só.
   */
  esperaDoCustoMs?: number;
  /** Quantas vezes, no máximo, o custo é lido de novo (cada uma depois da espera); para quando duas leituras seguidas coincidem. */
  releiturasDoCusto?: number;
  /** Onde vai o resumo do custo de cada execução (só nomes de campo e números, nenhum dado pessoal). */
  log?: (campos: Record<string, unknown>) => void;
}

// Créditos esgotados: o Apify recusa com 402 ou 403 (ainda não conferido contra a documentação). Só esses códigos
// passam para a próxima conta; 429, 5xx e prazo não são falta de crédito.
const SEM_CREDITO = new Set([402, 403]);

export function clienteDoApify(
  {
    tokens,
    fetchFn = fetch,
    runTimeoutSeconds = 120,
    timeoutMs = 135_000,
    esperaDoCustoMs = 0,
    releiturasDoCusto = 1,
    log = (campos) => console.log(JSON.stringify(campos)),
  }: OpcoesDoApify,
): Apify {
  if (tokens.length === 0) throw new Error("Sem conta do Apify configurada");
  // Contas que já recusaram por falta de crédito nesta instância: são puladas até a instância reiniciar.
  const esgotadas = new Set<number>();
  // Qual conta rodou cada execução, para ler o custo na mesma conta.
  const contaDaExecucao = new Map<string, string>();

  return {
    async run(args): Promise<Execucao> {
      let ultimo: unknown = new ApifyRequestError(402);
      for (let i = 0; i < tokens.length; i++) {
        if (esgotadas.has(i)) continue;
        try {
          const exec = await rodar(tokens[i], args);
          if (exec.runId) contaDaExecucao.set(exec.runId, tokens[i]);
          return exec;
        } catch (error) {
          if (
            error instanceof ApifyRequestError && SEM_CREDITO.has(error.status)
          ) {
            esgotadas.add(i);
            ultimo = error;
            continue;
          }
          throw error;
        }
      }
      // Todas esgotadas: quem chama recebe o 402 do Apify; na próxima tentativa todas voltam a ser testadas.
      esgotadas.clear();
      throw ultimo;
    },
    async custoDaExecucao(runId): Promise<number | null> {
      const token = contaDaExecucao.get(runId) ?? tokens[0];
      contaDaExecucao.delete(runId);
      return await custo(token, runId);
    },
  };

  async function rodar(
    token: string,
    { actorId, input, maxItems, maxTotalChargeUsd }: Parameters<
      Apify["run"]
    >[0],
  ): Promise<Execucao> {
    const consulta = new URLSearchParams({
      timeout: String(runTimeoutSeconds),
      limit: String(maxItems),
      maxItems: String(maxItems),
      maxTotalChargeUsd: String(maxTotalChargeUsd),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const inicio = Date.now();
    try {
      const resposta = await fetchFn(
        `https://api.apify.com/v2/acts/${
          encodeURIComponent(actorId)
        }/run-sync-get-dataset-items?${consulta}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
      if (resposta.status === 408) {
        await resposta.body?.cancel();
        throw new ApifyTimeoutError();
      }
      if (!resposta.ok) {
        await resposta.body?.cancel();
        throw new ApifyRequestError(resposta.status);
      }
      const itens = await resposta.json().catch(() => []);
      return {
        runId: resposta.headers.get("x-apify-run-id") ??
          await ultimaExecucao(token, actorId, inicio),
        items: Array.isArray(itens) ? itens : [],
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApifyTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * O id da última execução do actor nesta conta, se ela começou depois da chamada (com folga para o relógio): é a que
   * acabou de rodar. Só medida: qualquer falha devolve nulo e os itens seguem.
   */
  async function ultimaExecucao(
    token: string,
    actorId: string,
    inicio: number,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const resposta = await fetchFn(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs/last`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
      if (!resposta.ok) {
        await resposta.body?.cancel();
        return null;
      }
      const dados = ((await resposta.json().catch(() => null)) as {
        data?: { id?: unknown; startedAt?: unknown };
      } | null)?.data;
      const comecou = typeof dados?.startedAt === "string"
        ? Date.parse(dados.startedAt)
        : NaN;
      return typeof dados?.id === "string" && comecou >= inicio - 10_000
        ? dados.id
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * O custo da execução. O Apify fecha a conta alguns segundos depois de a execução terminar (log `apify_cost` de
   * 01/10/2026): com 1 perfil, a primeira leitura veio com `usageTotalUsd` 0 e sem eventos, e 3 s depois com 0,004 e
   * `profile: 1`; com 30 anúncios na Meta, a primeira leitura trouxe só o evento de início. Por isso, com
   * `esperaDoCustoMs`, o actor que cobra por evento é lido de novo (até `releiturasDoCusto` vezes, parando quando duas
   * leituras seguidas coincidem), e cada leitura vai para o log.
   */
  async function custo(token: string, runId: string): Promise<number | null> {
    let execucao = await lerExecucao(token, runId);
    if (!execucao) return null;
    let tentativa = 1;
    while (
      esperaDoCustoMs > 0 && cobraPorEvento(execucao) &&
      tentativa <= releiturasDoCusto
    ) {
      log({ type: "apify_cost", runId, tentativa, ...resumoDoCusto(execucao) });
      await new Promise((r) => setTimeout(r, esperaDoCustoMs));
      const nova = await lerExecucao(token, runId);
      tentativa++;
      if (!nova) break;
      const estavel = assinaturaDaCobranca(nova) === assinaturaDaCobranca(execucao);
      execucao = nova;
      if (estavel && eventosCobrados(execucao).length) break;
    }
    const costUsd = custoDaExecucaoLida(execucao);
    log({ type: "apify_cost", runId, tentativa, ...resumoDoCusto(execucao), costUsd });
    return costUsd;
  }

  async function lerExecucao(
    token: string,
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const resposta = await fetchFn(
        `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
      if (!resposta.ok) {
        await resposta.body?.cancel();
        return null;
      }
      const execucao = ((await resposta.json().catch(() => null)) as {
        data?: unknown;
      } | null)?.data;
      return execucao && typeof execucao === "object" && !Array.isArray(execucao)
        ? execucao as Record<string, unknown>
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

const numeroValido = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const registro = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown>
    : {};

const cobraPorEvento = (run: Record<string, unknown>) =>
  registro(run.pricingInfo).pricingModel === "PAY_PER_EVENT";

const eventosCobrados = (run: Record<string, unknown>) =>
  Object.entries(registro(run.chargedEventCounts))
    .filter(([, n]) => numeroValido(n)) as [string, number][];

/** A cobrança da execução como texto: duas leituras com o mesmo texto não mudaram. */
function assinaturaDaCobranca(run: Record<string, unknown>): string {
  return JSON.stringify([
    numeroValido(run.usageTotalUsd),
    eventosCobrados(run).sort(([a], [b]) => (a < b ? -1 : 1)),
  ]);
}

/**
 * Só números, booleanos e textos curtos de uma parte da execução (nomes de evento, contagens, tempos), no máximo
 * `fundo` níveis: nada que seja texto livre. Para conferir no log de onde vem o custo.
 */
function soNumeros(v: unknown, fundo = 3): unknown {
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length <= 60 ? v : undefined;
  if (fundo <= 0) return undefined;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => soNumeros(x, fundo - 1));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).slice(0, 40).map(([k, x]) => [k, soNumeros(x, fundo - 1)]),
    );
  }
  return undefined;
}

/** Os preços de cada evento do actor (`pricingPerEvent`), só nome e valor. */
function precosDosEventos(run: Record<string, unknown>): Record<string, unknown> {
  const eventos = registro(registro(registro(run.pricingInfo).pricingPerEvent).actorChargeEvents);
  return Object.fromEntries(
    Object.entries(eventos).map(([nome, e]) => {
      const evento = registro(e);
      return [
        nome,
        numeroValido(evento.eventPriceUsd) ??
          numeroValido(registro(registro(evento.eventTieredPricingUsd).FREE).tieredEventPriceUsd),
      ];
    }),
  );
}

/**
 * O que o log guarda da execução para conferir o custo: os nomes dos campos e os números da cobrança (contagens de
 * eventos, uso, preços dos eventos, tempos). Nada da entrada, das opções, da mensagem de status nem da origem da chamada.
 */
function resumoDoCusto(run: Record<string, unknown>): Record<string, unknown> {
  const detalhes = soNumeros({
    accountedChargedEventCounts: run.accountedChargedEventCounts,
    eventUsage: run.eventUsage,
    stats: run.stats,
    precos: Object.keys(precosDosEventos(run)).length ? precosDosEventos(run) : undefined,
  });
  const texto = JSON.stringify(detalhes);
  return {
    status: typeof run.status === "string" ? run.status : null,
    pricingModel: registro(run.pricingInfo).pricingModel ?? null,
    usageTotalUsd: numeroValido(run.usageTotalUsd),
    chargedEventCounts: Object.fromEntries(eventosCobrados(run)),
    campos: Object.keys(run).sort(),
    ...(texto && texto !== "{}" ? { cobranca: texto.slice(0, 1500) } : {}),
  };
}

/**
 * O custo de uma execução lida em `GET /v2/actor-runs/{id}`. O `usageTotalUsd` é o total que a conta paga e já inclui os
 * eventos que o actor cobrou: na execução real de 01/10/2026, 1 perfil (`profile: 1`, US$ 0,004 o evento) deu
 * `usageTotalUsd` 0,004. Enquanto o Apify ainda não fechou a conta, a soma dos eventos cobrados (`chargedEventCounts` ×
 * o preço do evento em `pricingInfo`; preço por faixa: o do plano Free, o da conta da Althius) vale no lugar dele: fica o
 * maior dos dois. Um actor que cobra por evento sem nenhum evento na execução, ou um evento sem preço conhecido sem o
 * total do Apify, deixa o custo em branco (nulo), em vez de um valor menor que o real.
 */
export function custoDaExecucaoLida(execucao: unknown): number | null {
  const run = registro(execucao);
  const plataforma = numeroValido(run.usageTotalUsd);
  const contagens = eventosCobrados(run);
  if (!contagens.length) return cobraPorEvento(run) ? null : plataforma;
  const eventos = registro(
    registro(registro(run.pricingInfo).pricingPerEvent).actorChargeEvents,
  );
  let totalDosEventos = 0;
  for (const [nome, quantidade] of contagens) {
    const evento = registro(eventos[nome]);
    const preco = numeroValido(evento.eventPriceUsd) ??
      numeroValido(
        registro(registro(evento.eventTieredPricingUsd).FREE)
          .tieredEventPriceUsd,
      );
    if (preco === null) return plataforma ? plataforma : null;
    totalDosEventos += quantidade * preco;
  }
  return Math.round(Math.max(plataforma ?? 0, totalDosEventos) * 1e6) / 1e6;
}
