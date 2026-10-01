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
   * Espera antes de ler o custo de novo quando o actor cobra por evento e a execução ainda não mostra os eventos. Zero
   * (o padrão) lê uma vez só: o signal-runner não tem tempo de sobra.
   */
  esperaDoCustoMs?: number;
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
   * O custo da execução. Na execução real de 01/10/2026, já com os eventos somados, o custo de um actor que cobra por
   * evento seguiu 0, lido logo depois de a execução terminar (o motivo ainda não foi confirmado). Por isso o resumo vai
   * para o log e, com `esperaDoCustoMs`, a execução sem eventos é lida de novo uma vez.
   */
  async function custo(token: string, runId: string): Promise<number | null> {
    let execucao = await lerExecucao(token, runId);
    if (!execucao) return null;
    let tentativa = 1;
    if (esperaDoCustoMs > 0 && semOsEventosAinda(execucao)) {
      log({ type: "apify_cost", runId, tentativa, ...resumoDoCusto(execucao) });
      await new Promise((r) => setTimeout(r, esperaDoCustoMs));
      execucao = (await lerExecucao(token, runId)) ?? execucao;
      tentativa = 2;
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

/** Cobra por evento e a execução ainda não mostra nenhum evento cobrado. */
function semOsEventosAinda(run: Record<string, unknown>): boolean {
  return cobraPorEvento(run) && !eventosCobrados(run).length;
}

/**
 * O que o log guarda da execução para conferir o custo: os nomes dos campos e os números da cobrança. Nada da entrada,
 * das opções nem da origem da chamada.
 */
function resumoDoCusto(run: Record<string, unknown>): Record<string, unknown> {
  return {
    status: typeof run.status === "string" ? run.status : null,
    pricingModel: registro(run.pricingInfo).pricingModel ?? null,
    usageTotalUsd: numeroValido(run.usageTotalUsd),
    chargedEventCounts: Object.fromEntries(eventosCobrados(run)),
    campos: Object.keys(run).sort(),
  };
}

/**
 * O custo de uma execução lida em `GET /v2/actor-runs/{id}`: o uso da plataforma (`usageTotalUsd`) mais os eventos que
 * o actor cobrou (`chargedEventCounts` × o preço do evento em `pricingInfo`), nos actors que cobram por evento. Na
 * execução real de 30/09/2026, o `usageTotalUsd` de um desses actors veio 0 com eventos cobrados (campos do tipo
 * `ActorRun` do cliente oficial apify-client). Preço por faixa: vale a do plano Free, o da conta da Althius. Um evento
 * cobrado sem preço conhecido, ou um actor que cobra por evento sem nenhum evento na execução, deixa o custo em branco
 * (nulo), em vez de um valor menor que o real.
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
    if (preco === null) return null;
    totalDosEventos += quantidade * preco;
  }
  return Math.round(((plataforma ?? 0) + totalDosEventos) * 1e6) / 1e6;
}
