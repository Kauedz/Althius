// Regras do onboarding pós-login: o que cada ramo percorre, quando a Casca exige o onboarding, quanto dele está
// completo e como a leitura do site entra no checklist. Todas derivam só do estado da Fonte de onboarding, então
// uma Fonte real usa as mesmas regras que a simulada.
import {
  CAMPOS_DO_MINI_ICP_E_PRODUTO,
  ITENS_DO_CHECKLIST,
  type ChecklistNorte,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type IdentidadeDoWorkspace,
  type LeituraDoSite,
  type MarcoDoOnboarding,
  type ProgressoDoOnboarding,
  type RamoDeOnboarding,
} from './onboarding-tipos'

interface RegrasDoRamo {
  /** Os passos do wizard em ordem. */
  etapas: readonly EtapaDeOnboarding[]
  /** Os marcos do progresso, na ordem do Norte. */
  marcos: readonly MarcoDoOnboarding[]
  /**
   * O criador ganha um Workspace novo e informa o Cliente: a empresa, o domínio do site e a leitura dele. O
   * convidado entra num Workspace que já existe e não informa nada disso.
   */
  criaOWorkspace: boolean
}

const REGRAS_DO_RAMO: Record<RamoDeOnboarding, RegrasDoRamo> = {
  criador: {
    etapas: ['papel', 'empresa', 'dominio', 'hdyhau', 'convite', 'checklist'],
    marcos: ['workspace', 'site', ...ITENS_DO_CHECKLIST],
    criaOWorkspace: true,
  },
  convidado: {
    etapas: ['papel', 'hdyhau', 'convite', 'checklist'],
    marcos: ['workspace', ...ITENS_DO_CHECKLIST],
    criaOWorkspace: false,
  },
}

/** Os passos do ramo, ou nenhum antes de o onboarding começar. */
export function etapasDoRamo(ramo: RamoDeOnboarding | null): readonly EtapaDeOnboarding[] {
  return ramo ? REGRAS_DO_RAMO[ramo].etapas : []
}

/** Se o ramo cria o Workspace e informa o Cliente. Nenhum ramo cria antes de o onboarding começar. */
export function criaOWorkspace(ramo: RamoDeOnboarding | null): boolean {
  return ramo ? REGRAS_DO_RAMO[ramo].criaOWorkspace : false
}

/**
 * A Casca exige o Day0: enquanto o wizard não chega ao checklist, a entrada leva a `/onboarding`. O checklist
 * não prende a sessão, que pode explorar a Casca e voltar a ele depois.
 */
export function precisaDoOnboarding(estado: EstadoDeOnboarding): boolean {
  return !estado.concluido && !estado.day0Concluido
}

/** Quanto do onboarding já está completo. */
export function progressoDoOnboarding(estado: EstadoDeOnboarding): ProgressoDoOnboarding {
  const marcos = (estado.ramo ? REGRAS_DO_RAMO[estado.ramo].marcos : []).map((marco) => ({
    marco,
    feito: marcoFeito(estado, marco),
  }))
  const feitos = marcos.filter(({ feito }) => feito).length
  const percentual = marcos.length ? Math.round((feitos / marcos.length) * 100) : 0
  return {
    marcos,
    percentual,
    proximo: marcos.find(({ feito }) => !feito)?.marco ?? null,
    pendente: estado.day0Concluido && percentual < 100,
  }
}

/** O Day0 exige o Workspace e o site, então os dois já estão feitos quando o checklist abre. */
function marcoFeito(estado: EstadoDeOnboarding, marco: MarcoDoOnboarding): boolean {
  if (marco === 'workspace') return estado.day0Concluido
  if (marco === 'site') return estado.dominio !== ''
  return estado.checklist[marco] === 'concluido'
}

/**
 * Como o Workspace que o onboarding criou se apresenta na Casca: o nome sugerido pela empresa, o que o Cliente
 * vende e o logo do site. Nenhuma quando o onboarding não criou um Workspace com nome, e a Casca fica com o da demo.
 */
export function identidadeDoWorkspace(estado: EstadoDeOnboarding): IdentidadeDoWorkspace | null {
  const nome = estado.workspace?.nomeSugerido
  if (!nome) return null
  return { nome, descricao: estado.checklist.oQueVende, logo: estado.logoDoSite }
}

/**
 * A leitura do site pré-preenche os itens 1 e 2 sem sobrescrever o que a pessoa editou. Um campo ainda é só
 * sugestão quando está igual ao que a leitura anterior trouxe, ou vazio se nenhuma leitura chegou antes. Depois de
 * uma leitura, um campo vazio foi descartado pela pessoa e continua vazio.
 */
export function aplicarLeitura(
  checklist: ChecklistNorte,
  anterior: LeituraDoSite | null,
  leitura: LeituraDoSite,
): ChecklistNorte {
  const aindaESugestao = (atual: string, daAnterior: string | undefined) => (anterior ? atual === daAnterior : !atual)
  const novo: ChecklistNorte = { ...checklist, personas: [...checklist.personas] }
  for (const campo of CAMPOS_DO_MINI_ICP_E_PRODUTO) {
    if (aindaESugestao(checklist[campo], anterior?.[campo])) novo[campo] = leitura[campo]
  }
  const emTexto = (personas: readonly string[]) => personas.join('\n')
  if (aindaESugestao(emTexto(checklist.personas), anterior ? emTexto(anterior.personas) : undefined)) {
    novo.personas = [...leitura.personas]
  }
  return novo
}
