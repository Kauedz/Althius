// O contrato único da cascata de contatos (enriquecimento-em-cascata, tickets 01 e 02):
// - Busca de pessoas da empresa para formação do comitê de compra (Decisor, Influenciador, Campeão);
// - Revelação de e-mail e telefone;
// - Provedores plugáveis (Apify como base nativa; Apollo e CRM como conexões do Workspace);
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
 * Uma ferramenta da Integração do Cliente, já com o Workspace, a pessoa e a autorização resolvidos pela camada de
 * Integrações (`integration-access`). Devolve o resultado da ferramenta; lança quando a chamada não deu certo. Nunca recebe
 * nem devolve segredo.
 */
export type ChamarFerramentaDoCliente = (ferramenta: string, argumentos: Record<string, unknown>) => Promise<unknown>

/**
 * As fontes que são conexões do Cliente (Apollo, CRM): o dado achado por elas não cobra Créditos Althius, porque o Cliente
 * já paga o próprio provedor. O banco usa a mesma regra (`private.is_customer_contact_source`).
 */
export const FONTES_DO_CLIENTE = ['apollo', 'crm'] as const
export function fonteDoCliente(fonte: string | null | undefined): boolean {
  const f = (fonte ?? '').trim().toLowerCase()
  return FONTES_DO_CLIENTE.some((prefixo) => f === prefixo || f.startsWith(`${prefixo}:`))
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

/** O conteúdo de uma ferramenta MCP: o estruturado, ou o primeiro texto que for JSON. */
function corpoDaFerramenta(resposta: unknown): Record<string, unknown> {
  if (!resposta || typeof resposta !== 'object') return {}
  const r = resposta as Record<string, unknown>
  if (r.estruturado && typeof r.estruturado === 'object') return r.estruturado as Record<string, unknown>
  if (Array.isArray(r.conteudo)) {
    for (const item of r.conteudo) {
      const texto = item && typeof item === 'object' ? (item as Record<string, unknown>).text : undefined
      if (typeof texto !== 'string') continue
      try {
        const lido = JSON.parse(texto)
        if (lido && typeof lido === 'object') return lido as Record<string, unknown>
      } catch {
        // Texto que não é JSON: segue para o próximo.
      }
    }
    return {}
  }
  return r
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * O Apollo conectado pelo Workspace (MCP do Apollo, https://docs.apollo.io/docs/apollo-mcp). A busca de pessoas
 * (`apollo_people_search`) não gasta crédito do Apollo; a revelação (`apollo_people_enrichment`) gasta o do Cliente. A
 * fonte é `apollo`: o dado não cobra Créditos Althius. Telefone fica fora, como no resto do produto.
 */
export class ApolloProvedorDeContatos implements ProvedorDeContatos {
  readonly nome = 'apollo'

  constructor(private readonly chamar: ChamarFerramentaDoCliente) {}

  async buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    const argumentos: Record<string, unknown> = { per_page: Math.min(Math.max(empresa.limite ?? 10, 1), 30), page: 1 }
    if (empresa.dominio) argumentos.q_organization_domains_list = [empresa.dominio]
    else argumentos.q_keywords = empresa.nome
    if (empresa.cargos?.length) argumentos.person_titles = empresa.cargos
    const corpo = corpoDaFerramenta(await this.chamar('apollo_people_search', argumentos))
    const pessoas = Array.isArray(corpo.people) ? corpo.people : Array.isArray(corpo.contacts) ? corpo.contacts : []
    return pessoas.flatMap((raw): PessoaEncontrada[] => {
      if (!raw || typeof raw !== 'object') return []
      const p = raw as Record<string, unknown>
      const nome = texto(p.name) ?? [texto(p.first_name), texto(p.last_name)].filter(Boolean).join(' ')
      if (!nome) return []
      const cargo = texto(p.title)
      const local = [texto(p.city), texto(p.state), texto(p.country)].filter(Boolean).join(', ')
      return [{
        nome,
        cargo,
        headline: texto(p.headline),
        linkedinUrl: texto(p.linkedin_url),
        localizacao: local || undefined,
        foto: texto(p.photo_url),
        persona: classificarPersona(cargo),
        fonte: 'apollo',
      }]
    })
  }

  async revelarContato(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    if (canal !== 'email') return null
    const argumentos: Record<string, unknown> = { name: pessoa.nome, reveal_personal_emails: false, reveal_phone_number: false }
    if (pessoa.linkedinUrl) argumentos.linkedin_url = pessoa.linkedinUrl
    if (pessoa.empresa) argumentos.organization_name = pessoa.empresa
    const corpo = corpoDaFerramenta(await this.chamar('apollo_people_enrichment', argumentos))
    const pessoaApollo = corpo.person && typeof corpo.person === 'object' ? corpo.person as Record<string, unknown> : corpo
    const valor = texto(pessoaApollo.email)
    // O Apollo devolve um marcador quando não libera o e-mail; só e-mail de verdade conta.
    if (!valor || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor) || /email_not_unlocked/i.test(valor)) return null
    return { canal, valor, fonte: 'apollo' }
  }
}

/** Stub para testes: devolve as pessoas dadas como vieram, sem rede, e não revela nada. */
export class ApolloProvedorStub implements ProvedorDeContatos {
  readonly nome = 'apollo'

  constructor(private readonly mockPessoas: PessoaEncontrada[] = []) {}

  buscarPessoas(_empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    return Promise.resolve(this.mockPessoas)
  }

  revelarContato(): Promise<DadoRevelado | null> {
    return Promise.resolve(null)
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
 * Os fornecedores da cascata, na ordem em que ela os tenta: o Apify da Althius é a base; o Apollo e o CRM conectados pelo
 * Workspace entram depois, só quando o Cliente os conectou (decisão 3 do plano "Como o Althius deve ser"). Sem nenhum, a
 * lista é vazia.
 */
export function fornecedoresDaCascata(deps: { apify?: Apify; apollo?: ProvedorDeContatos; crm?: ProvedorDeContatos }): ProvedorDeContatos[] {
  return [
    ...(deps.apify ? [new ApifyProvedorDeContatos({ apify: deps.apify })] : []),
    ...(deps.apollo ? [deps.apollo] : []),
    ...(deps.crm ? [deps.crm] : []),
  ]
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
    medicao?: { runId: string | null; costUsd: number | null },
  ): Promise<DadoRevelado | null> {
    return this.primeiroQueAcha(async (provedor) => await provedor.revelarContato?.(pessoa, canal, medicao) ?? null)
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
