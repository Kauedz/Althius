// A consulta de CNPJ na Receita, em lotes: com cerca de 11 CNPJs numa chamada só, o actor estoura o prazo; com poucos, passa.
// Cada lote leva no máximo 5 CNPJs e um prazo curto, para o TIMED-OUT voltar a tempo da BrasilAPI assumir.
import type { EntradaDoActor } from '../tipos.ts'

export const TAMANHO_DO_LOTE_DE_CNPJ = 5
export const PRAZO_DO_LOTE_DE_CNPJ_S = 40

export function consultaDeCnpjs(cnpjs: string[], vazio: string): EntradaDoActor {
  if (!cnpjs.length) return { pular: vazio }
  const lotes = []
  for (let i = 0; i < cnpjs.length; i += TAMANHO_DO_LOTE_DE_CNPJ) {
    const parte = cnpjs.slice(i, i + TAMANHO_DO_LOTE_DE_CNPJ)
    lotes.push({
      input: { mode: 'lookup', cnpjs: parte },
      maxItems: parte.length,
      timeoutSegundos: PRAZO_DO_LOTE_DE_CNPJ_S,
    })
  }
  return lotes.length === 1 ? lotes[0] : { lotes }
}
