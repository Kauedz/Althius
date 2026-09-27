import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import type { StepSequencia } from './sequencias-tipos'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

const PASSO: StepSequencia = {
  id: 'passo-1',
  ordem: 1,
  canal: 'email',
  contatoId: 'contato-1',
  delayDiasUteis: 0,
  titulo: 'Primeiro contato',
  assunto: 'Olá',
  corpo: 'Oi!',
}

function linhaDaMarina() {
  return {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
}

/** A Sequência da sessão num backend em memória: a RPC de atualização grava o documento que a de leitura devolve. */
function sequenciaDaMarina() {
  const linha = linhaDaMarina()
  let documento: Record<string, unknown> = { participantesIds: ['contato-1'], steps: [PASSO], passoAtual: 0 }
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: { sequences: [linha] },
    rpcs: {
      get_owned_sequence: () => [{ ...linha, public_summary: { ...linha.public_summary, _document: documento } }],
      update_owned_sequence: ({ p_private_document }) => {
        documento = p_private_document as Record<string, unknown>
        return null
      },
    },
  })
  return criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
}

describe('FonteDeSequencias do Workspace operacional', () => {
  it('guarda a edição do documento do Vendedor responsável', async () => {
    const fonte = sequenciaDaMarina()

    await fonte.atualizarDocumento('sequencia-da-marina', { steps: [{ ...PASSO, titulo: 'Abertura' }] })

    expect((await fonte.sequencia('sequencia-da-marina')).steps[0].titulo).toBe('Abertura')
  })

  it('editar o documento não regrava o status lido antes, para não desfazer uma pausa feita pelo backend', async () => {
    const statusEnviados: unknown[] = []
    const linha = linhaDaMarina()
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [linha] },
      rpcs: {
        get_owned_sequence: () => [{ ...linha, public_summary: { ...linha.public_summary, _document: { steps: [PASSO] } } }],
        update_owned_sequence: ({ p_status }) => {
          statusEnviados.push(p_status)
          return null
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)

    await fonte.atualizarDocumento('sequencia-da-marina', { steps: [{ ...PASSO, titulo: 'Abertura' }] })
    await fonte.atualizarDocumento('sequencia-da-marina', { status: 'pausada' })

    expect(statusEnviados).toEqual([null, 'pausada'])
  })

  it('recusa anexos no documento enquanto o Workspace não guarda arquivos, sem alterar nada', async () => {
    const fonte = sequenciaDaMarina()
    const comAnexo = { ...PASSO, titulo: 'Abertura', anexos: [{ tipo: 'imagem' as const, nome: 'print.png', url: 'blob:http://localhost/1' }] }

    await expect(fonte.atualizarDocumento('sequencia-da-marina', { steps: [comAnexo] })).rejects.toThrow(
      'Anexos ainda não estão disponíveis neste Workspace.',
    )

    const [passo] = (await fonte.sequencia('sequencia-da-marina')).steps
    expect(passo.titulo).toBe('Primeiro contato')
    expect(passo.anexos).toBeUndefined()
  })
})

/** A Sequência da Marina com um passo confirmado no backend em memória, mais as Edge Functions de envio e anexo. */
function sequenciaComEnvios(funcoes: OpcoesDoSupabaseFalso['funcoes'] = {}) {
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
  const envios: Record<string, unknown>[] = []
  const confirmacoes: Record<string, unknown>[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: { sequences: [linha] },
    rpcs: {
      list_sequence_step_sends: () => envios,
      confirm_sequence_step: (parametros) => {
        confirmacoes.push(parametros)
        const envio = {
          id: 'envio-1', step_id: parametros.p_step_id, contact_id: 'contato-1', destination: 'maria@empresa-alvo.test',
          status: 'confirmed', attempts: 0, confirmed_at: '2026-09-26T15:00:00Z', sent_at: null,
          last_error: null, last_error_at: null, updated_at: '2026-09-26T15:00:00Z',
        }
        envios.splice(0, envios.length, envio)
        return [envio]
      },
      list_received_emails: () => [{
        interaction_id: 'inter-1', sequence_id: 'sequencia-da-marina', send_id: 'envio-1', contact_id: 'contato-1',
        from_email: 'maria@empresa-alvo.test', from_name: 'Maria Souza', subject: 'Re: Olá', body: 'Podemos falar amanhã?',
        snippet: 'Podemos falar', received_at: '2026-09-26T16:00:00Z',
        attachments: [{ id: 'att-1', name: 'proposta.pdf', mime: 'application/pdf', size: 1234, status: 'stored' }],
      }],
    },
    funcoes,
  })
  return { fonte: criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id), confirmacoes }
}

describe('Envios e respostas da Sequência no Workspace operacional', () => {
  it('confirmar um passo fixa o Destino e o Envio passa a ser listado', async () => {
    const { fonte, confirmacoes } = sequenciaComEnvios()

    const envio = await fonte.confirmarPasso('sequencia-da-marina', 'passo-1')

    expect(envio).toEqual({
      id: 'envio-1', stepId: 'passo-1', contatoId: 'contato-1', destino: 'maria@empresa-alvo.test',
      status: 'confirmed', confirmadoEm: '2026-09-26T15:00:00Z',
    })
    expect(confirmacoes).toEqual([{ p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1' }])
    expect(await fonte.envios('sequencia-da-marina')).toEqual([envio])
  })

  it('enviar um passo chama a Edge Function com o Workspace e o Envio, e devolve o desfecho', async () => {
    const pedidos: Record<string, unknown>[] = []
    const { fonte } = sequenciaComEnvios({
      'sequence-step-sends': (corpo) => {
        pedidos.push(corpo)
        return { corpo: { outcome: 'sent', sendId: 'envio-1' } }
      },
    })

    expect(await fonte.enviarPasso('sequencia-da-marina', 'envio-1')).toEqual({ outcome: 'sent' })
    expect(pedidos).toEqual([{ action: 'send', workspaceId: 'ws-norte', sendId: 'envio-1' }])
  })

  it('uma resposta do backend sem desfecho não é tratada como enviado', async () => {
    const { fonte } = sequenciaComEnvios({ 'sequence-step-sends': () => ({ corpo: { ok: true } }) })

    expect((await fonte.enviarPasso('sequencia-da-marina', 'envio-1')).outcome).toBe('uncertain')
  })

  it('um envio bloqueado pelo backend volta como desfecho com a mensagem, não como erro', async () => {
    const { fonte } = sequenciaComEnvios({
      'sequence-step-sends': () => ({
        status: 409,
        corpo: { outcome: 'sender_not_ready', message: 'Sua Conta remetente de E-mail não está pronta para enviar.' },
      }),
    })

    expect(await fonte.enviarPasso('sequencia-da-marina', 'envio-1')).toEqual({
      outcome: 'sender_not_ready',
      mensagem: 'Sua Conta remetente de E-mail não está pronta para enviar.',
    })
  })

  it('uma Edge Function não publicada vira uma mensagem que diz isso', async () => {
    const { fonte } = sequenciaComEnvios({
      'sequence-step-sends': () => ({ status: 404, corpo: { code: 'NOT_FOUND', message: 'Requested function was not found' } }),
    })

    await expect(fonte.enviarPasso('sequencia-da-marina', 'envio-1')).rejects.toThrow(
      'A Edge Function sequence-step-sends não está publicada neste projeto.',
    )
  })

  it('uma Edge Function que não subiu aponta os segredos a conferir', async () => {
    const { fonte } = sequenciaComEnvios({
      'sequence-step-sends': () => ({ status: 503, corpo: { code: 'BOOT_ERROR', message: 'Function failed to start' } }),
    })

    await expect(fonte.enviarPasso('sequencia-da-marina', 'envio-1')).rejects.toThrow(
      'Confira os segredos UNIPILE_API_KEY e APP_ORIGIN.',
    )
  })

  it('a Responsável lê as respostas recebidas com o conteúdo e os anexos', async () => {
    const { fonte } = sequenciaComEnvios()

    expect(await fonte.respostasRecebidas('sequencia-da-marina')).toEqual([{
      interacaoId: 'inter-1', sequenciaId: 'sequencia-da-marina', envioId: 'envio-1', contatoId: 'contato-1',
      de: { email: 'maria@empresa-alvo.test', nome: 'Maria Souza' },
      assunto: 'Re: Olá', corpo: 'Podemos falar amanhã?', recebidaEm: '2026-09-26T16:00:00Z',
      anexos: [{ id: 'att-1', nome: 'proposta.pdf', mime: 'application/pdf', tamanho: 1234, status: 'stored' }],
    }])
  })

  it('o anexo abre por um endereço temporário pedido à Edge Function', async () => {
    const { fonte } = sequenciaComEnvios({
      'received-email-attachments': (corpo) => ({ corpo: { url: `https://storage.test/${corpo.attachmentId}?token=abc`, expiresIn: 300 } }),
    })

    expect(await fonte.urlDoAnexo('inter-1', 'att-1')).toBe('https://storage.test/att-1?token=abc')
  })

  it('quem não é o Responsável não recebe Envios nem respostas', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [{ id: 'sequencia-alheia', workspace_id: 'ws-norte', target_account_id: 'conta', owner_user_id: 'outro', status: 'ativa', public_summary: {}, created_at: '', updated_at: '' }] },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)

    expect(await fonte.envios('sequencia-alheia')).toEqual([])
    expect(await fonte.respostasRecebidas('sequencia-alheia')).toEqual([])
  })
})
