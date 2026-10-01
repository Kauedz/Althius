import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: { target_accounts: [], sales_responsibilities: [], target_contacts: [] },
    rpcs,
  })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => ANA.id, () => true)
}

const recusa = (mensagem: string, code = 'P0001') => () => {
  throw Object.assign(new Error(mensagem), { code })
}

describe('Transferir a responsabilidade de uma Conta (CRM-06)', () => {
  it('transferir chama transfer_target_account_responsibility com a Conta, a pessoa e o motivo', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({ transfer_target_account_responsibility: (p) => (chamadas.push(p), null) })
    await f.transferirResponsabilidade!(ALFA, 'usuario-bruno', 'Saiu da empresa')
    expect(chamadas).toEqual([{ p_target_account_id: ALFA, p_new_user_id: 'usuario-bruno', p_reason: 'Saiu da empresa' }])
  })

  it('os Participantes para receber a Conta são os ativos, pelo nome ou, sem nome, pelo e-mail', async () => {
    const f = fonte({
      list_workspace_participants: () => [
        { user_id: 'usuario-ana', email: 'ana@cliente.com.br', name: 'Ana', role: 'admin', is_owner: false },
        { user_id: 'usuario-bruno', email: 'bruno@cliente.com.br', name: null, role: 'member', is_owner: false },
      ],
    })
    expect(await f.participantesParaTransferir!()).toEqual([
      { id: 'usuario-ana', nome: 'Ana' },
      { id: 'usuario-bruno', nome: 'bruno@cliente.com.br' },
    ])
  })

  it('as recusas do banco viram palavras do produto', async () => {
    const aindaAtivo = fonte({ transfer_target_account_responsibility: recusa('the responsible seller is still an active participant', '42501') })
    await expect(aindaAtivo.transferirResponsabilidade!(ALFA, 'u', 'm')).rejects.toThrow(
      'O responsável ainda é Participante ativo: só se transfere depois que ele sair do Workspace.',
    )
    const destinoInativo = fonte({ transfer_target_account_responsibility: recusa('the new responsible seller must be an active participant', '42501') })
    await expect(destinoInativo.transferirResponsabilidade!(ALFA, 'u', 'm')).rejects.toThrow('Escolha um Participante ativo do Workspace para receber a Conta.')
    const semMotivo = fonte({ transfer_target_account_responsibility: recusa('a reason is required to transfer responsibility', '22023') })
    await expect(semMotivo.transferirResponsabilidade!(ALFA, 'u', '')).rejects.toThrow('Diga o motivo da transferência.')
    const semPermissao = fonte({ transfer_target_account_responsibility: recusa('only administrators can transfer responsibility', '42501') })
    await expect(semPermissao.transferirResponsabilidade!(ALFA, 'u', 'm')).rejects.toThrow('Só um Administrador pode transferir a responsabilidade.')
  })
})
