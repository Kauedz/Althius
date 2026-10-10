// Preenche o número da própria Conta remetente de WhatsApp (own_provider_id) nas contas já conectadas (fix-v1-email-whatsapp).
// Sem ele, a resposta de WhatsApp da v1 não se distingue de uma mensagem do titular e fica sem relação, e o núcleo do envio não
// consegue recusar um passo cujo Destino é o próprio número. O webhook também ensina o número na primeira mensagem de cada conta;
// este script adianta isso para as contas que ainda não receberam nada.
//
//   deno run --allow-env --allow-net scripts/unipile-numero-proprio.ts              # só mostra o que faria
//   deno run --allow-env --allow-net scripts/unipile-numero-proprio.ts --aplicar    # grava de verdade
//
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. A chave da Unipile vem da conexão ativa (Vault) e nunca é impressa.
import {
  createActiveConnectionLoader,
  createBridge,
  type RpcClient,
} from '../supabase/functions/_shared/unipile/index.ts'

const apply = Deno.args.includes('--aplicar')

function rpcViaRest(): RpcClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Informe SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  return {
    async rpc(fn, body = {}) {
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      return response.ok ? { data, error: null } : { data: null, error: { code: data?.code ?? String(response.status) } }
    },
  }
}

try {
  const rpc = rpcViaRest()
  const connection = await createActiveConnectionLoader({ rpc, env: Deno.env }).get()
  const bridge = createBridge(connection)
  const { accounts, complete } = await bridge.listAccounts()
  console.log(`Conexão: ${connection.name} (${connection.version}). Contas: ${accounts.length}${complete ? '' : ' (só a primeira página)'}`)
  let changed = 0
  for (const account of accounts.filter((item) => item.provider.toUpperCase() === 'WHATSAPP')) {
    if (!account.ownProviderId) {
      console.log(`- ${account.id}: a Unipile não disse o número desta conta; fica para o webhook.`)
      continue
    }
    const known = await rpc.rpc('sender_own_provider_id', { p_unipile_account_id: account.id })
    if (known.error) throw new Error(`leitura recusada (${(known.error as { code?: string }).code ?? 'erro'})`)
    if (known.data === account.ownProviderId) {
      console.log(`- ${account.id}: já tem o número.`)
      continue
    }
    if (!apply) {
      console.log(`- ${account.id}: gravaria o número (${account.ownProviderId.replace(/\d(?=\d{4})/g, '*')}). Use --aplicar.`)
      continue
    }
    const saved = await rpc.rpc('learn_sender_own_provider_id', { p_unipile_account_id: account.id, p_own_provider_id: account.ownProviderId })
    if (saved.error) throw new Error(`gravação recusada (${(saved.error as { code?: string }).code ?? 'erro'})`)
    changed += saved.data === true ? 1 : 0
    console.log(`- ${account.id}: ${saved.data === true ? 'número gravado' : 'conta desconhecida do banco, nada gravado'}.`)
  }
  console.log(apply ? `Pronto: ${changed} conta(s) atualizada(s).` : 'Simulação: nada foi gravado.')
} catch (error) {
  // Só o tipo da falha: nunca a chave, o corpo da resposta ou a configuração.
  console.error(`Falhou: ${error instanceof Error ? error.message : 'erro'}`)
  Deno.exit(1)
}
