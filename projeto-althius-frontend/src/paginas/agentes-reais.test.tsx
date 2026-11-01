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
  it('a grade mostra os Agentes padrão do Workspace, sem os da Demonstração', async () => {
    abrir(criarBancoDeAgentes(), '/')

    const grade = await screen.findByRole('list', { name: 'Agentes do Workspace' })
    expect(within(grade).getAllByRole('link').map((cartao) => cartao.getAttribute('aria-label'))).toEqual([
      'Scopus',
      'Ethos',
      'Rhetor',
      'Oraculum',
    ])
    expect(screen.queryByText(/Enterprise LATAM|Databricks/)).not.toBeInTheDocument()
    expect(within(grade).getAllByText('0')).toHaveLength(4)
    expect(grade).toHaveClass('md:grid-cols-4')

    const scopus = within(grade).getByRole('link', { name: 'Scopus' })
    expect(within(scopus).getByText('Sem conversas no momento')).toBeInTheDocument()
    expect(within(scopus).getByText('Sob demanda')).toBeInTheDocument()
    expect(within(scopus).queryByText(/Define o ICP/)).not.toBeInTheDocument()
    for (const integracao of ['Apollo', 'Clay', 'HubSpot', 'Lusha']) {
      expect(within(scopus).getByRole('img', { name: integracao })).toBeInTheDocument()
    }
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

  it('o Administrador cria um Agente, e ele reaparece com a configuração copiada em outra sessão', async () => {
    const banco = criarBancoDeAgentes()
    const { usuario } = abrir(banco, '/')

    await usuario.click(await screen.findByRole('button', { name: 'Novo agente' }))
    await usuario.click(await screen.findByRole('radio', { name: 'Scopus' }))
    await usuario.type(screen.getByLabelText('Complemento do nome'), 'Enterprise LATAM')
    await usuario.click(screen.getByRole('button', { name: 'Criar agente' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus · Enterprise LATAM' })).toBeInTheDocument()
    expect(banco.agentes.map((a) => a.name)).toContain('Scopus · Enterprise LATAM')

    cleanup()
    window.history.replaceState(null, '', '/')
    abrir(banco, '/')
    expect(await screen.findByRole('link', { name: 'Scopus · Enterprise LATAM' })).toBeInTheDocument()
  })

  it('um nome repetido é recusado com a mensagem do banco, sem criar outro Agente', async () => {
    const banco = criarBancoDeAgentes()
    const { usuario } = abrir(banco, '/')

    await usuario.click(await screen.findByRole('button', { name: 'Novo agente' }))
    await usuario.click(await screen.findByRole('radio', { name: 'Ethos' }))
    await usuario.type(screen.getByLabelText('Complemento do nome'), 'Comitê')
    await usuario.click(screen.getByRole('button', { name: 'Criar agente' }))
    await screen.findByRole('heading', { level: 1, name: 'Ethos · Comitê' })

    await usuario.click(screen.getAllByRole('link', { name: 'Agentes' })[0])
    await usuario.click(await screen.findByRole('button', { name: 'Novo agente' }))
    await usuario.click(await screen.findByRole('radio', { name: 'Ethos' }))
    await usuario.type(screen.getByLabelText('Complemento do nome'), 'comitê')
    await usuario.click(screen.getByRole('button', { name: 'Criar agente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um Agente chamado Ethos · comitê.')
    expect(banco.agentes.filter((a) => a.kind === 'criado')).toHaveLength(1)
  })

  it('a Permissão por Integração persiste e volta como estava salva, com a Integração não conectada', async () => {
    const banco = criarBancoDeAgentes()
    const { usuario } = abrir(banco, '/agentes/agente-scopus/configuracao')

    const grupo = await screen.findByRole('radiogroup', { name: 'Permissão em HubSpot' })
    expect(within(grupo).getByRole('radio', { name: 'Propor' })).toBeChecked()
    expect(screen.getAllByText('Não conectada no Workspace').length).toBeGreaterThan(0)

    await usuario.click(within(grupo).getByRole('radio', { name: 'Ler' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    expect(await screen.findByText('Personalização salva.')).toBeInTheDocument()
    expect(banco.agentes[0].permissions.hubspot).toBe('ler')

    cleanup()
    window.history.replaceState(null, '', '/')
    abrir(banco, '/agentes/agente-scopus/configuracao')
    const depois = await screen.findByRole('radiogroup', { name: 'Permissão em HubSpot' })
    expect(within(depois).getByRole('radio', { name: 'Ler' })).toBeChecked()
  })

  it('o Agente padrão não oferece exclusão, e o criado é excluído com confirmação', async () => {
    const banco = criarBancoDeAgentes()
    abrir(banco, '/agentes/agente-scopus/configuracao')

    await screen.findByRole('heading', { level: 1, name: 'Scopus' })
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()

    cleanup()
    banco.agentes.push({ ...structuredClone(banco.agentes[0]), id: 'agente-criado-x', name: 'Scopus · Norte', kind: 'criado', complement: 'Norte' })
    window.history.replaceState(null, '', '/')
    const segunda = abrir(banco, '/agentes/agente-criado-x/configuracao')
    await segunda.usuario.click(await screen.findByRole('button', { name: 'Excluir agente' }))
    await segunda.usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(banco.agentes.map((a) => a.id)).not.toContain('agente-criado-x'))
    expect(await screen.findByRole('list', { name: 'Agentes do Workspace' })).toBeInTheDocument()
  })

  it('o Membro consulta os Agentes e a configuração, sem criar, excluir nem alterar', async () => {
    const banco = criarBancoDeAgentes()
    abrir(banco, '/', 'member')

    expect(await screen.findByRole('list', { name: 'Agentes do Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo agente' })).not.toBeInTheDocument()

    cleanup()
    window.history.replaceState(null, '', '/')
    abrir(banco, '/agentes/agente-scopus/configuracao', 'member')
    expect(await screen.findByText(/Só Administradores alteram a configuração dos Agentes/)).toBeInTheDocument()
    expect(within(await screen.findByRole('radiogroup', { name: 'Permissão em HubSpot' })).getByRole('radio', { name: 'Ler' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar personalização' })).not.toBeInTheDocument()
  })

  it('as Rotinas dizem que ficam salvas mas ainda não rodam', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/rotinas')

    expect(await screen.findByText(/As Rotinas ficam salvas, mas ainda não rodam/)).toBeInTheDocument()
  })

  it('a Atividade não inventa histórico: diz que o Agente não executou nada', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/atividade')

    expect(await screen.findByText(/Scopus não executou nada neste Workspace/)).toBeInTheDocument()
  })

  it('os Canais e as Integrações não escolhidos aparecem como não conectados, sem aceitar conexão simulada', async () => {
    abrir(criarBancoDeAgentes(), '/agentes/agente-scopus/canais')

    const slack = (await screen.findByText('Slack')).closest('li')!
    expect(within(slack).getByText('Canal não conectado no Workspace.')).toBeInTheDocument()
    expect(within(slack).getByRole('switch')).toHaveAttribute('aria-disabled', 'true')
  })

  it('com o Canal Slack ativo no Workspace, o Administrador liga o Slack no Agente e a Personalização grava', async () => {
    const banco = criarBancoDeAgentes()
    const { usuario } = abrir(banco, '/agentes/agente-scopus/canais', 'admin', {
      slack_channel_status: (p) => {
        expect(p).toEqual({ p_workspace_id: NORTE.id })
        return [{ state: 'ativo', team_name: 'Norte no Slack' }]
      },
    })

    const slack = (await screen.findByText('Slack')).closest('li')!
    expect(within(slack).getByText('Mencione um Agente em qualquer canal ou thread.')).toBeInTheDocument()
    const teams = screen.getByText('Microsoft Teams').closest('li')!
    expect(within(teams).getByRole('switch')).toHaveAttribute('aria-disabled', 'true')

    await usuario.click(within(slack).getByRole('switch'))

    await waitFor(() => expect(banco.agentes.find((a) => a.id === 'agente-scopus')!.channels).toEqual(['slack']))
    await waitFor(() => expect(within(slack).getByRole('switch')).toHaveAttribute('aria-checked', 'true'))
  })
})
