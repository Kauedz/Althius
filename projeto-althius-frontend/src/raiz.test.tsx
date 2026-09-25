import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** A raiz como o navegador a abre, com a escolha de ambiente que a pessoa fez da última vez. */
function abrirAlthius({ ultimoAmbiente, ...opcoes }: Parameters<typeof criarSupabaseFalso>[0] & { ultimoAmbiente?: 'real' | 'demonstracao' } = {}) {
  if (ultimoAmbiente) localStorage.setItem('althius:modo_demo', String(ultimoAmbiente === 'demonstracao'))
  const supabase = criarSupabaseFalso(opcoes)
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} />)
  return { ...supabase, usuario }
}

function participacao(workspaceId: string, role: 'admin' | 'member' = 'admin') {
  return { workspace_id: workspaceId, role, user_id: MARINA.id, active: true }
}

const navegacao = () => screen.getByRole('complementary', { name: 'Navegação' })

/** A pessoa já passou pelo onboarding da Demonstração neste navegador, que abre direto na Casca. */
function demonstracaoJaIniciada() {
  localStorage.setItem(
    'althius.onboarding.v3',
    JSON.stringify({ ramo: 'convidado', etapa: 'checklist', day0Concluido: true, concluido: true }),
  )
}

describe('Workspace operacional e Demonstração', () => {
  it('uma sessão autenticada abre o Workspace operacional, sem o selo da Demonstração', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
    expect(within(navegacao()).queryByText('Demonstração')).not.toBeInTheDocument()
    // Sem Agentes guardados no Workspace, a navegação não lista os Especialistas da Demonstração nem um grupo vazio.
    await waitFor(() => expect(within(navegacao()).queryByRole('navigation', { name: 'Especialistas' })).not.toBeInTheDocument())
  })

  it.each([
    ['/', 'Agentes e Conversas ainda não estão disponíveis neste Workspace.', 'Scopus'],
    ['/agentes/scopus/conversa', 'Agentes e Conversas ainda não estão disponíveis neste Workspace.', 'Scopus'],
    ['/conversa', 'Agentes e Conversas ainda não estão disponíveis neste Workspace.', 'Scopus'],
    ['/contas', 'Contas e Contatos ainda não estão disponíveis neste Workspace.', 'OpenAI'],
    ['/contas/openai', 'Contas e Contatos ainda não estão disponíveis neste Workspace.', 'OpenAI'],
    ['/contatos', 'Contas e Contatos ainda não estão disponíveis neste Workspace.', 'Sarah Chen'],
    ['/sinais', 'Sinais ainda não estão disponíveis neste Workspace.', 'Vagas'],
    ['/sinais/contas/openai', 'Sinais ainda não estão disponíveis neste Workspace.', 'OpenAI'],
    ['/aprovacoes', 'Aprovações ainda não estão disponíveis neste Workspace.', 'Meta Ads'],
    ['/conexoes', 'Conexões ainda não estão disponíveis neste Workspace.', 'HubSpot'],
    ['/onboarding', 'Agentes e Conversas ainda não estão disponíveis neste Workspace.', 'Qual é o seu papel'],
  ])('%s mostra que o módulo está indisponível, sem dados da Demonstração', async (rota, aviso, daDemonstracao) => {
    window.history.replaceState(null, '', rota)
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(daDemonstracao))).not.toBeInTheDocument()
  })

  it.each(['/configuracoes/perfil', '/configuracoes/preferencias', '/configuracoes/workspace', '/configuracoes/memoria/icp', '/configuracoes/plano'])(
    '%s mostra que a seção está indisponível, sem dados da Demonstração',
    async (rota) => {
      window.history.replaceState(null, '', rota)
      abrirAlthius({
        ultimoAmbiente: 'real',
        sessao: sessaoDe(MARINA),
        tabelas: { workspace_memberships: [participacao('ws-norte')] },
      })

      expect(await screen.findByText('Esta seção de Configurações ainda não está disponível neste Workspace.')).toBeInTheDocument()
      expect(screen.queryByText(/Databricks|Marina Alves/)).not.toBeInTheDocument()
    },
  )

  it('a Ajuda continua disponível no Workspace operacional, por ser só conteúdo', async () => {
    window.history.replaceState(null, '', '/configuracoes/ajuda')
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect(await screen.findByRole('heading', { level: 2, name: 'Ajuda e informações' })).toBeInTheDocument()
    expect(screen.queryByText(/ainda não está disponível neste Workspace/)).not.toBeInTheDocument()
  })

  it('a Sequência do Vendedor responsável não aceita anexos enquanto o Workspace não guarda arquivos', async () => {
    abrirASequenciaDaMarina()

    expect(await screen.findByText('Anexos ainda não estão disponíveis neste Workspace.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Anexar imagem')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Anexar vídeo')).not.toBeInTheDocument()
  })

  it('a prévia da Sequência sai em nome da Conta de usuário da sessão, sem a remetente da Demonstração', async () => {
    const { usuario } = abrirASequenciaDaMarina()

    await usuario.click(await screen.findByRole('button', { name: 'Pré-visualizar' }))

    expect(within(await screen.findByTestId('preview-email')).getAllByText(new RegExp(MARINA.email)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Marina Costa|Databricks/)).not.toBeInTheDocument()
    // Sem o e-mail real do Contato, a prévia não inventa um endereço de destino.
    expect(screen.queryByText(/@empresa\.com/)).not.toBeInTheDocument()
  })

  it('o passo da Sequência não se apresenta como Demonstração no Workspace operacional', async () => {
    abrirASequenciaDaMarina()

    expect(await screen.findByText('Ainda não enviado')).toBeInTheDocument()
    expect(screen.queryByText('Demonstração')).not.toBeInTheDocument()
    expect(screen.queryByText(/protótipo/)).not.toBeInTheDocument()
  })

  it('sem Sequências, o Workspace operacional não sugere caminhos que ainda estão indisponíveis', async () => {
    window.history.replaceState(null, '', '/sequencias')
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')], sequences: [] },
    })

    expect(await screen.findByText(/Nenhuma sequência ainda/)).toHaveTextContent(
      'Nenhuma sequência ainda. Criar uma depende das Contas-alvo, que ainda não estão disponíveis neste Workspace.',
    )
    expect(screen.queryByRole('button', { name: /Nova sequência/ })).not.toBeInTheDocument()
  })

  it('trocar de Workspace não leva as Sequências nem a inscrição do Workspace anterior', async () => {
    window.history.replaceState(null, '', '/sequencias')
    const { usuario, canaisAbertos } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: {
        workspace_memberships: [participacao('ws-norte'), participacao('ws-sul', 'member')],
        sequences: [sequenciaDeOutroVendedor('ws-norte', 'conta-do-norte'), sequenciaDeOutroVendedor('ws-sul', 'conta-do-sul')],
      },
    })

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Selecione o Workspace' }), 'ws-norte')
    expect(await screen.findByRole('link', { name: 'conta-do-norte' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'conta-do-sul' })).not.toBeInTheDocument()
    expect(canaisAbertos()).toEqual(['sequencias:ws-norte'])

    await usuario.click(screen.getByRole('button', { name: 'Trocar de Workspace' }))
    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Selecione o Workspace' }), 'ws-sul')

    expect(await screen.findByRole('link', { name: 'conta-do-sul' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'conta-do-norte' })).not.toBeInTheDocument()
    expect(canaisAbertos()).toEqual(['sequencias:ws-sul'])
  })
})

describe('Alternar entre a Demonstração e o Workspace operacional', () => {
  it('cada ambiente mantém o próprio selo e os próprios dados', async () => {
    window.history.replaceState(null, '', '/contas')
    demonstracaoJaIniciada()
    const { usuario } = abrirAlthius({
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    // Sem escolha anterior, o protótipo abre na Demonstração, com o selo e as Contas-alvo de exemplo.
    expect(await screen.findByRole('link', { name: 'OpenAI' })).toBeInTheDocument()
    expect(within(navegacao()).getByText('Demonstração')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Acessar tela de login Supabase' }))
    expect(await screen.findByText('Contas e Contatos ainda não estão disponíveis neste Workspace.')).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'OpenAI' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir Demonstração' }))
    expect(await screen.findByRole('link', { name: 'OpenAI' })).toBeInTheDocument()
    expect(within(navegacao()).getByText('Demonstração')).toBeInTheDocument()
  })
})

/** A Sequência de que a sessão é a Vendedora responsável, aberta no detalhe, com o documento privado dela. */
function abrirASequenciaDaMarina() {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  const sequencia = {
    ...sequenciaDeOutroVendedor('ws-norte', 'conta-do-norte'),
    id: 'sequencia-da-marina',
    owner_user_id: MARINA.id,
  }
  const documento = {
    participantesIds: ['contato-1'],
    steps: [{ id: 'passo-1', ordem: 1, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 0, titulo: 'Primeiro contato', assunto: 'Olá', corpo: 'Oi! {{remetente.nome}}' }],
  }
  return abrirAlthius({
    ultimoAmbiente: 'real',
    sessao: sessaoDe(MARINA),
    tabelas: { workspace_memberships: [participacao('ws-norte')], sequences: [sequencia] },
    rpcs: { get_owned_sequence: () => [{ ...sequencia, public_summary: { ...sequencia.public_summary, _document: documento } }] },
  })
}

/** A projeção compartilhada da Sequência de outro Vendedor responsável, que a sessão só consulta. */
function sequenciaDeOutroVendedor(workspaceId: string, contaId: string) {
  return {
    id: `sequencia-${contaId}`,
    workspace_id: workspaceId,
    target_account_id: contaId,
    owner_user_id: 'usuario-outro-vendedor',
    status: 'ativa',
    public_summary: { totalParticipantes: 2, totalSteps: 3, passoAtual: 1 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
}

describe('Telas de acesso', () => {
  it('um visitante sem sessão é levado a /entrar', async () => {
    window.history.replaceState(null, '', '/contas')
    abrirAlthius({ ultimoAmbiente: 'real' })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/entrar')
  })

  it('depois de entrar nesta aba, a pessoa volta ao endereço que tentou abrir', async () => {
    window.history.replaceState(null, '', '/contas')
    const { usuario, iniciarSessao } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Enviar link de acesso' }))
    expect(await screen.findByRole('status')).toHaveTextContent('enviaremos um link seguro')

    act(() => iniciarSessao(sessaoDe(MARINA)))
    expect(await screen.findByText('Contas e Contatos ainda não estão disponíveis neste Workspace.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/contas')
  })

  it.each(['//outro.site/contas', '/\\outro.site/contas', 'https://outro.site/contas'])(
    'um destino fora da Althius (%s) leva ao início depois de entrar',
    async (destino) => {
      window.history.replaceState(null, '', `/entrar?${new URLSearchParams({ destino })}`)
      const { iniciarSessao } = abrirAlthius({
        ultimoAmbiente: 'real',
        tabelas: { workspace_memberships: [participacao('ws-norte')] },
      })
      await screen.findByRole('heading', { name: 'Entrar' })

      act(() => iniciarSessao(sessaoDe(MARINA)))
      expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
      expect(window.location.origin + window.location.pathname).toBe(`${window.location.origin}/`)
    },
  )

  it('o link enviado por e-mail leva ao endereço que a pessoa tentou abrir', async () => {
    window.history.replaceState(null, '', '/sinais')
    const { usuario, linkEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })

    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Enviar link de acesso' }))
    await screen.findByRole('status')

    expect(new URL(linkEnviadoPara(MARINA.email)!).pathname).toBe('/sinais')
  })

  it('a Demonstração continua acessível a partir de /entrar, sem login', async () => {
    demonstracaoJaIniciada()
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    await usuario.click(await screen.findByRole('button', { name: 'Acessar Protótipo Completo (Sem login)' }))
    expect(await within(navegacao()).findByText('Demonstração')).toBeInTheDocument()
  })
})
