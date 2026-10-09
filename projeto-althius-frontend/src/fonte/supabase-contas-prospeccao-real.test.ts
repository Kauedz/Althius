import { expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

it('salva a URL de empresa LinkedIn no parâmetro próprio da RPC', async () => {
  let parametros: Record<string, unknown> = {}
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe({ id: 'user', email: 'user@test.com' }),
    tabelas: { sales_responsibilities: [], target_contacts: [] },
    rpcs: { save_target_account: (args) => {
      parametros = args
      return { id: 'conta', workspace_id: 'ws', name: 'TOTVS', canonical_url: args.p_url, domain: null, linkedin_url: args.p_linkedin_url }
    } },
  })
  const fonte = criarFonteDeContasSupabase(cliente, () => 'ws', () => 'user')
  await fonte.salvarConta!({ nome: 'TOTVS', url: 'https://www.linkedin.com/company/totvs' })
  expect(parametros.p_linkedin_url).toBe('https://www.linkedin.com/company/totvs')
})

it('comitê recebe a URL LinkedIn da Conta e descarta domínio LinkedIn legado', async () => {
  let body: Record<string, unknown> = {}
  const { cliente } = criarSupabaseFalso({ tabelas: { target_accounts: [{ id: 'conta', workspace_id: 'ws', name: 'TOTVS', linkedin_url: 'https://www.linkedin.com/company/totvs', domain: 'linkedin.com' }] },
    funcoes: { 'account-enrichment': args => { body = args; return { corpo: {} } } },
  })
  const fonte = criarFonteDeContasSupabase(cliente, () => 'ws', () => 'user')
  await fonte.buscarComite!('conta')
  expect(body.companyLinkedinUrl).toBe('https://www.linkedin.com/company/totvs')
  expect(body.companyDomain).toBeUndefined()
})
