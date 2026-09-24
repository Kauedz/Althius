// Fonte simulada do onboarding (ADR 0003): estado no cliente, sem rede, auth ou IA.
// A empresa só sugere o nome do Workspace/Cliente. Nenhuma Conta-alvo nasce aqui.
import {
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type FonteDeOnboarding,
  type ItemDoChecklist,
  type OrigemHdyhau,
  type PapelNoDay0,
  type ProdutoDoChecklist,
  type RamoDeOnboarding,
  type SituacaoDoItem,
} from './onboarding-tipos'

const CHAVE = 'althius.onboarding.v2'
const ID_DO_WORKSPACE = 'ws-criador'

/** Defaults curtos de um Cliente B2B de dados, coerentes com a demo. Não são placeholder vazio. */
export const PRODUTO_INICIAL: ProdutoDoChecklist = {
  miniIcp: 'Empresas B2B com time comercial e operação de dados no Brasil.',
  oQueVende: 'Plataforma de dados para unificar análise e IA.',
  porQueCompram: 'Para decidir com uma base única e reduzir ferramentas soltas.',
}

export const PERSONA_INICIAL =
  'Exemplo fixo de Persona do Workspace: Diretora de Dados. A dor é operar com plataformas espalhadas; a compra acontece quando o time precisa de uma base única. Esta definição fica na Memória do Workspace. Não é a classificação de um Contato e não é a Memória do Agente.'

export const SINAL_INICIAL =
  'Abra Sinais para entender um Sinal. Abrir a página basta: não é preciso criar um Monitoramento.'

export interface LeituraDeEmpresa {
  dominio: string
  nome: string
  logoUrl: string
  miniIcp: string
  oQueVende: string
  porQueCompram: string
  personaTexto: string
  sinalTexto: string
  contextoDaIa: string
}

/** Normaliza um domínio. Devolve null quando ainda não é um host utilizável. */
export function dominioUtil(bruto: string): string | null {
  const host = bruto
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.includes('..')) return null
  return host
}

/**
 * Leitura simulada do domínio: favicon público e texto fixo com o nome do Cliente.
 * Não chama modelo. O nome digitado tem prioridade sobre o rótulo do domínio.
 */
export function lerEmpresa(dominioBruto: string, nomeInformado: string): LeituraDeEmpresa | null {
  const dominio = dominioUtil(dominioBruto)
  if (!dominio) return null
  const nome = nomeInformado.trim() || nomeDoDominio(dominio)
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=128`
  const miniIcp = `Empresas B2B que compram de ${nome} e já operam com time comercial.`
  const oQueVende = `A oferta pública de ${nome}, lida em ${dominio}.`
  const porQueCompram = `Para resolver o problema que ${nome} comunica em ${dominio}.`
  const personaTexto = `Persona lida em ${dominio}: quem patrocina a compra em ${nome}. Esta definição fica na Memória do Workspace. Não é a classificação de um Contato e não é a Memória do Agente.`
  const sinalTexto = `Sinal sugerido para ${nome}: um acontecimento ligado a ${dominio} que indica necessidade agora. Abrir Sinais basta; nenhum Monitoramento é criado.`
  const contextoDaIa = `Cliente ${nome}. Domínio ${dominio}. Mini-ICP: ${miniIcp} O que vende: ${oQueVende} Por que compram: ${porQueCompram}`
  return { dominio, nome, logoUrl, miniIcp, oQueVende, porQueCompram, personaTexto, sinalTexto, contextoDaIa }
}

function nomeDoDominio(dominio: string): string {
  const rotulo = dominio.split('.')[0].replace(/-/g, ' ')
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
}

export interface ArmazenamentoDeOnboarding {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
}

export interface OpcoesFonteDeOnboardingSimulada {
  /** Quando presente, o estado sobrevive a um refresh. Sem isso, vale só na instância. */
  armazenamento?: ArmazenamentoDeOnboarding | null
}

const ETAPAS: readonly EtapaDeOnboarding[] = ['ramo', 'papel', 'empresa', 'hdyhau', 'convite', 'checklist']
const SITUACOES: readonly SituacaoDoItem[] = ['pendente', 'concluido', 'pulado']

export function criarFonteDeOnboardingSimulada(
  opcoes: OpcoesFonteDeOnboardingSimulada = {},
): FonteDeOnboarding {
  const armazenamento = opcoes.armazenamento ?? null
  let estado = carregar(armazenamento)
  const ouvintes = new Set<() => void>()

  const notificar = () => {
    for (const ouvinte of ouvintes) ouvinte()
  }

  const publicar = () => {
    armazenamento?.setItem(CHAVE, JSON.stringify(estado))
    notificar()
  }

  const devolver = () => structuredClone(estado)

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

    async escolherRamo(ramo) {
      if (!ehRamo(ramo) || estado.ramo) return devolver()
      estado.ramo = ramo
      if (ramo === 'criador') {
        estado.workspace = { id: ID_DO_WORKSPACE, nomeSugerido: '' }
      }
      estado.etapa = 'papel'
      publicar()
      return devolver()
    },

    async definirPapel(papel) {
      if (!estado.ramo || !ehPapel(papel)) return devolver()
      estado.papel = papel
      if (estado.etapa === 'papel') {
        estado.etapa = estado.ramo === 'criador' ? 'empresa' : 'hdyhau'
      }
      publicar()
      return devolver()
    },

    async definirCliente(entrada) {
      if (estado.ramo !== 'criador' || !estado.workspace) return devolver()
      const leitura = lerEmpresa(entrada.dominio, entrada.nome)
      if (!leitura) return devolver()
      estado.empresa = leitura.nome
      estado.dominio = leitura.dominio
      estado.logoUrl = leitura.logoUrl
      estado.contextoDaIa = leitura.contextoDaIa
      estado.workspace = { id: estado.workspace.id, nomeSugerido: leitura.nome }
      estado.checklist.miniIcp = leitura.miniIcp
      estado.checklist.oQueVende = leitura.oQueVende
      estado.checklist.porQueCompram = leitura.porQueCompram
      estado.checklist.personaTexto = leitura.personaTexto
      estado.checklist.sinalTexto = leitura.sinalTexto
      estado.checklist.produto = 'concluido'
      estado.checklist.persona = 'concluido'
      estado.checklist.sinal = 'concluido'
      if (estado.etapa === 'empresa') estado.etapa = 'hdyhau'
      publicar()
      return devolver()
    },

    async definirComoConheceu(origem) {
      if (!estado.ramo || !ehOrigem(origem)) return devolver()
      estado.comoConheceu = origem
      if (estado.etapa === 'hdyhau') estado.etapa = 'convite'
      publicar()
      return devolver()
    },

    async pularConvite() {
      if (estado.etapa !== 'convite' && estado.etapa !== 'checklist') return devolver()
      estado.convitePulado = true
      if (estado.etapa === 'convite') estado.etapa = 'checklist'
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

    async concluirProduto() {
      if (estado.etapa !== 'checklist') return devolver()
      const { miniIcp, oQueVende, porQueCompram } = estado.checklist
      if (!miniIcp || !oQueVende || !porQueCompram) return devolver()
      estado.checklist.produto = 'concluido'
      publicar()
      return devolver()
    },

    async concluirPersona() {
      if (estado.etapa !== 'checklist') return devolver()
      estado.checklist.persona = 'concluido'
      publicar()
      return devolver()
    },

    async pularItem(item) {
      if (estado.etapa !== 'checklist' || !ehItem(item)) return devolver()
      if (item === 'sinal' && estado.checklist.sinal === 'concluido') return devolver()
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
  }
}

function estadoInicial(): EstadoDeOnboarding {
  return {
    etapa: 'ramo',
    ramo: null,
    papel: null,
    empresa: '',
    dominio: '',
    logoUrl: '',
    contextoDaIa: '',
    comoConheceu: null,
    convitePulado: false,
    workspace: null,
    retornoAoChecklist: false,
    checklist: {
      ...PRODUTO_INICIAL,
      personaTexto: PERSONA_INICIAL,
      sinalTexto: SINAL_INICIAL,
      produto: 'pendente',
      persona: 'pendente',
      sinal: 'pendente',
    },
  }
}

function carregar(armazenamento: ArmazenamentoDeOnboarding | null): EstadoDeOnboarding {
  if (!armazenamento) return estadoInicial()
  const bruto = armazenamento.getItem(CHAVE)
  if (!bruto) return estadoInicial()
  try {
    return normalizar(JSON.parse(bruto))
  } catch {
    return estadoInicial()
  }
}

function normalizar(bruto: unknown): EstadoDeOnboarding {
  const base = estadoInicial()
  if (!bruto || typeof bruto !== 'object') return base
  const lido = bruto as Record<string, unknown>

  if (ehEtapa(lido.etapa)) base.etapa = lido.etapa
  if (ehRamo(lido.ramo)) base.ramo = lido.ramo
  if (ehPapel(lido.papel)) base.papel = lido.papel
  if (typeof lido.empresa === 'string') base.empresa = lido.empresa
  if (typeof lido.dominio === 'string') base.dominio = lido.dominio
  if (typeof lido.logoUrl === 'string') base.logoUrl = lido.logoUrl
  if (typeof lido.contextoDaIa === 'string') base.contextoDaIa = lido.contextoDaIa
  if (ehOrigem(lido.comoConheceu)) base.comoConheceu = lido.comoConheceu
  if (lido.convitePulado === true) base.convitePulado = true
  if (lido.retornoAoChecklist === true) base.retornoAoChecklist = true

  if (lido.checklist && typeof lido.checklist === 'object') {
    const checklist = lido.checklist as Record<string, unknown>
    if (typeof checklist.miniIcp === 'string') base.checklist.miniIcp = checklist.miniIcp
    if (typeof checklist.oQueVende === 'string') base.checklist.oQueVende = checklist.oQueVende
    if (typeof checklist.porQueCompram === 'string') base.checklist.porQueCompram = checklist.porQueCompram
    if (typeof checklist.personaTexto === 'string') base.checklist.personaTexto = checklist.personaTexto
    if (typeof checklist.sinalTexto === 'string') base.checklist.sinalTexto = checklist.sinalTexto
    if (ehSituacao(checklist.produto)) base.checklist.produto = checklist.produto
    if (ehSituacao(checklist.persona)) base.checklist.persona = checklist.persona
    if (ehSituacao(checklist.sinal)) base.checklist.sinal = checklist.sinal
  }

  if (base.ramo === 'criador') {
    const workspace = lido.workspace
    const registro = workspace && typeof workspace === 'object' ? (workspace as Record<string, unknown>) : null
    const id = registro && typeof registro.id === 'string' && registro.id ? registro.id : ID_DO_WORKSPACE
    const nomeSugerido =
      registro && typeof registro.nomeSugerido === 'string' ? registro.nomeSugerido : base.empresa
    base.workspace = { id, nomeSugerido }
  } else {
    base.workspace = null
  }

  if (!base.ramo) {
    base.etapa = 'ramo'
    base.workspace = null
  } else if (base.ramo === 'convidado' && base.etapa === 'empresa') {
    base.etapa = 'hdyhau'
  }

  return base
}

function ehEtapa(valor: unknown): valor is EtapaDeOnboarding {
  return typeof valor === 'string' && (ETAPAS as readonly string[]).includes(valor)
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

function ehItem(valor: string): valor is ItemDoChecklist {
  return valor === 'produto' || valor === 'persona' || valor === 'sinal'
}
