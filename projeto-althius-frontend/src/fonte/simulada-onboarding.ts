// Fonte simulada do onboarding (ADR 0003): estado no cliente, sem rede, auth ou IA.
// A empresa só sugere o nome do Workspace/Cliente. Nenhuma Conta-alvo nasce aqui.
// A leitura do site é a única IA do onboarding; aqui ela é fixa, pela mesma interface que a leitura real vai usar.
import {
  ETAPAS_DO_RAMO,
  ORIGENS_HDYHAU,
  etapasDoRamo,
  PAPEIS_DO_DAY0,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type FonteDeOnboarding,
  type ItemDoChecklist,
  type LeituraDoSite,
  type OrigemHdyhau,
  type PapelNoDay0,
  type RamoDeOnboarding,
  type SituacaoDaLeitura,
  type SituacaoDoItem,
} from './onboarding-tipos'
import { dominioUtil, logoDoSite } from './dominio-do-site'

const CHAVE = 'althius.onboarding.v3'
const ID_DO_WORKSPACE = 'ws-criador'

/** A leitura fixa de um Cliente B2B de dados, coerente com a demo. Não é placeholder vazio. */
export const LEITURA_FIXA: LeituraDoSite = {
  oQueVende: 'Plataforma de dados que unifica engenharia, análise e IA num só lugar.',
  miniIcp:
    'Empresas B2B de médio e grande porte no Brasil, com time de dados próprio e operação comercial estruturada.',
  porQueCompram: 'Para decidir com uma base única de dados e cortar o custo de ferramentas soltas.',
  personas: [
    'Diretora de Dados: patrocina a compra e sofre com plataformas espalhadas.',
    'Head de Engenharia de Dados: avalia a integração com o que já existe.',
    'CFO: aprova o investimento quando vê o custo cair.',
  ],
}

export interface ArmazenamentoDeOnboarding {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
}

export interface OpcoesFonteDeOnboardingSimulada {
  /** Quando presente, o estado sobrevive a um refresh. Sem isso, vale só na instância. */
  armazenamento?: ArmazenamentoDeOnboarding | null
  /** Quem lê o site. Por padrão, a leitura fixa depois de um carregamento curto. */
  leitorDeSite?: (dominio: string) => Promise<LeituraDoSite>
  /** Duração do carregamento da leitura fixa. */
  atrasoDaLeituraMs?: number
  /**
   * A sessão já passou pelo onboarding no Workspace da demonstração, que ela não criou: a Casca abre direto. É o
   * ponto de partida dos testes da Casca. Vale só quando o armazenamento não guarda um onboarding legível.
   */
  jaConcluido?: boolean
}

const CAMPOS_DO_PRODUTO = ['miniIcp', 'oQueVende', 'porQueCompram'] as const

/** No checklist, as Personas sugeridas viram texto editável, uma por linha. */
function textoDasPersonas(leitura: LeituraDoSite) {
  return leitura.personas.join('\n')
}

const SITUACOES: readonly SituacaoDoItem[] = ['pendente', 'concluido', 'pulado']
const SITUACOES_DA_LEITURA: readonly SituacaoDaLeitura[] = ['inativa', 'lendo', 'pronta', 'falhou']

export function criarFonteDeOnboardingSimulada(
  opcoes: OpcoesFonteDeOnboardingSimulada = {},
): FonteDeOnboarding {
  const armazenamento = opcoes.armazenamento ?? null
  const atraso = opcoes.atrasoDaLeituraMs ?? 1200
  const leitorDeSite =
    opcoes.leitorDeSite ??
    (() => new Promise<LeituraDoSite>((resolver) => setTimeout(() => resolver(structuredClone(LEITURA_FIXA)), atraso)))
  let estado = carregar(armazenamento) ?? (opcoes.jaConcluido ? estadoConcluido() : estadoInicial())
  // Só a leitura mais recente vale: uma leitura de um domínio anterior que chegue depois é descartada.
  let leituraAtual = 0
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
  }

  /**
   * Um campo ainda é só sugestão quando está igual ao que a leitura anterior trouxe, ou vazio se nenhuma leitura
   * chegou antes. Depois de uma leitura, um campo vazio foi descartado pela pessoa e continua vazio.
   */
  const aplicarLeitura = (leitura: LeituraDoSite) => {
    const anterior = estado.leitura.resultado
    const checklist = estado.checklist
    const aindaESugestao = (atual: string, daAnterior: string | undefined) => (anterior ? atual === daAnterior : !atual)
    for (const campo of CAMPOS_DO_PRODUTO) {
      if (aindaESugestao(checklist[campo], anterior?.[campo])) checklist[campo] = leitura[campo]
    }
    if (aindaESugestao(checklist.personas, anterior ? textoDasPersonas(anterior) : undefined)) {
      checklist.personas = textoDasPersonas(leitura)
    }
  }

  async function lerSite() {
    if (estado.ramo !== 'criador' || !estado.dominio) return devolver()
    const dominio = estado.dominio
    const esta = ++leituraAtual
    estado.leitura = { ...estado.leitura, situacao: 'lendo' }
    publicar()
    try {
      const resultado = await leitorDeSite(dominio)
      if (esta !== leituraAtual) return devolver()
      aplicarLeitura(resultado)
      estado.leitura = { situacao: 'pronta', resultado: structuredClone(resultado) }
    } catch {
      if (esta !== leituraAtual) return devolver()
      estado.leitura = { ...estado.leitura, situacao: 'falhou' }
    }
    publicar()
    return devolver()
  }

  // Um refresh no meio da leitura retoma a leitura.
  if (estado.leitura.situacao === 'lendo') void lerSite()

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
      estado.ramo = ramo
      estado.etapa = 'papel'
      estado.workspace = ramo === 'criador' ? { id: ID_DO_WORKSPACE, nomeSugerido: '' } : null
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

    async definirEmpresa(nome) {
      const empresa = nome.trim()
      if (estado.ramo !== 'criador' || !estado.workspace || !empresa) return devolver()
      estado.empresa = empresa
      estado.workspace = { id: estado.workspace.id, nomeSugerido: empresa }
      avancarDe('empresa')
      publicar()
      return devolver()
    },

    async definirDominio(bruto) {
      const dominio = dominioUtil(bruto)
      if (estado.ramo !== 'criador' || !dominio) return devolver()
      const mudou = dominio !== estado.dominio
      estado.dominio = dominio
      estado.logoDoSite = logoDoSite(dominio)
      avancarDe('dominio')
      publicar()
      // Sem esperar: a leitura acontece enquanto a pessoa segue o wizard.
      const precisaLer = mudou || estado.leitura.situacao === 'inativa' || estado.leitura.situacao === 'falhou'
      if (precisaLer) void lerSite()
      return devolver()
    },

    lerSite,

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

    async salvarProduto(campos) {
      if (estado.etapa !== 'checklist') return devolver()
      estado.checklist.miniIcp = campos.miniIcp.trim()
      estado.checklist.oQueVende = campos.oQueVende.trim()
      estado.checklist.porQueCompram = campos.porQueCompram.trim()
      publicar()
      return devolver()
    },

    async salvarPersonas(personas) {
      if (estado.etapa !== 'checklist') return devolver()
      estado.checklist.personas = personas.trim()
      publicar()
      return devolver()
    },

    async concluirProduto() {
      if (estado.etapa !== 'checklist') return devolver()
      const { miniIcp, oQueVende, porQueCompram } = estado.checklist
      if (!miniIcp || !oQueVende || !porQueCompram) return devolver()
      estado.checklist.produto = 'concluido'
      publicar()
      return devolver()
    },

    async concluirPersona() {
      if (estado.etapa !== 'checklist' || !estado.checklist.personas) return devolver()
      estado.checklist.persona = 'concluido'
      publicar()
      return devolver()
    },

    async pularItem(item) {
      if (estado.etapa !== 'checklist' || !ehItem(item)) return devolver()
      if (estado.checklist[item] === 'concluido') return devolver()
      estado.checklist[item] = 'pulado'
      publicar()
      return devolver()
    },

    async registrarVisitaASinais() {
      if (estado.etapa !== 'checklist' || estado.checklist.sinal === 'concluido') return devolver()
      estado.checklist.sinal = 'concluido'
      publicar()
      return devolver()
    },

    async pedirRetornoAoChecklist() {
      if (estado.etapa !== 'checklist' || estado.retornoAoChecklist) return devolver()
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
      if (estado.etapa !== 'checklist' || estado.concluido) return devolver()
      estado.concluido = true
      publicar()
      return devolver()
    },
  }
}

function estadoInicial(): EstadoDeOnboarding {
  return {
    ramo: null,
    etapa: 'papel',
    papel: null,
    empresa: '',
    dominio: '',
    logoDoSite: [],
    leitura: { situacao: 'inativa', resultado: null },
    comoConheceu: null,
    convitePulado: false,
    workspace: null,
    retornoAoChecklist: false,
    concluido: false,
    checklist: {
      miniIcp: '',
      oQueVende: '',
      porQueCompram: '',
      personas: '',
      produto: 'pendente',
      persona: 'pendente',
      sinal: 'pendente',
    },
  }
}

/** O onboarding já concluído de quem entrou num Workspace que existia: sem Workspace novo nem leitura do site. */
function estadoConcluido(): EstadoDeOnboarding {
  return { ...estadoInicial(), ramo: 'convidado', etapa: 'checklist', concluido: true }
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
  if (!bruto || typeof bruto !== 'object') return base
  const lido = bruto as Record<string, unknown>

  if (!ehRamo(lido.ramo)) return base
  base.ramo = lido.ramo
  if (typeof lido.etapa === 'string' && (ETAPAS_DO_RAMO[base.ramo] as readonly string[]).includes(lido.etapa)) {
    base.etapa = lido.etapa as EtapaDeOnboarding
  }
  if (ehPapel(lido.papel)) base.papel = lido.papel
  if (ehOrigem(lido.comoConheceu)) base.comoConheceu = lido.comoConheceu
  if (lido.convitePulado === true) base.convitePulado = true
  if (lido.retornoAoChecklist === true) base.retornoAoChecklist = true
  if (lido.concluido === true) base.concluido = true

  if (lido.checklist && typeof lido.checklist === 'object') {
    const checklist = lido.checklist as Record<string, unknown>
    for (const campo of [...CAMPOS_DO_PRODUTO, 'personas'] as const) {
      if (typeof checklist[campo] === 'string') base.checklist[campo] = checklist[campo]
    }
    for (const item of ['produto', 'persona', 'sinal'] as const) {
      if (ehSituacao(checklist[item])) base.checklist[item] = checklist[item]
    }
  }

  if (base.ramo === 'criador') {
    if (typeof lido.empresa === 'string') base.empresa = lido.empresa
    if (typeof lido.dominio === 'string') base.dominio = dominioUtil(lido.dominio) ?? ''
    if (base.dominio) base.logoDoSite = logoDoSite(base.dominio)
    const leitura = lido.leitura && typeof lido.leitura === 'object' ? (lido.leitura as Record<string, unknown>) : null
    if (leitura && ehSituacaoDaLeitura(leitura.situacao) && base.dominio) {
      base.leitura = { situacao: leitura.situacao, resultado: ehLeitura(leitura.resultado) ? leitura.resultado : null }
    }
    const workspace = lido.workspace && typeof lido.workspace === 'object' ? (lido.workspace as Record<string, unknown>) : null
    const id = typeof workspace?.id === 'string' && workspace.id ? workspace.id : ID_DO_WORKSPACE
    base.workspace = { id, nomeSugerido: base.empresa }
  }

  return base
}

function ehRamo(valor: unknown): valor is RamoDeOnboarding {
  return valor === 'criador' || valor === 'convidado'
}

function ehPapel(valor: unknown): valor is PapelNoDay0 {
  return typeof valor === 'string' && (PAPEIS_DO_DAY0 as readonly string[]).includes(valor)
}

function ehOrigem(valor: unknown): valor is OrigemHdyhau {
  return typeof valor === 'string' && (ORIGENS_HDYHAU as readonly string[]).includes(valor)
}

function ehSituacao(valor: unknown): valor is SituacaoDoItem {
  return typeof valor === 'string' && (SITUACOES as readonly string[]).includes(valor)
}

function ehSituacaoDaLeitura(valor: unknown): valor is SituacaoDaLeitura {
  return typeof valor === 'string' && (SITUACOES_DA_LEITURA as readonly string[]).includes(valor)
}

function ehLeitura(valor: unknown): valor is LeituraDoSite {
  if (!valor || typeof valor !== 'object') return false
  const leitura = valor as Record<string, unknown>
  return (
    typeof leitura.oQueVende === 'string' &&
    typeof leitura.miniIcp === 'string' &&
    typeof leitura.porQueCompram === 'string' &&
    Array.isArray(leitura.personas) &&
    leitura.personas.every((persona) => typeof persona === 'string')
  )
}

function ehItem(valor: string): valor is ItemDoChecklist {
  return valor === 'produto' || valor === 'persona' || valor === 'sinal'
}
