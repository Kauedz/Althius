import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ID_DA_ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DA_MARIA = '7a1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DO_JOAO = '7a1c2d3e-4a5b-4c6d-8e7f-000000000002'
const ID_DO_RUI = '7a1c2d3e-4a5b-4c6d-8e7f-000000000003'

/** Um Contato com Vínculo ativo, como a visão `target_contacts` o devolve (com a correção do canais-06). */
function contatoNoBanco(id: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id, workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, link_id: `vinculo-${id}`, name: nome, role: null,
    email: null, phone: null, whatsapp: null, linkedin: null, linkedin_identity: null, is_real: true,
    last_interaction_at: null, ...extra,
  }
}

function fonteComContatos(contatos: Record<string, unknown>[]) {
  const tabelas: Record<string, Record<string, unknown>[]> = {
    target_accounts: [{
      id: ID_DA_ALFA, workspace_id: 'ws-norte', name: 'Alfa', canonical_url: 'https://alfa.com.br', domain: 'alfa.com.br',
      legal_identifier: null, linkedin_url: null, segment: null, created_by: MARINA.id, last_interaction_at: null,
      created_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T12:00:00Z',
    }],
    sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id }],
    account_interactions: [],
    target_contacts: contatos,
  }
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
}

describe('O telefone principal e a marca de WhatsApp nas listas de Contatos', () => {
  it('só mostra o número como WhatsApp quando o Contato o marcou; sem a marca, o telefone segue existindo', async () => {
    const fonte = fonteComContatos([
      contatoNoBanco(ID_DA_MARIA, 'Maria Souza', { phone: '+5511988887777', whatsapp: '+5511988887777' }),
      // A visão devolve `whatsapp` nulo quando a marca está desligada, mas o telefone continua em `phone`.
      contatoNoBanco(ID_DO_JOAO, 'João Lima', { phone: '+551133334444', whatsapp: null }),
      contatoNoBanco(ID_DO_RUI, 'Rui'),
    ])

    const contatos = await fonte.contatosDaConta(ID_DA_ALFA)
    const contato = (nome: string) => contatos.find((c) => c.nome === nome)!
    const [maria, joao, rui] = [contato('Maria Souza'), contato('João Lima'), contato('Rui')]

    expect(maria).toMatchObject({ whatsapp: '+5511988887777', canais: { telefone: true } })
    expect(maria.telefoneSemWhatsApp).toBeUndefined()
    expect(joao.whatsapp).toBeUndefined()
    expect(joao).toMatchObject({ telefoneSemWhatsApp: '+551133334444', canais: { telefone: true } })
    expect(rui).toMatchObject({ canais: { telefone: false } })
    expect(rui.whatsapp).toBeUndefined()
    expect(rui.telefoneSemWhatsApp).toBeUndefined()
  })
})
