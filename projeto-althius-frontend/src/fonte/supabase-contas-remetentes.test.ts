import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasRemetentesSupabase } from './supabase-contas-remetentes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function linha(extra: Record<string, unknown>) {
  return {
    id: 'conta-remetente-1',
    channel: 'email',
    provider: 'GOOGLE',
    status: 'ready',
    reconciliation_required: false,
    last_status_at: '2026-09-27T12:00:00Z',
    created_at: '2026-09-26T12:00:00Z',
    ...extra,
  }
}

function fonteDaMarina(opcoes: Pick<OpcoesDoSupabaseFalso, 'rpcs' | 'funcoes'>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), ...opcoes })
  return criarFonteDeContasRemetentesSupabase(cliente, () => 'ws-norte')
}

describe('FonteDeContasRemetentes do Workspace operacional', () => {
  it('lista as Contas remetentes da sessão com o estado que o backend registrou', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteDaMarina({
      rpcs: {
        list_owned_sender_accounts: (parametros) => {
          pedidos.push(parametros)
          return [
            linha({ id: 'a', status: 'connecting' }),
            linha({ id: 'b', channel: 'linkedin', provider: 'LINKEDIN', status: 'syncing' }),
            linha({ id: 'c', channel: 'whatsapp', provider: 'WHATSAPP', status: 'syncing', reconciliation_required: true }),
            linha({ id: 'd', status: 'ready' }),
            linha({ id: 'e', status: 'reconnect_required', reconciliation_required: true }),
            linha({ id: 'f', status: 'disconnected' }),
          ]
        },
      },
    })

    const contas = await fonte.minhas()

    expect(pedidos).toEqual([{ p_workspace_id: 'ws-norte' }])
    expect(contas.map(({ id, canal, provedor, estado, conferindoPeriodoForaDoAr }) => [id, canal, provedor, estado, conferindoPeriodoForaDoAr])).toEqual([
      ['a', 'email', 'GOOGLE', 'conectando', false],
      ['b', 'linkedin', 'LINKEDIN', 'sincronizando', false],
      ['c', 'whatsapp', 'WHATSAPP', 'sincronizando', true],
      ['d', 'email', 'GOOGLE', 'pronta', false],
      ['e', 'email', 'GOOGLE', 'requer-reconexao', true],
      ['f', 'email', 'GOOGLE', 'desconectada', false],
    ])
    expect(contas[0].estadoDesde).toBe('2026-09-27T12:00:00Z')
  })

  it('lê a cota de entrada do remetente e ignora Canal desconhecido', async () => {
    const fonte = fonteDaMarina({
      rpcs: {
        list_my_sender_entry_quotas: (parametros) => {
          expect(parametros).toEqual({ p_workspace_id: 'ws-norte' })
          return [
            {
              sender_account_id: 'wa',
              channel: 'whatsapp',
              used_today: 12,
              cap_today: 22,
              queued_for_tomorrow: 3,
              warming: false,
            },
            {
              sender_account_id: 'sms',
              channel: 'sms',
              used_today: 1,
              cap_today: 2,
              queued_for_tomorrow: 0,
              warming: false,
            },
          ]
        },
      },
    })

    await expect(fonte.cotasDeEntrada()).resolves.toEqual([
      { id: 'wa', canal: 'whatsapp', usadasHoje: 12, tetoHoje: 22, naFilaParaAmanha: 3, emAquecimento: false },
    ])
  })

  it('se a fila ainda não existe no backend, a cota fica vazia e a lista de contas não quebra', async () => {
    const fonte = fonteDaMarina({ rpcs: {} })

    await expect(fonte.cotasDeEntrada()).resolves.toEqual([])
  })

  it('conectar pede um link hospedado novo à Edge Function e devolve o endereço, sem avisar mudança antes do backend', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteDaMarina({
      funcoes: {
        'sender-accounts': (corpo) => {
          pedidos.push(corpo)
          return { corpo: { url: 'https://account.unipile.com/link-1' } }
        },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    const url = await fonte.conectar('whatsapp')

    expect(url).toBe('https://account.unipile.com/link-1')
    expect(pedidos).toEqual([{ action: 'connect', workspaceId: 'ws-norte', channel: 'whatsapp' }])
    expect(avisos).toBe(0)
  })

  it('reconectar leva a Conta remetente e o Canal dela', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteDaMarina({
      funcoes: {
        'sender-accounts': (corpo) => {
          pedidos.push(corpo)
          return { corpo: { url: 'https://account.unipile.com/link-2' } }
        },
      },
    })

    expect(await fonte.reconectar({ id: 'conta-remetente-1', canal: 'email' })).toBe('https://account.unipile.com/link-2')
    expect(pedidos).toEqual([{ action: 'reconnect', workspaceId: 'ws-norte', channel: 'email', senderAccountId: 'conta-remetente-1' }])
  })

  it('uma recusa do backend chega com a mensagem dele', async () => {
    const fonte = fonteDaMarina({
      funcoes: { 'sender-accounts': () => ({ status: 502, corpo: { error: 'A Unipile não conseguiu iniciar a conexão. Tente novamente.' } }) },
    })

    await expect(fonte.conectar('email')).rejects.toThrow('A Unipile não conseguiu iniciar a conexão. Tente novamente.')
  })

  it('um link que não é HTTPS não é aberto', async () => {
    const fonte = fonteDaMarina({
      funcoes: { 'sender-accounts': () => ({ corpo: { url: 'javascript:alert(1)' } }) },
    })

    await expect(fonte.conectar('email')).rejects.toThrow('O backend não devolveu um link de autenticação válido.')
  })

  it('desconectar avisa a mudança só depois que o backend confirma', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteDaMarina({
      funcoes: {
        'sender-accounts': (corpo) => {
          pedidos.push(corpo)
          return { corpo: { ok: true } }
        },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    await fonte.desconectar('conta-remetente-1')

    expect(pedidos).toEqual([{ action: 'disconnect', workspaceId: 'ws-norte', senderAccountId: 'conta-remetente-1' }])
    expect(avisos).toBe(1)
  })

  it('uma desconexão recusada diz o motivo e manda reler a lista, porque o provedor pode ter desconectado', async () => {
    const fonte = fonteDaMarina({
      funcoes: { 'sender-accounts': () => ({ status: 502, corpo: { error: 'A Unipile não confirmou a desconexão. Tente novamente.' } }) },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    await expect(fonte.desconectar('conta-remetente-1')).rejects.toThrow('A Unipile não confirmou a desconexão. Tente novamente.')
    expect(avisos).toBe(1)
  })
})
