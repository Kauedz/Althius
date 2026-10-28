// Antes dos testes: abre a sessão do QA e garante o ICP de teste.
//
// O login com senha de produção tem CAPTCHA (Turnstile), que um robô não resolve. Por isso a sessão sai de um link
// mágico gerado pelo Admin do Supabase Auth (service role) e verificado como o navegador faria. É a mesma sessão que
// o app recebe depois de um login; o formulário de entrada é conferido à parte, sem enviar.
import fs from 'node:fs'
import { request } from '@playwright/test'
import { ambiente, segredo } from './ambiente.js'
import { FIXTURE_ICP, NOME_DO_WORKSPACE_QA } from './fixture-icp.js'
import { ESTADO_DO_NAVEGADOR, PASTA_DA_SESSAO, salvarToken } from './sessao.js'

export default async function globalSetup() {
  const e = ambiente()
  const serviceRole = segredo('SUPABASE_SERVICE_ROLE_KEY')
  const http = await request.newContext()
  try {
    const link = await http.post(`${e.supabaseUrl}/auth/v1/admin/generate_link`, {
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
      data: { type: 'magiclink', email: e.email },
    })
    if (!link.ok()) throw new Error(`Não deu para gerar o link de acesso do QA (HTTP ${link.status()}).`)
    const corpoDoLink = (await link.json()) as { hashed_token?: string; properties?: { hashed_token?: string } }
    const tokenHash = corpoDoLink.hashed_token ?? corpoDoLink.properties?.hashed_token
    if (!tokenHash) throw new Error('O link de acesso do QA veio sem hashed_token.')

    const verificacao = await http.post(`${e.supabaseUrl}/auth/v1/verify`, {
      headers: { apikey: e.publishableKey },
      data: { type: 'magiclink', token_hash: tokenHash },
    })
    if (!verificacao.ok()) throw new Error(`Não deu para abrir a sessão do QA (HTTP ${verificacao.status()}).`)
    const sessao = (await verificacao.json()) as { access_token?: string }
    if (!sessao.access_token) throw new Error('A sessão do QA veio sem access_token.')

    fs.mkdirSync(PASTA_DA_SESSAO, { recursive: true, mode: 0o700 })
    // O supabase-js do app lê a sessão desta chave do localStorage.
    const estado = {
      cookies: [],
      origins: [{ origin: e.baseUrl, localStorage: [{ name: `sb-${e.projectRef}-auth-token`, value: JSON.stringify(sessao) }] }],
    }
    fs.writeFileSync(ESTADO_DO_NAVEGADOR, JSON.stringify(estado), { mode: 0o600 })
    salvarToken(sessao.access_token)

    await garantirIcpDoQa(http, e, sessao.access_token)
  } finally {
    await http.dispose()
  }
}

async function garantirIcpDoQa(http: Awaited<ReturnType<typeof request.newContext>>, e: ReturnType<typeof ambiente>, token: string) {
  const leitura = await http.post(`${e.supabaseUrl}/rest/v1/rpc/get_my_workspace_icp`, {
    headers: { apikey: e.publishableKey, Authorization: `Bearer ${token}` },
    data: { p_workspace_id: e.workspaceId },
  })
  if (!leitura.ok()) throw new Error(`Não deu para ler o ICP do Workspace QA (HTTP ${leitura.status()}).`)
  const icp = (await leitura.json()) as Record<string, unknown>
  const igual = icp.sector === FIXTURE_ICP.sector && icp.companySize === FIXTURE_ICP.companySize &&
    icp.geography === FIXTURE_ICP.geography
  if (igual) return

  // Ninguém na tela grava setor, porte e geografia ainda (ticket 16). Até lá, o fixture entra como uma NOVA versão do
  // ICP, só no Workspace QA: o SQL confere id e nome do Workspace e nunca altera nem apaga versão existente.
  const texto = (campo: string) => (typeof icp[campo] === 'string' ? (icp[campo] as string) : '')
  const sql = `insert into private.workspace_icp_versions
  (workspace_id, version, sector, company_size, geography, target_roles, free_text, o_que_vende, mini_icp, por_que_compram)
select w.id,
  coalesce((select max(v.version) from private.workspace_icp_versions v where v.workspace_id = w.id), 0) + 1,
  ${lit(FIXTURE_ICP.sector)}, ${lit(FIXTURE_ICP.companySize)}, ${lit(FIXTURE_ICP.geography)},
  ${lit(JSON.stringify(FIXTURE_ICP.targetRoles))}::jsonb, ${lit(texto('freeText'))},
  ${lit(texto('oQueVende'))}, ${lit(texto('miniIcp'))}, ${lit(texto('porQueCompram'))}
from public.workspaces w
where w.id = ${lit(e.workspaceId)}::uuid and w.name = ${lit(NOME_DO_WORKSPACE_QA)}`
  const resposta = await http.post(`https://api.supabase.com/v1/projects/${e.projectRef}/database/query`, {
    headers: { Authorization: `Bearer ${segredo('SUPABASE_ACCESS_TOKEN')}` },
    data: { query: sql },
  })
  if (!resposta.ok()) throw new Error(`Não deu para gravar o ICP de teste do QA (HTTP ${resposta.status()}).`)
}

function lit(valor: string) {
  return `'${valor.replace(/'/g, "''")}'`
}
