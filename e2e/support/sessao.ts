// Onde o globalSetup deixa a sessão do QA. Fica em e2e/.auth/, fora do git.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PASTA_DA_SESSAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.auth')
export const ESTADO_DO_NAVEGADOR = path.join(PASTA_DA_SESSAO, 'qa.json')
const TOKEN = path.join(PASTA_DA_SESSAO, 'sessao.json')

export function salvarToken(accessToken: string) {
  fs.writeFileSync(TOKEN, JSON.stringify({ access_token: accessToken }), { mode: 0o600 })
}

export function tokenDoQa(): string {
  return (JSON.parse(fs.readFileSync(TOKEN, 'utf8')) as { access_token: string }).access_token
}

/** Contexto sem sessão, para as telas públicas. */
export const SEM_SESSAO = { cookies: [], origins: [] }
