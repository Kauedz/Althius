// O que as funções de Sinais (signal-scan e signal-runner) repetiriam ao falar com o Apify e com o registro de actors:
// ler as contas do Apify do ambiente, traduzir a linha do registro e gravar o custo real de uma execução. Nada aqui
// fala com a rede; as pontas entram por parâmetro.

/** Uma conta de coleta. `slot` é o índice do segredo (0 = legado, 1 a 5 = numerado). Nunca guarde o valor no log. */
export interface ContaDeColeta {
  slot: number
  token: string
}

export interface EsperaDeConta {
  slot: number
  ateMs: number
}

/** A espera e o cursor do rodízio, compartilhados entre instâncias. Falha de banco não pode derrubar a função. */
export interface MemoriaDasContas {
  esgotadas(): Promise<EsperaDeConta[]>
  marcar(slot: number, ateMs: number, motivo: 'credito' | 'limite'): Promise<void>
  proximaPartida(total: number): Promise<number>
}

export interface AdminDeColeta {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

/**
 * Contas de coleta na ordem do rodízio: `APIFY_TOKEN_1` a `APIFY_TOKEN_5`, e o legado `APIFY_TOKEN` por último (índice 0),
 * se existir. Segredo vazio é pulado. Sem nenhuma, a função não sobe.
 */
export function contasDeColeta(lerVariavel: (nome: string) => string | undefined): ContaDeColeta[] {
  const contas: ContaDeColeta[] = []
  for (let slot = 1; slot <= 5; slot++) {
    const token = lerVariavel(`APIFY_TOKEN_${slot}`)?.trim()
    if (token) contas.push({ slot, token })
  }
  const legado = lerVariavel('APIFY_TOKEN')?.trim()
  if (legado) contas.push({ slot: 0, token: legado })
  if (contas.length === 0) throw new Error('Backend is not configured')
  return contas
}

/** Os valores, na mesma ordem de `contasDeColeta`, para quem ainda recebe uma lista. */
export function tokensDoApify(lerVariavel: (nome: string) => string | undefined): string[] {
  return contasDeColeta(lerVariavel).map((c) => c.token)
}

/**
 * A espera e o cursor no banco. Se a migração ainda não foi aplicada, a espera fica só nesta instância e o log leva o
 * índice da conta, nunca o segredo.
 */
export function memoriaDasContasDeColeta(admin: AdminDeColeta, log: (campos: Record<string, unknown>) => void = () => {}): MemoriaDasContas {
  const local = new Map<number, number>()
  let partida = 0
  return {
    async esgotadas() {
      try {
        const { data, error } = await admin.rpc('list_collection_account_cooldowns')
        if (error) throw new Error(error.message ?? 'cooldown')
        const linhas = Array.isArray(data) ? data : []
        return linhas.flatMap((linha) => {
          const o = linha && typeof linha === 'object' ? linha as Record<string, unknown> : {}
          const slot = Number(o.slot)
          const ateMs = Date.parse(String(o.exhausted_until ?? ''))
          return Number.isInteger(slot) && Number.isFinite(ateMs) ? [{ slot, ateMs }] : []
        })
      } catch {
        log({ type: 'coleta', outcome: 'cooldown_read_failed' })
        return [...local].map(([slot, ateMs]) => ({ slot, ateMs }))
      }
    },
    async marcar(slot, ateMs, motivo) {
      local.set(slot, ateMs)
      try {
        const { error } = await admin.rpc('mark_collection_account_cooldown', {
          p_slot: slot, p_until: new Date(ateMs).toISOString(), p_reason: motivo,
        })
        if (error) throw new Error(error.message ?? 'cooldown')
      } catch {
        log({ type: 'coleta', outcome: 'cooldown_write_failed', tokenIndex: slot })
      }
    },
    async proximaPartida(total) {
      try {
        const { data, error } = await admin.rpc('next_collection_account_start', { p_count: total })
        if (error) throw new Error(error.message ?? 'cursor')
        const n = Number(data)
        if (Number.isInteger(n) && n >= 0 && n < total) return n
        throw new Error('cursor')
      } catch {
        log({ type: 'coleta', outcome: 'cursor_failed' })
        const atual = partida % total
        partida = (partida + 1) % total
        return atual
      }
    },
  }
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
