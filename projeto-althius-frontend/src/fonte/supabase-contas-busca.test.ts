import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: { target_accounts: [], sales_responsibilities: [], target_contacts: [] },
    rpcs,
  })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

const recusa = (mensagem: string, code = 'P0001') => () => {
  throw Object.assign(new Error(mensagem), { code })
}

describe('Buscar Sinais de novo no Workspace operacional (reativação de Sinais)', () => {
  it('o custo vem de quote_account_rescan: quantos Monitoramentos, quantos créditos, o saldo e como terminou a última', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      quote_account_rescan: (p) => {
        chamadas.push(p)
        return [{ monitors: 2, credits: 2, available: 9.5, in_progress: false, last_finished_at: '2026-09-30T12:00:00+00:00', last_error: 'A busca parou.' }]
      },
    })
    expect(await f.custoDeBuscarSinais!(ALFA)).toEqual({
      monitoramentos: 2,
      creditos: 2,
      saldo: 9.5,
      emAndamento: false,
      terminouEm: '2026-09-30T12:00:00+00:00',
      motivo: 'A busca parou.',
    })
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_target_account_id: ALFA }])
  })

  it('pedir a busca chama request_account_rescan com o Workspace e a Conta', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({ request_account_rescan: (p) => (chamadas.push(p), 'busca-1') })
    await f.buscarSinaisDeNovo!(ALFA)
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_target_account_id: ALFA }])
  })

  it('as recusas do banco viram palavras do produto', async () => {
    const semMonitoramento = fonte({ request_account_rescan: recusa('no active monitor to search with', '22023') })
    await expect(semMonitoramento.buscarSinaisDeNovo!(ALFA)).rejects.toThrow('Nenhum Monitoramento ativo para buscar. Ative um em Sinais.')
    const semSaldo = fonte({ request_account_rescan: recusa('insufficient credits') })
    await expect(semSaldo.buscarSinaisDeNovo!(ALFA)).rejects.toThrow('Sem créditos suficientes para esta busca.')
    const noLimite = fonte({ request_account_rescan: recusa('monthly credit limit reached') })
    await expect(noLimite.buscarSinaisDeNovo!(ALFA)).rejects.toThrow('Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.')
    const arquivada = fonte({ quote_account_rescan: recusa('the target account is archived', '55006') })
    await expect(arquivada.custoDeBuscarSinais!(ALFA)).rejects.toThrow('A Conta-alvo está arquivada. Restaure-a para continuar.')
  })
})
