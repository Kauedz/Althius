import { clienteDoApify, type OpcoesDoApify } from '../signal-scan/apify.ts'

export function apifyDoEnriquecimento(opcoes: Pick<OpcoesDoApify, 'tokens' | 'contas' | 'memoria' | 'fetchFn' | 'log'>) {
  return clienteDoApify({ ...opcoes, timeoutMs: 45_000, runTimeoutSeconds: 40, esperaDoCustoMs: 3_000 })
}
