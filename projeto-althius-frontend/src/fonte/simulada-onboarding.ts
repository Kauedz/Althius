// Fonte simulada do onboarding (ADR 0003): estado no cliente, sem auth nem IA.
// A empresa só sugere o nome do Workspace/Cliente. Nenhuma Conta-alvo nasce aqui.
// A leitura do site não é daqui: ela gera o Contexto da empresa, pela Fonte do contexto (contexto-da-empresa 03).
import {
  ITENS_DO_CHECKLIST,
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  RAMOS_DE_ONBOARDING,
  SITUACOES_DO_ITEM,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type FonteDeOnboarding,
  type RamoDeOnboarding,
} from './onboarding-tipos'
import { criaOWorkspace, etapasDoRamo } from './regras-onboarding'
import { normalizarDominio, resolverLogoDoSite } from './dominio-do-site'

const CHAVE = 'althius.onboarding.v3'
const ID_DO_WORKSPACE = 'ws-criador'

export interface ArmazenamentoDeOnboarding {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
}

export interface OpcoesFonteDeOnboardingSimulada {
  /** Quando presente, o estado sobrevive a um refresh. Sem isso, vale só na instância. */
  armazenamento?: ArmazenamentoDeOnboarding | null
  /** Quem acha o logo do site. Por padrão, o navegador carrega os candidatos do domínio em ordem. */
  resolverLogo?: (dominio: string) => Promise<string | null>
  /**
   * A sessão já passou pelo onboarding no Workspace da demonstração, que ela não criou: a Casca abre direto. É o
   * ponto de partida dos testes da Casca. Vale só quando o armazenamento não guarda um onboarding legível.
   */
  jaConcluido?: boolean
}

export function criarFonteDeOnboardingSimulada(
  opcoes: OpcoesFonteDeOnboardingSimulada = {},
): FonteDeOnboarding {
  const armazenamento = opcoes.armazenamento ?? null
  const resolverLogo = opcoes.resolverLogo ?? ((dominio: string) => resolverLogoDoSite(dominio))
  let estado = carregar(armazenamento) ?? (opcoes.jaConcluido ? estadoConcluido() : estadoInicial())
  const ouvintes = new Set<() => void>()

  const notificar = () => {
    for (const ouvinte of ouvintes) ouvinte()
  }

  const publicar = () => {
    armazenamento?.setItem(CHAVE, JSON.stringify(estado))
    notificar()
  }

  const devolver = () => structuredClone(estado)

  const etapas = () => etapasDoRamo(estado.ramo)

  /** Avança ao próximo passo quando a pessoa está no passo que acabou de responder. */
  const avancarDe = (etapa: EtapaDeOnboarding) => {
    if (estado.etapa !== etapa) return
    const lista = etapas()
    const seguinte = lista[lista.indexOf(etapa) + 1]
    if (seguinte) estado.etapa = seguinte
    if (seguinte === 'checklist') estado.day0Concluido = true
  }

  /** Resolve o logo do domínio confirmado sem prender o wizard. Um logo de um domínio que já mudou é descartado. */
  async function resolverOLogo() {
    const dominio = estado.dominio
    const logo = await resolverLogo(dominio).catch(() => null)
    if (estado.dominio !== dominio || estado.logoDoSite === logo) return
    estado.logoDoSite = logo
    publicar()
  }

  // Um logo que não chegou a ser resolvido é procurado de novo.
  if (estado.dominio && !estado.logoDoSite) void resolverOLogo()

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async ler() {
      return devolver()
    },

    async iniciar(ramo) {
      if (!ehRamo(ramo) || estado.ramo) return devolver()
      estado = inicioDoRamo(ramo)
      publicar()
      return devolver()
    },

    async retomar() {
      if (!estado.day0Concluido || estado.etapa === 'checklist') return devolver()
      estado.etapa = 'checklist'
      publicar()
      return devolver()
    },

    async voltar() {
      const lista = etapas()
      const indice = lista.indexOf(estado.etapa)
      if (indice <= 0) return devolver()
      estado.etapa = lista[indice - 1]
      publicar()
      return devolver()
    },

    async definirPapel(papel) {
      if (!estado.ramo || !ehPapel(papel)) return devolver()
      estado.papel = papel
      avancarDe('papel')
      publicar()
      return devolver()
    },

    async definirCliente(nome) {
      const empresa = nome.trim()
      if (!criaOWorkspace(estado.ramo) || !estado.workspace || !empresa) return devolver()
      estado.empresa = empresa
      estado.workspace = { id: estado.workspace.id, nomeSugerido: empresa }
      avancarDe('empresa')
      publicar()
      return devolver()
    },

    async definirDominio(bruto) {
      const dominio = normalizarDominio(bruto)
      if (!criaOWorkspace(estado.ramo) || !dominio) return devolver()
      const mudou = dominio !== estado.dominio
      estado.dominio = dominio
      estado.sitePulado = false
      if (mudou) estado.logoDoSite = null
      avancarDe('dominio')
      publicar()
      // Sem esperar: o logo é resolvido enquanto a pessoa segue o wizard.
      if (!estado.logoDoSite) void resolverOLogo()
      return devolver()
    },

    async pularSite() {
      if (!criaOWorkspace(estado.ramo) || estado.etapa !== 'dominio') return devolver()
      estado.sitePulado = true
      avancarDe('dominio')
      publicar()
      return devolver()
    },

    async buscarLogo(bruto) {
      const dominio = normalizarDominio(bruto)
      if (!dominio) return null
      return resolverLogo(dominio).catch(() => null)
    },

    async definirComoConheceu(origem) {
      if (!estado.ramo || !ehOrigem(origem)) return devolver()
      estado.comoConheceu = origem
      avancarDe('hdyhau')
      publicar()
      return devolver()
    },

    async pularConvite() {
      if (estado.etapa !== 'convite') return devolver()
      estado.convitePulado = true
      avancarDe('convite')
      publicar()
      return devolver()
    },

    async confirmarConvite() {
      if (estado.etapa !== 'convite') return devolver()
      estado.convitePulado = false
      avancarDe('convite')
      publicar()
      return devolver()
    },

    async pularItem(item) {
      if (!estado.day0Concluido || !ehItem(item)) return devolver()
      if (estado.checklist[item] === 'concluido') return devolver()
      estado.checklist[item] = 'pulado'
      publicar()
      return devolver()
    },

    async registrarVisitaASinais() {
      if (!estado.day0Concluido || estado.checklist.sinal === 'concluido') return devolver()
      estado.checklist.sinal = 'concluido'
      publicar()
      return devolver()
    },

    async pedirRetornoAoChecklist() {
      if (!estado.day0Concluido || estado.retornoAoChecklist) return devolver()
      estado.retornoAoChecklist = true
      publicar()
      return devolver()
    },

    async dispensarRetorno() {
      if (!estado.retornoAoChecklist) return devolver()
      estado.retornoAoChecklist = false
      publicar()
      return devolver()
    },

    async concluirOnboarding() {
      if (!estado.day0Concluido || estado.concluido) return devolver()
      estado.concluido = true
      publicar()
      return devolver()
    },

    async trocarRamoDaDemonstracao(ramo) {
      if (!ehRamo(ramo) || estado.ramo === ramo) return devolver()
      estado = inicioDoRamo(ramo)
      publicar()
      return devolver()
    },
  }
}

/** O começo do wizard no ramo: o criador ganha o Workspace dele, ainda sem nome; o convidado entra no que já existe. */
function inicioDoRamo(ramo: RamoDeOnboarding): EstadoDeOnboarding {
  return {
    ...estadoInicial(),
    ramo,
    workspace: criaOWorkspace(ramo) ? { id: ID_DO_WORKSPACE, nomeSugerido: '' } : null,
  }
}

function estadoInicial(): EstadoDeOnboarding {
  return {
    ramo: null,
    etapa: 'papel',
    papel: null,
    empresa: '',
    dominio: '',
    logoDoSite: null,
    sitePulado: false,
    comoConheceu: null,
    convitePulado: false,
    workspace: null,
    retornoAoChecklist: false,
    day0Concluido: false,
    concluido: false,
    checklist: { contexto: 'pendente', sinal: 'pendente' },
  }
}

/** O onboarding já concluído de quem entrou num Workspace que existia: sem Workspace novo, com o Sinal visto. */
function estadoConcluido(): EstadoDeOnboarding {
  const base = estadoInicial()
  return {
    ...base,
    ramo: 'convidado',
    etapa: 'checklist',
    day0Concluido: true,
    concluido: true,
    checklist: { ...base.checklist, contexto: 'concluido', sinal: 'concluido' },
  }
}

/** O onboarding guardado, ou nenhum quando o armazenamento não guarda um legível. */
function carregar(armazenamento: ArmazenamentoDeOnboarding | null): EstadoDeOnboarding | null {
  if (!armazenamento) return null
  const bruto = armazenamento.getItem(CHAVE)
  if (!bruto) return null
  try {
    return normalizar(JSON.parse(bruto))
  } catch {
    return null
  }
}

function normalizar(bruto: unknown): EstadoDeOnboarding {
  const base = estadoInicial()
  if (!ehObjeto(bruto)) return base
  const lido = bruto

  if (!ehRamo(lido.ramo)) return base
  base.ramo = lido.ramo
  if (typeof lido.etapa === 'string' && etapasDoRamo(base.ramo).includes(lido.etapa as EtapaDeOnboarding)) {
    base.etapa = lido.etapa as EtapaDeOnboarding
  }
  if (ehPapel(lido.papel)) base.papel = lido.papel
  if (ehOrigem(lido.comoConheceu)) base.comoConheceu = lido.comoConheceu
  if (lido.convitePulado === true) base.convitePulado = true
  if (lido.retornoAoChecklist === true) base.retornoAoChecklist = true
  // Sem a marca guardada, estar no checklist já mostra que o Day0 foi feito.
  if (lido.day0Concluido === true || base.etapa === 'checklist') base.day0Concluido = true
  if (lido.concluido === true) base.concluido = true

  if (ehObjeto(lido.checklist)) {
    const checklist = lido.checklist
    for (const item of ITENS_DO_CHECKLIST) {
      const situacao = checklist[item]
      if (ehSituacao(situacao)) base.checklist[item] = situacao
    }
  }

  if (criaOWorkspace(base.ramo)) {
    if (typeof lido.empresa === 'string') base.empresa = lido.empresa
    if (typeof lido.dominio === 'string') base.dominio = normalizarDominio(lido.dominio) ?? ''
    // Versões anteriores guardavam a lista de candidatos: sem um logo resolvido, a Fonte o procura de novo.
    if (base.dominio && typeof lido.logoDoSite === 'string') base.logoDoSite = lido.logoDoSite
    if (lido.sitePulado === true && !base.dominio) base.sitePulado = true
    const workspace = ehObjeto(lido.workspace) ? lido.workspace : null
    const id = typeof workspace?.id === 'string' && workspace.id ? workspace.id : ID_DO_WORKSPACE
    base.workspace = { id, nomeSugerido: base.empresa }
  }

  return base
}

/** Uma guarda para os valores de uma lista fixa, como os papéis do Day0 ou as situações de um item. */
function umDe<T extends string>(lista: readonly T[]) {
  return (valor: unknown): valor is T => typeof valor === 'string' && (lista as readonly string[]).includes(valor)
}

const ehRamo = umDe(RAMOS_DE_ONBOARDING)
const ehPapel = umDe(PAPEIS_DO_DAY0)
const ehOrigem = umDe(ORIGENS_HDYHAU)
const ehSituacao = umDe(SITUACOES_DO_ITEM)
const ehItem = umDe(ITENS_DO_CHECKLIST)

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}
