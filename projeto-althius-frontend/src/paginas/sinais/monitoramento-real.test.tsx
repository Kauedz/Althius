import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O Monitoramento real pela tela (sinais-reais 02): no Workspace operacional a pessoa cria o Monitoramento com Contas
// reais, ele grava com o id do banco, e os Sinais gravados aparecem na página de Sinais e no detalhe da Conta. Nada da
// Demonstração completa o que o banco não devolve.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const OUTRA_CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000ab'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'
const MONITOR_NOVO = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000cc'
const SINAL = '9a1c2d3e-4a5b-4c6d-8e7f-0000000000dd'

const LISTAS_DE_EXEMPLO = /Enterprise LATAM|Fintechs Brasil|Oportunidades do HubSpot/
const CONTAS_DE_EXEMPLO = /Anthropic|OpenAI|Stripe|Nubank|Rappi/

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

function sinalNoBanco(extra: Partial<SinalNoBanco> = {}): SinalNoBanco {
  return {
    id: SINAL,
    target_account_id: CONTA,
    monitor_id: MONITOR,
    signal_type: 'vaga_linkedin',
    event_key: 'linkedin:vaga:123',
    phrase: 'Abriu vaga de Engenheiro de Dados',
    fired_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    source: 'LinkedIn',
    evidence: 'https://www.linkedin.com/jobs/view/123',
    seen_again_at: null,
    seen_again_monitor_id: null,
    valid: true,
    ...extra,
  }
}

/** Um monitor ativo de vagas na Conta da Norte, como o banco o guarda. */
function monitorAtivo(): MonitorNoBanco {
  return {
    id: MONITOR,
    signal_type: 'vaga_linkedin',
    name: 'Vagas de dados',
    state: 'ativo',
    audience: { accountIds: [CONTA] },
    criteria: { palavras: 'dados' },
    last_error: null,
  }
}

/**
 * O Workspace operacional com um actor de vagas disponível e duas Contas-alvo reais. Os Monitoramentos e os Sinais
 * ficam no "banco" do teste: o que a tela grava, as próximas leituras devolvem.
 */
function abrir(
  rota: string,
  opcoes: { monitores?: MonitorNoBanco[]; sinais?: SinalNoBanco[] | 'falha'; contas?: ReturnType<typeof contaNoBanco>[] } = {},
) {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const monitores = [...(opcoes.monitores ?? [])]
  const sinais = opcoes.sinais ?? []
  const ativos = () => monitores.filter((m) => m.state === 'ativo').length
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
      target_accounts: opcoes.contas ?? [
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
        { signal_type: 'vaga_linkedin', state: 'available' },
        { signal_type: 'nova_lideranca', state: 'testing' },
      ],
      list_signal_monitors: () => monitores,
      list_signals: (p) => {
        chamadas.push({ nome: 'list_signals', parametros: p })
        if (sinais === 'falha') throw new Error('permission denied')
        return sinais.filter((s) => !p.p_target_account_id || s.target_account_id === p.p_target_account_id)
      },
      list_account_signals: () => {
        if (sinais === 'falha') return []
        const contas = [...new Set(sinais.map((s) => s.target_account_id))]
        return contas.map((conta) => {
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
      // Como o banco: sem Monitoramento ativo não há o que buscar; o custo é 1 crédito por Monitoramento ativo.
      quote_account_rescan: () => [
        { monitors: ativos(), credits: ativos(), available: 10, in_progress: false, last_finished_at: null, last_error: null },
      ],
      save_signal_monitor: (p) => {
        chamadas.push({ nome: 'save_signal_monitor', parametros: p })
        const audiencia = p.p_audience as { accountIds: string[] }
        if (p.p_state === 'ativo' && audiencia.accountIds.length === 0) {
          throw new Error('an active monitor needs at least one target account')
        }
        const id = typeof p.p_id === 'string' && p.p_id ? p.p_id : MONITOR_NOVO
        const salvo: MonitorNoBanco = {
          id,
          signal_type: String(p.p_signal_type),
          name: String(p.p_name),
          state: String(p.p_state),
          audience: audiencia,
          criteria: (p.p_criteria ?? {}) as Record<string, unknown>,
          last_error: null,
        }
        const index = monitores.findIndex((m) => m.id === id)
        if (index >= 0) monitores[index] = salvo
        else monitores.push(salvo)
        return id
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  const gravacoes = () => chamadas.filter((c) => c.nome === 'save_signal_monitor').map((c) => c.parametros)
  return { usuario, chamadas, gravacoes }
}

describe('Criar Monitoramento no Workspace operacional', () => {
  it('grava com o id do banco e as Contas reais, sem as listas de exemplo nem a descoberta por perfil', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
    expect(within(contas).getByRole('checkbox', { name: /Sul Logística/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)
    expect(screen.queryByRole('radio', { name: /Descobrir por perfil|Listas e descoberta/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Público recomendado' })).not.toBeInTheDocument()

    await usuario.click(within(contas).getByRole('checkbox', { name: /Norte Alimentos/ }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas na Norte')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByText('Rascunho “Vagas na Norte” salvo.')).toBeInTheDocument()
    expect(gravacoes()).toHaveLength(1)
    expect(gravacoes()[0]).toMatchObject({
      p_workspace_id: NORTE.id,
      p_id: null,
      p_signal_type: 'vaga_linkedin',
      p_name: 'Vagas na Norte',
      p_state: 'rascunho',
      p_audience: { accountIds: [CONTA] },
    })
    expect(JSON.stringify(gravacoes()[0])).not.toMatch(/novo-|enterprise-latam/)
  })

  it('ativado, aparece na lista com as Contas e liga o "Buscar Sinais de novo" da Conta', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas/novo')

    const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
    await usuario.click(within(contas).getByRole('checkbox', { name: /Norte Alimentos/ }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas na Norte')
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(await within(revisao).findByText('Norte Alimentos')).toBeInTheDocument()
    expect(within(revisao).getByText(/Cada Conta varrida debita 1 crédito/)).toBeInTheDocument()
    expect(within(revisao).queryByText(/na demonstração/i)).not.toBeInTheDocument()
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    expect(await screen.findByText('“Vagas na Norte” está ativo.')).toBeInTheDocument()
    expect(gravacoes()[0]).toMatchObject({ p_id: null, p_state: 'ativo', p_audience: { accountIds: [CONTA] } })
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = await within(lista).findByRole('listitem', { name: 'Vagas na Norte' })
    expect(within(item).getByText('Ativo')).toBeInTheDocument()
    expect(within(item).getByText('1 Conta-alvo')).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Contas e Contatos' }))
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    await usuario.click(within(tabela).getByRole('link', { name: 'Norte Alimentos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Buscar Sinais de novo' })).toBeEnabled()
    expect(screen.queryByText('Nenhum Monitoramento ativo para buscar.')).not.toBeInTheDocument()
  })

  it('ativar sem Conta-alvo mostra a recusa do banco em palavras do produto', async () => {
    const { usuario } = abrir('/sinais/tipos/abertura-de-vagas/novo')

    await screen.findByRole('group', { name: 'Contas-alvo' })
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas sem público')
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    await usuario.click(screen.getByRole('button', { name: 'Ativar monitoramento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha ao menos uma Conta-alvo para ativar o Monitoramento.')
  })

  it('sem Contas-alvo no Workspace, o público diz onde cadastrá-las', async () => {
    abrir('/sinais/tipos/abertura-de-vagas/novo', { contas: [] })

    expect(await screen.findByText(/Nenhuma Conta-alvo neste Workspace/)).toBeInTheDocument()
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)
  })

  it('editar um Monitoramento gravado manda só o uuid dele', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas', { monitores: [monitorAtivo()] })

    await usuario.click(await screen.findByRole('link', { name: 'Vagas de dados' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Vagas de dados' })).toBeInTheDocument()
    const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
    expect(within(contas).getByRole('checkbox', { name: /Norte Alimentos/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)

    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('Alterações salvas em “Vagas de dados”.')).toBeInTheDocument()
    expect(gravacoes()).toHaveLength(1)
    expect(gravacoes()[0]).toMatchObject({ p_id: MONITOR, p_audience: { accountIds: [CONTA] } })
  })

  it('um card visível abre o editor mesmo quando o registro ainda diz em teste', async () => {
    abrir('/sinais/tipos/nova-lideranca/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument()
    expect(screen.queryByText(/ainda não roda de verdade/)).not.toBeInTheDocument()
  })

  it('a Demonstração continua oferecendo as listas de exemplo e a descoberta', async () => {
    renderizarApp('/sinais/tipos/abertura-de-vagas/novo')

    expect(await screen.findByRole('checkbox', { name: /Enterprise LATAM/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Fintechs Brasil/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Oportunidades do HubSpot/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Descobrir por perfil' })).toBeInTheDocument()
  })
})

describe('Sinais gravados no Workspace operacional', () => {
  it('sem Sinal gravado, a página de Sinais mostra zero e a lista vazia, sem os de exemplo', async () => {
    const { usuario } = abrir('/sinais')

    const botao = await screen.findByRole('button', { name: /^Sinais encontrados\s*0$/ })
    await usuario.click(botao)

    expect(await screen.findByText('Nenhum Sinal encontrado ainda.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Sinais encontrados' })).not.toBeInTheDocument()
    expect(screen.queryAllByText(CONTAS_DE_EXEMPLO)).toHaveLength(0)
  })

  it('se os Sinais não puderem ser lidos, a contagem não usa os de exemplo e a lista diz que falhou', async () => {
    const { usuario } = abrir('/sinais', { sinais: 'falha' })

    const botao = await screen.findByRole('button', { name: 'Sinais encontrados' })
    await usuario.click(botao)

    expect(await screen.findByText('Não foi possível carregar os sinais encontrados.')).toBeInTheDocument()
    expect(screen.queryAllByText(CONTAS_DE_EXEMPLO)).toHaveLength(0)
  })

  it('o Sinal gravado aparece na lista com o nome da Conta e abre a Conta com o histórico e a evidência', async () => {
    const { usuario } = abrir('/sinais?vista=encontrados', { monitores: [monitorAtivo()], sinais: [sinalNoBanco()] })

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(within(tabela).getByText('Abriu vaga de Engenheiro de Dados')).toBeInTheDocument()
    await usuario.click(within(tabela).getByRole('link', { name: 'Norte Alimentos' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    const historico = screen.getByRole('list', { name: 'Histórico de sinais' })
    const item = within(historico).getByRole('listitem', { name: 'Abriu vaga de Engenheiro de Dados' })
    expect(within(item).getByText(/Vagas de dados/)).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'Evidência' })).toHaveAttribute('href', 'https://www.linkedin.com/jobs/view/123')
    expect(within(item).getByText('Fonte: LinkedIn')).toBeInTheDocument()
    expect(screen.queryByText(/simulad/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Importada|Recomendada pela Althius/)).not.toBeInTheDocument()
  })

  it('a página do tipo conta os Sinais do Monitoramento e mostra o público em Contas', async () => {
    abrir('/sinais/tipos/abertura-de-vagas', { monitores: [monitorAtivo()], sinais: [sinalNoBanco()] })

    const item = await screen.findByRole('listitem', { name: 'Vagas de dados' })
    expect(await within(item).findByText('1 Conta-alvo · 1 Sinal disparado')).toBeInTheDocument()
    expect(within(item).queryByText(/Nenhuma lista/)).not.toBeInTheDocument()
  })

  it('uma Conta de exemplo não abre no operacional', async () => {
    abrir('/sinais/contas/stripe')

    expect(await screen.findByRole('heading', { level: 2, name: 'Sinais encontrados' })).toBeInTheDocument()
    expect(screen.queryAllByText(CONTAS_DE_EXEMPLO)).toHaveLength(0)
  })

  it('o detalhe da Conta Quente mostra os Sinais gravados dela', async () => {
    const outro = sinalNoBanco({ id: '9a1c2d3e-4a5b-4c6d-8e7f-0000000000ee', target_account_id: OUTRA_CONTA, phrase: 'Vaga na Sul' })
    const { chamadas } = abrir(`/contas/${CONTA}`, { monitores: [monitorAtivo()], sinais: [sinalNoBanco(), outro] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    const recente = await screen.findByRole('article', { name: 'Sinal mais recente' })
    expect(within(recente).getByText('Abriu vaga de Engenheiro de Dados')).toBeInTheDocument()
    expect(within(recente).getByText('Válido')).toBeInTheDocument()
    expect(within(recente).getByText('Fonte: LinkedIn')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum sinal')).not.toBeInTheDocument()
    expect(screen.queryByText('Vaga na Sul')).not.toBeInTheDocument()
    expect(chamadas.find((c) => c.nome === 'list_signals')?.parametros).toEqual({
      p_workspace_id: NORTE.id,
      p_target_account_id: CONTA,
    })
  })

  it('o detalhe da Conta sem Sinal gravado diz que não há nenhum', async () => {
    abrir(`/contas/${CONTA}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Norte Alimentos' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhum sinal')).toBeInTheDocument()
    expect(screen.queryAllByText(CONTAS_DE_EXEMPLO)).toHaveLength(0)
  })
})
