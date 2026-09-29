// Leitura do CSV da importação de Contas e Contatos (CRM-07): codificação, delimitador, cabeçalho, registros e o
// mapeamento sugerido das colunas. Funções puras, sem rede: a Edge Function só orquestra o banco e o Storage.

export type Delimitador = ',' | ';' | '\t' | '|'

/** Por que o arquivo não pôde ser lido; o código vai para o lote e a tela o traduz. */
export type CodigoDeCsvInvalido =
  | 'empty_file'
  | 'malformed_csv'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'invalid_encoding'

export class CsvInvalido extends Error {
  constructor(readonly code: CodigoDeCsvInvalido) {
    super(code)
    this.name = 'CsvInvalido'
  }
}

/** Um registro do arquivo, com o número dele contando os registros vazios: o número da linha numa planilha. */
export interface Registro {
  line: number
  cells: string[]
}

/** Os campos que uma coluna do arquivo pode alimentar; os mesmos de private.import_fields no banco. */
export type Campo =
  | 'company_name'
  | 'company_url'
  | 'company_legal_identifier'
  | 'company_linkedin'
  | 'company_segment'
  | 'contact_name'
  | 'contact_role'
  | 'contact_email'
  | 'contact_phone'
  | 'contact_linkedin'

export interface CsvLido {
  delimiter: Delimitador
  hasHeader: boolean
  headers: string[]
  records: Registro[]
  mapping: Partial<Record<Campo, number>>
}

/** O cabeçalho mais 5.000 linhas de dados; o banco confere o mesmo limite. */
export const MAXIMO_DE_REGISTROS = 5001
export const MAXIMO_DE_COLUNAS = 100

const DELIMITADORES: Delimitador[] = [',', ';', '\t', '|']

/** UTF-8 (com ou sem BOM); se o arquivo não for UTF-8 válido, Windows-1252, como o Excel brasileiro o grava. */
export function decodificar(bytes: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      texto = new TextDecoder('windows-1252', { fatal: true }).decode(bytes)
    } catch {
      throw new CsvInvalido('invalid_encoding')
    }
  }
  return texto.charAt(0) === '﻿' ? texto.slice(1) : texto
}

interface OpcoesDaLeitura {
  /** Para de ler depois destes registros, contando os vazios. */
  limite?: number
  /** Aceita uma aspa que não fecha (a amostra do delimitador pode cortar o texto no meio de um campo). */
  tolerante?: boolean
}

/** Os registros do texto, com as aspas do CSV: `""` é uma aspa, e o campo entre aspas pode ter delimitador e quebra. */
function percorrer(
  texto: string,
  delimitador: string,
  { limite = Infinity, tolerante = false }: OpcoesDaLeitura = {},
): Registro[] {
  const registros: Registro[] = []
  let celulas: string[] = []
  let campo = ''
  let entreAspas = false
  let contador = 0
  let iniciouCampo = false

  const fecharCampo = () => {
    celulas.push(campo)
    campo = ''
    iniciouCampo = false
  }
  const fecharRegistro = () => {
    fecharCampo()
    contador++
    registros.push({ line: contador, cells: celulas })
    celulas = []
  }

  for (let i = 0; i < texto.length; i++) {
    if (registros.length >= limite) break
    const c = texto[i]
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreAspas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"' && !iniciouCampo) {
      entreAspas = true
      iniciouCampo = true
    } else if (c === delimitador) {
      fecharCampo()
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fecharRegistro()
    } else {
      campo += c
      iniciouCampo = true
    }
  }
  if (entreAspas && !tolerante) throw new CsvInvalido('malformed_csv')
  // O último registro sem quebra de linha no fim.
  if (registros.length < limite && (campo !== '' || celulas.length > 0 || iniciouCampo)) fecharRegistro()
  return registros
}

const vazio = (registro: Registro) => registro.cells.every((celula) => celula.trim() === '')

/** O delimitador que deixa a maior parte das primeiras linhas com o mesmo número de colunas, de duas ou mais. */
export function detectarDelimitador(texto: string): Delimitador {
  let melhor: { delimitador: Delimitador; pontos: number; colunas: number } = {
    delimitador: ',',
    pontos: 0,
    colunas: 0,
  }
  for (const delimitador of DELIMITADORES) {
    const amostra = percorrer(texto, delimitador, { limite: 20, tolerante: true }).filter((r) => !vazio(r))
    const frequencia = new Map<number, number>()
    for (const { cells } of amostra) frequencia.set(cells.length, (frequencia.get(cells.length) ?? 0) + 1)
    for (const [colunas, pontos] of frequencia) {
      if (colunas < 2) continue
      if (pontos > melhor.pontos || (pontos === melhor.pontos && colunas > melhor.colunas)) {
        melhor = { delimitador, pontos, colunas }
      }
    }
  }
  return melhor.delimitador
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ENDERECO = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i
const TELEFONE = /^\+?[\d\s().-]{8,}$/

/** A primeira linha é cabeçalho se nenhuma célula parece dado: e-mail, endereço de site ou telefone. */
export function pareceCabecalho(celulas: string[]): boolean {
  const preenchidas = celulas.map((celula) => celula.trim()).filter(Boolean)
  if (preenchidas.length === 0) return false
  return !preenchidas.some((celula) => EMAIL.test(celula) || ENDERECO.test(celula) || TELEFONE.test(celula))
}

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Em ordem: a primeira regra que serve fica com a coluna. "Email do contato" é e-mail antes de ser nome do contato, e
// "Site da empresa" é o site antes de ser o nome da empresa.
const REGRAS: [Campo, RegExp][] = [
  ['contact_email', /\b(e ?mail)\b/],
  ['contact_phone', /\b(telefone|celular|whatsapp|fone|phone|mobile)\b/],
  ['company_linkedin', /linkedin.*(empresa|company|organizacao)|(empresa|company|organizacao).*linkedin/],
  ['contact_linkedin', /linkedin/],
  ['company_legal_identifier', /\b(cnpj|identificador legal|tax id|registro)\b/],
  ['company_url', /\b(site|website|url|dominio|domain|web)\b/],
  ['company_segment', /\b(segmento|setor|industria|industry|segment)\b/],
  ['contact_role', /\b(cargo|funcao|title|role|posicao)\b/],
  ['contact_name', /\b(contato|contact|pessoa|responsavel)\b/],
  ['company_name', /\b(empresa|company|organizacao|razao social|conta|account)\b/],
]

/**
 * O mapeamento que os nomes das colunas sugerem, com cada coluna e cada campo usados uma vez. Um "Nome" sozinho é o
 * Contato quando o arquivo já tem uma coluna de empresa e, senão, a empresa.
 */
export function sugerirMapeamento(headers: string[]): Partial<Record<Campo, number>> {
  const mapeamento: Partial<Record<Campo, number>> = {}
  const usadas = new Set<number>()
  const normalizados = headers.map(normalizar)
  normalizados.forEach((cabecalho, coluna) => {
    const regra = REGRAS.find(([campo, padrao]) => mapeamento[campo] === undefined && padrao.test(cabecalho))
    if (regra) {
      mapeamento[regra[0]] = coluna
      usadas.add(coluna)
    }
  })
  const nome = normalizados.findIndex((cabecalho, coluna) =>
    !usadas.has(coluna) && (cabecalho === 'nome' || cabecalho === 'name')
  )
  if (nome >= 0) {
    if (mapeamento.company_name === undefined) mapeamento.company_name = nome
    else if (mapeamento.contact_name === undefined) mapeamento.contact_name = nome
  }
  return mapeamento
}

/** Lê o arquivo: codificação, delimitador, cabeçalho (ou colunas numeradas), registros não vazios e o mapeamento sugerido. */
export function lerCsv(bytes: Uint8Array): CsvLido {
  const texto = decodificar(bytes)
  if (texto.trim() === '') throw new CsvInvalido('empty_file')
  const delimiter = detectarDelimitador(texto)
  const todos = percorrer(texto, delimiter, { limite: MAXIMO_DE_REGISTROS + 1000 })
  const records = todos.filter((registro) => !vazio(registro))
  if (records.length === 0) throw new CsvInvalido('empty_file')
  if (records.length > MAXIMO_DE_REGISTROS) throw new CsvInvalido('too_many_rows')

  const colunas = Math.max(...records.map((registro) => registro.cells.length))
  if (colunas > MAXIMO_DE_COLUNAS) throw new CsvInvalido('too_many_columns')
  // As linhas mais curtas ficam completas: a célula que falta é vazia.
  for (const registro of records) {
    while (registro.cells.length < colunas) registro.cells.push('')
  }

  const hasHeader = pareceCabecalho(records[0].cells)
  const headers = Array.from({ length: colunas }, (_, coluna) => {
    const nome = hasHeader ? records[0].cells[coluna].trim() : ''
    return nome || `Coluna ${coluna + 1}`
  })
  return { delimiter, hasHeader, headers, records, mapping: hasHeader ? sugerirMapeamento(headers) : {} }
}
