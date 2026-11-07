// Regras do onboarding pós-login: o que cada ramo percorre, quando a Casca exige o onboarding, quanto dele está
// completo. O Contexto da empresa conta pela versão vigente dele, que a tela lê da Fonte do contexto. As demais derivam
// só do estado da Fonte de onboarding, então uma Fonte real usa as mesmas regras que a simulada.
import {
  ITENS_DO_CHECKLIST,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type IdentidadeDoWorkspace,
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

/** Quanto do onboarding já está completo. `contextoVigente`: o Contexto da empresa já tem versão vigente. */
export function progressoDoOnboarding(estado: EstadoDeOnboarding, contextoVigente = false): ProgressoDoOnboarding {
  const marcos = (estado.ramo ? REGRAS_DO_RAMO[estado.ramo].marcos : []).map((marco) => ({
    marco,
    feito: marcoFeito(estado, marco, contextoVigente),
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

/** O Day0 exige o Workspace; o site pode ficar para depois. */
function marcoFeito(estado: EstadoDeOnboarding, marco: MarcoDoOnboarding, contextoVigente: boolean): boolean {
  if (marco === 'workspace') return estado.day0Concluido
  if (marco === 'site') return estado.dominio !== ''
  if (marco === 'contexto') return contextoVigente
  return estado.checklist[marco] === 'concluido'
}

/**
 * Como o Workspace que o onboarding criou se apresenta na Casca: o nome sugerido pela empresa e o logo do site.
 * Nenhuma quando o onboarding não criou um Workspace com nome, e a Casca fica com o da demo.
 */
export function identidadeDoWorkspace(estado: EstadoDeOnboarding): IdentidadeDoWorkspace | null {
  const nome = estado.workspace?.nomeSugerido
  if (!nome) return null
  return { nome, descricao: '', logo: estado.logoDoSite }
}
