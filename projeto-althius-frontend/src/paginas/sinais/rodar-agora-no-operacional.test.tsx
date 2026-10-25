import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// Rodar agora no Workspace operacional (agente-de-sinal 02): a tela fala com as funções do banco (`quote_signal_run`,
// `request_signal_run_now`, `list_signal_runs`, `list_signal_run_findings`) e mostra a prévia em créditos, a fila, a Rodada e
// os Sinais encontrados com o "por que apareceu". Nada de US$ nem de Teto na tela.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'
const RODADA = '9b1c2d3e-4a5b-4c6d-8e7f-0000000000dd'
const PEDIDO = 'a01c2d3e-4a5b-4c6d-8e7f-0000000000ee'

const PLANO = {
  versao: 1,
  origem: 'briefing',
  escopo: { tipo: 'contas', contaIds: [CONTA] },
  sinais: [{ tipo: 'vaga_linkedin', criterios: { funcoes: ['RevOps e GTM'], periodo: 'Últimos 30 dias' } }],
  explicacao: 'Vamos acompanhar “Abertura de vagas”.',
  maxEmpresasPorRodada: 25,
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

interface Estado {
  bloqueio: string | null
  rodadas: Record<string, unknown>[]
  solicitacoes: Record<string, unknown>[]
  achados: Record<string, unknown>[]
  recusa?: string
}

function abrir(parcial: Partial<Estado> = {}) {
  const estado: Estado = { bloqueio: null, rodadas: [], solicitacoes: [], achados: [], ...parcial }
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const registrar = (nome: string, parametros: Record<string, unknown>) => chamadas.push({ nome, parametros })
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', `/sinais/tipos/abertura-de-vagas/${MONITOR}`)
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: 'admin', user_id: MARINA.id, active: true },
      ],
      target_accounts: [{
        id: CONTA, workspace_id: NORTE.id, name: 'Norte Alimentos', canonical_url: 'https://nortealimentos.com.br',
        domain: 'nortealimentos.com.br', linkedin_url: null, segment: null, last_interaction_at: null,
      }],
      sales_responsibilities: [],
      account_interactions: [],
      target_contacts: [],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_signal_actors: () => [{ signal_type: 'vaga_linkedin', state: 'available' }],
      list_signal_catalog: () => [],
      list_signal_monitors: () => [{
        id: MONITOR,
        signal_type: 'vaga_linkedin',
        name: 'Vagas de RevOps',
        state: 'rascunho',
        audience: { accountIds: [CONTA] },
        criteria: PLANO.sinais[0].criterios,
        last_error: null,
        brief: 'Quero saber quando abrirem vaga de RevOps.',
        plan: PLANO,
        plan_version: 1,
        plan_origin: 'briefing',
        last_run: null,
      }],
      list_signals: () => [],
      list_account_signals: () => [],
      quote_signal_run: (p) => {
        registrar('quote_signal_run', p)
        return [{
          contas: 3, contas_sem_dado: 1, creditos_por_conta: 2, ate_creditos: 6, saldo: 180, ilimitado: false,
          bloqueio: estado.bloqueio, liberado_em: estado.bloqueio === 'intervalo_minimo' ? '2026-10-23T17:30:00.000Z' : null,
        }]
      },
      request_signal_run_now: (p) => {
        registrar('request_signal_run_now', p)
        if (estado.recusa) throw new Error(`signal run blocked: ${estado.recusa}`)
        estado.solicitacoes = [{ id: PEDIDO, estado: 'pendente', pedidaEm: '2026-10-23T12:00:00.000Z', ateCreditos: 6, rodadaId: null }]
        return PEDIDO
      },
      list_signal_runs: (p) => {
        registrar('list_signal_runs', p)
        return { rodadas: estado.rodadas, solicitacoes: estado.solicitacoes }
      },
      list_signal_run_findings: (p) => {
        registrar('list_signal_run_findings', p)
        return estado.achados
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  const chamou = (nome: string) => chamadas.filter((c) => c.nome === nome).map((c) => c.parametros)
  return { usuario, estado, chamou }
}

const RODADA_NO_BANCO = {
  id: RODADA, origem: 'manual', estado: 'concluida', iniciadaEm: '2026-10-23T13:00:00.000Z', terminouEm: '2026-10-23T13:03:00.000Z',
  contasNoEscopo: 3, contasVerificadas: 2, contasSemDado: 1, sinaisNovos: 1, sinaisRepetidos: 0, creditos: 4,
  motivoDaParada: 'concluida', versaoDoPlano: 1, observacao: 'Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.',
}

describe('Rodar agora no Workspace operacional', () => {
  it('a prévia vem do banco, em créditos, e o pedido entra na fila com o Monitoramento certo', async () => {
    const { usuario, chamou } = abrir()

    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(
      'Vai verificar até 3 Contas. Até 6 créditos (2 por Conta). Seu saldo: 180 créditos. Contas sem dado suficiente não são cobradas.',
    )).toBeInTheDocument()
    expect(within(dialogo).getByText('Pelo que sabemos, 1 Conta não tem dado suficiente e deve ficar de fora.')).toBeInTheDocument()
    expect(chamou('quote_signal_run')[0]).toEqual({ p_workspace_id: NORTE.id, p_monitor_id: MONITOR })
    expect(dialogo.textContent).not.toMatch(/US\$|teto|apify|actor/i)

    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))

    expect(await screen.findByText('Na fila. Começa em até 10 minutos.')).toBeInTheDocument()
    expect(chamou('request_signal_run_now')).toEqual([{ p_workspace_id: NORTE.id, p_monitor_id: MONITOR }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // O pedido nunca mexe no Monitoramento: nada é gravado pelo editor.
    expect(chamou('save_signal_monitor')).toEqual([])
    expect(chamou('set_signal_monitor_state')).toEqual([])
  })

  it.each([
    ['sem_creditos', 'Sem créditos suficientes. Fale com o responsável pelo plano.'],
    ['contrato_inativo', 'Contrato inativo. Fale com a equipe Althius para reativar.'],
    ['limite_do_mes', 'Limite do mês atingido. Ele volta na renovação ou fale com a equipe Althius.'],
    ['limite_do_participante', 'Você chegou ao seu limite mensal de créditos. Fale com o responsável pelo plano.'],
    ['intervalo_minimo', 'Este Sinal rodou há pouco. Tente de novo depois das 14:30.'],
  ])('o bloqueio %s do banco vira o texto do produto, com o botão desabilitado', async (bloqueio, frase) => {
    abrir({ bloqueio })

    // O aviso de contrato inativo da Casca usa a mesma frase, então o texto do botão se confere pela descrição dele.
    const botao = await screen.findByRole('button', { name: 'Rodar agora' })
    await waitFor(() => expect(botao).toBeDisabled())
    expect(botao).toHaveAccessibleDescription(frase)
  })

  it('a recusa do banco na hora de pedir (já tem uma na fila) aparece na confirmação', async () => {
    const { usuario, estado } = abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Rodar agora' }))
    const dialogo = await screen.findByRole('dialog')
    estado.recusa = 'ja_na_fila'

    await usuario.click(within(dialogo).getByRole('button', { name: 'Rodar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Já tem uma rodada na fila.')
  })

  it('o histórico e os Sinais encontrados vêm do banco, com o "por que apareceu"', async () => {
    const { usuario, chamou } = abrir({
      rodadas: [RODADA_NO_BANCO, { ...RODADA_NO_BANCO, id: 'rodada-agendada', origem: 'agenda', iniciadaEm: '2026-10-22T09:00:00.000Z' }],
      achados: [{
        signal_id: 'sinal-1', target_account_id: CONTA, account_name: 'Norte Alimentos', signal_type: 'vaga_linkedin',
        phrase: 'Abriu vaga: Head de RevOps', fired_at: '2026-10-22T10:00:00.000Z', source: 'LinkedIn',
        evidence: 'https://exemplo.com.br/vagas/1', kind: 'novo',
        why: 'Combina com o Plano: Abertura de vagas (função: RevOps e GTM; período: Últimos 30 dias)',
      }],
    })

    const lista = await screen.findByRole('list', { name: 'Rodadas do Sinal' })
    expect(chamou('list_signal_runs')[0]).toEqual({ p_workspace_id: NORTE.id, p_monitor_id: MONITOR })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens[0]).toHaveTextContent('23/10/2026 10:00')
    expect(itens[0]).toHaveTextContent('Manual')
    expect(itens[0]).toHaveTextContent('2 Contas verificadas · 1 Sinal novo · 4 créditos · 1 Conta sem dado suficiente')
    expect(itens[0]).toHaveTextContent('Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.')
    expect(itens[1]).toHaveTextContent('Agendada')

    await usuario.click(within(itens[0]).getByRole('button'))
    const cartao = within(await screen.findByRole('list', { name: 'Sinais encontrados' })).getByRole('listitem')
    expect(chamou('list_signal_run_findings')).toEqual([{ p_workspace_id: NORTE.id, p_run_id: RODADA }])
    expect(within(cartao).getByRole('link', { name: 'Norte Alimentos' })).toHaveAttribute('href', `/contas/${CONTA}`)
    expect(cartao).toHaveTextContent('Abriu vaga: Head de RevOps')
    expect(cartao).toHaveTextContent('Por que apareceuCombina com o Plano: Abertura de vagas (função: RevOps e GTM; período: Últimos 30 dias)')
    expect(within(cartao).getByRole('link', { name: 'Ver evidência' })).toHaveAttribute('href', 'https://exemplo.com.br/vagas/1')
  })

  it('a Rodada que está rodando é conferida a cada 30 segundos até terminar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { estado, chamou } = abrir({
      rodadas: [{ ...RODADA_NO_BANCO, estado: 'rodando', terminouEm: null, motivoDaParada: null }],
    })

    expect(await screen.findByText('Rodando.', { selector: '[role="status"]' })).toBeInTheDocument()
    const consultas = chamou('list_signal_runs').length
    estado.rodadas = [RODADA_NO_BANCO]
    await act(async () => { vi.advanceTimersByTime(30_000) })

    expect(await screen.findByText('Concluída.')).toBeInTheDocument()
    expect(chamou('list_signal_runs').length).toBeGreaterThan(consultas)
    const aposTerminar = chamou('list_signal_runs').length
    await act(async () => { vi.advanceTimersByTime(300_000) })
    expect(chamou('list_signal_runs').length).toBe(aposTerminar)
  })

  it('o Sinal sem fonte por Conta (cascata, interno ou mercado) não oferece o botão', async () => {
    abrir({ bloqueio: 'sem_fonte' })

    expect(await screen.findByRole('textbox', { name: 'Nome do monitoramento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rodar agora' })).not.toBeInTheDocument()
  })
})
