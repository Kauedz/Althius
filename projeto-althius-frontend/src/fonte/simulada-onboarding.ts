// Fonte simulada do onboarding (ADR 0003): estado no cliente, sem auth nem IA.
// A empresa só sugere o nome do Workspace/Cliente. Nenhuma Conta-alvo nasce aqui.
// A leitura do site é a única IA do onboarding; aqui ela é fixa, pela mesma interface que a leitura real vai usar.
import {
  CAMPOS_DO_MINI_ICP_E_PRODUTO,
  ITENS_DO_CHECKLIST,
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  RAMOS_DE_ONBOARDING,
  SITUACOES_DA_LEITURA,
  SITUACOES_DO_ITEM,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type FonteDeOnboarding,
  type LeituraDoSite,
  type MiniIcpEProduto,
  type RamoDeOnboarding,
} from './onboarding-tipos'
import { aplicarLeitura, criaOWorkspace, etapasDoRamo } from './regras-onboarding'
import { normalizarDominio, resolverLogoDoSite } from './dominio-do-site'

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
  /** Quem acha o logo do site. Por padrão, o navegador carrega os candidatos do domínio em ordem. */
  resolverLogo?: (dominio: string) => Promise<string | null>
  /**
   * A sessão já passou pelo onboarding no Workspace da demonstração, que ela não criou: a Casca abre direto. É o
   * ponto de partida dos testes da Casca. Vale só quando o armazenamento não guarda um onboarding legível.
   */
  jaConcluido?: boolean
}

/** As Personas guardadas: sem espaços nas pontas e sem linhas vazias. */
function limparPersonas(personas: readonly string[]): string[] {
  return personas.map((persona) => persona.trim()).filter(Boolean)
}

export function criarFonteDeOnboardingSimulada(
  opcoes: OpcoesFonteDeOnboardingSimulada = {},
): FonteDeOnboarding {
  const armazenamento = opcoes.armazenamento ?? null
  const atraso = opcoes.atrasoDaLeituraMs ?? 1200
  const leitorDeSite =
    opcoes.leitorDeSite ??
    (() => new Promise<LeituraDoSite>((resolver) => setTimeout(() => resolver(structuredClone(LEITURA_FIXA)), atraso)))
  const resolverLogo = opcoes.resolverLogo ?? ((dominio: string) => resolverLogoDoSite(dominio))
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

  async function lerSite(bruto: string): Promise<LeituraDoSite | null> {
    const dominio = normalizarDominio(bruto)
    if (!criaOWorkspace(estado.ramo) || !dominio || dominio !== estado.dominio) return null
    const esta = ++leituraAtual
    estado.leitura = { ...estado.leitura, situacao: 'lendo' }
    publicar()
    try {
      const resultado = await leitorDeSite(dominio)
      if (esta !== leituraAtual) return null
      estado.checklist = aplicarLeitura(estado.checklist, estado.leitura.resultado, resultado)
      estado.leitura = { situacao: 'pronta', resultado: structuredClone(resultado) }
      publicar()
      return structuredClone(resultado)
    } catch {
      if (esta !== leituraAtual) return null
      estado.leitura = { ...estado.leitura, situacao: 'falhou' }
      publicar()
      return null
    }
  }

  // Um refresh no meio da leitura retoma a leitura, e um logo que não chegou a ser resolvido é procurado de novo.
  if (estado.leitura.situacao === 'lendo') void lerSite(estado.dominio)
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
      if (mudou) estado.logoDoSite = null
      avancarDe('dominio')
      publicar()
      // Sem esperar: o logo e a leitura acontecem enquanto a pessoa segue o wizard.
      if (!estado.logoDoSite) void resolverOLogo()
      const precisaLer = mudou || estado.leitura.situacao === 'inativa' || estado.leitura.situacao === 'falhou'
      if (precisaLer) void lerSite(dominio)
      return devolver()
    },

    async buscarLogo(bruto) {
      const dominio = normalizarDominio(bruto)
      if (!dominio) return null
      return resolverLogo(dominio).catch(() => null)
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

    async salvarProduto(campos: MiniIcpEProduto) {
      if (!estado.day0Concluido) return devolver()
      for (const campo of CAMPOS_DO_MINI_ICP_E_PRODUTO) estado.checklist[campo] = campos[campo].trim()
      publicar()
      return devolver()
    },

    async salvarPersonas(personas) {
      if (!estado.day0Concluido) return devolver()
      estado.checklist.personas = limparPersonas(personas)
      publicar()
      return devolver()
    },

    async concluirProduto() {
      if (!estado.day0Concluido) return devolver()
      if (CAMPOS_DO_MINI_ICP_E_PRODUTO.some((campo) => !estado.checklist[campo])) return devolver()
      estado.checklist.produto = 'concluido'
      publicar()
      return devolver()
    },

    async concluirPersona() {
      if (!estado.day0Concluido || estado.checklist.personas.length === 0) return devolver()
      estado.checklist.persona = 'concluido'
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
      // Uma leitura do site em andamento é do ramo anterior e não chega ao novo.
      leituraAtual++
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
    leitura: { situacao: 'inativa', resultado: null },
    comoConheceu: null,
    convitePulado: false,
    workspace: null,
    retornoAoChecklist: false,
    day0Concluido: false,
    concluido: false,
    checklist: {
      miniIcp: '',
      oQueVende: '',
      porQueCompram: '',
      personas: [],
      produto: 'pendente',
      persona: 'pendente',
      sinal: 'pendente',
    },
  }
}

/**
 * O onboarding já concluído de quem entrou num Workspace que existia: sem Workspace novo nem leitura do site, e com
 * o onboarding 100% completo.
 */
function estadoConcluido(): EstadoDeOnboarding {
  const base = estadoInicial()
  return {
    ...base,
    ramo: 'convidado',
    etapa: 'checklist',
    day0Concluido: true,
    concluido: true,
    checklist: { ...base.checklist, produto: 'concluido', persona: 'concluido', sinal: 'concluido' },
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
    for (const campo of CAMPOS_DO_MINI_ICP_E_PRODUTO) {
      const valor = checklist[campo]
      if (typeof valor === 'string') base.checklist[campo] = valor
    }
    // Versões anteriores guardavam as Personas num texto, uma por linha.
    const personas = checklist.personas
    if (typeof personas === 'string') base.checklist.personas = limparPersonas(personas.split('\n'))
    else if (ehListaDeTextos(personas)) base.checklist.personas = limparPersonas(personas)
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
    const leitura = ehObjeto(lido.leitura) ? lido.leitura : null
    if (leitura && ehSituacaoDaLeitura(leitura.situacao) && base.dominio) {
      base.leitura = { situacao: leitura.situacao, resultado: ehLeitura(leitura.resultado) ? leitura.resultado : null }
    }
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
const ehSituacaoDaLeitura = umDe(SITUACOES_DA_LEITURA)
const ehItem = umDe(ITENS_DO_CHECKLIST)

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function ehListaDeTextos(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((item) => typeof item === 'string')
}

function ehLeitura(valor: unknown): valor is LeituraDoSite {
  return (
    ehObjeto(valor) &&
    CAMPOS_DO_MINI_ICP_E_PRODUTO.every((campo) => typeof valor[campo] === 'string') &&
    ehListaDeTextos(valor.personas)
  )
}
