// O contrato único da cascata de contatos (enriquecimento-em-cascata, tickets 01 e 02):
// - Busca de pessoas da empresa para formação do comitê de compra (Decisor, Influenciador, Campeão);
// - Revelação de e-mail e telefone;
// - Provedores plugáveis (Apify como base nativa; Apollo, Lusha e Clay como stubs prontos para os Agentes);
// - Cascata que percorre provedores na ordem configurada.
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

export interface FiltrosEmpresaParaBusca {
  nome: string
  linkedinUrl?: string
  dominio?: string
  cargos?: string[]
  personas?: string[]
  limite?: number
}

export interface ProvedorDeContatos {
  readonly nome: string
  buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]>
  revelarContato?(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
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

export interface OpcoesApifyContatos {
  apify: Apify
  actorEmployees?: string
  actorProfile?: string
  maxCostUsdEmployees?: number
  maxCostUsdProfile?: number
}

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
    const companyKey = extrairIdentificadorLinkedin(empresa.linkedinUrl) ?? empresa.nome.trim()
    const maxItems = Math.min(Math.max(empresa.limite ?? 10, 1), 50)

    const input: Record<string, unknown> = {
      companies: [companyKey],
      maxItems,
    }
    if (empresa.cargos && empresa.cargos.length > 0) {
      input.jobTitles = empresa.cargos
    }

    try {
      const exec = await this.apify.run({
        actorId: this.actorEmployees,
        input,
        maxItems,
        maxTotalChargeUsd: this.maxCostEmployees,
      })

      const itens = Array.isArray(exec.items) ? exec.items : []
      const encontradas: PessoaEncontrada[] = []

      for (const item of itens) {
        if (!item || typeof item !== 'object') continue
        const raw = item as Record<string, unknown>
        const firstName = typeof raw.firstName === 'string' ? raw.firstName.trim() : ''
        const lastName = typeof raw.lastName === 'string' ? raw.lastName.trim() : ''
        const rawName = typeof raw.name === 'string' ? raw.name.trim() : ''
        const nome = [firstName, lastName].filter(Boolean).join(' ') || rawName
        if (!nome) continue

        const headline = typeof raw.headline === 'string' ? raw.headline.trim() : ''
        const cargo = typeof raw.currentPosition === 'string'
          ? raw.currentPosition.trim()
          : (typeof raw.title === 'string' ? raw.title.trim() : '')
        const linkedinUrl = typeof raw.linkedinUrl === 'string'
          ? raw.linkedinUrl.trim()
          : (typeof raw.profileUrl === 'string' ? raw.profileUrl.trim() : undefined)
        const location = typeof raw.location === 'string' ? raw.location.trim() : undefined
        const photo = typeof raw.photo === 'string'
          ? raw.photo.trim()
          : (typeof raw.pictureUrl === 'string' ? raw.pictureUrl.trim() : undefined)

        const persona = classificarPersona(cargo, headline)

        encontradas.push({
          nome,
          cargo: cargo || headline || undefined,
          headline: headline || undefined,
          linkedinUrl,
          localizacao: location,
          foto: photo,
          persona,
          fonte: 'apify:harvestapi~linkedin-company-employees',
        })
      }

      return encontradas
    } catch {
      return []
    }
  }

  async revelarContato(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    if (!pessoa.linkedinUrl) return null

    const input = {
      profileUrls: [pessoa.linkedinUrl],
      findEmail: canal === 'email',
    }

    try {
      const exec = await this.apify.run({
        actorId: this.actorProfile,
        input,
        maxItems: 1,
        maxTotalChargeUsd: this.maxCostProfile,
      })

      const item = Array.isArray(exec.items) && exec.items[0] ? (exec.items[0] as Record<string, unknown>) : null
      if (!item) return null

      if (canal === 'email') {
        const email = typeof item.email === 'string'
          ? item.email.trim()
          : (typeof item.personalEmail === 'string'
            ? item.personalEmail.trim()
            : (typeof item.workEmail === 'string' ? item.workEmail.trim() : null))

        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { canal: 'email', valor: email.toLowerCase(), confianca: 90, fonte: 'apify:harvestapi~linkedin-profile-scraper' }
        }
      }

      if (canal === 'telefone') {
        const phone = typeof item.phone === 'string'
          ? item.phone.trim()
          : (typeof item.mobilePhone === 'string'
            ? item.mobilePhone.trim()
            : (typeof item.phoneNumber === 'string' ? item.phoneNumber.trim() : null))

        if (phone && phone.replace(/\D/g, '').length >= 8) {
          return { canal: 'telefone', valor: phone, confianca: 85, fonte: 'apify:harvestapi~linkedin-profile-scraper' }
        }
      }

      return null
    } catch {
      return null
    }
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
 * Cascata de provedores: tenta cada fornecedor registrado em ordem até
 * obter resultados ou esgotar a lista.
 */
export class CascataProvedorDeContatos implements ProvedorDeContatos {
  readonly nome = 'cascata'

  constructor(private readonly provedores: ProvedorDeContatos[]) {}

  async buscarPessoas(empresa: FiltrosEmpresaParaBusca): Promise<PessoaEncontrada[]> {
    for (const provedor of this.provedores) {
      try {
        const pessoas = await provedor.buscarPessoas(empresa)
        if (pessoas && pessoas.length > 0) {
          return pessoas
        }
      } catch {
        // Continua para o próximo fornecedor da cascata
        continue
      }
    }
    return []
  }

  async revelarContato(
    pessoa: { nome: string; linkedinUrl?: string; empresa?: string },
    canal: 'email' | 'telefone',
  ): Promise<DadoRevelado | null> {
    for (const provedor of this.provedores) {
      if (!provedor.revelarContato) continue
      try {
        const resultado = await provedor.revelarContato(pessoa, canal)
        if (resultado) {
          return resultado
        }
      } catch {
        continue
      }
    }
    return null
  }
}
