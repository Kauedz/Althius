import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe, type RespostaDaFuncao } from '@/test/supabase-falso'

// Briefing → Plano editável do Sinal no Workspace operacional (agente-de-sinal 01): a pessoa escreve o Briefing, escolhe
// as Contas, a Edge Function `signal-plan` devolve o Plano, ela edita um critério e `save_signal_plan` grava o rascunho.
// Nada é ativado nem cobrado, e o Briefing só vai para a função e para o Plano gravado.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const OUTRA_CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000ab'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'
const MONITOR_NOVO = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000cc'

const BRIEFING = 'Quero saber quando a Norte abrir vaga de RevOps.'
const PLANO = {
  versao: 1,
  origem: 'briefing',
  escopo: { tipo: 'contas', contaIds: [CONTA] },
  sinais: [{
    tipo: 'vaga_linkedin',
    criterios: { funcoes: ['RevOps e GTM'], senioridade: 'Qualquer', localizacao: ['Brasil'], periodo: 'Últimos 30 dias' },
  }],
  explicacao: 'Vamos acompanhar “Abertura de vagas” na Conta escolhida: a empresa abre vagas de RevOps e GTM.',
  maxEmpresasPorRodada: 25,
}

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
  brief?: string | null
  plan?: unknown
  plan_version?: number
  plan_origin?: string | null
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

interface Opcoes {
  monitores?: MonitorNoBanco[]
  contas?: ReturnType<typeof contaNoBanco>[]
  /** Os actors do registro; o padrão tem só Abertura de vagas disponível. */
  actors?: { signal_type: string; state: string }[]
  planejar?: (corpo: Record<string, unknown>) => RespostaDaFuncao | Promise<RespostaDaFuncao>
  salvar?: (parametros: Record<string, unknown>) => void
}

function abrir(rota: string, opcoes: Opcoes = {}) {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const monitores = [...(opcoes.monitores ?? [])]
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
    funcoes: {
      'signal-plan': (corpo) => {
        chamadas.push({ nome: 'signal-plan', parametros: corpo })
        return opcoes.planejar ? opcoes.planejar(corpo) : { corpo: { plano: PLANO, avisos: [] } }
      },
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_signal_actors: () => opcoes.actors ?? [
        { signal_type: 'vaga_linkedin', state: 'available' },
        { signal_type: 'nova_lideranca', state: 'testing' },
      ],
      list_signal_catalog: () => [],
      list_signal_monitors: () => monitores,
      list_signals: () => [],
      list_account_signals: () => [],
      save_signal_plan: (p) => {
        chamadas.push({ nome: 'save_signal_plan', parametros: p })
        opcoes.salvar?.(p)
        const plano = p.p_plan as typeof PLANO
        const id = typeof p.p_monitor_id === 'string' ? p.p_monitor_id : MONITOR_NOVO
        const anterior = monitores.find((m) => m.id === id)
        const salvo: MonitorNoBanco = {
          id,
          signal_type: plano.sinais[0].tipo,
          name: String(p.p_name),
          state: anterior?.state ?? 'rascunho',
          audience: { accountIds: plano.escopo.contaIds },
          criteria: plano.sinais[0].criterios,
          last_error: null,
          brief: (p.p_brief as string | null) || null,
          plan: plano,
          plan_version: (anterior?.plan_version ?? 0) + 1,
          plan_origin: plano.origem,
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
  const chamou = (nome: string) => chamadas.filter((c) => c.nome === nome).map((c) => c.parametros)
  return { usuario, chamadas, chamou, monitores }
}

async function escreverEEscolher(usuario: ReturnType<typeof userEvent.setup>, texto = BRIEFING, conta = /Norte Alimentos/) {
  await usuario.type(await screen.findByRole('textbox', { name: 'O que você quer acompanhar' }), texto)
  const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
  await usuario.click(within(contas).getByRole('checkbox', { name: conta }))
}

describe('Descrever um Sinal no Workspace operacional', () => {
  it('briefing, Plano, critério editado e rascunho salvo: nada é ativado e a página do Monitoramento mostra o Plano', async () => {
    const { usuario, chamou } = abrir('/sinais')

    await usuario.click(await screen.findByRole('link', { name: 'Descrever um Sinal' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Descrever um Sinal' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Exemplos de briefing' })).toBeInTheDocument()
    expect(screen.getByText('0 de 1000 caracteres')).toBeInTheDocument()
    const montar = screen.getByRole('button', { name: 'Montar plano' })
    expect(montar).toBeDisabled()

    await escreverEEscolher(usuario)
    expect(screen.getByText(`${BRIEFING.length} de 1000 caracteres`)).toBeInTheDocument()
    expect(montar).toBeEnabled()
    await usuario.click(montar)

    // O passo 2: o Plano editável, com a explicação só para leitura e o tipo entre os aceitos.
    expect(await screen.findByText(PLANO.explicacao)).toBeInTheDocument()
    expect(chamou('signal-plan')).toEqual([{ workspaceId: NORTE.id, briefing: BRIEFING, escopo: { tipo: 'contas', contaIds: [CONTA] } }])
    const tipo = screen.getByRole('combobox', { name: 'Tipo de Sinal' })
    expect(within(tipo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Abertura de vagas'])
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue(BRIEFING.replace(/\.$/, ''))
    const funcoes = screen.getByRole('group', { name: 'Cargos ou funções' })
    expect(within(funcoes).getByRole('checkbox', { name: 'RevOps e GTM' })).toHaveAttribute('aria-checked', 'true')
    await usuario.click(within(funcoes).getByRole('checkbox', { name: 'Finanças' }))
    await usuario.click(within(screen.getByRole('radiogroup', { name: 'Senioridade' })).getByRole('radio', { name: 'Liderança' }))
    await usuario.clear(screen.getByRole('textbox', { name: 'Nome do monitoramento' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas de RevOps na Norte')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    // Vai para a página do Monitoramento que já existe, com o Briefing e o Plano no topo.
    const plano = await screen.findByRole('complementary', { name: 'Briefing e Plano' })
    expect(within(plano).getByText('Plano v1')).toBeInTheDocument()
    expect(within(plano).getByText(BRIEFING)).toBeInTheDocument()
    expect(within(plano).getByRole('link', { name: 'Editar plano' })).toHaveAttribute('href', `/sinais/novo?monitor=${MONITOR_NOVO}`)
    expect(window.location.pathname).toBe(`/sinais/tipos/abertura-de-vagas/${MONITOR_NOVO}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Vagas de RevOps na Norte' })).toBeInTheDocument()
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThan(0)

    const gravado = chamou('save_signal_plan')
    expect(gravado).toHaveLength(1)
    expect(gravado[0]).toMatchObject({ p_workspace_id: NORTE.id, p_monitor_id: null, p_name: 'Vagas de RevOps na Norte', p_brief: BRIEFING })
    expect(gravado[0].p_plan).toEqual({
      ...PLANO,
      sinais: [{
        tipo: 'vaga_linkedin',
        criterios: { funcoes: ['RevOps e GTM', 'Finanças'], senioridade: 'Liderança', localizacao: ['Brasil'], periodo: 'Últimos 30 dias' },
      }],
    })
    // Nada foi ativado: nenhuma gravação pelo caminho do editor e o Monitoramento segue em rascunho.
    expect(chamou('save_signal_monitor')).toHaveLength(0)
  })

  it('o Plano vem com 25 empresas por rodada, editáveis de 1 a 100, e o que a pessoa escolhe é o que o banco recebe', async () => {
    const { usuario, chamou } = abrir('/sinais/novo')
    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByText(PLANO.explicacao)

    const campo = screen.getByRole('spinbutton', { name: 'Empresas por rodada' })
    expect(campo).toHaveValue(25)
    expect(screen.getByText('Cada rodada verifica até 25 Contas e continua de onde parou na próxima.')).toBeInTheDocument()

    await usuario.clear(campo)
    expect(screen.getByText('Use um número de 1 a 100.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    await usuario.type(campo, '101')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    await usuario.clear(campo)
    await usuario.type(campo, '40')
    expect(screen.getByText('Cada rodada verifica até 40 Contas e continua de onde parou na próxima.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(chamou('save_signal_plan')).toHaveLength(1))
    expect((chamou('save_signal_plan')[0].p_plan as { maxEmpresasPorRodada: number }).maxEmpresasPorRodada).toBe(40)
  })

  it('volta ao briefing sem perder o texto nem as Contas, e monta de novo', async () => {
    const { usuario, chamou } = abrir('/sinais/novo')

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByText(PLANO.explicacao)
    await usuario.click(screen.getByRole('button', { name: 'Voltar ao briefing' }))

    expect(await screen.findByRole('textbox', { name: 'O que você quer acompanhar' })).toHaveValue(BRIEFING)
    const contas = screen.getByRole('group', { name: 'Contas-alvo' })
    expect(within(contas).getByRole('checkbox', { name: /Norte Alimentos/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(contas).getByRole('checkbox', { name: /Sul Logística/ })).toHaveAttribute('aria-checked', 'false')

    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByText(PLANO.explicacao)
    expect(chamou('signal-plan')).toHaveLength(2)
  })

  it('mostra o carregamento enquanto monta e uma falha recuperável em palavras do produto', async () => {
    let liberar!: () => void
    let tentativa = 0
    const { usuario } = abrir('/sinais/novo', {
      planejar: async () => {
        tentativa++
        if (tentativa === 1) {
          await new Promise<void>((resolver) => { liberar = resolver })
          return { status: 500, corpo: { error: 'Detalhe técnico do fornecedor apify 401', codigo: 'falha' } }
        }
        return { corpo: { plano: PLANO, avisos: [] } }
      },
    })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByRole('status', { name: '' })).toBeInTheDocument()
    expect(screen.getByText('Montando o plano')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Montar plano' })).toBeDisabled()
    liberar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não deu para montar o plano agora. Tente de novo.')
    expect(alerta).not.toHaveTextContent(/apify|fornecedor|401/i)
    // O texto e as Contas continuam, e tentar de novo funciona.
    expect(screen.getByRole('textbox', { name: 'O que você quer acompanhar' })).toHaveValue(BRIEFING)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByText(PLANO.explicacao)).toBeInTheDocument()
  })

  it('o limite de planos do dia aparece com a mensagem neutra do servidor', async () => {
    const { usuario } = abrir('/sinais/novo', {
      planejar: () => ({
        status: 429,
        corpo: { error: 'Você chegou ao limite de planos de hoje. Tente de novo amanhã.', codigo: 'limite_diario' },
      }),
    })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você chegou ao limite de planos de hoje. Tente de novo amanhã.')
    expect(screen.queryByText(PLANO.explicacao)).not.toBeInTheDocument()
  })

  it('o aviso do plano inicial por regra aparece no passo do Plano', async () => {
    const { usuario } = abrir('/sinais/novo', {
      planejar: () => ({ corpo: { plano: PLANO, avisos: ['Montamos um plano inicial. Revise os critérios.'] } }),
    })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByText('Montamos um plano inicial. Revise os critérios.')).toBeInTheDocument()
  })

  it('a recusa do servidor ao salvar mostra a mensagem e deixa o Plano editável', async () => {
    const { usuario, chamou } = abrir('/sinais/novo', {
      salvar: () => {
        throw new Error('invalid signal plan')
      },
    })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByText(PLANO.explicacao)
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O plano tem Contas, critérios ou limites inválidos. Confira e tente de novo.')
    expect(chamou('save_signal_plan')).toHaveLength(1)
    expect(window.location.pathname).toBe('/sinais/novo')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled()
  })

  it('a recusa de Conta arquivada aparece em palavras do produto', async () => {
    const { usuario } = abrir('/sinais/novo', {
      salvar: () => {
        throw new Error('the target account is archived')
      },
    })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByText(PLANO.explicacao)
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Uma das Contas escolhidas está arquivada ou foi apagada.')
  })

  it('só deixa escolher até 500 Contas', async () => {
    const contas = Array.from({ length: 501 }, (_, i) =>
      contaNoBanco(`6f1c2d3e-4a5b-4c6d-8e7f-${String(i + 1).padStart(12, '0')}`, `Empresa ${String(i + 1).padStart(2, '0')}`, `empresa${i + 1}.com.br`))
    const { usuario } = abrir('/sinais/novo', { contas })

    const grupo = await screen.findByRole('group', { name: 'Contas-alvo' })
    const caixas = within(grupo).getAllByRole('checkbox')
    expect(caixas).toHaveLength(501)
    for (const caixa of caixas.slice(0, 500)) await usuario.click(caixa)
    expect(screen.getByText('500 de 500 escolhidas')).toBeInTheDocument()
    await usuario.click(caixas[500])
    expect(caixas[500]).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Escolha até 500 Contas por Sinal.')).toBeInTheDocument()
    expect(screen.getByText('500 de 500 escolhidas')).toBeInTheDocument()
  })

  it('"Editar plano" abre o Plano do Monitoramento com o Briefing, e salvar atualiza o mesmo Monitoramento', async () => {
    const existente: MonitorNoBanco = {
      id: MONITOR,
      signal_type: 'vaga_linkedin',
      name: 'Vagas de RevOps',
      state: 'ativo',
      audience: { accountIds: [CONTA] },
      criteria: PLANO.sinais[0].criterios,
      last_error: null,
      brief: BRIEFING,
      plan: PLANO,
      plan_version: 2,
      plan_origin: 'briefing',
    }
    const { usuario, chamou, monitores } = abrir(`/sinais/tipos/abertura-de-vagas/${MONITOR}`, { monitores: [existente] })

    const resumo = await screen.findByRole('complementary', { name: 'Briefing e Plano' })
    expect(within(resumo).getByText('Plano v2')).toBeInTheDocument()
    await usuario.click(within(resumo).getByRole('link', { name: 'Editar plano' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Editar plano' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Vagas de RevOps')
    expect(screen.getByText(PLANO.explicacao)).toBeInTheDocument()
    await usuario.click(within(screen.getByRole('group', { name: 'Cargos ou funções' })).getByRole('checkbox', { name: 'Finanças' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByText('Plano v3')).toBeInTheDocument()
    expect(chamou('save_signal_plan')[0]).toMatchObject({ p_monitor_id: MONITOR, p_brief: BRIEFING })
    // O estado que o Monitoramento já tinha continua: salvar o Plano não ativa nem pausa.
    expect(monitores.find((m) => m.id === MONITOR)?.state).toBe('ativo')
    expect(window.location.pathname).toBe(`/sinais/tipos/abertura-de-vagas/${MONITOR}`)

    // E o "Voltar ao briefing" de um Plano que já existe mostra o texto que o gerou.
    await usuario.click(screen.getByRole('link', { name: 'Editar plano' }))
    await usuario.click(await screen.findByRole('button', { name: 'Voltar ao briefing' }))
    expect(screen.getByRole('textbox', { name: 'O que você quer acompanhar' })).toHaveValue(BRIEFING)
  })

  it('um Monitoramento sem Plano não mostra o resumo e "Editar plano" volta ao editor de sempre', async () => {
    const antigo: MonitorNoBanco = {
      id: MONITOR,
      signal_type: 'vaga_linkedin',
      name: 'Vagas do editor',
      state: 'rascunho',
      audience: { accountIds: [CONTA] },
      criteria: { palavras: 'dados' },
      last_error: null,
      brief: BRIEFING,
      plan: null,
      plan_version: 3,
    }
    abrir(`/sinais/novo?monitor=${MONITOR}`, { monitores: [antigo] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Vagas do editor' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Briefing e Plano' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe(`/sinais/tipos/abertura-de-vagas/${MONITOR}`)
  })

  it('o botão não aparece onde ninguém pode criar Monitoramento (nenhum Sinal disponível)', async () => {
    abrir('/sinais', {
      actors: [
        { signal_type: 'vaga_linkedin', state: 'testing' },
        { signal_type: 'nova_lideranca', state: 'testing' },
        { signal_type: 'anuncio_meta', state: 'out' },
      ],
    })

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Descrever um Sinal' })).not.toBeInTheDocument()
  })

  it('o botão aparece quando algum Sinal que o Plano aceita está disponível', async () => {
    abrir('/sinais', { actors: [{ signal_type: 'anuncio_meta', state: 'available' }] })
    expect(await screen.findByRole('link', { name: 'Descrever um Sinal' })).toHaveAttribute('href', '/sinais/novo')
  })
})
