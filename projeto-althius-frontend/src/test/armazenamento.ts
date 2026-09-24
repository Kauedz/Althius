import type { ArmazenamentoDemonstrativo } from '@/fonte/simulada'

/** Um armazenamento demonstrativo só em memória: remontar a app com o mesmo simula um refresh do navegador. */
export function armazenamentoEmMemoria(): ArmazenamentoDemonstrativo {
  const dados = new Map<string, string>()
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => {
      dados.set(chave, valor)
    },
  }
}
