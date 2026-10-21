import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// Os Sinais internos reais (CRM-10): no Workspace operacional, Ausência de resposta e Negociação parada saem das
// Interações gravadas, sem actor do Apify e sem crédito. O Monitoramento interno só pede o prazo, é avaliado ao ativar e
// os Sinais aparecem na página de Sinais e na Conta, com a fonte e a evidência. Nada simulado aparece.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const OUTRA_CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000ab'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'
const SINAL = '9a1c2d3e-4a5b-4c6d-8e7f-0000000000dd'
const EVIDENCIA =
  'Primeiro envio sem resposta: e-mail em 29/08/2026. Nenhuma resposta, ligação ou reunião registrada desde então (prazo do Monitoramento: 30 dias).'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

interface MonitorNoBanco {
  id: string
  signal_type: string
  name: string
  state: string
  audience: { accountIds: string[] }
  criteria: Record<string, unknown>
  last_error: string | null
  last_run: Record<string, unknown> | null
}

interface SinalNoBanco {
  id: string
  target_account_id: string
  monitor_id: string | null
  signal_type: string
  event_key: string
  phrase: string
  fired_at: string
  source: string | null
  evidence: string | null
  seen_again_at: string | null
  seen_again_monitor_id: string | null
  valid: boolean
}

function contaNoBanco(id: string, nome: string, dominio: string) {
  return {
    id,
    workspace_id: NORTE.id,
    name: nome,
    canonical_url: `https://${dominio}`,
    domain: dominio,
    linkedin_url: null,
    segment: null,
    last_interaction_at: null,
  }
}

function sinalInterno(extra: Partial<SinalNoBanco> = {}): SinalNoBanco {
  return {
    id: SINAL,
    target_account_id: CONTA,
    monitor_id: MONITOR,
    signal_type: 'sem_resposta',
    event_key: 'sem_resposta|interacao-1',
    phrase: 'Sem resposta desde 29/08/2026',
    fired_at: new Date().toISOString(),
    source: 'Interações da Conta',
    evidence: EVIDENCIA,
    seen_again_at: null,
    seen_again_monitor_id: null,
    valid: true,
    ...extra,
  }
}

/**
 * O Workspace operacional sem nenhum actor do Apify disponível e com os Sinais internos no catálogo do banco. Ativar um
 * Monitoramento interno faz o que o banco faz: avalia as Interações na hora, grava a rodada e o Sinal encontrado.
 */
function abrir(rota: string, opcoes: { monitores?: MonitorNoBanco[]; sinais?: SinalNoBanco[] | 'falha' } = {}) {
  const gravacoes: Record<string, unknown>[] = []
  const monitores = [...(opcoes.monitores ?? [])]
  const sinais = opcoes.sinais === 'falha' ? 'falha' : [...(opcoes.sinais ?? [])]
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: 'admin', user_id: MARINA.id, active: true },
      ],
      target_accounts: [
        contaNoBanco(CONTA, 'Norte Alimentos', 'nortealimentos.com.br'),
        contaNoBanco(OUTRA_CONTA, 'Sul Logística', 'sullogistica.com.br'),
      ],
      sales_responsibilities: [],
      account_interactions: [],
      target_contacts: [],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_signal_actors: () => [
        { signal_type: 'vaga_linkedin', state: 'testing' },
        { signal_type: 'nova_lideranca', state: 'testing' },
      ],
      list_signal_catalog: () => [
        { signal_type: 'negociacao_parada', origin: 'interno', state: 'available' },
        { signal_type: 'sem_resposta', origin: 'interno', state: 'available' },
        // Como em produção: o catálogo só mostra ao cliente o Sinal que roda (catalogo-so-funcionais).
        { signal_type: 'proposta_recusada', origin: 'interno', state: 'available' },
        { signal_type: 'nova_lideranca', origin: 'externo', state: 'testing' },
        { signal_type: 'vaga_linkedin', origin: 'externo', state: 'testing' },
      ],
      list_signal_monitors: () => monitores,
      list_signals: (p) => {
        if (sinais === 'falha') throw new Error('permission denied')
        return sinais.filter((s) => !p.p_target_account_id || s.target_account_id === p.p_target_account_id)
      },
      list_account_signals: () => {
        if (sinais === 'falha') return []
        return [...new Set(sinais.map((s) => s.target_account_id))].map((conta) => {
          const daConta = sinais.filter((s) => s.target_account_id === conta)
          return {
            target_account_id: conta,
            valid_signals: daConta.filter((s) => s.valid).length,
            hot: daConta.some((s) => s.valid),
            last_phrase: daConta[0].phrase,
            last_fired_at: daConta[0].fired_at,
          }
        })
      },
      // Os internos não entram na busca de novo: sem Monitoramento externo ativo, não há o que buscar.
      quote_account_rescan: () => [
        { monitors: 0, credits: 0, available: 10, in_progress: false, last_finished_at: null, last_error: null },
      ],
      save_signal_monitor: (p) => {
        gravacoes.push(p)
        const audiencia = p.p_audience as { accountIds: string[] }
        if (p.p_state === 'ativo' && audiencia.accountIds.length === 0) {
          throw new Error('an active monitor needs at least one target account')
        }
        const id = typeof p.p_id === 'string' && p.p_id ? p.p_id : MONITOR
        const ativo = p.p_state === 'ativo'
        const salvo: MonitorNoBanco = {
          id,
          signal_type: String(p.p_signal_type),
          name: String(p.p_name),
          state: String(p.p_state),
          audience: audiencia,
          criteria: (p.p_criteria ?? {}) as Record<string, unknown>,
          last_error: null,
          last_run: ativo
            ? {
                state: 'concluida', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
                accountsChecked: audiencia.accountIds.length, signalsNew: 1, signalsRepeated: 0,
              }
            : null,
        }
        const index = monitores.findIndex((m) => m.id === id)
        if (index >= 0) monitores[index] = salvo
        else monitores.push(salvo)
        if (ativo && sinais !== 'falha') sinais.push(sinalInterno({ monitor_id: id }))
        return id
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, gravacoes }
}

describe('Sinais internos no catálogo do Workspace operacional', () => {
  it('Ausência de resposta, Negociação parada e Proposta recusada são cards iguais, sem selo', async () => {
    abrir('/sinais')

    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    expect(await within(catalogo).findByRole('link', { name: /Ausência de resposta/ })).toHaveAttribute('href', '/sinais/tipos/sem-resposta')
    expect(within(catalogo).getByRole('link', { name: /Negociação parada/ })).toHaveAttribute('href', '/sinais/tipos/negociacao-parada')
    expect(within(catalogo).getByRole('link', { name: /Proposta recusada/ })).toHaveAttribute('href', '/sinais/tipos/proposta-recusada')
    expect(screen.queryByText('Disponível')).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
  })
})

describe('Monitoramento interno no Workspace operacional', () => {
  it('o editor só pede o prazo, explica que usa as Interações e não cobra crédito', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/sem-resposta/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    const prazo = screen.getByRole('spinbutton', { name: 'Há pelo menos' })
    expect(prazo).toHaveValue(45)
    expect(screen.queryByRole('radiogroup', { name: 'Condição' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Etapas do funil' })).not.toBeInTheDocument()
    expect(screen.getByText(/contado pelas Interações registradas na Conta-alvo/)).toBeInTheDocument()
    expect(screen.queryByText(/no CRM/)).not.toBeInTheDocument()
    expect(await screen.findByText(/não gasta crédito/)).toBeInTheDocument()
    expect(screen.queryByText(/Cada Conta varrida debita 1 crédito/)).not.toBeInTheDocument()
    expect(screen.queryByText(/simulad|na demonstração/i)).not.toBeInTheDocument()

    await usuario.clear(prazo)
    await usuario.type(prazo, '30')
    await usuario.click(within(screen.getByRole('group', { name: 'Contas-alvo' })).getByRole('checkbox', { name: /Norte Alimentos/ }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Sem resposta em 30 dias')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByText('Rascunho “Sem resposta em 30 dias” salvo.')).toBeInTheDocument()
    expect(gravacoes).toHaveLength(1)
    expect(gravacoes[0]).toMatchObject({
      p_id: null,
      p_signal_type: 'sem_resposta',
      p_state: 'rascunho',
      p_audience: { accountIds: [CONTA] },
    })
    expect(gravacoes[0].p_criteria).toEqual({ prazo: '30' })
  })

  it('ativado, avalia as Interações na hora: a lista mostra a rodada e o Sinal abre na Conta com a fonte', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/sem-resposta/novo')

    await usuario.click(
      within(await screen.findByRole('group', { name: 'Contas-alvo' })).getByRole('checkbox', { name: /Norte Alimentos/ }),
    )
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Sem resposta')
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(within(revisao).getByText('45 dias')).toBeInTheDocument()
    expect(within(revisao).queryByText('Sem resposta, Negociação parada')).not.toBeInTheDocument()
    expect(within(revisao).getByText(/não gastam crédito/)).toBeInTheDocument()
    expect(within(revisao).queryByText(/Cada Conta varrida debita/)).not.toBeInTheDocument()
    expect(within(revisao).queryByText(/simulad|demonstração/i)).not.toBeInTheDocument()
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    expect(await screen.findByText('“Sem resposta” está ativo.')).toBeInTheDocument()
    expect(gravacoes[0]).toMatchObject({ p_signal_type: 'sem_resposta', p_state: 'ativo', p_criteria: { prazo: '45' } })
    const item = await screen.findByRole('listitem', { name: 'Sem resposta' })
    expect(within(item).getByText('Ativo')).toBeInTheDocument()
    expect(await within(item).findByText('1 Conta-alvo · 1 Sinal disparado')).toBeInTheDocument()
    expect(within(item).getByText('Última rodada: hoje · 1 Conta avaliada · 1 Sinal novo')).toBeInTheDocument()

    await usuario.click(screen.getAllByRole('link', { name: 'Sinais' })[0])
    await usuario.click(await screen.findByRole('button', { name: /^Sinais encontrados/ }))
    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(within(tabela).getByText('Sem resposta desde 29/08/2026')).toBeInTheDocument()
    expect(within(tabela).getByText('Ausência de resposta')).toBeInTheDocument()
    await usuario.click(within(tabela).getByRole('link', { name: 'Norte Alimentos' }))

    const historico = await screen.findByRole('list', { name: 'Histórico de sinais' })
    const sinal = within(historico).getByRole('listitem', { name: 'Sem resposta desde 29/08/2026' })
    expect(within(sinal).getByText(EVIDENCIA)).toBeInTheDocument()
    expect(within(sinal).getByText('Fonte: Interações da Conta')).toBeInTheDocument()
    expect(within(sinal).getByText(/Ausência de resposta · Sem resposta/)).toBeInTheDocument()
    expect(screen.queryByText(/simulad/i)).not.toBeInTheDocument()
  })

  it('a página de Proposta recusada oferece Ativar Monitoramento', async () => {
    abrir('/sinais/tipos/proposta-recusada')

    expect(await screen.findByRole('link', { name: 'Ativar Monitoramento' })).toHaveAttribute(
      'href',
      '/sinais/tipos/proposta-recusada/novo',
    )
    expect(screen.queryByText(/chega em breve/)).not.toBeInTheDocument()
  })
})

describe('Sinal interno na Conta do Workspace operacional', () => {
  it('a Conta fica Quente e o detalhe mostra o Sinal interno com a fonte e a evidência', async () => {
    abrir(`/contas/${CONTA}`, { sinais: [sinalInterno()] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Quente, 1 sinal válido' })).toBeInTheDocument()
    const recente = await screen.findByRole('article', { name: 'Sinal mais recente' })
    expect(within(recente).getByText('Sem resposta desde 29/08/2026')).toBeInTheDocument()
    expect(within(recente).getByText(EVIDENCIA)).toBeInTheDocument()
    expect(within(recente).getByText('Válido')).toBeInTheDocument()
    expect(within(recente).getByText('Fonte: Interações da Conta')).toBeInTheDocument()
  })

  it('"Buscar Sinais de novo" explica que os Sinais internos não entram na busca', async () => {
    abrir(`/contas/${CONTA}`, { sinais: [sinalInterno()] })

    expect(await screen.findByRole('button', { name: 'Buscar Sinais de novo' })).toBeDisabled()
    expect(screen.getByText('Nenhum Monitoramento ativo para buscar.')).toBeInTheDocument()
    expect(screen.getByText(/Os Sinais internos não entram nesta busca/)).toBeInTheDocument()
  })

  it('se os Sinais da Conta não puderem ser lidos, o detalhe diz que falhou em vez de "Nenhum sinal"', async () => {
    const { usuario } = abrir(`/contas/${CONTA}`, { sinais: 'falha' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    const secao = screen.getByRole('region', { name: 'Sinais' })
    expect(await within(secao).findByText('Não foi possível carregar os Sinais da Conta.')).toBeInTheDocument()
    expect(within(secao).queryByText('Nenhum sinal')).not.toBeInTheDocument()
    expect(within(secao).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(secao).findByText('Não foi possível carregar os Sinais da Conta.')).toBeInTheDocument()
  })
})
