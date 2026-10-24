import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// Preço por rodada e limites no Workspace operacional (agente-de-sinal 04): a tela fala com `quote_signal_schedule` (a estimativa
// e o bloqueio), `save_signal_daily_cap` (o limite por dia, onde o servidor confere o máximo) e `list_signal_monitors` (o limite
// gravado e o motivo da pausa). As recusas do banco viram a frase do produto, e o cliente vê só créditos.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'

const PLANO = {
  versao: 1,
  origem: 'briefing',
  escopo: { tipo: 'contas', contaIds: [CONTA] },
  sinais: [{ tipo: 'vaga_linkedin', criterios: { funcoes: ['RevOps e GTM'], periodo: 'Últimos 30 dias' } }],
  explicacao: 'Vamos acompanhar “Abertura de vagas”.',
  maxEmpresasPorRodada: 50,
}

const AGENDA = { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

interface Estado {
  state: string
  schedule: typeof AGENDA | null
  dailyCap: number | null
  pausedReason: string | null
  papel: 'admin' | 'member'
  bloqueio: string | null
  recusaDoLimite?: string
}

/** A linha que `quote_signal_schedule` devolve para a Agenda pedida (12 Contas a 2 créditos, saldo de 110). */
function cotacao(schedule: { horarios: string[]; dias: number[] } | null, bloqueio: string | null) {
  const porDia = schedule ? schedule.horarios.length : 1
  const porSemana = schedule ? schedule.horarios.length * schedule.dias.length : 7
  return [{
    por_rodada: 24,
    rodadas_por_semana: porSemana,
    por_dia: 24 * porDia,
    por_mes_aprox: Math.ceil((porSemana * 52 * 24) / 12),
    saldo: 110,
    dias_de_saldo: Math.floor(110 / ((porSemana * 24) / 7)),
    aviso_repeticao: porDia > 2,
    teto_diario_sugerido: 24 * porDia,
    bloqueio_ativacao: bloqueio,
    ilimitado: false,
  }]
}

function abrir(parcial: Partial<Estado> = {}, rota = `/sinais/tipos/abertura-de-vagas/${MONITOR}`) {
  const estado: Estado = {
    state: 'rascunho', schedule: AGENDA, dailyCap: null, pausedReason: null, papel: 'admin', bloqueio: null, ...parcial,
  }
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const registrar = (nome: string, parametros: Record<string, unknown>) => chamadas.push({ nome, parametros })
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: estado.papel, user_id: MARINA.id, active: true },
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
        state: estado.state,
        audience: { accountIds: [CONTA] },
        criteria: PLANO.sinais[0].criterios,
        last_error: null,
        brief: 'Quero saber quando abrirem vaga de RevOps.',
        plan: PLANO,
        plan_version: 1,
        plan_origin: 'briefing',
        last_run: null,
        schedule: estado.schedule,
        next_run_at: null,
        daily_credit_cap: estado.dailyCap,
        consecutive_skips: estado.pausedReason ? 3 : 0,
        paused_reason: estado.pausedReason,
      }],
      list_signals: () => [],
      list_account_signals: () => [],
      quote_signal_run: () => [{
        contas: 1, contas_sem_dado: 0, creditos_por_conta: 2, ate_creditos: 2, saldo: 180, ilimitado: false, bloqueio: null, liberado_em: null,
      }],
      list_signal_runs: () => ({ rodadas: [], solicitacoes: [] }),
      preview_signal_schedule: () => ['2026-10-26T11:00:00+00:00'],
      quote_signal_schedule: (p) => {
        registrar('quote_signal_schedule', p)
        return cotacao((p.p_schedule as typeof AGENDA | null) ?? estado.schedule, estado.bloqueio)
      },
      save_signal_schedule: (p) => {
        registrar('save_signal_schedule', p)
        estado.schedule = p.p_schedule as typeof AGENDA
        return p.p_schedule
      },
      save_signal_daily_cap: (p) => {
        registrar('save_signal_daily_cap', p)
        if (estado.recusaDoLimite) throw new Error(`daily credit cap invalid: ${estado.recusaDoLimite}`)
        estado.dailyCap = p.p_cap as number
        return p.p_cap
      },
      set_signal_monitor_state: (p) => {
        registrar('set_signal_monitor_state', p)
        estado.state = p.p_state as string
        estado.pausedReason = null
        return null
      },
      save_signal_monitor: (p) => {
        registrar('save_signal_monitor', p)
        estado.state = p.p_state as string
        return MONITOR
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  const chamou = (nome: string) => chamadas.filter((c) => c.nome === nome).map((c) => c.parametros)
  return { usuario, estado, chamou }
}

describe('A estimativa e o limite por dia no Workspace operacional', () => {
  it('lê a estimativa do banco para a Agenda gravada e a mostra só em créditos', async () => {
    const { chamou } = abrir()

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(await within(bloco).findByText(
      'Até 24 créditos por rodada · até 48 por dia · cerca de 1.040 por mês. Seu saldo dura cerca de 3 dias nesse ritmo.',
    )).toBeInTheDocument()
    expect(chamou('quote_signal_schedule').at(-1)).toEqual({
      p_workspace_id: NORTE.id,
      p_monitor_id: MONITOR,
      p_schedule: { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo' },
    })
    expect(bloco.textContent).not.toMatch(/US\$|\$|teto|apify|actor/i)
  })

  it('mudar a Agenda pede uma nova estimativa com a proposta, e o aviso de repetição vem do banco', async () => {
    const { usuario, chamou } = abrir()
    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    await within(bloco).findByText(/cerca de 1\.040 por mês/)

    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '18:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))

    expect(await within(bloco).findByText(/até 72 por dia · cerca de 1\.560 por mês/)).toBeInTheDocument()
    expect(await within(bloco).findByText('Rodar várias vezes por dia costuma repetir resultados.')).toBeInTheDocument()
    expect(chamou('quote_signal_schedule').at(-1)?.p_schedule).toEqual({
      horarios: ['08:00', '14:00', '18:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo',
    })
  })

  it('grava o limite por dia com o Monitoramento certo, depois de gravar a Agenda', async () => {
    const { usuario, chamou, estado } = abrir({ schedule: null })
    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    const campo = await within(bloco).findByLabelText('Limite por dia')
    await waitFor(() => expect(campo).toHaveValue('24'))
    await usuario.clear(campo)
    await usuario.type(campo, '20')

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(chamou('save_signal_daily_cap')).toEqual([{ p_workspace_id: NORTE.id, p_monitor_id: MONITOR, p_cap: 20 }]))
    expect(chamou('save_signal_schedule')).toHaveLength(1)
    expect(estado.dailyCap).toBe(20)
    expect(await within(bloco).findByRole('status')).toHaveTextContent('Agenda salva.')
  })

  it('o limite que o banco já tem aparece no campo', async () => {
    abrir({ dailyCap: 30 })

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(await within(bloco).findByLabelText('Limite por dia')).toHaveValue('30')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
  })

  it('a recusa do banco vira a frase do produto, sem texto técnico', async () => {
    const { usuario } = abrir({ dailyCap: 30, recusaDoLimite: 'acima_do_sugerido' })
    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    const campo = await within(bloco).findByLabelText('Limite por dia')
    await usuario.clear(campo)
    await usuario.type(campo, '40')

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    const alerta = await within(bloco).findByRole('alert')
    expect(alerta).toHaveTextContent('O limite não pode passar do máximo de um dia da agenda.')
    expect(alerta.textContent).not.toMatch(/daily|credit cap|invalid|acima_do_sugerido/)
  })
})

describe('Ativar e reativar no Workspace operacional', () => {
  it('o Sinal pausado por falta de créditos mostra o aviso; Reativar confirma, grava o limite padrão e ativa', async () => {
    const { usuario, chamou, estado } = abrir({ state: 'pausado', pausedReason: 'sem_creditos' })

    const aviso = await screen.findByRole('complementary', { name: /Pausado por falta de créditos/ })
    expect(within(aviso).getByRole('link', { name: 'Ver créditos' })).toHaveAttribute('href', '/configuracoes/plano')
    await usuario.click(within(aviso).getByRole('button', { name: 'Reativar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    expect(await within(dialogo).findByText(/cerca de 1\.040 por mês/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(chamou('set_signal_monitor_state')).toEqual([{ p_id: MONITOR, p_state: 'ativo' }]))
    expect(chamou('save_signal_daily_cap')).toEqual([{ p_workspace_id: NORTE.id, p_monitor_id: MONITOR, p_cap: 48 }])
    expect(estado.state).toBe('ativo')
    await waitFor(() => expect(screen.queryByRole('complementary', { name: /Pausado por falta de créditos/ })).not.toBeInTheDocument())
  })

  it('o Sinal pausado pela pessoa não leva o aviso de créditos', async () => {
    abrir({ state: 'pausado' })

    await screen.findByRole('region', { name: 'Agenda' })
    expect(screen.queryByText('Pausado por falta de créditos')).not.toBeInTheDocument()
  })

  it('a lista "Meus Sinais" mostra o Sinal pausado por falta de créditos', async () => {
    abrir({ state: 'pausado', pausedReason: 'sem_creditos' }, '/sinais')

    const meus = await screen.findByRole('region', { name: 'Meus Sinais' })
    const grupo = await within(meus).findByRole('group', { name: 'Sinais pausados por falta de créditos' })
    expect(within(grupo).getByText(/Vagas de RevOps/)).toBeInTheDocument()
    expect(within(grupo).getByRole('link', { name: 'Ver créditos' })).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
  })

  it('sem automação liberada, quem é Administrador recebe o caminho para configurar e quem não é, o pedido, e o valor do Teto nunca aparece', async () => {
    const admin = abrir({ state: 'pausado', pausedReason: 'sem_creditos', bloqueio: 'sem_teto_automacao', papel: 'admin' })
    await admin.usuario.click(within(await screen.findByRole('complementary', { name: /Pausado por falta de créditos/ })).getByRole('button', { name: 'Reativar' }))
    const dialogoDoAdmin = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    expect(await within(dialogoDoAdmin).findByRole('link', { name: 'Configurar a automação' })).toHaveAttribute('href', '/configuracoes/automacao')
    expect(within(dialogoDoAdmin).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(dialogoDoAdmin.textContent).not.toMatch(/US\$|\$|teto/i)
    cleanup()

    const membro = abrir({ state: 'pausado', pausedReason: 'sem_creditos', bloqueio: 'sem_teto_automacao', papel: 'member' })
    await membro.usuario.click(within(await screen.findByRole('complementary', { name: /Pausado por falta de créditos/ })).getByRole('button', { name: 'Reativar' }))
    const dialogoDoMembro = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    expect(await within(dialogoDoMembro).findByText('Peça ao responsável pelo plano para liberar a automação.')).toBeInTheDocument()
    expect(within(dialogoDoMembro).queryByRole('link', { name: /automação/i })).not.toBeInTheDocument()
    expect(within(dialogoDoMembro).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(dialogoDoMembro.textContent).not.toMatch(/US\$|\$|teto/i)
    expect(membro.chamou('set_signal_monitor_state')).toEqual([])
  })

  it('sem créditos para uma rodada o Sinal não reativa e a frase é a do produto', async () => {
    const { usuario, chamou } = abrir({ state: 'pausado', pausedReason: 'sem_creditos', bloqueio: 'sem_creditos' })

    await usuario.click(within(await screen.findByRole('complementary', { name: /Pausado por falta de créditos/ })).getByRole('button', { name: 'Reativar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    expect(await within(dialogo).findByText('Sem créditos suficientes. Fale com o responsável pelo plano.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(chamou('set_signal_monitor_state')).toEqual([])
  })
})
