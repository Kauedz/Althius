const MESES_ABREV = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
]

const MESES_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export interface OpcoesFormatacaoData {
  /** Se a data relativa deve começar com maiúscula (ex.: 'Hoje', 'Há 5 dias'). Padrão: false. */
  maiuscula?: boolean
}

/**
 * Regra única de formatação de datas do módulo Contas e Contatos:
 * - até 30 dias: 'Hoje'/'hoje', 'Ontem'/'ontem', 'há N dias', 'há N semanas';
 * - depois disso: data explícita, '12 mar.' no mesmo ano e '12 mar. 2025' em outro ano;
 * - no Último contato, a data relativa começa com maiúscula ('Há 5 dias'). Depois do '·' do Último sinal, fica em minúscula ('há 2 dias').
 */
export function formatarDataDoModulo(
  data: string | Date,
  hoje: Date,
  opcoes: OpcoesFormatacaoData = {},
): string {
  const dAlvo = typeof data === 'string' ? new Date(data) : data
  const dRefDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const dAlvoDia = new Date(dAlvo.getFullYear(), dAlvo.getMonth(), dAlvo.getDate())

  const diffMs = dRefDia.getTime() - dAlvoDia.getTime()
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const { maiuscula = false } = opcoes

  if (diffDias <= 0) {
    return maiuscula ? 'Hoje' : 'hoje'
  }

  if (diffDias === 1) {
    return maiuscula ? 'Ontem' : 'ontem'
  }

  if (diffDias >= 2 && diffDias < 7) {
    return maiuscula ? `Há ${diffDias} dias` : `há ${diffDias} dias`
  }

  if (diffDias >= 7 && diffDias <= 30) {
    const semanas = Math.floor(diffDias / 7)
    const textoSemana = semanas === 1 ? '1 semana' : `${semanas} semanas`
    return maiuscula ? `Há ${textoSemana}` : `há ${textoSemana}`
  }

  return formatarDataExplicita(dAlvo, hoje)
}

/**
 * A data explícita da regra do módulo, sem forma relativa: '12 mar.' no mesmo ano e '12 mar. 2025' em outro ano.
 * Serve onde a data vem depois de "em" (ex.: 'Importada por Marina em 12 set.').
 */
export function formatarDataExplicita(data: string | Date, hoje: Date): string {
  const d = typeof data === 'string' ? new Date(data) : data
  const diaEMes = `${d.getDate()} ${MESES_ABREV[d.getMonth()]}`
  return d.getFullYear() === hoje.getFullYear() ? diaEMes : `${diaEMes} ${d.getFullYear()}`
}

/**
 * Retorna a data completa por extenso para tooltips e nomes acessíveis (ex.: '12 de março de 2026').
 */
export function formatarDataCompleta(data: string | Date): string {
  const d = typeof data === 'string' ? new Date(data) : data
  return `${d.getDate()} de ${MESES_EXTENSO[d.getMonth()]} de ${d.getFullYear()}`
}

/** Uma data em ISO (aaaa-mm-dd) por extenso, no dia do calendário, sem deslocar pelo fuso. */
export function formatarDiaIsoPorExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return formatarDataCompleta(new Date(ano, mes - 1, dia))
}

/**
 * Um período entre dois dias em ISO, por extenso e sem repetir o mês ou o ano em comum
 * (ex.: '1 a 23 de setembro de 2026', '28 de agosto a 3 de setembro de 2026').
 */
export function formatarPeriodoIsoPorExtenso(inicio: string, fim: string): string {
  if (inicio === fim) return formatarDiaIsoPorExtenso(inicio)
  const [anoInicial, mesInicial, diaInicial] = inicio.split('-').map(Number)
  const [anoFinal, mesFinal] = fim.split('-').map(Number)
  if (anoInicial !== anoFinal) return `${formatarDiaIsoPorExtenso(inicio)} a ${formatarDiaIsoPorExtenso(fim)}`
  const comeco = mesInicial === mesFinal ? `${diaInicial}` : `${diaInicial} de ${MESES_EXTENSO[mesInicial - 1]}`
  return `${comeco} a ${formatarDiaIsoPorExtenso(fim)}`
}

/** Um dia do calendário local em ISO (aaaa-mm-dd). */
export function diaIso(data: Date): string {
  const doisDigitos = (n: number) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`
}
