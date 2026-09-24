export const VALIDADE_EM_DIAS = 30
export const DIA_EM_MS = 24 * 60 * 60 * 1000
export const VALIDADE_SINAL_MS = VALIDADE_EM_DIAS * DIA_EM_MS

/**
 * Converte data de disparo (ISO, YYYY-MM-DD, Date ou objeto contendo a data) para Date.
 * Se for YYYY-MM-DD puro, interpreta à meia-noite local para consistência com o mockup.
 */
export function parseDataDisparo(
  data: string | Date | { data?: string | Date; dataDisparo?: string | Date; dataAcontecimento?: string | Date },
): Date {
  if (data instanceof Date) {
    return data
  }
  if (typeof data === 'object' && data !== null) {
    const d = data.dataDisparo ?? data.data ?? data.dataAcontecimento
    if (!d) return new Date(0)
    return parseDataDisparo(d)
  }
  if (typeof data !== 'string') {
    return new Date(data)
  }
  if (data.includes('T')) {
    return new Date(data)
  }
  const partes = data.split('-').map(Number)
  if (partes.length === 3 && !partes.some(isNaN)) {
    return new Date(partes[0], partes[1] - 1, partes[2])
  }
  return new Date(data)
}

/**
 * Alias para dataDoDisparo para compatibilidade com código existente do módulo de sinais.
 */
export const dataDoDisparo = parseDataDisparo

/**
 * O instante exato em que o Sinal expira: ao completar os 30 dias a partir do disparo.
 */
export function expiraEm(
  sinal: string | Date | { data?: string | Date; dataDisparo?: string | Date; dataAcontecimento?: string | Date },
): Date {
  return new Date(parseDataDisparo(sinal).getTime() + VALIDADE_SINAL_MS)
}

/**
 * Verifica se o sinal já foi disparado na data de referência (não é uma data futura).
 */
export function foiDisparado(
  sinal: string | Date | { data?: string | Date; dataDisparo?: string | Date; dataAcontecimento?: string | Date },
  hoje: Date,
): boolean {
  return parseDataDisparo(sinal).getTime() <= hoje.getTime()
}

/**
 * Verifica se o sinal é válido na data de referência:
 * válido desde o disparo até antes de completar 30 dias (no instante da expiração deixa de contar).
 * Datas futuras não contam como sinais já disparados.
 */
export function estaValido(
  sinal: string | Date | { data?: string | Date; dataDisparo?: string | Date; dataAcontecimento?: string | Date },
  hoje: Date,
): boolean {
  const disparo = parseDataDisparo(sinal).getTime()
  const expira = disparo + VALIDADE_SINAL_MS
  const agora = hoje.getTime()
  return disparo <= agora && agora < expira
}
