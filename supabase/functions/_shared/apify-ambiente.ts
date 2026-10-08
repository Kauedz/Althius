// O que as funções de Sinais (signal-scan e signal-runner) repetiriam ao falar com o Apify e com o registro de actors:
// ler as contas do Apify do ambiente, traduzir a linha do registro e gravar o custo real de uma execução. Nada aqui
// fala com a rede; as pontas entram por parâmetro.

const NOMES_DAS_CONTAS = ['APIFY_TOKEN', 'APIFY_TOKEN_2', 'APIFY_TOKEN_3', 'APIFY_TOKEN_4', 'APIFY_TOKEN_5']

/**
 * As contas do Apify em ordem de uso: APIFY_TOKEN e, se houver, APIFY_TOKEN_2 a APIFY_TOKEN_5. Quando os créditos de
 * uma acabam, a próxima assume. Sem nenhuma, a função não sobe e nenhuma varredura é prometida.
 */
export function tokensDoApify(lerVariavel: (nome: string) => string | undefined): string[] {
  const tokens = NOMES_DAS_CONTAS.map(lerVariavel).filter((t): t is string => !!t)
  if (tokens.length === 0) throw new Error('Backend is not configured')
  return tokens
}

/** A linha que as funções do registro devolvem para um actor. */
export interface LinhaDoActor {
  actor_id: string
  signal_type: string
  state: 'available' | 'testing' | 'out'
  version: string | null
  max_cost_usd: number | string
}

export function actorDoRegistro(linha: LinhaDoActor) {
  return {
    actorId: linha.actor_id,
    signalType: linha.signal_type,
    state: linha.state,
    version: linha.version,
    maxCostUsd: Number(linha.max_cost_usd),
  }
}

/**
 * Grava o custo real de uma execução, só para medir: se não der para ler o valor, a execução é gravada com ele em branco;
 * se não der para gravar, os itens já existem e seguem adiante. Devolve o identificador usado (o do Apify, ou um próprio
 * quando o Apify não devolveu o dele).
 */
export async function gravarCustoDaExecucao(
  { custoDaExecucao, gravar, aoFalhar }: {
    custoDaExecucao?: (runId: string) => Promise<number | null>
    gravar: (args: { workspaceId: string; actorId: string; runId: string; items: number; costUsd: number | null }) => Promise<void>
    aoFalhar: (erro: unknown) => void
  },
  { workspaceId, actorId, runId, items, prefixo }: {
    workspaceId: string
    actorId: string
    runId: string | null
    items: number
    prefixo: string
  },
): Promise<string> {
  const usado = runId ?? `${prefixo}:${crypto.randomUUID()}`
  let costUsd: number | null = null
  try {
    if (runId) costUsd = (await custoDaExecucao?.(runId)) ?? null
  } catch {
    // Sem o valor, a execução é gravada com ele em branco.
  }
  try {
    await gravar({ workspaceId, actorId, runId: usado, items, costUsd })
  } catch (erro) {
    aoFalhar(erro)
  }
  return usado
}
