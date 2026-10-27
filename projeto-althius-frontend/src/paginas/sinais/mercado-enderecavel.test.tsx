import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { comEstado, comPais, custoDoMercado, resumoDoMercado, trocarEscopo } from './mercado-enderecavel'

// Abertura de vagas no mercado endereçável: em Sinais › Abertura de vagas › Ativar Monitoramento, o público escolhe entre
// as Contas-alvo e o mercado endereçável. No mercado, as Contas-alvo somem e aparecem o país e o estado; o custo é só em
// créditos. O modo Contas-alvo grava o mesmo público de antes.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const MONITOR_NOVO = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000cc'

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
  audience: Record<string, unknown>
  criteria: Record<string, unknown>
  last_error: string | null
}

function abrir(rota: string, opcoes: { recusa?: string } = {}) {
  const gravacoes: Record<string, unknown>[] = []
  const monitores: MonitorNoBanco[] = []
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
      list_signal_monitors: () => monitores,
      list_signals: () => [],
      list_account_signals: () => [],
      save_signal_monitor: (p) => {
        gravacoes.push(p)
        if (opcoes.recusa) throw new Error(opcoes.recusa)
        const salvo: MonitorNoBanco = {
          id: MONITOR_NOVO,
          signal_type: String(p.p_signal_type),
          name: String(p.p_name),
          state: String(p.p_state),
          audience: p.p_audience as Record<string, unknown>,
          criteria: (p.p_criteria ?? {}) as Record<string, unknown>,
          last_error: null,
        }
        monitores.push(salvo)
        return MONITOR_NOVO
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, gravacoes }
}

/** Preenche o Monitoramento de mercado: setor escrito, cargo SDR, Rio de Janeiro, e vai à revisão. */
async function prepararMercado(usuario: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
  const onde = await screen.findByRole('radiogroup', { name: 'Onde procurar' })
  await usuario.click(within(onde).getByRole('radio', { name: 'Mercado endereçável (ICP)' }))

  await usuario.type(screen.getByRole('textbox', { name: 'Setor escrito' }), 'Óleo e gás')
  await usuario.click(screen.getByRole('button', { name: 'Adicionar setor' }))
  const cargos = screen.getByRole('group', { name: 'Cargos ou funções' })
  await usuario.click(within(cargos).getByRole('checkbox', { name: 'Custom' }))
  await usuario.type(screen.getByRole('textbox', { name: 'Cargo Custom' }), 'SDR, BDR{Enter}')
  await usuario.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'Rio de Janeiro')
  await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'SDR em óleo e gás')
  await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
}

describe('Mercado endereçável: regras', () => {
  it('trocar para o mercado tira as Contas e põe o país padrão; voltar tira o estado', () => {
    const publico = { modo: 'listas' as const, listas: [CONTA], usaRecomendado: false }
    const mercado = trocarEscopo(publico, { funcoes: ['SDR'] }, 'mercado')
    expect(mercado.publico).toEqual({ ...publico, listas: [], escopo: 'mercado' })
    expect(mercado.criterios).toEqual({ funcoes: ['SDR'], localizacao: ['Brasil'] })
    const comRio = comEstado(mercado.criterios, 'Rio de Janeiro')
    expect(resumoDoMercado(comRio)).toBe('Mercado endereçável · Brasil · Rio de Janeiro')
    expect(comPais(comRio, 'México')).toEqual({ funcoes: ['SDR'], localizacao: ['México'] })
    const volta = trocarEscopo(mercado.publico, comRio, 'contas')
    expect(volta.publico).toEqual({ modo: 'listas', listas: [], usaRecomendado: false })
    expect(volta.criterios).toEqual({ funcoes: ['SDR'], localizacao: ['Brasil'] })
  })

  it('o custo é só em créditos', () => {
    expect(custoDoMercado()).toBe('Cada rodada debita 4 créditos, com qualquer número de empresas encontradas.')
    expect(custoDoMercado()).not.toMatch(/US\$|d[oó]lar|teto/i)
  })
})

describe('Mercado endereçável: tela', () => {
  it('não permite revisar e ativar vagas sem recorte, mas deixa salvar o rascunho', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas/novo')
    await usuario.click(within(await screen.findByRole('radiogroup', { name: 'Onde procurar' })).getByRole('radio', { name: 'Mercado endereçável (ICP)' }))
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    expect(screen.queryByRole('region', { name: 'Revisão antes de ativar' })).not.toBeInTheDocument()
    expect(screen.getByText('Escolha ao menos um nicho ou escreva um setor para ativar.')).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas sem recorte')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByText('Rascunho “Vagas sem recorte” salvo.')).toBeInTheDocument()
    expect(gravacoes[0]).toMatchObject({ p_state: 'rascunho', p_criteria: { nichos: [], nichosCustom: [] } })
  })

  it('o seletor esconde as Contas-alvo, mostra país e estado, e grava o mercado sem Conta', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas/novo')

    const onde = await screen.findByRole('radiogroup', { name: 'Onde procurar' })
    expect(within(onde).getByRole('radio', { name: 'Contas-alvo' })).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByRole('group', { name: 'Contas-alvo' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Localização' })).toBeInTheDocument()

    await usuario.click(within(onde).getByRole('radio', { name: 'Mercado endereçável (ICP)' }))
    expect(screen.queryByRole('group', { name: 'Contas-alvo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Localização' })).not.toBeInTheDocument()
    const pais = screen.getByRole('radiogroup', { name: 'País' })
    expect(within(pais).getByRole('radio', { name: 'Brasil' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('')
    expect(screen.getByText(/Cada rodada debita 4 créditos/)).toBeInTheDocument()

    // Fora do Brasil, o estado some.
    await usuario.click(within(pais).getByRole('radio', { name: 'México' }))
    expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument()
    await usuario.click(within(pais).getByRole('radio', { name: 'Brasil' }))

    await prepararMercado(usuario)
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(within(revisao).getByText('Mercado endereçável · Brasil · Rio de Janeiro')).toBeInTheDocument()
    expect(within(revisao).getByText(/Cada rodada debita 4 créditos/)).toBeInTheDocument()
    expect(revisao.textContent).not.toMatch(/US\$/)
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    expect(await screen.findByText('“SDR em óleo e gás” está ativo.')).toBeInTheDocument()
    expect(gravacoes).toHaveLength(1)
    expect(gravacoes[0].p_audience).toEqual({ escopo: 'mercado', accountIds: [] })
    expect(gravacoes[0]).toMatchObject({
      p_signal_type: 'vaga_linkedin',
      p_state: 'ativo',
      p_criteria: { nichos: [], nichosCustom: ['Óleo e gás'], localizacao: ['Brasil'], estado: 'Rio de Janeiro' },
    })
    expect((gravacoes[0].p_criteria as { funcoes: string[] }).funcoes).toEqual(expect.arrayContaining(['SDR', 'BDR']))

    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = await within(lista).findByRole('listitem', { name: 'SDR em óleo e gás' })
    expect(within(item).getByText('Mercado endereçável · Brasil · Rio de Janeiro')).toBeInTheDocument()
    expect(item.textContent).not.toMatch(/\b[A-H]\b/)
  })

  it('a recusa do servidor (sem contrato) aparece em palavras do produto', async () => {
    const { usuario } = abrir('/sinais/tipos/abertura-de-vagas/novo', { recusa: 'the market scope needs an active contract' })
    await prepararMercado(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O mercado endereçável precisa de contrato ativo. Fale com a equipe Althius.')
  })

  it('traduz a recusa do servidor quando falta recorte', async () => {
    const { usuario } = abrir('/sinais/tipos/abertura-de-vagas/novo', { recusa: 'a market monitor needs at least one niche' })
    await prepararMercado(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha ao menos um nicho ou escreva um setor para ativar.')
  })

  it('o modo Contas-alvo grava o mesmo público de antes', async () => {
    const { usuario, gravacoes } = abrir('/sinais/tipos/abertura-de-vagas/novo')
    const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
    await usuario.click(within(contas).getByRole('checkbox', { name: /Norte Alimentos/ }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas na Norte')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByText('Rascunho “Vagas na Norte” salvo.')).toBeInTheDocument()
    expect(gravacoes[0].p_audience).toEqual({ accountIds: [CONTA] })
  })

  it('a Demonstração não oferece o mercado endereçável', async () => {
    renderizarApp('/sinais/tipos/abertura-de-vagas/novo')
    expect(await screen.findByRole('checkbox', { name: /Enterprise LATAM/ })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Onde procurar' })).not.toBeInTheDocument()
  })
})
