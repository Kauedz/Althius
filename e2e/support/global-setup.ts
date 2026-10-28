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

  // Desde o ticket sinais-first 16, a mesma RPC da tela grava setor, porte e geografia, com a sessão do QA
  // (Administrador do Workspace QA). Ela cria uma NOVA versão do ICP e nunca altera nem apaga versão existente.
  const gravacao = await http.post(`${e.supabaseUrl}/rest/v1/rpc/save_my_workspace_icp_fields`, {
    headers: { apikey: e.publishableKey, Authorization: `Bearer ${token}` },
    data: {
      p_workspace_id: e.workspaceId,
      p_sector: FIXTURE_ICP.sector,
      p_company_size: FIXTURE_ICP.companySize,
      p_geography: FIXTURE_ICP.geography,
    },
  })
  if (!gravacao.ok()) throw new Error(`Não deu para gravar o ICP de teste do QA (HTTP ${gravacao.status()}).`)
}
