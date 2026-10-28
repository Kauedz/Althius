// Lê a configuração da suíte. Os valores vêm do ambiente ou de um arquivo KEY=VALUE fora do repositório
// (ALTHIUS_QA_ENV_FILE, padrão ~/.althius-qa.env). Nada aqui é impresso: os erros citam só o NOME da variável.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let carregado = false

function carregarArquivo() {
  if (carregado) return
  carregado = true
  const arquivo = process.env.ALTHIUS_QA_ENV_FILE ?? path.join(os.homedir(), '.althius-qa.env')
  if (!fs.existsSync(arquivo)) return
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    // O ambiente vale mais que o arquivo.
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}

export interface Ambiente {
  baseUrl: string
  supabaseUrl: string
  publishableKey: string
  email: string
  workspaceId: string
  projectRef: string
}

const OBRIGATORIAS = [
  'ALTHIUS_QA_BASE_URL',
  'ALTHIUS_QA_SUPABASE_URL',
  'ALTHIUS_QA_PUBLISHABLE_KEY',
  'ALTHIUS_QA_EMAIL',
  'ALTHIUS_QA_WORKSPACE_ID',
] as const

export function ambiente(): Ambiente {
  carregarArquivo()
  exigir(OBRIGATORIAS)
  const supabaseUrl = process.env.ALTHIUS_QA_SUPABASE_URL!.replace(/\/$/, '')
  return {
    baseUrl: process.env.ALTHIUS_QA_BASE_URL!.replace(/\/$/, ''),
    supabaseUrl,
    publishableKey: process.env.ALTHIUS_QA_PUBLISHABLE_KEY!,
    email: process.env.ALTHIUS_QA_EMAIL!,
    workspaceId: process.env.ALTHIUS_QA_WORKSPACE_ID!,
    projectRef: process.env.ALTHIUS_QA_PROJECT_REF ?? new URL(supabaseUrl).hostname.split('.')[0],
  }
}

/** Segredo usado só no globalSetup, nunca nos testes nem no navegador. */
export function segredo(nome: 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_ACCESS_TOKEN'): string {
  carregarArquivo()
  exigir([nome])
  return process.env[nome]!
}

function exigir(nomes: readonly string[]) {
  const faltando = nomes.filter((n) => !process.env[n])
  if (faltando.length) throw new Error(`Faltam variáveis da suíte de smoke: ${faltando.join(', ')}. Veja e2e/README.md.`)
}
