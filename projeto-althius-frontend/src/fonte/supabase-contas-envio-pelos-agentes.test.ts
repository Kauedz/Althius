import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe, type RespostaDaFuncao } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

// Enviar ao CRM pelos Agentes no Workspace operacional (ADR-0023): a Fonte pede à Edge Function agent-conversation
// (`enviar_ao_crm`) e lê a Conversa do envio por list_crm_handoff_conversations.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function fonte(
  funcao: (corpo: Record<string, unknown>) => RespostaDaFuncao = () => ({ corpo: {} }),
  rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {},
) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), funcoes: { 'agent-conversation': funcao }, rpcs })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => false)
}

describe('Enviar ao CRM pelos Agentes pela Fonte de Contas real', () => {
  it('pede pela agent-conversation com o Workspace, a Conta, o CRM e um id de pedido, e devolve a Conversa', async () => {
    const pedidos: Record<string, unknown>[] = []
    const f = fonte((corpo) => {
      pedidos.push(corpo)
      return { status: 202, corpo: { conversationId: 'conversa-1', runId: 'execucao-1', status: 'queued' } }
    })
    expect(await f.enviarAoCrmPelosAgentes!(ALFA, 'hubspot')).toEqual({ conversaId: 'conversa-1' })
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({ action: 'enviar_ao_crm', workspaceId: 'ws-norte', targetAccountId: ALFA, integrationId: 'hubspot' })
    expect(pedidos[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('a recusa do servidor chega à tela com a mensagem dele', async () => {
    const f = fonte(() => ({ status: 409, corpo: { error: 'Este CRM está conectado pela chave de API: o envio sai direto, sem os Agentes.', code: 'pela_chave' } }))
    await expect(f.enviarAoCrmPelosAgentes!(ALFA, 'hubspot')).rejects.toThrow('Este CRM está conectado pela chave de API')
  })

  it('a Conversa do envio vem de list_crm_handoff_conversations, da Conta pedida', async () => {
    const f = fonte(undefined, {
      list_crm_handoff_conversations: () => [{ target_account_id: ALFA, conversation_id: 'conversa-1', status: 'enviando' }],
    })
    expect(await f.conversaDoEnvioAoCrm!(ALFA)).toBe('conversa-1')
    expect(await f.conversaDoEnvioAoCrm!('outra')).toBeNull()
  })
})
