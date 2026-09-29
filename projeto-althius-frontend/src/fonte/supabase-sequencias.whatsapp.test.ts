import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

/** A Sequência da Marina com os RPCs de envio e as Edge Functions que o teste responde. */
function sequenciaDaMarina(
  rpcs: OpcoesDoSupabaseFalso['rpcs'] = {},
  funcoes: OpcoesDoSupabaseFalso['funcoes'] = {},
) {
  const linha = {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas: { sequences: [linha] }, rpcs, funcoes })
  return criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
}

const envioNoBanco = (extra: Record<string, unknown> = {}) => ({
  id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: '+5511987654321', status: 'confirmed',
  attempts: 0, confirmed_at: '2026-09-29T15:00:00Z', sent_at: null, last_error: null, last_error_at: null,
  updated_at: '2026-09-29T15:00:00Z', ...extra,
})

describe('Passo de WhatsApp no Workspace operacional', () => {
  it('confirmar um passo de WhatsApp chama a confirmação do WhatsApp; o padrão continua sendo o do E-mail', async () => {
    const chamadas: string[] = []
    const fonte = sequenciaDaMarina({
      confirm_whatsapp_step: () => {
        chamadas.push('whatsapp')
        return [envioNoBanco()]
      },
      confirm_sequence_step: () => {
        chamadas.push('email')
        return [envioNoBanco({ destination: 'maria@empresa-alvo.test' })]
      },
    })

    const whatsapp = await fonte.confirmarPasso('sequencia-da-marina', 'passo-1', 'whatsapp')
    const email = await fonte.confirmarPasso('sequencia-da-marina', 'passo-1')
    const emailExplicito = await fonte.confirmarPasso('sequencia-da-marina', 'passo-1', 'email')

    expect(chamadas).toEqual(['whatsapp', 'email', 'email'])
    expect(whatsapp).toMatchObject({ destino: '+5511987654321', status: 'confirmed' })
    expect(email.destino).toBe('maria@empresa-alvo.test')
    expect(emailExplicito.destino).toBe('maria@empresa-alvo.test')
  })

  it('a confirmação leva o Sequência e o passo, e um número sem WhatsApp é recusado com o motivo', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = sequenciaDaMarina({
      confirm_whatsapp_step: (parametros) => {
        pedidos.push(parametros)
        throw Object.assign(new Error('contact phone at this position is not flagged as whatsapp'), { code: '22023' })
      },
    })

    await expect(fonte.confirmarPasso('sequencia-da-marina', 'passo-1', 'whatsapp')).rejects.toThrow(
      'Este número não está marcado como WhatsApp no Contato. Marque-o ou escolha outro número.',
    )
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1' }])
  })

  it('um Contato sem telefone na posição escolhida é recusado com o motivo', async () => {
    const fonte = sequenciaDaMarina({
      confirm_whatsapp_step: () => {
        throw Object.assign(new Error('contact has no phone destination'), { code: '22023' })
      },
    })
    await expect(fonte.confirmarPasso('sequencia-da-marina', 'passo-1', 'whatsapp')).rejects.toThrow(
      'O Contato deste passo não tem o telefone escolhido. Cadastre-o ou escolha outro número.',
    )
  })

  it('um passo de outro canal não é confirmado, e o motivo cita E-mail e WhatsApp', async () => {
    const fonte = sequenciaDaMarina({
      confirm_whatsapp_step: () => {
        throw Object.assign(new Error('only whatsapp steps can be confirmed here'), { code: '0A000' })
      },
    })
    await expect(fonte.confirmarPasso('sequencia-da-marina', 'passo-1', 'whatsapp')).rejects.toThrow(
      'Só passos de E-mail e de WhatsApp podem ser confirmados por enquanto.',
    )
  })

  it('lista o Envio de WhatsApp com o número fixado e o motivo do bloqueio', async () => {
    const fonte = sequenciaDaMarina({
      list_sequence_step_sends: () => [
        envioNoBanco({ status: 'awaiting_reconfirmation', last_error: 'destination_no_whatsapp' }),
      ],
    })
    expect(await fonte.envios('sequencia-da-marina')).toEqual([{
      id: 'envio-1', stepId: 'passo-1', contatoId: 'contato-1', destino: '+5511987654321',
      status: 'awaiting_reconfirmation', confirmadoEm: '2026-09-29T15:00:00Z', ultimoErro: 'destination_no_whatsapp',
    }])
  })

  it('os bloqueios do envio de WhatsApp voltam como desfecho com a mensagem, não como erro', async () => {
    for (const [outcome, mensagem] of [
      ['destination_no_whatsapp', 'Este número não tem WhatsApp. Corrija o número do Contato e reconfirme o passo.'],
      ['destination_check_failed', 'Não foi possível conferir se o número tem WhatsApp. Tente de novo em instantes.'],
      ['sender_spacing', 'Sua Conta de WhatsApp enviou uma mensagem há poucos segundos. Espere um pouco antes de enviar outra.'],
      ['sender_not_ready', 'Sua Conta remetente de WhatsApp não está pronta para enviar.'],
      ['automatic_disabled', 'O envio automático de WhatsApp está desligado. Este passo só sai quando você confirma e envia.'],
    ]) {
      const fonte = sequenciaDaMarina({}, { 'sequence-step-sends': () => ({ status: 409, corpo: { outcome, message: mensagem } }) })
      expect(await fonte.enviarPasso('sequencia-da-marina', 'envio-1')).toEqual({ outcome, mensagem })
    }
  })

  it('a ativação traz a mensagem de cada bloqueio novo do WhatsApp', async () => {
    for (const [outcome, trecho] of [
      ['contact_without_phone', 'não tem telefone'],
      ['phone_not_whatsapp', 'não marcou como WhatsApp'],
      ['whatsapp_sender_not_ready', 'Conta remetente de WhatsApp não está pronta'],
    ]) {
      const fonte = sequenciaDaMarina({
        activate_sequence: () => [{ outcome, step_id: 'passo-1', version: null, scheduled_for: null }],
      })
      const resultado = await fonte.ativarEnvios('sequencia-da-marina')
      expect(resultado.outcome).toBe(outcome)
      expect(resultado.stepId).toBe('passo-1')
      expect(resultado.mensagem).toContain(trecho)
    }
  })

  it('"não saiu" e "saiu" de um envio incerto de WhatsApp usam a mesma resolução do E-mail', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = sequenciaDaMarina({ resolve_uncertain_step: (parametros) => void pedidos.push(parametros) })
    await fonte.resolverIncerto('sequencia-da-marina', 'passo-1', false)
    await fonte.resolverIncerto('sequencia-da-marina', 'passo-1', true)
    expect(pedidos).toEqual([
      { p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1', p_went_out: false },
      { p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1', p_went_out: true },
    ])
  })
})
