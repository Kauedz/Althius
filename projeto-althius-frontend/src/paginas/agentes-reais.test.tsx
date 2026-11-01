import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes, type BancoDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** A Marina abre o Norte, onde tem o papel dado, sobre o `banco` de Agentes: outra sessão com o mesmo banco reencontra o salvo. */
function abrir(
  banco: BancoDeAgentes,
  rota: string,
  papel: 'admin' | 'member' = 'admin',
  outrasRpcs: Record<string, (parametros: Record<string, unknown>) => unknown> = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspaces: [PESSOAL, NORTE],
    workspace_memberships: [
      { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
      { workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true },
    ],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    rpcs: { bootstrap_personal_workspace: () => PESSOAL, list_owned_sender_accounts: () => [], ...rpcsDeAgentes(banco, papel), ...outrasRpcs },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario }
}

describe('Agentes no Workspace operacional', () => {
  // Sinais first 10: a grade, a criação e a seção "Especialistas" saíram; a / fica só com o composer.
  it('a / não mostra a grade dos Agentes nem a criação, sem dados da Demonstração', async () => {
    abrir(criarBancoDeAgentes(), '/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes do Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Especialistas' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Enterprise LATAM|Databricks/)).not.toBeInTheDocument()
  })

  it('pedir algo aos Agentes diz que não está disponível, sem composer nem resposta simulada', async () => {
    abrir(criarBancoDeAgentes(), '/')

    expect(await screen.findByText(/Conversas e Coordenação com os Agentes ainda não estão disponíveis/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Peça algo/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Monte a abordagem completa para a OpenAI')).not.toBeInTheDocument()
  })

  it('a Conversa de um Agente diz que ele ainda não executa, sem composer nem sugestões', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/conversa')

    expect(await screen.findByText(/Conversas e Coordenação com os Agentes ainda não estão disponíveis/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aderência da OpenAI/ })).not.toBeInTheDocument()
  })

  it('o Agente criado antes continua com a página só para leitura, sem criar outro nem excluir', async () => {
    const banco = criarBancoDeAgentes()
    banco.agentes.push({ ...structuredClone(banco.agentes[0]), id: 'agente-criado-x', name: 'Scopus · Norte', kind: 'criado', complement: 'Norte' })
    abrir(banco, '/agentes/agente-criado-x/memoria')

    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus · Norte' })).toBeInTheDocument()
    expect(screen.getByText(/Este Agente foi retirado do produto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir agente|Novo agente|Criar agente/ })).not.toBeInTheDocument()
    expect(banco.agentes.filter((a) => a.kind === 'criado')).toHaveLength(1)
  })

  it('a Configuração e os Canais saíram da página do Agente e levam à Conversa, sem gravar nada', async () => {
    for (const secao of ['configuracao', 'canais']) {
      const banco = criarBancoDeAgentes()
      const antes = structuredClone(banco.agentes)
      abrir(banco, `/agentes/agente-scopus/${secao}`)

      expect(await screen.findByRole('heading', { level: 1, name: 'Scopus' })).toBeInTheDocument()
      await waitFor(() => expect(window.location.pathname).toBe('/agentes/agente-scopus/conversa'))
      const abas = screen.getByRole('navigation', { name: 'Seções do agente' })
      expect(within(abas).queryByRole('link', { name: /Configuração|Canais/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: 'Permissão em HubSpot' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Salvar personalização|Excluir agente/ })).not.toBeInTheDocument()
      expect(banco.agentes).toEqual(antes)
      cleanup()
      window.history.replaceState(null, '', '/')
    }
  })

  it('o Membro vê a / e a página do Agente como o Administrador: nada para criar, excluir nem alterar', async () => {
    const banco = criarBancoDeAgentes()
    abrir(banco, '/', 'member')

    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo agente' })).not.toBeInTheDocument()

    cleanup()
    window.history.replaceState(null, '', '/')
    abrir(banco, '/agentes/agente-scopus/memoria', 'member')
    expect(await screen.findByText(/Este Agente foi retirado do produto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar personalização|Excluir agente/ })).not.toBeInTheDocument()
  })

  it('as Rotinas dizem que ficam salvas mas ainda não rodam', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/rotinas')

    expect(await screen.findByText(/As Rotinas ficam salvas, mas ainda não rodam/)).toBeInTheDocument()
  })

  it('a Atividade não inventa histórico: diz que o Agente não executou nada', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/atividade')

    expect(await screen.findByText(/Scopus não executou nada neste Workspace/)).toBeInTheDocument()
  })
})
