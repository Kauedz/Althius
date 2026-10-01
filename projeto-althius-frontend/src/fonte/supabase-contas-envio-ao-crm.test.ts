import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe, type RespostaDaFuncao } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

// Enviar ao CRM no Workspace operacional (kanban-de-prospeccao 05): a Fonte chama a Edge Function crm-handoff e lê o
// estado por list_crm_handoffs.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'

function fonte(
  funcao: (corpo: Record<string, unknown>) => RespostaDaFuncao = () => ({ corpo: {} }),
  rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {},
) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), funcoes: { 'crm-handoff': funcao }, rpcs })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

describe('Enviar ao CRM pela Fonte de Contas real', () => {
  it('envia pela crm-handoff com o Workspace, a Conta e o CRM, e devolve a mensagem do servidor', async () => {
    const pedidos: Record<string, unknown>[] = []
    const f = fonte((corpo) => {
      pedidos.push(corpo)
      return { corpo: { status: 'enviado', mensagem: 'Enviada ao HubSpot: a empresa, 2 Contatos e a nota.', pendencias: [] } }
    })
    expect(await f.enviarAoCrm!(ALFA, 'hubspot')).toEqual({
      mensagem: 'Enviada ao HubSpot: a empresa, 2 Contatos e a nota.',
      pendencias: [],
    })
    expect(pedidos).toEqual([{ action: 'enviar', workspaceId: 'ws-norte', targetAccountId: ALFA, integrationId: 'hubspot' }])
  })

  it('a recusa do servidor chega à tela com a mensagem dele', async () => {
    const f = fonte(() => ({ status: 403, corpo: { error: 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM.', code: 'nao_responsavel' } }))
    await expect(f.enviarAoCrm!(ALFA, 'hubspot')).rejects.toThrow('Só o Vendedor responsável pela Conta-alvo a envia ao CRM.')
  })

  it('sem a função publicada, explica em vez de fingir', async () => {
    const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA) })
    const f = criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
    await expect(f.enviarAoCrm!(ALFA, 'hubspot')).rejects.toThrow(/Edge Function crm-handoff não respondeu/)
  })

  it('o estado do envio vem de list_crm_handoffs, da Conta pedida', async () => {
    const f = fonte(undefined, {
      list_crm_handoffs: () => [
        { target_account_id: ALFA, integration_id: 'hubspot', status: 'enviado', crm_refs: { empresa: '1' }, error: null, finished_at: '2026-10-01T12:00:00Z' },
        { target_account_id: BETA, integration_id: 'pipedrive', status: 'falhou', crm_refs: {}, error: 'O Pipedrive recusou a organização.', finished_at: '2026-10-01T12:00:00Z' },
      ],
    })
    expect(await f.envioAoCrm!(ALFA)).toEqual({ integracaoId: 'hubspot', estado: 'enviado', concluidoEm: '2026-10-01T12:00:00Z' })
    expect(await f.envioAoCrm!(BETA)).toEqual({
      integracaoId: 'pipedrive',
      estado: 'falhou',
      erro: 'O Pipedrive recusou a organização.',
      concluidoEm: '2026-10-01T12:00:00Z',
    })
    expect(await f.envioAoCrm!('outra')).toBeNull()
  })
})
