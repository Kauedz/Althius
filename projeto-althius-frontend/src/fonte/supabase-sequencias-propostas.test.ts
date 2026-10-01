import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

const LINHA = {
  id: 'proposta-1',
  sequence_id: 'seq-1',
  target_account_id: 'conta-1',
  contact_id: 'contato-1',
  channel: 'email',
  origin_interaction_id: 'interacao-1',
  recipient: 'carla@acme.com.br',
  recipient_name: 'Carla',
  subject: 'Re: Proposta',
  body: 'Oi Carla, obrigado pelo retorno.',
  revision: 2,
  status: 'pronta',
  failure_code: null,
  approved_revision: null,
  decided_at: null,
  sent_at: null,
  send_error: null,
  generations: 1,
  origin_received_at: '2026-10-01T10:00:00Z',
  origin_subject: 'Re: Proposta',
  origin_excerpt: 'Pode me mandar mais detalhes?',
  created_at: '2026-10-01T10:01:00Z',
  updated_at: '2026-10-01T10:02:00Z',
}

describe('Propostas de resposta no Workspace operacional (canais 08 e 09)', () => {
  it('lê só as propostas da Sequência pedida', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: {
        list_reply_proposals: (p) => {
          chamadas.push(p)
          return [LINHA]
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.propostasDeResposta!('seq-1')).toEqual([
      {
        id: 'proposta-1',
        canal: 'email',
        destinatario: 'carla@acme.com.br',
        nomeDoDestinatario: 'Carla',
        assunto: 'Re: Proposta',
        texto: 'Oi Carla, obrigado pelo retorno.',
        revisao: 2,
        status: 'pronta',
        mensagemDeOrigem: 'Pode me mandar mais detalhes?',
        recebidaEm: '2026-10-01T10:00:00Z',
      },
    ])
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_sequence_id: 'seq-1' }])
  })

  it('aprova a revisão lida e pede o envio uma vez', async () => {
    const ordem: string[] = []
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: {
        approve_reply_proposal: (p) => {
          ordem.push(`aprovar:${p.p_proposal_id}:${p.p_revision}`)
          return 'aprovada'
        },
      },
      funcoes: {
        'reply-proposal-send': (corpo) => {
          ordem.push(`enviar:${corpo.action}:${corpo.workspaceId}:${corpo.proposalId}`)
          return { corpo: { outcome: 'sent', proposalId: corpo.proposalId } }
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.aprovarEEnviarProposta!({ id: 'proposta-1', revisao: 2 })).toEqual({ enviada: true })
    expect(ordem).toEqual(['aprovar:proposta-1:2', 'enviar:send:ws-norte:proposta-1'])
  })

  it('grava o texto editado como nova revisão antes de aprovar', async () => {
    const ordem: string[] = []
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: {
        edit_reply_proposal: (p) => {
          ordem.push(`editar:${p.p_revision}:${p.p_body}`)
          return 3
        },
        approve_reply_proposal: (p) => {
          ordem.push(`aprovar:${p.p_revision}`)
          return 'aprovada'
        },
      },
      funcoes: { 'reply-proposal-send': () => ({ corpo: { outcome: 'sent' } }) },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    await fonte.aprovarEEnviarProposta!({ id: 'proposta-1', revisao: 2, textoEditado: 'Oi Carla, segue o material.' })
    expect(ordem).toEqual(['editar:2:Oi Carla, segue o material.', 'aprovar:3'])
  })

  it('devolve o bloqueio do servidor sem fingir que enviou', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: { approve_reply_proposal: () => 'aprovada' },
      funcoes: {
        'reply-proposal-send': () => ({
          status: 409,
          corpo: { outcome: 'outdated', message: 'Chegou outra mensagem nesta conversa. Revise a resposta, edite ou gere de novo e aprove outra vez.' },
        }),
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.aprovarEEnviarProposta!({ id: 'proposta-1', revisao: 2 })).toEqual({
      enviada: false,
      mensagem: 'Chegou outra mensagem nesta conversa. Revise a resposta, edite ou gere de novo e aprove outra vez.',
    })
  })

  it('traduz a recusa de aprovar uma revisão que mudou', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: {
        approve_reply_proposal: () => {
          throw Object.assign(new Error('the reply proposal changed since it was read'), { code: '55000' })
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    await expect(fonte.aprovarEEnviarProposta!({ id: 'proposta-1', revisao: 2 })).rejects.toThrow(
      'A resposta mudou desde que você abriu. Confira o texto atual e aprove de novo.',
    )
  })
})
