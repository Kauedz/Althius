// Os estados do Brasil, para ler "SP", "São Paulo" ou "State of São Paulo" como a mesma região e para escrever o local
// que o LinkedIn entende. Nada aqui fala com a rede.
import { normalizar } from '../signal-runner/adaptadores/comum.ts'

export const ESTADOS: Readonly<Record<string, string>> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

export const CAPITAIS: Readonly<Record<string, string>> = {
  'Rio Branco': 'AC',
  'Maceió': 'AL',
  'Macapá': 'AP',
  'Manaus': 'AM',
  'Salvador': 'BA',
  'Fortaleza': 'CE',
  'Brasília': 'DF',
  'Vitória': 'ES',
  'Goiânia': 'GO',
  'São Luís': 'MA',
  'Cuiabá': 'MT',
  'Campo Grande': 'MS',
  'Belo Horizonte': 'MG',
  'Belém': 'PA',
  'João Pessoa': 'PB',
  'Curitiba': 'PR',
  'Recife': 'PE',
  'Teresina': 'PI',
  'Rio de Janeiro': 'RJ',
  'Natal': 'RN',
  'Porto Alegre': 'RS',
  'Porto Velho': 'RO',
  'Boa Vista': 'RR',
  'Florianópolis': 'SC',
  'São Paulo': 'SP',
  'Aracaju': 'SE',
  'Palmas': 'TO',
}

// Do nome mais longo ao mais curto: "Mato Grosso do Sul" antes de "Mato Grosso".
const POR_NOME = Object.entries(ESTADOS)
  .map(([uf, nome]) => ({ uf, nome: normalizar(nome) }))
  .sort((a, b) => b.nome.length - a.nome.length)

/**
 * O estado (a sigla) que o texto cita, ou nulo. Aceita a sigla sozinha ("sp"), o nome ("São Paulo", "State of Sao Paulo",
 * "Campinas, São Paulo, Brasil") e a sigla em maiúsculas no meio do texto ("Campinas, SP"). A sigla em minúsculas no
 * meio de uma frase não conta, para "es" ou "pa" não virarem estado.
 */
export function ufDe(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const bruto = valor.trim()
  if (!bruto) return null
  const sozinho = bruto.toUpperCase()
  if (/^[A-Za-z]{2}$/.test(bruto) && ESTADOS[sozinho]) return sozinho
  const texto = ` ${normalizar(bruto)} `
  for (const { uf, nome } of POR_NOME) {
    if (!texto.includes(` ${nome} `)) continue
    // "Pará" sem acento é também a preposição "para": só vale sozinho, com acento ou depois de vírgula, "estado do/of".
    if (uf === 'PA' && !/pará/i.test(bruto) && texto.trim() !== 'para' && !/(,|\bof|\bdo)\s*para\b/i.test(bruto)) continue
    return uf
  }
  for (const parte of bruto.split(/[^A-Za-zÀ-ÿ]+/)) {
    if (parte.length === 2 && parte === parte.toUpperCase() && ESTADOS[parte]) return parte
  }
  return null
}

/** Se o texto é o Brasil ("Brasil", "Brazil", "BR"). */
export function ehBrasil(valor: unknown): boolean {
  const texto = normalizar(valor)
  return texto === 'brasil' || texto === 'brazil' || texto === 'br'
}

/** O local como o filtro do LinkedIn o entende: "São Paulo, Brazil", "Brazil", ou o texto com ", Brazil" no fim. */
export function localDoLinkedin(regiao: string): string {
  const uf = ufDe(regiao)
  if (uf && normalizar(regiao) !== normalizar(ESTADOS[uf]) && !/^[A-Za-z]{2}$/.test(regiao.trim())) {
    // "Campinas, SP": o estado vira o nome, e o país entra no fim.
    return `${regiao.replace(/[,\s]+[A-Za-z]{2}$/, '').trim()}, ${ESTADOS[uf]}, Brazil`
  }
  if (uf) return `${ESTADOS[uf]}, Brazil`
  if (ehBrasil(regiao)) return 'Brazil'
  return /brazil|brasil/i.test(regiao) ? regiao.trim() : `${regiao.trim()}, Brazil`
}
