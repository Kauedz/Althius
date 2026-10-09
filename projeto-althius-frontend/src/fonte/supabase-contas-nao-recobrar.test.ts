import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSimulada } from './simulada-contas'
import { criarFonteDeContasSupabase } from './supabase-contas'

// Nunca cobrar de novo o que já foi descoberto (decisão do Renan, 09/10/2026): a Fonte leva à tela o que o servidor
// disse que é novo, o que já foi encontrado e a cotação 0.

const SESSAO = sessaoDe({ id: 'user', email: 'user@test.com' })

describe('Fonte operacional: o que já foi descoberto não é cobrado de novo', () => {
  it('a cotação de quem já tem e-mail é 0 e já encontrada', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: SESSAO,
      rpcs: { quote_reveal_contact: () => [{ credits: 0, current_balance: 11, can_reveal: true, already_known: true }] },
    })
    const fonte = criarFonteDeContasSupabase(cliente, () => 'ws', () => 'user')

    expect(await fonte.cotarRevelacaoContato!('contato', 'email')).toEqual({
      creditos: 0,
      saldo: 11,
      podeRevelar: true,
      jaEncontrado: true,
    })
  })

  it('o e-mail que já existia volta com jaExistia e 0 crédito', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: SESSAO,
      funcoes: {
        'account-enrichment': () => ({
          corpo: { sucesso: true, canal: 'email', valor: 'gilsomar@totvs.com.br', creditosDebitados: 0, jaExistia: true },
        }),
      },
    })
    const fonte = criarFonteDeContasSupabase(cliente, () => 'ws', () => 'user')

    expect(await fonte.revelarContato!('contato', 'email')).toEqual({
      sucesso: true,
      valor: 'gilsomar@totvs.com.br',
      creditosDebitados: 0,
      jaExistia: true,
    })
  })

  it('a busca do comitê devolve as novas e as já encontradas', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: SESSAO,
      tabelas: { target_accounts: [{ id: 'conta', workspace_id: 'ws', name: 'TOTVS', linkedin_url: 'https://www.linkedin.com/company/totvs', domain: null }] },
      funcoes: {
        'account-enrichment': () => ({ corpo: { contactsFound: 1, contactsAdded: 0, contactsAlreadyKnown: 1, proposed: [] } }),
      },
    })
    const fonte = criarFonteDeContasSupabase(cliente, () => 'ws', () => 'user')

    expect(await fonte.buscarComite!('conta')).toEqual({ encontradas: 1, novas: 0, jaEncontradas: 1 })
  })
})

describe('Demonstração: o que já foi descoberto não é cobrado de novo', () => {
  it('revelar de novo devolve o e-mail que já existe, sem custo, e a cotação passa a 0', async () => {
    const fonte = criarFonteDeContasSimulada({ atrasoMs: 0 })

    const primeira = await fonte.revelarContato!('contato-openai-1', 'email')
    const segunda = await fonte.revelarContato!('contato-openai-1', 'email')

    expect(primeira.creditosDebitados).toBe(2)
    expect(segunda).toEqual({ sucesso: true, valor: primeira.valor, creditosDebitados: 0, jaExistia: true })
    expect(await fonte.cotarRevelacaoContato!('contato-openai-1', 'email')).toMatchObject({ creditos: 0, jaEncontrado: true })
  })

  it('buscar o comitê de novo traz a mesma pessoa como já encontrada', async () => {
    const fonte = criarFonteDeContasSimulada({ atrasoMs: 0 })

    expect(await fonte.buscarComite!('openai')).toEqual({ encontradas: 1, novas: 1, jaEncontradas: 0 })
    expect(await fonte.buscarComite!('openai')).toEqual({ encontradas: 1, novas: 0, jaEncontradas: 1 })
  })
})
