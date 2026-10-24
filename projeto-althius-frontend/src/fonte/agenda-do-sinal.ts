// Agenda do Sinal (agente-de-sinal 03): quantas Rodadas por dia, em quais horários e em quais dias. As regras valem no servidor
// (`private.validate_signal_schedule`, `private.next_signal_run`, `public.save_signal_schedule`); aqui estão os mesmos limites e
// a mesma conta para a tela avisar antes de gravar e para a Demonstração, que não tem servidor. O servidor recusa o que a tela
// deixar passar. Um teste confere estes números contra a migration.

/** A Agenda como a pessoa a edita. O fuso é só o de Brasília por enquanto; os dias são ISO (1 = segunda ... 7 = domingo). */
export interface AgendaDoSinal {
  /** "HH:MM", em ordem. */
  horarios: string[]
  dias: number[]
}

/**
 * Os limites e o padrão. DECISÃO PENDENTE 3 (passo, máximo por dia, intervalo e dias úteis) e 10 (mais de 50 Contas, 1 Rodada
 * por dia): o Kauê ainda não decidiu; são os valores recomendados e ficam aqui e em `private.signal_schedule_limit`.
 */
export const LIMITES_DA_AGENDA = {
  passoEmMinutos: 15,
  maximoPorDia: 6,
  intervaloMinimoEmMinutos: 120,
  contasDoEscopoGrande: 50,
  maximoNoEscopoGrande: 1,
} as const

export const DIAS_UTEIS: readonly number[] = [1, 2, 3, 4, 5]
export const AGENDA_PADRAO: AgendaDoSinal = { horarios: ['08:00'], dias: [...DIAS_UTEIS] }
export const FUSO_DA_AGENDA = 'America/Sao_Paulo'

/** Por que a Agenda foi recusada: o código estável do servidor. A tela escreve a frase. */
export type CodigoDeErroDaAgenda =
  | 'formato_invalido'
  | 'sem_horario'
  | 'muitos_horarios'
  | 'horario_invalido'
  | 'horario_repetido'
  | 'intervalo_curto'
  | 'sem_dia'
  | 'dia_invalido'
  | 'fuso_invalido'
  | 'muitas_contas'
  | 'tipo_sem_agenda'

export const CODIGOS_DE_ERRO_DA_AGENDA: readonly CodigoDeErroDaAgenda[] = [
  'formato_invalido', 'sem_horario', 'muitos_horarios', 'horario_invalido', 'horario_repetido', 'intervalo_curto', 'sem_dia',
  'dia_invalido', 'fuso_invalido', 'muitas_contas', 'tipo_sem_agenda',
]

const { maximoPorDia, intervaloMinimoEmMinutos, contasDoEscopoGrande, maximoNoEscopoGrande } = LIMITES_DA_AGENDA
const horas = (minutos: number) => (minutos % 60 === 0 ? `${minutos / 60} ${minutos === 60 ? 'hora' : 'horas'}` : `${minutos} minutos`)
const vezes = (n: number) => (n === 1 ? '1 vez' : `${n} vezes`)

/** A regra da Agenda em uma frase, para quem vai editar. */
export const REGRA_DA_AGENDA =
  `Até ${maximoPorDia} rodadas por dia, com pelo menos ${horas(intervaloMinimoEmMinutos)} entre elas.`

/** O aviso do escopo grande (DECISÃO PENDENTE 10). */
export const AVISO_DO_ESCOPO_GRANDE =
  `Com mais de ${contasDoEscopoGrande} Contas, o Sinal roda ${vezes(maximoNoEscopoGrande)} por dia.`

/** As frases do produto para cada recusa. Nada de termo técnico. */
export const TEXTO_DO_ERRO_DA_AGENDA: Readonly<Record<CodigoDeErroDaAgenda, string>> = {
  formato_invalido: 'A agenda não está num formato válido. Confira e tente de novo.',
  sem_horario: 'Escolha ao menos um horário.',
  muitos_horarios: `Até ${maximoPorDia} rodadas por dia.`,
  horario_invalido: `Use horários de ${LIMITES_DA_AGENDA.passoEmMinutos} em ${LIMITES_DA_AGENDA.passoEmMinutos} minutos, como 08:00 ou 08:15.`,
  horario_repetido: 'Esse horário já está na agenda.',
  intervalo_curto: `Deixe pelo menos ${horas(intervaloMinimoEmMinutos)} entre uma rodada e outra.`,
  sem_dia: 'Escolha ao menos um dia da semana.',
  dia_invalido: 'Um dos dias escolhidos não existe.',
  fuso_invalido: 'Por enquanto a agenda vale no horário de Brasília.',
  muitas_contas: AVISO_DO_ESCOPO_GRANDE,
  tipo_sem_agenda: 'Este Sinal não tem agenda: ele avalia as Interações no ritmo dele.',
}

export const MENSAGEM_DA_FALHA_DA_AGENDA = 'Não foi possível salvar a agenda. Tente de novo.'

/** A recusa da Agenda, com o código para a tela agir (por exemplo, mostrar o erro junto dos horários). */
export class ErroDaAgenda extends Error {
  readonly codigo: CodigoDeErroDaAgenda
  constructor(codigo: CodigoDeErroDaAgenda) {
    super(TEXTO_DO_ERRO_DA_AGENDA[codigo])
    this.name = 'ErroDaAgenda'
    this.codigo = codigo
  }
}

/** O código que o banco recusou (`signal schedule invalid: <código>`), ou nada. */
export function codigoDoErroDaAgenda(mensagem: string): CodigoDeErroDaAgenda | null {
  const achado = /signal schedule invalid: ([a-z_]+)/.exec(mensagem)?.[1]
  return CODIGOS_DE_ERRO_DA_AGENDA.find((c) => c === achado) ?? null
}

/** Os erros que dizem respeito aos horários (os demais são dos dias). */
export const ERROS_DE_HORARIO: readonly CodigoDeErroDaAgenda[] = [
  'sem_horario', 'muitos_horarios', 'horario_invalido', 'horario_repetido', 'intervalo_curto', 'muitas_contas',
]

const HORARIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

const emMinutos = (horario: string) => Number(horario.slice(0, 2)) * 60 + Number(horario.slice(3, 5))

/**
 * Confere a Agenda como o servidor confere, na mesma ordem. `contas`: as Contas no escopo. Devolve o primeiro problema ou nada.
 */
export function validarAgenda(agenda: AgendaDoSinal, contas = 0): CodigoDeErroDaAgenda | null {
  const { horarios, dias } = agenda
  if (horarios.length === 0) return 'sem_horario'
  if (horarios.length > maximoPorDia) return 'muitos_horarios'
  if (horarios.some((h) => !HORARIO.test(h) || emMinutos(h) % LIMITES_DA_AGENDA.passoEmMinutos !== 0)) return 'horario_invalido'
  const minutos = horarios.map(emMinutos).sort((a, b) => a - b)
  if (new Set(minutos).size !== minutos.length) return 'horario_repetido'
  for (let i = 1; i < minutos.length; i++) {
    if (minutos[i] - minutos[i - 1] < intervaloMinimoEmMinutos) return 'intervalo_curto'
  }
  // A virada do dia: do último horário de um dia ao primeiro do dia seguinte (23:00 e 01:00 são 2 horas).
  if (minutos.length >= 2 && minutos[0] + 1440 - minutos[minutos.length - 1] < intervaloMinimoEmMinutos) return 'intervalo_curto'
  if (dias.length === 0) return 'sem_dia'
  if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(dias).size !== dias.length) return 'dia_invalido'
  if (contas > contasDoEscopoGrande && horarios.length > maximoNoEscopoGrande) return 'muitas_contas'
  return null
}

const emOrdem = (lista: number[]) => [...lista].sort((a, b) => a - b)

/** Põe os horários e os dias em ordem, como o servidor os guarda. */
export function normalizarAgenda(agenda: AgendaDoSinal): AgendaDoSinal {
  return { horarios: [...agenda.horarios].sort(), dias: emOrdem(agenda.dias) }
}

export function mesmaAgenda(a: AgendaDoSinal, b: AgendaDoSinal): boolean {
  const x = normalizarAgenda(a)
  const y = normalizarAgenda(b)
  return x.horarios.join() === y.horarios.join() && x.dias.join() === y.dias.join()
}

export function adicionarHorario(agenda: AgendaDoSinal, horario: string): AgendaDoSinal {
  return normalizarAgenda({ ...agenda, horarios: [...agenda.horarios, horario] })
}

export function removerHorario(agenda: AgendaDoSinal, horario: string): AgendaDoSinal {
  return { ...agenda, horarios: agenda.horarios.filter((h) => h !== horario) }
}

export function alternarDia(agenda: AgendaDoSinal, dia: number): AgendaDoSinal {
  return normalizarAgenda({ ...agenda, dias: agenda.dias.includes(dia) ? agenda.dias.filter((d) => d !== dia) : [...agenda.dias, dia] })
}

/** Todos os horários que a tela oferece: de 15 em 15 minutos, "00:00" a "23:45". */
export const HORARIOS_POSSIVEIS: readonly string[] = Array.from({ length: 1440 / LIMITES_DA_AGENDA.passoEmMinutos }, (_, i) => {
  const m = i * LIMITES_DA_AGENDA.passoEmMinutos
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

/** Quantas Rodadas a Agenda faz por semana. */
export function rodadasPorSemana(agenda: AgendaDoSinal): number {
  return agenda.horarios.length * agenda.dias.length
}

export const NOME_CURTO_DO_DIA: Readonly<Record<number, string>> = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb', 7: 'dom' }

function listar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/** "seg a sex", "todos os dias", "sáb e dom", "seg, qua e sex". */
export function textoDosDias(dias: number[]): string {
  const ordem = emOrdem(dias)
  if (ordem.length === 7) return 'todos os dias'
  if (ordem.join() === DIAS_UTEIS.join()) return 'seg a sex'
  return listar(ordem.map((d) => NOME_CURTO_DO_DIA[d]))
}

/** "08:00 e 14:00, seg a sex". */
export function textoDaAgenda(agenda: AgendaDoSinal): string {
  return `${listar([...agenda.horarios].sort())}, ${textoDosDias(agenda.dias)}`
}

// ---- A próxima Rodada, no horário de Brasília (a mesma conta de `private.next_signal_run`) ----

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DA_AGENDA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function partesEmBrasilia(instante: number) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(instante)).map((x) => [x.type, Number(x.value)]))
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second }
}

/** A diferença, em milissegundos, entre a hora de parede de Brasília e a UTC naquele instante. */
function deslocamentoEmBrasilia(instante: number): number {
  const p = partesEmBrasilia(instante)
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(instante / 1000) * 1000
}

/** O instante em que a parede de Brasília marca esse dia e hora. */
function instanteEmBrasilia(ano: number, mes: number, dia: number, minutosDoDia: number): number {
  const alvo = Date.UTC(ano, mes - 1, dia, Math.floor(minutosDoDia / 60), minutosDoDia % 60)
  let t = alvo
  for (let i = 0; i < 2; i++) t = alvo - deslocamentoEmBrasilia(t)
  return t
}

/** O dia da semana ISO (1 = segunda ... 7 = domingo) de um dia do calendário. */
const diaIso = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() || 7

/**
 * O primeiro horário da Agenda estritamente depois de `depois`, nos dias permitidos, em Brasília (nulo se a Agenda não tem
 * horário nem dia). Um horário igual a `depois` não conta. Procura de hoje a hoje + 7, então a Agenda de um dia só acha o da
 * semana seguinte.
 */
export function proximaRodada(agenda: AgendaDoSinal, depois: Date): Date | null {
  const inicio = partesEmBrasilia(depois.getTime())
  let melhor: number | null = null
  for (let k = 0; k <= 7; k++) {
    const dia = new Date(Date.UTC(inicio.ano, inicio.mes - 1, inicio.dia + k))
    const [ano, mes, d] = [dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate()]
    if (!agenda.dias.includes(diaIso(ano, mes, d))) continue
    for (const horario of agenda.horarios) {
      const instante = instanteEmBrasilia(ano, mes, d, emMinutos(horario))
      if (instante > depois.getTime() && (melhor === null || instante < melhor)) melhor = instante
    }
  }
  return melhor === null ? null : new Date(melhor)
}

/** Os próximos `n` horários a partir de `depois`. */
export function proximasRodadas(agenda: AgendaDoSinal, depois: Date, n: number): Date[] {
  const lista: Date[] = []
  let ref = depois
  for (let i = 0; i < n; i++) {
    const proxima = proximaRodada(agenda, ref)
    if (!proxima) break
    lista.push(proxima)
    ref = proxima
  }
  return lista
}

/** "seg 26/10 por volta de 08:00", no horário de Brasília (a Rodada começa em até 10 minutos depois do horário). */
export function textoDaRodada(instante: string | Date): string {
  const p = partesEmBrasilia(new Date(instante).getTime())
  const dia = NOME_CURTO_DO_DIA[diaIso(p.ano, p.mes, p.dia)]
  const dd = String(p.dia).padStart(2, '0')
  const mm = String(p.mes).padStart(2, '0')
  const hh = String(p.hora).padStart(2, '0')
  const min = String(p.minuto).padStart(2, '0')
  return `${dia} ${dd}/${mm} por volta de ${hh}:${min}`
}

/** "Próximas rodadas: seg 26/10 por volta de 08:00, ter 27/10 por volta de 08:00 e ...". */
export function textoDasProximasRodadas(instantes: string[]): string {
  return `Próximas rodadas: ${listar(instantes.map(textoDaRodada))}.`
}
