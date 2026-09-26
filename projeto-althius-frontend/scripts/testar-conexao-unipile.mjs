// Testa de ponta a ponta a conexão de um canal real pela Unipile (canais-03): chama a Edge Function
// sender-accounts como o Vendedor responsável, abre o link de autenticação hospedada da Unipile, espera
// a pessoa concluir e confere o estado da Conta remetente depois do webhook account_status.
//
// As variáveis TESTE_* e VITE_* vêm do ambiente ou do .env.local, as mesmas do scripts/wizard-teste-real.sh.
// Rodar depois de scripts/wizard-unipile.sh configurar os segredos e o webhook.
//
//   npm run unipile:testar -- email
//   npm run unipile:testar -- whatsapp
//   npm run unipile:testar -- linkedin

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ARQUIVO_ENV = new URL('../.env.local', import.meta.url)
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile(ARQUIVO_ENV)

function exigir(nome) {
  const valor = process.env[nome]
  if (!valor) {
    console.error(`Falta ${nome} no ambiente e no .env.local: rode scripts/wizard-teste-real.sh antes.`)
    process.exit(1)
  }
  return valor
}

const canal = process.argv[2] ?? 'email'
if (!['email', 'whatsapp', 'linkedin'].includes(canal)) {
  console.error(`Canal "${canal}" não suportado: use email, whatsapp ou linkedin.`)
  process.exit(1)
}

const url = exigir('VITE_SUPABASE_URL')
const chavePublicavel = exigir('VITE_SUPABASE_PUBLISHABLE_KEY')
const workspaceId = exigir('TESTE_WORKSPACE_A')

const cliente = createClient(url, chavePublicavel, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: sessao, error: erroLogin } = await cliente.auth.signInWithPassword({
  email: exigir('TESTE_RESPONSAVEL_EMAIL'),
  password: exigir('TESTE_RESPONSAVEL_SENHA'),
})
if (erroLogin) {
  console.error(`Não foi possível entrar como Vendedor responsável: ${erroLogin.message}`)
  process.exit(1)
}
console.log(`Sessão real de ${sessao.user.email}.`)

const { data: conexao, error: erroConexao } = await cliente.functions.invoke('sender-accounts', {
  body: { action: 'connect', workspaceId, channel: canal },
})
if (erroConexao || !conexao?.url) {
  console.error(`A Edge Function sender-accounts não devolveu um link: ${erroConexao?.message ?? JSON.stringify(conexao)}`)
  console.error('Confira se UNIPILE_API_KEY, UNIPILE_WEBHOOK_SECRET e APP_ORIGIN estão nos segredos das Edge Functions.')
  await cliente.auth.signOut({ scope: 'local' })
  process.exit(1)
}

console.log(`\nAbra este link e conecte uma conta ${canal} de verdade (a Unipile expira o link em 15 minutos):`)
console.log(conexao.url)

for (let tentativa = 1; tentativa <= 12; tentativa += 1) {
  await new Promise((resolver) => setTimeout(resolver, 10_000))
  const { data: contas, error: erroLista } = await cliente.rpc('list_owned_sender_accounts', {
    p_workspace_id: workspaceId,
  })
  if (erroLista) {
    console.error(`Não foi possível consultar as Contas remetentes: ${erroLista.message}`)
    break
  }
  const conta = contas?.find((c) => c.channel === canal)
  console.log(`(${tentativa}/12) status: ${conta?.status ?? 'ainda sem Conta remetente'}${conta?.reconciliation_required ? ' · reconciliação pendente' : ''}`)
  if (conta?.status === 'ready' || conta?.status === 'reconnect_required') break
}

await cliente.auth.signOut({ scope: 'local' })
