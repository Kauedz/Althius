import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'

function conta(id: string, nome: string) {
  return {
    id, workspace_id: 'ws-norte', name: nome, canonical_url: `https://${nome.toLowerCase()}.com.br`,
    domain: `${nome.toLowerCase()}.com.br`, linkedin_url: null, segment: null, last_interaction_at: null,
  }
}

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      target_accounts: [conta(ALFA, 'Alfa'), conta(BETA, 'Beta')],
      sales_responsibilities: [],
      target_contacts: [],
    },
    rpcs,
  })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

describe('Sinais reais nas Contas do Workspace operacional', () => {
  it('a Conta com Sinal válido é Quente, com a contagem e o último Sinal', async () => {
    const f = fonte({
      list_account_signals: () => [
        { target_account_id: ALFA, valid_signals: 2, hot: true, last_phrase: 'Abriu vaga de engenheiro de dados', last_fired_at: '2026-09-29T10:00:00Z' },
        { target_account_id: BETA, valid_signals: 0, hot: false, last_phrase: 'Vaga antiga', last_fired_at: '2026-08-01T10:00:00Z' },
      ],
    })
    const [alfa, beta] = await f.contas()
    expect(alfa).toMatchObject({ quente: true, totalSinaisValidos: 2 })
    expect(alfa.ultimoSinal).toMatchObject({ contaId: ALFA, frase: 'Abriu vaga de engenheiro de dados', data: '2026-09-29T10:00:00Z' })
    expect(beta).toMatchObject({ quente: false, totalSinaisValidos: 0 })
    expect(beta.ultimoSinal?.frase).toBe('Vaga antiga')
  })

  it('a Conta sem Sinal nenhum não é Quente e não tem último Sinal', async () => {
    const f = fonte({ list_account_signals: () => [] })
    const [alfa] = await f.contas()
    expect(alfa).toMatchObject({ quente: false, totalSinaisValidos: 0 })
    expect(alfa.ultimoSinal).toBeUndefined()
  })

  it('se os Sinais não puderem ser lidos, a lista de Contas aparece sem eles', async () => {
    const [alfa] = await fonte({}).contas()
    expect(alfa.nome).toBe('Alfa')
    expect(alfa.quente).toBeUndefined()
  })

  it('o detalhe da Conta traz o Quente também', async () => {
    const f = fonte({
      list_account_signals: () => [
        { target_account_id: ALFA, valid_signals: 1, hot: true, last_phrase: 'Vaga', last_fired_at: '2026-09-29T10:00:00Z' },
      ],
    })
    expect(await f.conta(ALFA)).toMatchObject({ quente: true, totalSinaisValidos: 1 })
  })
})
