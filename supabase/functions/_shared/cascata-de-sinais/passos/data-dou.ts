// Data de publicação do Diário Oficial. A fonte real (amostra de 13/10/2026) manda `data` como "13/10/2026".
// `Date.parse` lê isso como mês/dia e rejeita o dia 13. Por isso dd/mm/aaaa vem primeiro; ISO é a reserva.
import { dataIso, texto } from './comum.ts'

function meioDiaUtc(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > 2100) return null
  const ms = Date.UTC(ano, mes - 1, dia, 12)
  const data = new Date(ms)
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null
  return data.toISOString()
}

/**
 * "13/10/2026" (dd/mm/aaaa, com ou sem hora depois) vira ISO ao meio-dia UTC.
 * Se não for esse formato, aceita ISO: "2026-10-13" também ao meio-dia, e "2026-10-13T15:30:00Z" como veio.
 * Data impossível (31/02, mês 13) volta nula.
 */
export function dataDoDou(valor: unknown): string | null {
  const bruto = texto(valor)
  if (!bruto) return null
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(bruto)
  if (br) return meioDiaUtc(Number(br[3]), Number(br[2]), Number(br[1]))
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto)
  if (soData) return meioDiaUtc(Number(soData[1]), Number(soData[2]), Number(soData[3]))
  return dataIso(bruto)
}
