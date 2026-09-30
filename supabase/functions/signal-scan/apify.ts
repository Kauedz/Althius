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
}

// Créditos esgotados: o Apify recusa com 402 ou 403 (ainda não conferido contra a documentação). Só esses códigos
// passam para a próxima conta; 429, 5xx e prazo não são falta de crédito.
const SEM_CREDITO = new Set([402, 403]);

export function clienteDoApify(
  { tokens, fetchFn = fetch, runTimeoutSeconds = 120, timeoutMs = 135_000 }:
    OpcoesDoApify,
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

  async function custo(token: string, runId: string): Promise<number | null> {
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
      const valor = ((await resposta.json().catch(() =>
        null
      )) as { data?: { usageTotalUsd?: unknown } } | null)?.data
        ?.usageTotalUsd;
      return typeof valor === "number" && Number.isFinite(valor) && valor >= 0
        ? valor
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
