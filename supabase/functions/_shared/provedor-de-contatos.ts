// O contrato único da cascata de contatos (enriquecimento-em-cascata, tickets 01 e 02):
// - Busca de pessoas da empresa para formação do comitê de compra (Decisor, Influenciador, Campeão);
// - Revelação de e-mail e telefone;
// - Provedores plugáveis (Apify como base nativa; Apollo, Lusha e Clay como stubs, fora da cascata da Althius);
// - Cascata que percorre os fornecedores de `fornecedoresDaCascata` na ordem.
import type { Apify } from '../signal-scan/handler.ts'

export interface PessoaEncontrada {
  nome: string
  cargo?: string
  headline?: string
  linkedinUrl?: string
  localizacao?: string
  foto?: string
  persona?: 'Decisor' | 'Influenciador' | 'Campeao' | 'Outro'
  fonte: string
}

export interface DadoRevelado {
  canal: 'email' | 'telefone'
  valor: string
  confianca?: number
  fonte: string
}

export interface MedicaoDaBuscaDePessoas {
  runId: string | null
  costUsd: number | null
}

export interface FiltrosEmpresaParaBusca {
  nome: string
  linkedinUrl?: string
  dominio?: string
  cargos?: string[]
  personas?: string[]
  limite?: number
  /** Preenchida por buscarPessoas com o id e o dólar que o Apify devolveu, inclusive quando a resposta não é uma lista. */
  medicao?: MedicaoDaBuscaDePessoas
}

export interface ProvedorDeContatos {
  readonly nome: string
  buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]>
  /**
   * O dado novo, ou null quando a execução terminou sem ele. Falha da execução lança: não é "não encontrado".
   * `medicao` recebe o id e o dólar da execução, inclusive na falha.
   */
  revelarContato?(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
    medicao?: { runId: string | null; costUsd: number | null },
  ): Promise<DadoRevelado | null>
}

/**
 * Classifica o cargo em uma das três Personas do Playbook (Decisor, Influenciador, Campeão),
 * garantindo a correspondência determinística com a estrutura do comitê de compra.
 */
export function classificarPersona(cargo = '', headline = ''): 'Decisor' | 'Influenciador' | 'Campeao' | 'Outro' {
  const texto = `${cargo} ${headline}`.toLowerCase()
  if (
    /\b(ceo|cfo|coo|cto|cio|cmo|cro|cpo|chief|diretor|diretora|vp|vice[- ]presidente|presidente|fundador|fundadora|founder|co-founder|proprietari[oa]|s[oó]ci[oa]|head|general manager|superintendente)\b/i
      .test(texto)
  ) {
    return 'Decisor'
  }
  if (
    /\b(gerente|coordenador|coordenadora|manager|supervisor|supervisora|leader|l[ií]der|especialista|specialist|tech lead|product lead)\b/i
      .test(texto)
  ) {
    return 'Influenciador'
  }
  if (
    /\b(analista|analyst|engenheir[oa]|engineer|desenvolvedor[a]?|developer|dev|consultor[a]?|operador[a]?|sdr|bdr|executiv[oa] de vendas|account executive)\b/i
      .test(texto)
  ) {
    return 'Campeao'
  }
  return 'Outro'
}

/** Extrai o identificador da empresa no LinkedIn (ex: /company/exemplo/ -> "exemplo"). */
export function extrairIdentificadorLinkedin(url?: string): string | null {
  if (!url) return null
  const m = url.match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#\s]+)/i)
  return m ? m[1].toLowerCase() : null
}

/**
 * A URL inteira da página, como o schema de `companies` do build 0.0.163 pede
 * (`https://www.linkedin.com/company/google`). Sem página, null: a busca usa o nome.
 */
function urlCompletaDaEmpresaNoLinkedin(url?: string): string | null {
  if (!url) return null
  const m = url.trim().match(/linkedin\.com\/(company|school|showcase)\/([^/?#\s]+)/i)
  if (!m) return null
  let id = m[2]
  try {
    id = decodeURIComponent(id)
  } catch {
    // O trecho da URL segue como veio.
  }
  return `https://www.linkedin.com/${m[1].toLowerCase()}/${id}`
}

function runIdDoErro(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('runId' in error)) return null
  const runId = (error as { runId: unknown }).runId
  return typeof runId === 'string' && runId.length > 0 ? runId : null
}

function textoLimpo(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

function registro(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  return valor as Record<string, unknown>
}

/** Cargo pelos campos do README do build 0.0.163 e do perfil curto real. Headline não entra. */
function cargoDocumentado(raw: Record<string, unknown>): string {
  for (const lista of [raw.currentPositions, raw.currentPosition]) {
    if (!Array.isArray(lista)) continue
    for (const item of lista) {
      const posicao = registro(item)
      if (!posicao) continue
      const titulo = textoLimpo(posicao.title) || textoLimpo(posicao.position)
      if (titulo) return titulo
    }
  }
  if (!Array.isArray(raw.experience)) return ''
  for (const item of raw.experience) {
    const experiencia = registro(item)
    const titulo = experiencia ? textoLimpo(experiencia.position) : ''
    if (titulo) return titulo
  }
  return ''
}

function localDocumentado(raw: Record<string, unknown>): string {
  const local = registro(raw.location)
  if (!local) return ''
  const texto = textoLimpo(local.linkedinText)
  if (texto) return texto
  const parsed = registro(local.parsed)
  return parsed ? textoLimpo(parsed.text) : ''
}

// Build 0.0.135, modo 'Profile details + email search ($10 per 1k)', confirmado nos runs 4uNBrExLfebRmntCf e
// JINU8l6sWgWksEUIH: `emails` no topo do perfil é uma lista de { email, status, qualityScore, validEmailServer,
// catchAllDomain, free }, ou null quando o actor não acha. `companyWebsites[i].validEmailServer` não é e-mail.
const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * O primeiro e-mail bem formado cujo status não é "invalid", ou null quando o perfil não tem e-mail.
 * `emails` fora do formato confirmado lança: é falha, não "não encontrado".
 */
function emailDoPerfil(raw: Record<string, unknown>): string | null {
  const emails = raw.emails
  if (emails === undefined || emails === null) return null
  if (!Array.isArray(emails)) {
    throw new Error('formato inesperado do campo emails na resposta da fonte')
  }
  for (const item of emails) {
    const entrada = registro(item)
    if (!entrada) continue
    const email = textoLimpo(entrada.email)
    if (!FORMATO_DE_EMAIL.test(email)) continue
    if (textoLimpo(entrada.status).toLowerCase() === 'invalid') continue
    return email
  }
  return null
}

export interface OpcoesApifyContatos {
  apify: Apify
  actorEmployees?: string
  actorProfile?: string
  maxCostUsdEmployees?: number
  maxCostUsdProfile?: number
}

/**
 * A origem que fica gravada junto do dado coletado e que o cliente pode ler (`fonte`, `lgpd.origem`): a descrição pública
 * do dado, nunca o fornecedor nem o actor, que ficam em `action_costs` e no log.
 */
export const ORIGEM_PUBLICA_DO_LINKEDIN = 'linkedin_publico'

/**
 * Provedor nativo baseado no Apify.
 * - Busca de colaboradores via `harvestapi~linkedin-company-employees`
 * - Revelação de contato via `harvestapi~linkedin-profile-scraper`
 */
export class ApifyProvedorDeContatos implements ProvedorDeContatos {
  readonly nome = 'apify'
  private readonly apify: Apify
  private readonly actorEmployees: string
  private readonly actorProfile: string
  private readonly maxCostEmployees: number
  private readonly maxCostProfile: number

  constructor(opcoes: OpcoesApifyContatos) {
    this.apify = opcoes.apify
    this.actorEmployees = opcoes.actorEmployees ?? 'harvestapi~linkedin-company-employees'
    this.actorProfile = opcoes.actorProfile ?? 'harvestapi~linkedin-profile-scraper'
    this.maxCostEmployees = opcoes.maxCostUsdEmployees ?? 0.25
    this.maxCostProfile = opcoes.maxCostUsdProfile ?? 0.05
  }

  async buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    // Build 0.0.163: companies é a URL inteira; o modo Short é o enum do schema; jobTitles filtra o cargo.
    const company = urlCompletaDaEmpresaNoLinkedin(empresa.linkedinUrl) ?? empresa.nome.trim()
    const maxItems = Math.min(Math.max(empresa.limite ?? 10, 1), 50)
    const input: Record<string, unknown> = {
      profileScraperMode: 'Short ($4 per 1k)',
      companies: [company],
      maxItems,
    }
    if (empresa.cargos && empresa.cargos.length > 0) {
      input.jobTitles = empresa.cargos
    }

    const anotar = async (runId: string | null) => {
      if (!empresa.medicao) return
      empresa.medicao.runId = runId
      if (!runId || !this.apify.custoDaExecucao) return
      try {
        empresa.medicao.costUsd = await this.apify.custoDaExecucao(runId)
      } catch {
        empresa.medicao.costUsd = null
      }
    }

    let exec: { runId: string | null; items: unknown[] }
    try {
      exec = await this.apify.run({
        actorId: this.actorEmployees,
        input,
        maxItems,
        maxTotalChargeUsd: this.maxCostEmployees,
        corpoTemDeSerLista: true,
      })
    } catch (e) {
      await anotar(runIdDoErro(e))
      if (e instanceof Error && e.message === 'O Apify não devolveu uma lista.') {
        throw new Error('A busca do comitê não devolveu uma lista de pessoas.')
      }
      throw e
    }

    await anotar(exec.runId)

    if (!Array.isArray(exec.items)) {
      throw new Error('A busca do comitê não devolveu uma lista de pessoas.')
    }

    const encontradas: PessoaEncontrada[] = []
    for (const item of exec.items) {
      const raw = registro(item)
      if (!raw) continue
      const nome = [textoLimpo(raw.firstName), textoLimpo(raw.lastName)].filter(Boolean).join(' ')
      if (!nome) continue

      const headline = textoLimpo(raw.headline)
      const cargo = cargoDocumentado(raw)
      const linkedinUrl = textoLimpo(raw.linkedinUrl)
      const localizacao = localDocumentado(raw)
      const foto = textoLimpo(raw.photo)

      encontradas.push({
        nome,
        cargo: cargo || undefined,
        headline: headline || undefined,
        linkedinUrl: linkedinUrl || undefined,
        localizacao: localizacao || undefined,
        foto: foto || undefined,
        persona: classificarPersona(cargo, headline),
        fonte: ORIGEM_PUBLICA_DO_LINKEDIN,
      })
    }

    return encontradas
  }

  async revelarContato(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
    medicao?: { runId: string | null; costUsd: number | null },
  ): Promise<DadoRevelado | null> {
    // Telefone: nenhum actor validado traz telefone. Sem LinkedIn, não há perfil para consultar.
    const perfil = pessoa.linkedinUrl?.trim()
    if (canal !== 'email' || !perfil) return null

    // Build 0.0.135: o modo com busca de e-mail é o enum do schema; `queries` aceita a URL do perfil.
    const input = {
      profileScraperMode: 'Profile details + email search ($10 per 1k)',
      queries: [perfil],
    }

    const anotar = async (runId: string | null) => {
      if (!medicao) return
      medicao.runId = runId
      if (!runId || !this.apify.custoDaExecucao) return
      try {
        medicao.costUsd = await this.apify.custoDaExecucao(runId)
      } catch {
        medicao.costUsd = null
      }
    }

    let exec: { runId: string | null; items: unknown[] }
    try {
      exec = await this.apify.run({
        actorId: this.actorProfile,
        input,
        maxItems: 1,
        maxTotalChargeUsd: this.maxCostProfile,
        corpoTemDeSerLista: true,
      })
    } catch (e) {
      await anotar(runIdDoErro(e))
      if (e instanceof Error && e.message === 'O Apify não devolveu uma lista.') {
        throw new Error('A busca do e-mail não devolveu uma lista de perfis.')
      }
      throw e
    }

    await anotar(exec.runId)

    if (!Array.isArray(exec.items)) {
      throw new Error('A busca do e-mail não devolveu uma lista de perfis.')
    }

    const item = registro(exec.items[0])
    const email = item ? emailDoPerfil(item) : null
    return email ? { canal: 'email', valor: email, fonte: ORIGEM_PUBLICA_DO_LINKEDIN } : null
  }
}

/** Stub para integração com Apollo (cliente conecta sua conta no Agente). */
export class ApolloProvedorStub implements ProvedorDeContatos {
  readonly nome = 'apollo'

  constructor(private readonly mockPessoas: PessoaEncontrada[] = []) {}

  async buscarPessoas(_empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    return this.mockPessoas
  }

  async revelarContato(
    _pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    if (canal === 'email') {
      return null
    }
    return null
  }
}

/** Stub para integração com Lusha (cliente conecta sua conta no Agente). */
export class LushaProvedorStub implements ProvedorDeContatos {
  readonly nome = 'lusha'

  constructor(private readonly mockPessoas: PessoaEncontrada[] = []) {}

  async buscarPessoas(_empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    return this.mockPessoas
  }

  async revelarContato(
    _pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    return null
  }
}

/** Stub para integração com Clay (cliente conecta sua conta no Agente). */
export class ClayProvedorStub implements ProvedorDeContatos {
  readonly nome = 'clay'

  constructor(private readonly mockPessoas: PessoaEncontrada[] = []) {}

  async buscarPessoas(_empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    return this.mockPessoas
  }

  async revelarContato(
    _pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    return null
  }
}

/**
 * Os fornecedores da cascata da Althius, na ordem em que a cascata os tenta. Só os actors do Apify: Apollo, Lusha e
 * Clay são do cliente e entram pelas Conexões, nunca aqui (decisão do Nan, 01/10/2026). Sem o Apify, a lista é vazia.
 */
export function fornecedoresDaCascata(deps: { apify?: Apify }): ProvedorDeContatos[] {
  return deps.apify ? [new ApifyProvedorDeContatos({ apify: deps.apify })] : []
}

/**
 * Cascata de provedores: tenta cada fornecedor registrado em ordem até
 * obter resultados ou esgotar a lista. Quem falha não para a cascata, mas a falha volta se nenhum achar.
 */
export class CascataProvedorDeContatos implements ProvedorDeContatos {
  readonly nome = 'cascata'

  constructor(private readonly provedores: ProvedorDeContatos[]) {}

  async buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    const pessoas = await this.primeiroQueAcha(async (provedor) => {
      const encontradas = await provedor.buscarPessoas(empresa)
      return encontradas?.length ? encontradas : null
    })
    return pessoas ?? []
  }

  revelarContato(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    return this.primeiroQueAcha(async (provedor) => await provedor.revelarContato?.(pessoa, canal) ?? null)
  }

  /** O primeiro fornecedor que acha, em ordem; null quando nenhum acha. A falha só volta se nenhum achar. */
  private async primeiroQueAcha<T>(tentar: (provedor: ProvedorDeContatos) => Promise<T | null>): Promise<T | null> {
    let falha: unknown = null
    for (const provedor of this.provedores) {
      try {
        const resultado = await tentar(provedor)
        if (resultado !== null) return resultado
      } catch (e) {
        falha ??= e
      }
    }
    if (falha) throw falha
    return null
  }
}
