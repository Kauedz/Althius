import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import type { CanalStep } from '@/fonte/sequencias-tipos'

// C1: a Sequência de WhatsApp ou de LinkedIn, inclusive só de chat, se ativa pela tela com o Destino à vista.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const WORKSPACE_PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const EMAIL = 'maria@empresa-alvo.test'
const WHATSAPP = '+5511999998888'
const PERFIL = 'https://www.linkedin.com/in/maria-souza'

function agendaConfirmada(stepIds: string[]) {
  return {
    p_step_ids: stepIds,
    p_agenda: {
      fuso: 'America/Sao_Paulo',
      diasUteis: [1, 2, 3, 4, 5],
      janela: { de: '09:00', ate: '17:00' },
      maximoDiario: 3,
      intervaloMinutos: 30,
    },
  }
}

async function confirmarAgenda(usuario: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
  await usuario.click(within(dialogo).getByRole('checkbox', { name: /Confirmo o fuso/i }))
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function participacao(workspaceId: string) {
  return { workspace_id: workspaceId, role: 'admin', user_id: MARINA.id, active: true }
}

function passo(canal: CanalStep, titulo: string, id = 'passo-1') {
  return {
    id,
    ordem: id === 'passo-1' ? 1 : 2,
    canal,
    contatoId: 'contato-1',
    delayDiasUteis: 0,
    titulo,
    corpo: 'Olá, Maria.',
    ...(canal === 'email' ? { assunto: 'Olá', modoEmail: 'auto' } : {}),
    ...(canal === 'linkedin' ? { subtipoLinkedIn: 'mensagem' } : {}),
  }
}

function abrir({
  canal,
  titulo,
  contato = {},
  canaisLiberados = ['whatsapp', 'linkedin'] as string[] | null,
  aoAtivar,
  passosExtra = [],
}: {
  canal: CanalStep
  titulo: string
  contato?: { email?: string | null; whatsapp?: string | null; linkedin?: string | null }
  /** null: a leitura dos canais de chat falha. */
  canaisLiberados?: string[] | null
  aoAtivar?: (parametros: Record<string, unknown>) => unknown
  passosExtra?: { canal: CanalStep; titulo: string }[]
}) {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  const sequencia = {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
  const documento = {
    participantesIds: ['contato-1'],
    steps: [
      passo(canal, titulo),
      ...passosExtra.map((item, indice) => passo(item.canal, item.titulo, `passo-${indice + 2}`)),
    ],
  }
  const pedidos: Record<string, unknown>[] = []
  let ativada = false
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [participacao('ws-norte')],
    sequences: [sequencia],
    target_accounts: [{
      id: 'conta-do-norte', workspace_id: 'ws-norte', name: 'Norte', domain: 'norte.test',
      canonical_url: 'https://norte.test', archived_at: null,
    }],
    target_contacts: [{
      id: 'contato-1', workspace_id: 'ws-norte', target_account_id: 'conta-do-norte', name: 'Maria Souza',
      role: null, email: contato.email ?? null, whatsapp: contato.whatsapp ?? null,
      linkedin: contato.linkedin ?? null, last_interaction_at: null,
    }],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: () => {
        const workspaces = (tabelas.workspaces ??= [])
        if (!workspaces.some((w) => w.id === WORKSPACE_PESSOAL.id)) workspaces.push(WORKSPACE_PESSOAL)
        if (!tabelas.workspace_memberships.some((p) => p.workspace_id === WORKSPACE_PESSOAL.id)) {
          tabelas.workspace_memberships.push(participacao(WORKSPACE_PESSOAL.id))
        }
        return WORKSPACE_PESSOAL
      },
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      get_owned_sequence: () => [{ ...sequencia, public_summary: { ...sequencia.public_summary, _document: documento } }],
      list_sequence_step_sends: () => ativada
        ? [{
            id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1',
            destination: canal === 'whatsapp' ? WHATSAPP : canal === 'linkedin' ? PERFIL : EMAIL,
            status: 'scheduled', attempts: 0, confirmed_at: '2026-09-30T12:59:00Z', sent_at: null,
            last_error: null, last_error_at: null, updated_at: '2026-09-30T12:59:00Z', mode: 'auto',
            scheduled_for: '2026-09-30T13:00:00Z',
          }]
        : [],
      list_received_emails: () => [],
      get_sequence_authorization: () => ativada
        ? [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }]
        : [],
      list_enabled_chat_channels: () => {
        if (canaisLiberados === null) throw new Error('canais indisponíveis')
        return canaisLiberados
      },
      activate_sequence: (parametros) => {
        pedidos.push(parametros)
        const marcar = (valor: unknown) => {
          const linha = (Array.isArray(valor) ? valor[0] : valor) as { outcome?: string } | null
          if (linha?.outcome === 'activated') ativada = true
          return valor
        }
        if (aoAtivar) return Promise.resolve(aoAtivar(parametros)).then(marcar)
        ativada = true
        return [{ outcome: 'activated', step_id: 'passo-1', version: 1, scheduled_for: '2026-09-30T13:00:00Z' }]
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, pedidos }
}

describe('Ativar pela tela uma Sequência de WhatsApp ou LinkedIn', () => {
  it('uma Sequência só de WhatsApp abre o diálogo com o número e, ao confirmar, espera a Fonte', async () => {
    let liberar: (valor: unknown) => void = () => {}
    const pendente = new Promise((resolve) => { liberar = resolve })
    const { usuario, pedidos } = abrir({
      canal: 'whatsapp',
      titulo: 'Mensagem no WhatsApp',
      contato: { whatsapp: WHATSAPP },
      canaisLiberados: ['whatsapp'],
      aoAtivar: () => pendente,
    })

    const painel = await screen.findByRole('region', { name: 'Envios automáticos' })
    await usuario.click(within(painel).getByRole('button', { name: 'Ativar envios' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    expect(dialogo).not.toHaveTextContent('Os passos de E-mail abaixo')
    const passos = within(dialogo).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText('Mensagem no WhatsApp')).toBeInTheDocument()
    expect(within(passos).getByText(`WhatsApp · ${WHATSAPP}`, { exact: false })).toBeInTheDocument()

    const ativar = within(dialogo).getByRole('button', { name: 'Ativar' })
    expect(ativar).toBeDisabled()
    await confirmarAgenda(usuario, dialogo)
    await waitFor(() => expect(ativar).toBeEnabled())
    await usuario.click(ativar)
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', ...agendaConfirmada(['passo-1']) }])
    expect(within(dialogo).getByRole('button', { name: 'Ativando…' })).toBeDisabled()

    liberar([{ outcome: 'activated', step_id: 'passo-1', version: 1, scheduled_for: '2026-09-30T13:00:00Z' }])
    expect(await within(painel).findByRole('status')).toHaveTextContent(/Envios ativados/)
    expect(screen.queryByRole('dialog', { name: 'Ativar envios' })).not.toBeInTheDocument()
    expect(await screen.findByText(new RegExp(`para ${WHATSAPP.replace('+', '\\+')}`))).toBeInTheDocument()
    expect(screen.queryByText(/ainda não disponível neste Workspace/)).not.toBeInTheDocument()
  })

  it('uma Sequência só de LinkedIn abre o diálogo com o perfil', async () => {
    const { usuario } = abrir({
      canal: 'linkedin',
      titulo: 'Mensagem no LinkedIn',
      contato: { linkedin: PERFIL },
      canaisLiberados: ['linkedin'],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const passos = within(await screen.findByRole('dialog', { name: 'Ativar envios' })).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText('Mensagem no LinkedIn')).toBeInTheDocument()
    expect(within(passos).getByText(`LinkedIn · ${PERFIL}`, { exact: false })).toBeInTheDocument()
  })

  it('uma Sequência de e-mail continua mostrando o e-mail', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'email',
      titulo: 'Primeiro contato',
      contato: { email: EMAIL },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    expect(dialogo).not.toHaveTextContent('Os passos de E-mail abaixo')
    const passos = within(dialogo).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText(`E-mail · ${EMAIL}`, { exact: false })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    await confirmarAgenda(usuario, dialogo)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ativar' }))
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', ...agendaConfirmada(['passo-1']) }])
  })

  it('uma Sequência sem nenhum Destino não ativa calada', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'whatsapp',
      titulo: 'Mensagem no WhatsApp',
      contato: {},
      canaisLiberados: ['whatsapp'],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    const passos = within(dialogo).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText('Mensagem no WhatsApp')).toBeInTheDocument()
    expect(within(passos).getByText(/Contato sem WhatsApp/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(pedidos).toEqual([])
  })

  it('com o canal desligado, o diálogo avisa que o passo de chat não sai e a ativação não segue', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'linkedin',
      titulo: 'Mensagem no LinkedIn',
      contato: { linkedin: PERFIL },
      canaisLiberados: [],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    expect(await within(dialogo).findByText(/LinkedIn está desligado/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(pedidos).toEqual([])
  })

  it('um passo de chat sem texto diz o canal, e não que falta um passo de E-mail', async () => {
    const { usuario } = abrir({
      canal: 'whatsapp',
      titulo: 'Mensagem no WhatsApp',
      contato: { whatsapp: WHATSAPP },
      canaisLiberados: ['whatsapp'],
      aoAtivar: () => [{ outcome: 'empty_content', step_id: 'passo-1', version: null, scheduled_for: null }],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    const ativar = within(dialogo).getByRole('button', { name: 'Ativar' })
    expect(ativar).toBeDisabled()
    await confirmarAgenda(usuario, dialogo)
    await waitFor(() => expect(ativar).toBeEnabled())
    await usuario.click(ativar)
    const painel = screen.getByRole('region', { name: 'Envios automáticos' })
    const aviso = await within(painel).findByRole('status')
    expect(aviso).toHaveTextContent('Um passo de WhatsApp está sem texto')
    expect(aviso).toHaveTextContent('Passo: "Mensagem no WhatsApp"')
    expect(aviso).not.toHaveTextContent('Um passo de E-mail')
  })

  it('uma Sequência mista com o chat desligado ainda ativa o e-mail e avisa que o chat não sai', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'email',
      titulo: 'Primeiro contato',
      contato: { email: EMAIL, whatsapp: WHATSAPP },
      canaisLiberados: [],
      passosExtra: [{ canal: 'whatsapp', titulo: 'Mensagem no WhatsApp' }],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    expect(await within(dialogo).findByText(/WhatsApp está desligado/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/Este passo não sai/)).toBeInTheDocument()
    const ativar = within(dialogo).getByRole('button', { name: 'Ativar' })
    expect(ativar).toBeDisabled()
    await confirmarAgenda(usuario, dialogo)
    await waitFor(() => expect(ativar).toBeEnabled())
    await usuario.click(ativar)
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', ...agendaConfirmada(['passo-1']) }])
  })

  it('sem conseguir ler o canal, a Sequência mista não ativa e não afirma que o chat ficou de fora', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'email',
      titulo: 'Primeiro contato',
      contato: { email: EMAIL, whatsapp: WHATSAPP },
      canaisLiberados: null,
      passosExtra: [{ canal: 'whatsapp', titulo: 'Mensagem no WhatsApp' }],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    expect(await within(dialogo).findByText(/Não deu para confirmar se WhatsApp está liberado/)).toBeInTheDocument()
    expect(dialogo).not.toHaveTextContent('Este passo não sai')
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(pedidos).toEqual([])
  })

  it('desmarcar um caminho completo tira ele da ativação', async () => {
    const { usuario, pedidos } = abrir({
      canal: 'email',
      titulo: 'Primeiro contato',
      contato: { email: EMAIL },
      passosExtra: [{ canal: 'email', titulo: 'Outro caminho' }],
    })

    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ativar envios' })
    await usuario.click(within(dialogo).getByRole('checkbox', { name: 'Incluir Outro caminho nesta ativação' }))
    await confirmarAgenda(usuario, dialogo)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ativar' }))
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', ...agendaConfirmada(['passo-1']) }])
  })

  it('a Demonstração não mostra o painel de ativação real', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText('WhatsApp com print')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Envios automáticos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar envios' })).not.toBeInTheDocument()
  })
})
