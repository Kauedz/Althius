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

/** Um armazenamento demonstrativo cuja gravação o teste faz falhar, como um navegador sem espaço. */
export function armazenamentoQueFalha() {
  const base = armazenamentoEmMemoria()
  let falhar = false
  const armazenamento: ArmazenamentoDemonstrativo = {
    getItem: base.getItem,
    setItem: (chave, valor) => {
      if (falhar) throw new Error('QuotaExceededError')
      base.setItem(chave, valor)
    },
  }
  return {
    armazenamento,
    falharAGravacao: (sim: boolean) => {
      falhar = sim
    },
  }
}
