import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// A Agenda do Sinal no Workspace operacional (agente-de-sinal 03): a tela fala com `list_signal_monitors` (a Agenda guardada),
// `preview_signal_schedule` (os próximos horários, no cálculo do relógio) e `save_signal_schedule` (a gravação, onde o servidor
// confere os limites). As recusas do banco viram a frase do produto, sem texto técnico.

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
  maxEmpresasPorRodada: 25,
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

interface Estado {
  schedule: { horarios: string[]; dias: number[]; fuso: string } | null
  contas: string[]
  recusaAoGravar?: string
  recusaNaPrevia?: string
}

function abrir(parcial: Partial<Estado> = {}) {
  const estado: Estado = { schedule: null, contas: [CONTA], ...parcial }
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
        state: 'ativo',
        audience: { accountIds: estado.contas },
        criteria: PLANO.sinais[0].criterios,
        last_error: null,
        brief: 'Quero saber quando abrirem vaga de RevOps.',
        plan: PLANO,
        plan_version: 1,
        plan_origin: 'briefing',
        last_run: null,
        schedule: estado.schedule,
        next_run_at: '2026-10-26T11:00:00.000Z',
      }],
      list_signals: () => [],
      list_account_signals: () => [],
      quote_signal_run: () => [{
        contas: 1, contas_sem_dado: 0, creditos_por_conta: 2, ate_creditos: 2, saldo: 180, ilimitado: false, bloqueio: null, liberado_em: null,
      }],
      list_signal_runs: () => ({ rodadas: [], solicitacoes: [] }),
      preview_signal_schedule: (p) => {
        registrar('preview_signal_schedule', p)
        if (estado.recusaNaPrevia) throw new Error(`signal schedule invalid: ${estado.recusaNaPrevia}`)
        return ['2026-10-26T11:00:00+00:00', '2026-10-26T17:00:00+00:00', '2026-10-27T11:00:00+00:00']
      },
      save_signal_schedule: (p) => {
        registrar('save_signal_schedule', p)
        if (estado.recusaAoGravar) throw new Error(`signal schedule invalid: ${estado.recusaAoGravar}`)
        estado.schedule = p.p_schedule as Estado['schedule']
        return p.p_schedule
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  const chamou = (nome: string) => chamadas.filter((c) => c.nome === nome).map((c) => c.parametros)
  return { usuario, estado, chamou }
}

const chips = (bloco: HTMLElement) => within(bloco).queryAllByRole('listitem').map((item) => item.textContent)

describe('A Agenda no Workspace operacional', () => {
  it('lê a Agenda guardada no banco e mostra os próximos horários que o servidor calcula', async () => {
    const { chamou } = abrir({ schedule: { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo' } })

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(chips(bloco)).toEqual(['08:00', '14:00'])
    expect(bloco.textContent).toMatch(/Rodadas por semana\s*10/)
    expect(within(bloco).queryByText(/Sem agenda salva/)).not.toBeInTheDocument()
    expect(await within(bloco).findByText(
      'Próximas rodadas: seg 26/10 por volta de 08:00, seg 26/10 por volta de 14:00 e ter 27/10 por volta de 08:00.',
    )).toBeInTheDocument()
    // A prévia leva a Agenda, o fuso e as Contas no escopo (o servidor confere o limite de 50).
    expect(chamou('preview_signal_schedule').at(-1)).toEqual({
      p_schedule: { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo' },
      p_n: 3,
      p_accounts: 1,
    })
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
  })

  it('o Monitoramento sem Agenda diz que roda a cada 24 horas e sugere a agenda padrão', async () => {
    abrir()

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(within(bloco).getByText(/Sem agenda salva, o Sinal roda a cada 24 horas/)).toBeInTheDocument()
    expect(chips(bloco)).toEqual(['08:00'])
  })

  it('grava com o Monitoramento certo, em ordem e no fuso de Brasília, e confirma', async () => {
    const { usuario, chamou } = abrir()
    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '14:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(chamou('save_signal_schedule')).toEqual([{
      p_workspace_id: NORTE.id,
      p_monitor_id: MONITOR,
      p_schedule: { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5, 6], fuso: 'America/Sao_Paulo' },
    }]))
    expect(await within(bloco).findByRole('status')).toHaveTextContent('Agenda salva.')
    // Gravar a Agenda não mexe no resto do Monitoramento.
    expect(chamou('save_signal_monitor')).toEqual([])
    expect(chamou('set_signal_monitor_state')).toEqual([])
  })

  it('a recusa do servidor vira a frase do produto', async () => {
    const { usuario } = abrir({ recusaAoGravar: 'intervalo_curto' })
    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    const alerta = await within(bloco).findByRole('alert')
    expect(alerta).toHaveTextContent('Deixe pelo menos 1 hora entre uma rodada e outra.')
    expect(alerta.textContent).not.toMatch(/signal|invalid|intervalo_curto/)
  })

  it('uma lista grande não limita a Agenda: sem aviso, e a prévia leva as Contas ao banco', async () => {
    const contas = Array.from({ length: 51 }, (_, i) => `6f1c2d3e-4a5b-4c6d-8e7f-${String(i).padStart(12, '0')}`)
    const { chamou } = abrir({ contas, schedule: { horarios: ['08:00'], dias: [1, 2, 3, 4, 5], fuso: 'America/Sao_Paulo' } })

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(bloco.textContent).not.toMatch(/mais de 50 Contas/)
    await waitFor(() => expect(chamou('preview_signal_schedule').at(-1)?.p_accounts).toBe(51))
  })

  it('uma falha da prévia não derruba o bloco e a frase é neutra', async () => {
    abrir({ recusaNaPrevia: 'formato_invalido' })

    const bloco = await screen.findByRole('region', { name: 'Agenda' })
    expect(await within(bloco).findByText('Não foi possível calcular as próximas rodadas agora.')).toBeInTheDocument()
    expect(chips(bloco)).toEqual(['08:00'])
  })
})
