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
      sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ALFA, owner_user_id: MARINA.id }],
      target_contacts: [],
    },
    rpcs,
  })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

describe('Kanban de prospecção no Workspace operacional', () => {
  it('a lista de Contas traz o estágio de list_prospecting_stages', async () => {
    const f = fonte({
      list_prospecting_stages: () => [
        { target_account_id: ALFA, stage: 'em_abordagem' },
        { target_account_id: BETA, stage: 'descoberta' },
      ],
    })
    expect((await f.contas()).map((c) => [c.nome, c.estagio])).toEqual([['Alfa', 'em_abordagem'], ['Beta', 'descoberta']])
  })

  it('se o estágio não puder ser lido, as Contas vêm sem ele em vez de a lista falhar', async () => {
    const [alfa] = await fonte({}).contas()
    expect(alfa.nome).toBe('Alfa')
    expect(alfa.estagio).toBeUndefined()
  })

  it('mover chama move_prospecting_stage e traduz as recusas', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      move_prospecting_stage: (p) => {
        chamadas.push(p)
        if (p.p_target_account_id === BETA) {
          throw Object.assign(new Error('only the responsible seller can move this target account'), { code: '42501' })
        }
        return true
      },
    })
    await f.moverEstagio!(ALFA, 'fit')
    expect(chamadas[0]).toEqual({ p_workspace_id: 'ws-norte', p_target_account_id: ALFA, p_stage: 'fit' })
    await expect(f.moverEstagio!(BETA, 'fit')).rejects.toThrow('Só o Vendedor responsável pode mover esta Conta no kanban.')
  })
})
