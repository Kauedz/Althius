import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'
const GAMA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000003'

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
      target_accounts: [conta(ALFA, 'Alfa'), conta(BETA, 'Beta'), conta(GAMA, 'Gama')],
      sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ALFA, owner_user_id: MARINA.id }],
      target_contacts: [],
    },
    rpcs,
  })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

const FITS = () => [
  { target_account_id: ALFA, fit: 'fit', reason: 'Setor e porte do ICP' },
  { target_account_id: BETA, fit: 'nao_fit', reason: 'Só atende o setor público' },
]

describe('Aderência gravada no Workspace operacional', () => {
  it('a lista de Contas traz a Aderência e o motivo de list_account_fits; sem linha, sem avaliação', async () => {
    const contas = await fonte({ list_account_fits: FITS }).contas()
    expect(contas.map((c) => [c.nome, c.aderencia, c.motivoDaAderencia])).toEqual([
      ['Alfa', 'fit', 'Setor e porte do ICP'],
      ['Beta', 'nao-fit', 'Só atende o setor público'],
      ['Gama', undefined, undefined],
    ])
  })

  it('o detalhe da Conta também traz a Aderência', async () => {
    const f = fonte({ list_account_fits: FITS })
    const beta = await f.conta!(BETA)
    expect([beta.aderencia, beta.motivoDaAderencia]).toEqual(['nao-fit', 'Só atende o setor público'])
  })

  it('definir chama set_account_fit e traduz as recusas', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      set_account_fit: (p) => {
        chamadas.push(p)
        if (p.p_target_account_id === GAMA) {
          throw Object.assign(new Error('only the responsible seller can set the fit of this target account'), { code: '42501' })
        }
        if (p.p_fit === 'nao_fit' && !p.p_reason) {
          throw Object.assign(new Error('fit: a reason is required for nao_fit'), { code: '22023' })
        }
        return true
      },
    })
    await f.definirAderencia!(ALFA, 'nao-fit', 'Só atende o setor público')
    expect(chamadas[0]).toEqual({
      p_workspace_id: 'ws-norte', p_target_account_id: ALFA, p_fit: 'nao_fit', p_reason: 'Só atende o setor público',
    })
    await expect(f.definirAderencia!(ALFA, 'nao-fit', '')).rejects.toThrow('Diga o motivo do Não fit.')
    await expect(f.definirAderencia!(GAMA, 'fit', '')).rejects.toThrow('Só o Vendedor responsável define a Aderência desta Conta.')
  })
})
