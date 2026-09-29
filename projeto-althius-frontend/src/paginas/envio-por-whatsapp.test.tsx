import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { renderizarApp } from '@/test/renderizar'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const WORKSPACE_PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

const passoDeWhatsapp = (extra: Record<string, unknown> = {}) => ({
  id: 'passo-1', ordem: 1, canal: 'whatsapp', contatoId: 'contato-1', delayDiasUteis: 0, titulo: 'Primeiro contato',
  corpo: 'Oi, Maria!', ...extra,
})

/** A Sequência da Marina (Vendedora responsável), aberta no detalhe, com o documento privado dela. */
function abrirASequencia({
  steps = [passoDeWhatsapp()],
  rpcs = {},
  funcoes = {},
}: {
  steps?: Record<string, unknown>[]
  rpcs?: OpcoesDoSupabaseFalso['rpcs']
  funcoes?: OpcoesDoSupabaseFalso['funcoes']
} = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  const sequencia = {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 2, totalSteps: steps.length, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [{ workspace_id: 'ws-norte', role: 'admin', user_id: MARINA.id, active: true }],
    sequences: [sequencia],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: () => WORKSPACE_PESSOAL,
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      get_owned_sequence: () => [{
        ...sequencia,
        public_summary: { ...sequencia.public_summary, _document: { participantesIds: ['contato-1'], steps } },
      }],
      list_sequence_step_sends: () => [],
      list_received_emails: () => [],
      get_sequence_authorization: () => [],
      ...rpcs,
    },
    funcoes,
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario }
}

const linhaDoEnvio = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: '+5511987654321', status,
  attempts: 0, confirmed_at: '2026-09-29T15:00:00Z', sent_at: null, last_error: null, last_error_at: null,
  updated_at: '2026-09-29T15:00:00Z', mode: 'auto', scheduled_for: '2026-09-30T13:00:00Z', ...extra,
})

describe('Passo de WhatsApp no Workspace operacional', () => {
  it('a Vendedora confirma o passo e o envia pela Conta de WhatsApp dela', async () => {
    const envios: Record<string, unknown>[] = []
    const confirmacoes: Record<string, unknown>[] = []
    const pedidosDeEnvio: Record<string, unknown>[] = []
    const { usuario } = abrirASequencia({
      rpcs: {
        list_sequence_step_sends: () => envios,
        confirm_whatsapp_step: (parametros) => {
          confirmacoes.push(parametros)
          envios.splice(0, envios.length, linhaDoEnvio('confirmed', { mode: 'manual', scheduled_for: null }))
          return [envios[0]]
        },
      },
      funcoes: {
        'sequence-step-sends': (corpo) => {
          pedidosDeEnvio.push(corpo)
          envios.splice(0, envios.length, linhaDoEnvio('sent', { sent_at: '2026-09-29T15:00:05Z', scheduled_for: null }))
          return { corpo: { outcome: 'sent', sendId: 'envio-1' } }
        },
      },
    })

    expect(await screen.findByText(/^Ainda não enviado\. Confirmar fixa o número de WhatsApp escolhido do Contato/)).toBeInTheDocument()
    expect(screen.getByText(/Enviado da sua Conta de WhatsApp, com intervalo entre as mensagens/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e enviar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Mensagem enviada para +5511987654321.')
    expect(confirmacoes).toEqual([{ p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1' }])
    expect(pedidosDeEnvio).toEqual([{ action: 'send', workspaceId: 'ws-norte', sendId: 'envio-1' }])
    expect(await screen.findByText(/^Enviado em .* para \+5511987654321\. Aceito pelo provedor; não é entrega nem leitura\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar e enviar|Reconfirmar e enviar/ })).not.toBeInTheDocument()
  })

  it('um número sem WhatsApp explica o motivo e o passo espera a reconfirmação', async () => {
    const envios: Record<string, unknown>[] = []
    const { usuario } = abrirASequencia({
      rpcs: {
        list_sequence_step_sends: () => envios,
        confirm_whatsapp_step: () => {
          envios.splice(0, envios.length, linhaDoEnvio('confirmed', { mode: 'manual', scheduled_for: null }))
          return [envios[0]]
        },
      },
      funcoes: {
        'sequence-step-sends': () => {
          envios.splice(0, envios.length, linhaDoEnvio('awaiting_reconfirmation', {
            last_error: 'destination_no_whatsapp', mode: 'manual', scheduled_for: null,
          }))
          return {
            status: 409,
            corpo: {
              outcome: 'destination_no_whatsapp',
              message: 'Este número não tem WhatsApp. Corrija o número do Contato e reconfirme o passo.',
            },
          }
        },
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar e enviar' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Este número não tem WhatsApp. Corrija o número do Contato e reconfirme o passo.',
    )
    expect(await screen.findByText('Aguardando reconfirmação')).toBeInTheDocument()
    expect(screen.getByText('Este número não tem WhatsApp (+5511987654321). Corrija o número do Contato e reconfirme.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconfirmar e enviar' })).toBeInTheDocument()
  })

  it('um envio incerto pede que a Vendedora confira o WhatsApp dela e diga se a mensagem saiu', async () => {
    const pedidos: Record<string, unknown>[] = []
    let resolvido = false
    const { usuario } = abrirASequencia({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [resolvido ? linhaDoEnvio('sent', { sent_at: '2026-09-30T13:00:05Z' }) : linhaDoEnvio('uncertain')],
        resolve_uncertain_step: (parametros) => {
          pedidos.push(parametros)
          resolvido = true
          return 'sent'
        },
      },
    })

    expect(await screen.findByText('A Unipile não confirmou o envio e nada é reenviado sozinho. Confira seu WhatsApp: a mensagem saiu?')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Saiu' }))
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1', p_went_out: true }])
    expect(await screen.findByText('Registrado como enviado.')).toBeInTheDocument()
  })

  it('a conferência do número que falhou aparece como última tentativa, em português, e o passo continua programado', async () => {
    abrirASequencia({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [linhaDoEnvio('scheduled', { last_error: 'destination_check_failed' })],
      },
    })
    expect(await screen.findByText(
      /^Sai sozinho qua\., 30\/09, 10:00 para \+5511987654321, mesmo com o navegador fechado\. Última tentativa: não foi possível conferir se o número tem WhatsApp\./,
    )).toBeInTheDocument()
  })

  it('uma recusa do provedor mostra o código traduzido', async () => {
    abrirASequencia({
      rpcs: { list_sequence_step_sends: () => [linhaDoEnvio('failed', { last_error: 'http_403' })] },
    })
    expect(await screen.findByText('O provedor não aceitou o envio (a Unipile recusou (HTTP 403)). Reconfirme para tentar de novo.')).toBeInTheDocument()
  })

  it('o painel de envios automáticos e a ativação cobrem os passos de WhatsApp', async () => {
    const { usuario } = abrirASequencia()

    const painel = await screen.findByRole('region', { name: 'Envios automáticos' })
    expect(within(painel).getByText('Os passos de WhatsApp só saem sozinhos, mesmo com o navegador fechado, depois que você ativar os envios.')).toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Ativar envios' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Os passos de WhatsApp abaixo saem sozinhos/)).toBeInTheDocument()
    const passos = within(dialogo).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText('Primeiro contato')).toBeInTheDocument()
    expect(within(passos).getByText(/Para Contato sem WhatsApp · automático/)).toBeInTheDocument()
  })

  it('os bloqueios da ativação de um passo de WhatsApp dizem o motivo e o passo', async () => {
    const casos: [string, string][] = [
      ['whatsapp_sender_not_ready', 'Sua Conta remetente de WhatsApp não está pronta para enviar. Passo: "Primeiro contato".'],
      ['contact_without_phone', 'O Contato de um passo de WhatsApp não tem telefone. Cadastre o telefone antes de ativar. Passo: "Primeiro contato".'],
      ['phone_not_whatsapp', 'Um passo de WhatsApp usa um número que o Contato não marcou como WhatsApp. Marque-o ou escolha outro número. Passo: "Primeiro contato".'],
      ['destination_not_found', 'Um passo escolhe um número de telefone que o Contato não tem. Ajuste o passo antes de ativar. Passo: "Primeiro contato".'],
      ['empty_content', 'Um passo de WhatsApp está sem texto. Escreva a mensagem antes de ativar. Passo: "Primeiro contato".'],
    ]
    for (const [outcome, texto] of casos) {
      const { usuario } = abrirASequencia({
        rpcs: { activate_sequence: () => [{ outcome, step_id: 'passo-1', version: null, scheduled_for: null }] },
      })
      await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
      await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ativar' }))
      const painel = screen.getByRole('region', { name: 'Envios automáticos' })
      expect(await within(painel).findByRole('status'), outcome).toHaveTextContent(texto)
      cleanup()
    }
  })

  it('numa Sequência com E-mail e WhatsApp, o painel e o diálogo falam dos dois canais', async () => {
    const { usuario } = abrirASequencia({
      steps: [
        { ...passoDeWhatsapp(), id: 'passo-1', titulo: 'Abertura' },
        { id: 'passo-2', ordem: 2, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 1, titulo: 'Depois', assunto: 'Olá', corpo: 'Oi' },
      ],
    })
    const painel = await screen.findByRole('region', { name: 'Envios automáticos' })
    expect(within(painel).getByText(/^Os passos de E-mail e de WhatsApp só saem sozinhos/)).toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Ativar envios' }))
    const passos = within(await screen.findByRole('dialog')).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getAllByRole('listitem')).toHaveLength(2)
  })

  it('um passo de LinkedIn segue sem envio neste Workspace', async () => {
    const { usuario } = abrirASequencia({
      steps: [
        passoDeWhatsapp(),
        { id: 'passo-2', ordem: 2, canal: 'linkedin', contatoId: 'contato-1', delayDiasUteis: 1, titulo: 'Convite no LinkedIn', corpo: 'Oi', subtipoLinkedIn: 'mensagem' },
      ],
    })
    const linhaDoTempo = await screen.findByRole('list', { name: 'Linha do tempo de passos' })
    await usuario.click(within(linhaDoTempo).getByRole('button', { name: /Convite no LinkedIn/ }))
    expect(await screen.findByText('Envio por LinkedIn ainda não disponível neste Workspace.')).toBeInTheDocument()
  })
})

describe('Demonstração', () => {
  it('o passo de WhatsApp segue sem envio neste protótipo', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')
    await screen.findByTestId('composer-step')
    await usuario.click(screen.getByRole('tab', { name: /WhatsApp/ }))

    expect(screen.getByText('Enviado do número do vendedor · sem envio neste protótipo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar e enviar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Envios automáticos' })).not.toBeInTheDocument()
  })
})
