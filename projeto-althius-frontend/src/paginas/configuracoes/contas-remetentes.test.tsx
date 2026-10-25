import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { renderizarApp } from '@/test/renderizar'
import { criarSupabaseFalso, type RespostaDaFuncao, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

type Linha = Record<string, unknown>

/** Uma Conta remetente como `list_owned_sender_accounts` a devolve ao titular. */
function contaRemetente(extra: Linha): Linha {
  return {
    id: 'conta-email',
    channel: 'email',
    provider: 'GOOGLE',
    status: 'ready',
    reconciliation_required: false,
    last_status_at: '2026-09-27T12:00:00Z',
    created_at: '2026-09-26T12:00:00Z',
    ...extra,
  }
}

/**
 * A Marina abre Configurações → Meu perfil no Workspace operacional. O backend em memória guarda as Contas remetentes
 * dela, que o teste muda como o webhook da Unipile mudaria; a Edge Function responde com `responder`.
 */
function abrirMeuPerfil({
  contas = [],
  cotas,
  responder = () => ({ corpo: { url: 'https://account.unipile.com/link-novo' } }),
}: {
  contas?: Linha[]
  cotas?: Linha[]
  responder?: (corpo: Record<string, unknown>) => RespostaDaFuncao
} = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  window.history.replaceState(null, '', '/configuracoes/perfil')
  const backend = { contas: [...contas], falhar: false }
  const pedidos: Record<string, unknown>[] = []
  const listagens: Record<string, unknown>[] = []
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspace_memberships: [{ workspace_id: 'ws-norte', role: 'member', user_id: MARINA.id, active: true }],
      workspaces: [{ id: 'ws-norte', kind: 'empresa', name: 'Norte Distribuidora', owner_user_id: null }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => ({ id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }),
      get_my_profile: () => [{ name: 'Marina Souza', avatar_data_url: null, email: MARINA.email }],
      list_owned_sender_accounts: (parametros) => {
        listagens.push(parametros)
        if (backend.falhar) throw new Error('falha de rede')
        return backend.contas
      },
      ...(cotas
        ? {
            list_my_sender_entry_quotas: () => cotas,
          }
        : {}),
    },
    funcoes: {
      'sender-accounts': (corpo) => {
        pedidos.push(corpo)
        return responder(corpo)
      },
    },
  })
  const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
  const usuario = userEvent.setup({ advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined) })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { backend, pedidos, listagens, abrir, usuario }
}

const minhasContas = () => screen.findByRole('region', { name: 'Minhas Contas remetentes' })
const canal = async (nome: string) => within(await minhasContas()).findByRole('listitem', { name: nome })

describe('Minhas Contas remetentes no Workspace operacional', () => {
  it('o titular vê em Meu perfil cada Canal de abordagem com o estado que o backend registrou', async () => {
    abrirMeuPerfil({
      contas: [
        contaRemetente({ id: 'e', status: 'ready', provider: 'GOOGLE' }),
        contaRemetente({ id: 'w', channel: 'whatsapp', provider: 'WHATSAPP', status: 'reconnect_required', reconciliation_required: true }),
        contaRemetente({ id: 'l', channel: 'linkedin', provider: 'LINKEDIN', status: 'syncing' }),
      ],
    })

    const email = await canal('E-mail')
    expect(await within(email).findByText('Pronta')).toBeInTheDocument()
    expect(within(email).getByText('Google')).toBeInTheDocument()
    expect(within(email).getByRole('button', { name: 'Desconectar E-mail' })).toBeInTheDocument()
    expect(within(email).queryByRole('button', { name: 'Conectar E-mail' })).not.toBeInTheDocument()

    const whatsapp = await canal('WhatsApp')
    expect(within(whatsapp).getByText('Requer reconexão')).toBeInTheDocument()
    expect(within(whatsapp).getByRole('button', { name: 'Reconectar WhatsApp' })).toBeInTheDocument()

    const linkedin = await canal('LinkedIn')
    expect(within(linkedin).getByText('Sincronizando')).toBeInTheDocument()
    expect(within(linkedin).queryByRole('button', { name: /Conectar|Reconectar/ })).not.toBeInTheDocument()

    // O resto do perfil vem do backend (CRM-08), e nada da Demonstração aparece no lugar.
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Souza')
    expect(screen.queryByText(/ainda não estão disponíveis neste Workspace/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Databricks|Marina Alves/)).not.toBeInTheDocument()
  })

  it('diferencia conectando, a conferência depois de uma queda e desconectada', async () => {
    abrirMeuPerfil({
      contas: [
        contaRemetente({ id: 'e', status: 'connecting' }),
        contaRemetente({ id: 'w', channel: 'whatsapp', provider: 'WHATSAPP', status: 'syncing', reconciliation_required: true }),
        contaRemetente({ id: 'l', channel: 'linkedin', provider: 'LINKEDIN', status: 'disconnected' }),
      ],
    })

    expect(await within(await canal('E-mail')).findByText('Conectando')).toBeInTheDocument()

    const whatsapp = await canal('WhatsApp')
    expect(within(whatsapp).getByText('Conferindo respostas')).toBeInTheDocument()
    expect(within(whatsapp).getByText(/Conferindo respostas do período fora do ar/)).toBeInTheDocument()
    expect(within(whatsapp).queryByText('Sincronizando')).not.toBeInTheDocument()

    const linkedin = await canal('LinkedIn')
    expect(within(linkedin).getByText('Desconectada')).toBeInTheDocument()
    expect(within(linkedin).getByRole('button', { name: 'Conectar LinkedIn' })).toBeInTheDocument()
  })

  it('um Canal sem Conta remetente oferece a conexão', async () => {
    abrirMeuPerfil()

    const email = await canal('E-mail')
    expect(await within(email).findByText('Não conectada')).toBeInTheDocument()
    expect(within(email).getByRole('button', { name: 'Conectar E-mail' })).toBeInTheDocument()
  })

  it('conectar abre o link hospedado novo em outra aba e avisa que o estado aparece aqui, sem dizer que a conta foi conectada', async () => {
    const { pedidos, abrir, usuario } = abrirMeuPerfil()

    await usuario.click(await within(await canal('WhatsApp')).findByRole('button', { name: 'Conectar WhatsApp' }))

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://account.unipile.com/link-novo', '_blank', 'noopener,noreferrer'))
    expect(pedidos).toEqual([{ action: 'connect', workspaceId: 'ws-norte', channel: 'whatsapp' }])
    const aviso = await within(await minhasContas()).findByText(/A autenticação do WhatsApp abriu em outra aba/)
    expect(aviso).toHaveTextContent('o estado aparece aqui quando o provedor confirmar a conexão')
    // Se o navegador bloqueou a aba nova, o mesmo link continua à mão.
    expect(within(aviso).getByRole('link', { name: 'abra a autenticação por aqui' })).toHaveAttribute(
      'href',
      'https://account.unipile.com/link-novo',
    )
    expect(within(await canal('WhatsApp')).getByText('Não conectada')).toBeInTheDocument()
    expect(screen.queryByText(/Pronta|conectada com sucesso/i)).not.toBeInTheDocument()
  })

  it('uma conexão recusada pelo backend diz o motivo e não abre nada', async () => {
    const { abrir, usuario } = abrirMeuPerfil({
      responder: () => ({ status: 502, corpo: { error: 'A Unipile não conseguiu iniciar a conexão. Tente novamente.' } }),
    })

    await usuario.click(await within(await canal('E-mail')).findByRole('button', { name: 'Conectar E-mail' }))

    const mensagem = await screen.findByText('A Unipile não conseguiu iniciar a conexão. Tente novamente.')
    expect(mensagem.closest('[role="alert"]')).not.toBeNull()
    expect(abrir).not.toHaveBeenCalled()
  })

  it('reconectar reautentica a mesma Conta remetente', async () => {
    const { pedidos, abrir, usuario } = abrirMeuPerfil({
      contas: [contaRemetente({ id: 'conta-email', status: 'reconnect_required', reconciliation_required: true })],
    })

    await usuario.click(await within(await canal('E-mail')).findByRole('button', { name: 'Reconectar E-mail' }))

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://account.unipile.com/link-novo', '_blank', 'noopener,noreferrer'))
    expect(pedidos).toEqual([{ action: 'reconnect', workspaceId: 'ws-norte', channel: 'email', senderAccountId: 'conta-email' }])
  })

  it('desconectar pede confirmação e mostra o estado que o backend gravou', async () => {
    const { backend, pedidos, usuario } = abrirMeuPerfil({
      contas: [contaRemetente({ id: 'conta-email', status: 'ready' })],
      responder: (corpo) => {
        backend.contas = [contaRemetente({ id: 'conta-email', status: 'disconnected' })]
        return { corpo: corpo.action === 'disconnect' ? { ok: true } : {} }
      },
    })

    await usuario.click(await within(await canal('E-mail')).findByRole('button', { name: 'Desconectar E-mail' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Desconectar E-mail' })
    expect(pedidos).toEqual([])
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Desconectar' }))

    const email = await canal('E-mail')
    expect(await within(email).findByText('Desconectada')).toBeInTheDocument()
    expect(within(email).getByRole('button', { name: 'Conectar E-mail' })).toBeInTheDocument()
    expect(pedidos).toEqual([{ action: 'disconnect', workspaceId: 'ws-norte', senderAccountId: 'conta-email' }])
  })

  it('depois de abrir a autenticação, espera a confirmação do backend e atualiza sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { backend, usuario } = abrirMeuPerfil()
    await usuario.click(await within(await canal('E-mail')).findByRole('button', { name: 'Conectar E-mail' }))
    expect(await screen.findByText(/A autenticação do E-mail abriu em outra aba/)).toBeInTheDocument()

    // O retorno da autenticação cai em Conexões, na outra aba: só o backend diz que a conta entrou.
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(within(await canal('E-mail')).getByText('Não conectada')).toBeInTheDocument()

    backend.contas = [contaRemetente({ status: 'syncing' })]
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(await within(await canal('E-mail')).findByText('Sincronizando')).toBeInTheDocument()
    // O backend respondeu por este Canal: o aviso da espera sai, e o estado da linha fala por si.
    expect(screen.queryByText(/abriu em outra aba/)).not.toBeInTheDocument()

    backend.contas = [contaRemetente({ status: 'ready' })]
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()
  })

  it('a espera termina quando o link hospedado vence, sem a lista ficar consultando o backend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { listagens, usuario } = abrirMeuPerfil()
    await usuario.click(await within(await canal('LinkedIn')).findByRole('button', { name: 'Conectar LinkedIn' }))
    expect(await screen.findByText(/A autenticação do LinkedIn abriu em outra aba/)).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000))

    expect(screen.queryByText(/abriu em outra aba/)).not.toBeInTheDocument()
    const antes = listagens.length
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(listagens.length).toBe(antes)
  })

  it('ao voltar para esta aba, relê a lista, porque o estado pode ter mudado lá fora', async () => {
    const { backend } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'ready' })] })
    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()

    backend.contas = [contaRemetente({ status: 'reconnect_required', reconciliation_required: true })]
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await within(await canal('E-mail')).findByText('Requer reconexão')).toBeInTheDocument()
  })

  it('com as contas prontas, a lista não fica consultando o backend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { listagens } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'ready' })] })

    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()
    const antes = listagens.length
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(listagens.length).toBe(antes)
  })

  it('uma conta que o backend deixou parada não é consultada para sempre', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { listagens } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'syncing', reconciliation_required: true })] })
    expect(await within(await canal('E-mail')).findByText('Conferindo respostas')).toBeInTheDocument()

    const antes = listagens.length
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(listagens.length).toBeGreaterThan(antes)

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000))
    const depoisDoLimite = listagens.length
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(listagens.length).toBe(depoisDoLimite)
  })

  it('a pessoa atualiza a lista quando quiser', async () => {
    const { backend, usuario } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'reconnect_required' })] })
    expect(await within(await canal('E-mail')).findByText('Requer reconexão')).toBeInTheDocument()

    backend.contas = [contaRemetente({ status: 'ready' })]
    await usuario.click(within(await minhasContas()).getByRole('button', { name: 'Atualizar' }))

    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()
  })

  it('Atualizar relê o backend e diz quando a lista foi atualizada, mesmo sem mudança', async () => {
    const { listagens, usuario } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'ready' })] })
    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()
    const antes = listagens.length

    await usuario.click(within(await minhasContas()).getByRole('button', { name: 'Atualizar' }))

    expect(await within(await minhasContas()).findByText(/Lista atualizada às \d{2}:\d{2}/)).toBeInTheDocument()
    expect(listagens.length).toBeGreaterThan(antes)
    expect(within(await minhasContas()).getByRole('button', { name: 'Atualizar' })).toBeEnabled()
  })

  it('se a releitura falhar, Atualizar mostra o erro e deixa tentar de novo', async () => {
    const { backend, usuario } = abrirMeuPerfil({ contas: [contaRemetente({ status: 'ready' })] })
    expect(await within(await canal('E-mail')).findByText('Pronta')).toBeInTheDocument()

    backend.falhar = true
    await usuario.click(within(await minhasContas()).getByRole('button', { name: 'Atualizar' }))

    expect(await within(await minhasContas()).findByText('Não foi possível carregar suas Contas remetentes.')).toBeInTheDocument()
    expect(within(await minhasContas()).getByRole('button', { name: 'Atualizar' })).toBeEnabled()
  })

  it('diz de qual Workspace são as Contas remetentes mostradas', async () => {
    abrirMeuPerfil()

    expect(await within(await minhasContas()).findByText(/conectou no Workspace Norte Distribuidora/)).toBeInTheDocument()
  })

  it('mostra X de Y hoje e a fila de amanhã na Conta remetente pronta', async () => {
    abrirMeuPerfil({
      contas: [contaRemetente({ id: 'wa', channel: 'whatsapp', provider: 'WHATSAPP', status: 'ready' })],
      cotas: [
        {
          sender_account_id: 'wa',
          channel: 'whatsapp',
          used_today: 5,
          cap_today: 5,
          queued_for_tomorrow: 1,
          warming: true,
        },
      ],
    })

    const whatsapp = await canal('WhatsApp')
    expect(await within(whatsapp).findByText('5 de 5 hoje · 1 na fila para amanhã · em aquecimento')).toBeInTheDocument()
  })

  it('sem a cota no backend, a lista segue sem o contador', async () => {
    abrirMeuPerfil({
      contas: [contaRemetente({ id: 'wa', channel: 'whatsapp', provider: 'WHATSAPP', status: 'ready' })],
    })

    const whatsapp = await canal('WhatsApp')
    expect(await within(whatsapp).findByText('Pronta')).toBeInTheDocument()
    expect(within(whatsapp).queryByText(/na fila para amanhã/)).not.toBeInTheDocument()
  })
})

describe('Minhas Contas remetentes na Demonstração', () => {
  it('explica que as Contas remetentes se conectam no Workspace operacional, sem oferecer conexão', async () => {
    renderizarApp('/configuracoes/perfil')

    const bloco = await minhasContas()
    expect(within(bloco).getByText(/Na Demonstração, nenhuma Conta remetente é conectada/)).toBeInTheDocument()
    expect(within(bloco).queryByRole('button')).not.toBeInTheDocument()
    expect(within(bloco).queryByText(/na fila para amanhã/)).not.toBeInTheDocument()
  })
})
