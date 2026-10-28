// O resultado de cada Actor de descoberta numa forma só (`CandidataBruta`). Os campos lidos são os do README e do esquema do
// build mais recente de cada Actor (lidos na API pública do Apify em 01/10/2026); a execução real que os confirma é passo do
// Nan (`registro de Actors`: todos nascem "em teste"). Um campo que o Actor não trouxe fica de fora: nada é estimado.
import { dominio, objeto, objetos, primeiroTexto, recortar, texto } from '../signal-runner/adaptadores/comum.ts'
import type { CandidataBruta } from './pontuacao.ts'
import { ESTADOS, ufDe } from './regioes.ts'

export const ACTOR_LINKEDIN_EMPRESAS = 'harvestapi~linkedin-company-search'
export const ACTOR_RECEITA = 'johnatan029~cnpj-empresas-brasil-scraper'

// Sites que não identificam a empresa: redes sociais e páginas de links. A URL do site é a identidade da Conta-alvo, então
// uma empresa que só tem isso entra sem site, e a pessoa informa o endereço ao aceitar.
const SITES_QUE_NAO_SAO_DA_EMPRESA = new Set([
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com', 'linktr.ee',
  'wa.me', 'whatsapp.com', 'bit.ly', 'goo.gl', 'google.com', 'forms.gle', 'wixsite.com', 'blogspot.com', 'wordpress.com',
])

function siteDaEmpresa(valor: unknown): string | undefined {
  const host = dominio(valor)
  if (!host || !host.includes('.')) return undefined
  const base = host.split('.').slice(-2).join('.')
  if (SITES_QUE_NAO_SAO_DA_EMPRESA.has(host) || SITES_QUE_NAO_SAO_DA_EMPRESA.has(base)) return undefined
  return `https://${host}`
}

/** "MAGAZINE LUIZA S/A" vira "Magazine Luiza S/A"; um nome que já mistura maiúsculas e minúsculas fica como está. */
export function nomeLegivel(nome: string): string {
  const limpo = nome.replace(/\s+/g, ' ').trim()
  if (limpo !== limpo.toUpperCase() || limpo === limpo.toLowerCase()) return limpo
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'a', 'o'])
  return limpo
    .toLowerCase()
    .split(' ')
    .map((p, i) => {
      if (i > 0 && minusculas.has(p)) return p
      if (/^(s\/a|ltda|me|epp|sa)$/.test(p)) return p === 'ltda' ? 'Ltda' : p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
}

const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)

// LinkedIn: harvestapi/linkedin-company-search, modo completo.

function faixaDeFuncionarios(item: Record<string, unknown>): string | undefined {
  const faixa = objeto(item.employeeCountRange)
  const comeco = numero(faixa.start)
  const fim = numero(faixa.end)
  if (comeco === undefined) return undefined
  return fim === undefined ? `${comeco}+` : `${comeco}-${fim}`
}

/** As empresas do resultado do `harvestapi/linkedin-company-search`. */
export function candidatasDoLinkedin(itens: unknown[], sourceRunId?: string): CandidataBruta[] {
  return objetos(itens).flatMap((item): CandidataBruta[] => {
    const name = primeiroTexto(item, 'name')
    if (!name) return []
    const locais = Array.isArray(item.locations) ? item.locations.map(objeto) : []
    const sede = locais.find((l) => l.headquarter === true) ?? locais[0] ?? {}
    const lido = objeto(sede.parsed)
    const pais = primeiroTexto(lido, 'countryCode') || primeiroTexto(sede, 'country')
    const estado = primeiroTexto(lido, 'state') || primeiroTexto(lido, 'regionCode')
    const uf = pais.toUpperCase() === 'BR' ? ufDe(estado) ?? ufDe(primeiroTexto(lido, 'text')) ?? undefined : undefined
    const setores = (Array.isArray(item.industries) ? item.industries : []).map((i) => primeiroTexto(i, 'name')).filter(Boolean)
    const especialidades = (Array.isArray(item.specialities) ? item.specialities : [])
      .filter((e): e is string => typeof e === 'string' && !!e.trim())
      .map((e) => recortar(e, 60))
    const descricao = [primeiroTexto(item, 'tagline'), primeiroTexto(item, 'description')].filter(Boolean).join(' — ')
    const funcionarios = numero(item.employeeCount)
    return [{
      name: recortar(name, 300),
      website: siteDaEmpresa(item.website),
      linkedinUrl: primeiroTexto(item, 'linkedinUrl') || undefined,
      location: primeiroTexto(lido, 'text') || undefined,
      uf,
      city: primeiroTexto(lido, 'city') || undefined,
      country: pais || undefined,
      sector: setores.length ? recortar(setores.slice(0, 2).join(', '), 200) : undefined,
      sizeLabel: faixaDeFuncionarios(item),
      employeeCount: funcionarios,
      description: descricao ? recortar(descricao, 1000) : undefined,
      tags: especialidades.slice(0, 20),
      sourceRef: primeiroTexto(item, 'universalName', 'id') || undefined,
      sourceActor: ACTOR_LINKEDIN_EMPRESAS,
      sourceRunId,
      signals: [],
      outrosLocais: locais.map((l) => primeiroTexto(objeto(l.parsed), 'text')).filter(Boolean).slice(0, 20),
    }]
  })
}

// Receita Federal: johnatan029/cnpj-empresas-brasil-scraper, modo discovery.

const DIA_EM_MS = 24 * 60 * 60 * 1000

/** A data de abertura como ISO, ou nulo: aceita "2026-03-15", "15/03/2026" e ISO completo. */
function dataDeAbertura(valor: unknown): string | null {
  const bruto = texto(valor)
  if (!bruto) return null
  const brasileira = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const ms = Date.parse(brasileira ? `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}T00:00:00Z` : bruto)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** As empresas ativas do resultado do `johnatan029/cnpj-empresas-brasil-scraper` (modo discovery). */
export function candidatasDaReceita(itens: unknown[], agora: number, sourceRunId?: string): CandidataBruta[] {
  return objetos(itens).flatMap((item): CandidataBruta[] => {
    const situacao = primeiroTexto(item, 'situacaoCadastral')
    if (situacao && !/^ativa$/i.test(situacao)) return []
    const razao = primeiroTexto(item, 'razaoSocial')
    const fantasia = primeiroTexto(item, 'nomeFantasia')
    const name = nomeLegivel(fantasia || razao)
    const cnpj = primeiroTexto(item, 'cnpj')
    if (!name || !cnpj) return []
    const endereco = objeto(item.endereco)
    const uf = primeiroTexto(endereco, 'uf').toUpperCase()
    const municipio = primeiroTexto(endereco, 'municipio')
    const cidade = municipio ? nomeLegivel(municipio) : undefined
    const atividade = primeiroTexto(item, 'cnaeDescricao')
    const abertura = dataDeAbertura(item.dataAbertura)
    const recente = abertura !== null && Date.parse(abertura) <= agora && agora - Date.parse(abertura) <= 365 * DIA_EM_MS
    const data = recente ? new Date(abertura!) : null
    return [{
      name: recortar(name, 300),
      cnpj,
      location: [cidade, ESTADOS[uf] ? uf : ''].filter(Boolean).join(', ') || undefined,
      uf: ESTADOS[uf] ? uf : undefined,
      city: cidade,
      country: 'BR',
      sector: atividade ? recortar(atividade, 200) : undefined,
      cnae: atividade ? recortar(atividade, 200) : undefined,
      sizeLabel: primeiroTexto(item, 'porte').toUpperCase() || undefined,
      description: atividade ? recortar(atividade, 1000) : undefined,
      tags: [],
      sourceRef: cnpj,
      sourceActor: ACTOR_RECEITA,
      sourceRunId,
      signals: recente && data
        ? [{
          texto: `Empresa aberta em ${MESES[data.getUTCMonth()]}/${data.getUTCFullYear()}.`,
          fonte: 'Receita Federal',
          data: abertura!,
        }]
        : [],
    }]
  })
}
