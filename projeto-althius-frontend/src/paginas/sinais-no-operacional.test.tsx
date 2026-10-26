import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

/**
 * Prova a regra de `sinaisDisponiveis` (supabase-sinais.ts) pela raiz/página, não pela função interna: o módulo Sinais
 * do Workspace operacional só liga com ao menos um Sinal real `available` (um actor externo ou um tipo interno do
 * catálogo do banco); sem isso, ou com falha ao consultar os dois registros, o módulo fica indisponível, sem nada
 * simulado da Demonstração no lugar. Arquivo novo, fora de `paginas/sinais/` (PR #261 em aberto ali).
 */

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ID_DA_ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const AVISO_INDISPONIVEL = 'Sinais ainda não estão disponíveis neste Workspace.'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

function contaAlfaNoBanco() {
  return {
    id: ID_DA_ALFA,
    workspace_id: 'ws-norte',
    name: 'Alfa Varejo',
    canonical_url: 'https://alfa.com.br',
    domain: 'alfa.com.br',
    linkedin_url: null,
    segment: null,
    last_interaction_at: null,
  }
}

/**
 * Abre o Workspace operacional da Marina direto em `/sinais/contas/:contaId`: a mesma guarda do módulo (`TelaDoModulo`)
 * vale para essa rota aninhada, e a página é simples o bastante para não exigir o catálogo inteiro de Sinais.
 *
 * `comSinais` (aplicativo.tsx) começa em `false` e só depois a leitura assíncrona confirma o valor real: logo após
 * montar, a tela sempre mostra "indisponível" por um instante, mesmo quando o resultado real será "disponível". Por
 * isso devolve `leituraDosSinais`, que resolve só depois que as duas RPCs da regra (`list_signal_actors` e
 * `list_signal_catalog`) já responderam; esperar por ela (e mais um tick) é o que distingue o estado assentado do
 * flash inicial, nos casos em que o teste espera "indisponível".
 */
function abrirContaComSinais({ rpcs = {} }: { rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown> } = {}) {
  localStorage.setItem('althius:ambiente', 'real')
  window.history.replaceState(null, '', `/sinais/contas/${ID_DA_ALFA}`)
  let actorsChamado = false
  let catalogoChamado = false
  let avisarLeituraCompleta = () => {}
  const leituraDosSinais = new Promise<void>((resolve) => { avisarLeituraCompleta = resolve })
  const conferirCompleta = () => { if (actorsChamado && catalogoChamado) avisarLeituraCompleta() }
  const actorsOriginal = rpcs.list_signal_actors ?? (() => [])
  const catalogoOriginal = rpcs.list_signal_catalog ?? (() => [])
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspace_memberships: [{ workspace_id: 'ws-norte', role: 'admin', user_id: MARINA.id, active: true }],
      target_accounts: [contaAlfaNoBanco()],
      sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => ({ id: null, kind: null, name: null, owner_user_id: null }),
      ...rpcs,
      list_signal_actors: (p: Record<string, unknown>) => {
        actorsChamado = true
        conferirCompleta()
        return actorsOriginal(p)
      },
      list_signal_catalog: (p: Record<string, unknown>) => {
        catalogoChamado = true
        conferirCompleta()
        return catalogoOriginal(p)
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, leituraDosSinais }
}

/** Espera a leitura da regra responder e mais um ciclo de tarefas, para o estado de `comSinais` já estar assentado. */
async function aguardarRegraAssentada(leituraDosSinais: Promise<void>) {
  await leituraDosSinais
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Regra do módulo Sinais no Workspace operacional', () => {
  it('sem nenhum Sinal real disponível (actors e catálogo sem resposta), o módulo fica indisponível, sem dado da Demonstração', async () => {
    const { leituraDosSinais } = abrirContaComSinais()
    await aguardarRegraAssentada(leituraDosSinais)

    expect(screen.getByText(AVISO_INDISPONIVEL)).toBeInTheDocument()
    expect(screen.queryByText('Alfa Varejo')).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenAI|Databricks|Vagas no LinkedIn/)).not.toBeInTheDocument()
  })

  it('erro ao consultar o registro de actors e o catálogo também deixa o módulo indisponível', async () => {
    const { leituraDosSinais } = abrirContaComSinais({
      rpcs: {
        list_signal_actors: () => { throw new Error('connection refused') },
        list_signal_catalog: () => { throw new Error('connection refused') },
      },
    })
    await aguardarRegraAssentada(leituraDosSinais)

    expect(screen.getByText(AVISO_INDISPONIVEL)).toBeInTheDocument()
    expect(screen.queryByText('Alfa Varejo')).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenAI|Databricks|Vagas no LinkedIn/)).not.toBeInTheDocument()
  })

  it('actors e catálogo com registros só em `testing`/`out` não ligam o módulo', async () => {
    const { leituraDosSinais } = abrirContaComSinais({
      rpcs: {
        list_signal_actors: () => [
          { signal_type: 'vaga_linkedin', state: 'testing' },
          { signal_type: 'noticia', state: 'out' },
        ],
        list_signal_catalog: () => [
          { signal_type: 'sem_resposta', state: 'testing' },
          { signal_type: 'visita_ao_site', state: 'out' },
        ],
      },
    })
    await aguardarRegraAssentada(leituraDosSinais)

    expect(screen.getByText(AVISO_INDISPONIVEL)).toBeInTheDocument()
    expect(screen.queryByText('Alfa Varejo')).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenAI|Databricks|Vagas no LinkedIn/)).not.toBeInTheDocument()
  })

  it('um Sinal interno `available` no catálogo do banco já liga o módulo, mesmo sem nenhum actor', async () => {
    abrirContaComSinais({
      rpcs: {
        list_signal_actors: () => [],
        list_signal_catalog: () => [{ signal_type: 'sem_resposta', state: 'available' }],
        list_signals: () => [],
      },
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Alfa Varejo' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO_INDISPONIVEL)).not.toBeInTheDocument()
  })

  it('um actor `available` liga o módulo e o Sinal dele aparece na Conta-alvo', async () => {
    abrirContaComSinais({
      rpcs: {
        list_signal_actors: () => [{ signal_type: 'vaga_linkedin', state: 'available' }],
        list_signal_catalog: () => [],
        list_signals: () => [
          {
            id: 'sinal-1',
            target_account_id: ID_DA_ALFA,
            monitor_id: null,
            signal_type: 'vaga_linkedin',
            event_key: 'vaga-1',
            phrase: 'Abriu vaga de Engenheiro de Dados',
            fired_at: '2026-10-01T10:00:00Z',
            source: null,
            evidence: null,
            seen_again_at: null,
            seen_again_monitor_id: null,
          },
        ],
      },
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Alfa Varejo' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO_INDISPONIVEL)).not.toBeInTheDocument()
    expect(screen.getAllByText('Abriu vaga de Engenheiro de Dados').length).toBeGreaterThan(0)
  })
})
