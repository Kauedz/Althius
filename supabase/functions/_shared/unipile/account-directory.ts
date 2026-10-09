// "Esta conta é da conexão ativa?" (canais-17, ADR-0024). Não há webhook por conta nem tabela de contas por conexão que o
// webhook possa ler sem migration: a resposta vem da lista de contas da própria conexão ativa (a ponte). A lista fica em
// memória por um minuto; uma conta que não aparece força uma releitura (a conta recém-criada), no máximo uma a cada 10 s,
// para uma conta de fora não virar uma chamada à Unipile por evento. Só uma lista COMPLETA prova ausência: página
// cortada ou falha na leitura dão `unknown`, e o evento segue como seguia antes (nunca se descarta sem prova).
import type { UnipileAccountSummary } from './bridge.ts'

export const ACCOUNT_LIST_TTL_MS = 60_000
export const MISS_RELOAD_INTERVAL_MS = 10_000

export type AccountLookup =
  | { status: 'member'; provider: string }
  | { status: 'foreign' }
  | { status: 'unknown' }

export interface AccountDirectory {
  lookup(accountId: string): Promise<AccountLookup>
}

export interface AccountDirectoryOptions {
  list: () => Promise<{ accounts: UnipileAccountSummary[]; complete: boolean }>
  now?: () => number
}

export function createAccountDirectory(options: AccountDirectoryOptions): AccountDirectory {
  const now = options.now ?? Date.now
  let snapshot: { accounts: Map<string, UnipileAccountSummary>; complete: boolean; at: number } | null = null

  async function reload(): Promise<boolean> {
    try {
      const page = await options.list()
      snapshot = { accounts: new Map(page.accounts.map((account) => [account.id, account])), complete: page.complete, at: now() }
      return true
    } catch {
      return false
    }
  }

  return {
    async lookup(accountId) {
      let freshlyLoaded = false
      if (!snapshot || now() - snapshot.at >= ACCOUNT_LIST_TTL_MS) {
        if (!(await reload())) return { status: 'unknown' }
        freshlyLoaded = true
      }
      let found = snapshot!.accounts.get(accountId)
      if (!found && !freshlyLoaded && now() - snapshot!.at >= MISS_RELOAD_INTERVAL_MS) {
        if (!(await reload())) return { status: 'unknown' }
        found = snapshot!.accounts.get(accountId)
      }
      if (found) return { status: 'member', provider: found.provider }
      return snapshot!.complete ? { status: 'foreign' } : { status: 'unknown' }
    },
  }
}
