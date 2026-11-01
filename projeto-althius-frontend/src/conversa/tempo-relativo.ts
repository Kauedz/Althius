// O tempo relativo de uma Conversa, calculado no cliente a partir de `atualizadaEm`.

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate())
}

function hora(data: Date): string {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`
}

/**
 * "agora", "há 12 min" e "há 3 h" no dia de hoje; "ontem, 16:40"; o dia da semana com hora nos
 * últimos 7 dias ("terça, 10:15"); "14 out" nas mais antigas.
 */
export function tempoRelativo(data: string | Date, agora: Date): string {
  const alvo = typeof data === 'string' ? new Date(data) : data
  const diffDias = Math.round((inicioDoDia(agora).getTime() - inicioDoDia(alvo).getTime()) / 86_400_000)

  if (diffDias <= 0) {
    const diffMs = agora.getTime() - alvo.getTime()
    if (diffMs < 60_000) return 'agora'
    const minutos = Math.floor(diffMs / 60_000)
    if (minutos < 60) return `há ${minutos} min`
    return `há ${Math.floor(minutos / 60)} h`
  }
  if (diffDias === 1) return `ontem, ${hora(alvo)}`
  if (diffDias <= 7) return `${DIAS[alvo.getDay()]}, ${hora(alvo)}`
  return `${alvo.getDate()} ${MESES[alvo.getMonth()]}`
}
