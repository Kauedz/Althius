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

  // Depois de 30 dias: data explícita
  const dia = dAlvo.getDate()
  const mes = MESES_ABREV[dAlvo.getMonth()]
  if (dAlvo.getFullYear() === hoje.getFullYear()) {
    return `${dia} ${mes}`
  }
  return `${dia} ${mes} ${dAlvo.getFullYear()}`
}

/**
 * Retorna a data completa por extenso para tooltips e nomes acessíveis (ex.: '12 de março de 2026').
 */
export function formatarDataCompleta(data: string | Date): string {
  const d = typeof data === 'string' ? new Date(data) : data
  return `${d.getDate()} de ${MESES_EXTENSO[d.getMonth()]} de ${d.getFullYear()}`
}
