import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos, type OpcoesDosServicosFalsos } from '@/test/servicos-do-navegador-falsos'
import { VERSAO_DOS_TERMOS } from '@/auth/termos'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
/** A Conta de usuário da Marina já verificada no Supabase Auth, com senha. */
const CONTA_DA_MARINA = { ...MARINA, senha: 'correta-e-longa-123' }

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

const WORKSPACE_PESSOAL_DA_MARINA = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }

/**
 * A raiz como o navegador a abre, com a escolha de ambiente que a pessoa fez da última vez e o último Workspace
 * usado nesta aba. Salvo quando o teste responde o bootstrap, o banco garante o Workspace pessoal da Marina.
 */
function abrirAlthius({
  ultimoAmbiente,
  ultimoWorkspace,
  navegador,
  tabelas = {},
  rpcs = {},
  ...opcoes
}: Parameters<typeof criarSupabaseFalso>[0] & {
  ultimoAmbiente?: 'real' | 'demonstracao'
  ultimoWorkspace?: string
  /** Como os serviços do navegador (Pwned Passwords) respondem; nenhum chama a rede. */
  navegador?: OpcoesDosServicosFalsos
} = {}) {
  if (ultimoAmbiente) localStorage.setItem('althius:modo_demo', String(ultimoAmbiente === 'demonstracao'))
  if (ultimoWorkspace) sessionStorage.setItem('althius:workspace', ultimoWorkspace)
  const supabase = criarSupabaseFalso({
    ...opcoes,
    tabelas,
    rpcs: { bootstrap_personal_workspace: workspacePessoalDaMarinaNoBanco(tabelas), ...rpcs },
  })
  const { servicos, senhasConsultadas } = criarServicosDoNavegadorFalsos(navegador)
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, servicos, senhasConsultadas, usuario }
}

function participacao(workspaceId: string, role: 'admin' | 'member' = 'admin') {
  return { workspace_id: workspaceId, role, user_id: MARINA.id, active: true }
}

/** O bootstrap como o banco o executa: cria o Workspace pessoal e a Participação de Administrador uma única vez. */
function workspacePessoalDaMarinaNoBanco(tabelas: Record<string, Record<string, unknown>[]>) {
  return () => {
    const participacoes = (tabelas.workspace_memberships ??= [])
    if (!participacoes.some((p) => p.workspace_id === WORKSPACE_PESSOAL_DA_MARINA.id)) {
      participacoes.push(participacao(WORKSPACE_PESSOAL_DA_MARINA.id))
    }
    return WORKSPACE_PESSOAL_DA_MARINA
  }
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

    // Sem outro destino, a entrada abre o Workspace pessoal; daí a pessoa troca para o Workspace da empresa.
    await usuario.click(await screen.findByRole('button', { name: 'Trocar de Workspace' }))
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
    ultimoWorkspace: 'ws-norte',
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

  it('quem abre /entrar pela primeira vez neste navegador vê a tela de acesso, e não a Demonstração', async () => {
    window.history.replaceState(null, '', '/entrar')
    abrirAlthius()

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('depois de entrar nesta aba, a pessoa volta ao endereço que tentou abrir', async () => {
    window.history.replaceState(null, '', '/contas')
    const { usuario, iniciarSessao } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um código de 6 dígitos')

    // A pessoa abre o link do e-mail neste navegador.
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
      expect(window.location.pathname).toBe('/')
    },
  )

  it('o link enviado por e-mail leva ao endereço que a pessoa tentou abrir', async () => {
    window.history.replaceState(null, '', '/sinais')
    const { usuario, linkEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })

    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    await screen.findByRole('status')

    expect(new URL(linkEnviadoPara(MARINA.email)!).pathname).toBe('/sinais')
  })

  it('a Demonstração continua acessível a partir de /entrar, sem login', async () => {
    demonstracaoJaIniciada()
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    await usuario.click(await screen.findByRole('button', { name: 'Abrir Demonstração (sem login)' }))
    expect(await within(navegacao()).findByText('Demonstração')).toBeInTheDocument()
  })
})

describe('Workspace pessoal no primeiro acesso', () => {
  it('uma Conta de usuário sem Participação entra e cai no seu Workspace pessoal', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { iniciarSessao } = abrirAlthius({ ultimoAmbiente: 'real' })
    await screen.findByRole('heading', { name: 'Entrar' })

    act(() => iniciarSessao(sessaoDe(MARINA)))

    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
    expect(screen.getByText('Marina Souza')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum Workspace ativo')).not.toBeInTheDocument()
  })

  it('quem já tem Participação num Workspace da empresa, sem outro destino, abre o Workspace pessoal', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
  })

  it('enquanto o Workspace pessoal é preparado, a pessoa vê o carregamento; se falhar, pode tentar de novo', async () => {
    let tentativas = 0
    let concluirPrimeira: (erro: Error) => void = () => {}
    const tabelas: Record<string, Record<string, unknown>[]> = {}
    const noBanco = workspacePessoalDaMarinaNoBanco(tabelas)
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas,
      rpcs: {
        bootstrap_personal_workspace: () => {
          tentativas += 1
          if (tentativas > 1) return noBanco()
          return new Promise((_, rejeitar) => { concluirPrimeira = rejeitar })
        },
      },
    })

    expect(await screen.findByText('Preparando seu Workspace pessoal…')).toBeInTheDocument()
    await act(async () => concluirPrimeira(new Error('connection reset')))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível preparar seu Workspace pessoal.')
    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Cadastro com senha', () => {
  const SENHA = 'correta cavalo bateria'

  async function preencherCadastro(usuario: ReturnType<typeof userEvent.setup>, { email = MARINA.email, senha = SENHA } = {}) {
    await usuario.type(await screen.findByLabelText('Nome'), 'Marina Souza')
    await usuario.type(screen.getByLabelText('E-mail'), email)
    await usuario.type(screen.getByLabelText('Senha'), senha)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
  }

  it('/cadastro pede nome, e-mail e senha, com link para entrar e o aceite passivo dos Termos', async () => {
    window.history.replaceState(null, '', '/cadastro')
    abrirAlthius({ ultimoAmbiente: 'real' })

    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
  })

  it('/entrar tem link para criar conta', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    await usuario.click(await screen.findByRole('link', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/cadastro')
  })

  it('a senha tem medidor de força e pode ser mostrada e ocultada', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    const senha = await screen.findByLabelText('Senha')
    await usuario.type(senha, 'abc')
    expect(screen.getByText('Força da senha: muito curta')).toBeInTheDocument()
    await usuario.type(senha, 'defghi')
    expect(screen.getByText('Força da senha: fraca')).toBeInTheDocument()
    await usuario.type(senha, ' Jklmn 42!')
    expect(screen.getByText('Força da senha: forte')).toBeInTheDocument()

    expect(senha).toHaveAttribute('type', 'password')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha).toHaveAttribute('type', 'text')
    await usuario.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(senha).toHaveAttribute('type', 'password')
  })

  it('uma senha com menos de 8 caracteres é recusada antes de criar a conta', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })

    await preencherCadastro(usuario, { senha: '1234567' })

    expect(await screen.findByRole('alert')).toHaveTextContent('A senha precisa ter pelo menos 8 caracteres.')
    expect(codigoEnviadoPara(MARINA.email)).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
  })

  it('caminho completo: cria a conta, confirma o código e cai no Workspace pessoal, com o aceite gravado pelo bootstrap', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const versoesAceitas: unknown[] = []
    const tabelas: Record<string, Record<string, unknown>[]> = {}
    const noBanco = workspacePessoalDaMarinaNoBanco(tabelas)
    const { usuario, codigoEnviadoPara, nomeCadastrado } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas,
      rpcs: { bootstrap_personal_workspace: (p) => { versoesAceitas.push(p.p_terms_version); return noBanco() } },
    })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(MARINA.email)).toBeInTheDocument()
    expect(nomeCadastrado(MARINA.email)).toBe('Marina Souza')
    // Sem verificação não há sessão nem Workspace.
    expect(versoesAceitas).toEqual([])
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()

    const codigo = screen.getByLabelText('Código de 6 dígitos')
    expect(codigo).toHaveAttribute('autocomplete', 'one-time-code')
    await usuario.type(codigo, '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado.')

    await usuario.clear(codigo)
    await usuario.type(codigo, codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
    expect(screen.getByText('Marina Souza')).toBeInTheDocument()
    expect(versoesAceitas).toEqual([VERSAO_DOS_TERMOS])
    expect(window.location.pathname).toBe('/')
  })

  it('o link do e-mail também confirma neste navegador e leva ao destino lembrado', async () => {
    window.history.replaceState(null, '', `/cadastro?${new URLSearchParams({ destino: '/sinais' })}`)
    const { usuario, linkEnviadoPara, abrirLinkDeConfirmacao } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    await preencherCadastro(usuario)
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
    expect(new URL(linkEnviadoPara(MARINA.email)!).pathname).toBe('/sinais')

    act(() => abrirLinkDeConfirmacao(MARINA.email))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/sinais')
  })

  it('cadastro com e-mail que já tem conta mostra a mesma resposta do cadastro novo', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('"Corrigir e-mail" volta ao formulário sem perder o nome digitado', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })

    await preencherCadastro(usuario, { email: 'marina@errado.com.br' })
    await usuario.click(await screen.findByRole('button', { name: 'Corrigir e-mail' }))

    expect(screen.getByLabelText('Nome')).toHaveValue('Marina Souza')
    await usuario.clear(screen.getByLabelText('E-mail'))
    await usuario.type(screen.getByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText(MARINA.email)).toBeInTheDocument()
    expect(codigoEnviadoPara(MARINA.email)).toBeDefined()
  })

  it('atualizar a página na etapa do código mantém a etapa, sem guardar a senha', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const supabase = abrirAlthius({ ultimoAmbiente: 'real' })
    await preencherCadastro(supabase.usuario)
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })

    cleanup()
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={supabase.servicos} />)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(MARINA.email)).toBeInTheDocument()
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SENHA)

    await supabase.usuario.type(screen.getByLabelText('Código de 6 dígitos'), supabase.codigoEnviadoPara(MARINA.email)!)
    await supabase.usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('"Reenviar código" só fica disponível depois do intervalo mínimo, que a tela mostra', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      window.history.replaceState(null, '', '/cadastro')
      const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })
      await preencherCadastro(usuario)
      await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
      const primeiro = codigoEnviadoPara(MARINA.email)

      expect(screen.getByRole('button', { name: /Reenviar código em \d+ s/ })).toBeDisabled()
      act(() => vi.advanceTimersByTime(60_000))
      await usuario.click(await screen.findByRole('button', { name: 'Reenviar código' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Enviamos um novo código')
      expect(codigoEnviadoPara(MARINA.email)).not.toBe(primeiro)
      expect(screen.getByRole('button', { name: /Reenviar código em \d+ s/ })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })
})

/** A pessoa preenche /entrar com e-mail e senha e confirma. */
async function entrarComSenha(usuario: ReturnType<typeof userEvent.setup>, email: string, senha: string) {
  await usuario.type(await screen.findByLabelText('E-mail'), email)
  await usuario.type(screen.getByLabelText('Senha'), senha)
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Entrar com senha ou com código', () => {
  it('/entrar oferece senha, código, "Esqueci a senha" e o link para criar conta, sem o formulário de link antigo', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    expect(await screen.findByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email')
    const senha = screen.getByLabelText('Senha')
    expect(senha).toHaveAttribute('autocomplete', 'current-password')
    expect(senha).toHaveAttribute('type', 'password')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha).toHaveAttribute('type', 'text')
    await usuario.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(senha).toHaveAttribute('type', 'password')

    expect(screen.getByRole('button', { name: 'Entrar com código' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/esqueci-a-senha')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro')
    expect(screen.queryByRole('button', { name: 'Enviar link de acesso' })).not.toBeInTheDocument()
  })

  it('com a senha certa, a Conta de usuário entra no seu Workspace pessoal', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
  })

  it.each([
    ['senha errada', MARINA.email, 'senha-errada-123'],
    ['e-mail inexistente', 'ninguem@cliente.com.br', CONTA_DA_MARINA.senha],
  ])('com %s, a tela diz só "E-mail ou senha incorretos"', async (_caso, email, senha) => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await entrarComSenha(usuario, email, senha)

    expect(await screen.findByRole('alert')).toHaveTextContent(/^E-mail ou senha incorretos$/)
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('"Entrar com código" pede o código na mesma tela e entra com ele', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um código de 6 dígitos e um link')
    const campo = screen.getByLabelText('Código')
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code')

    await usuario.type(campo, '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado')

    await usuario.clear(campo)
    await usuario.type(campo, codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('"Entrar com código" não cria Conta de usuário e responde igual para um e-mail desconhecido', async () => {
    window.history.replaceState(null, '', '/entrar')
    const contas = [CONTA_DA_MARINA]
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas })

    await usuario.type(await screen.findByLabelText('E-mail'), 'ninguem@cliente.com.br')
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))

    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um código de 6 dígitos e um link')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(codigoEnviadoPara('ninguem@cliente.com.br')).toBeUndefined()
    expect(contas).toEqual([CONTA_DA_MARINA])
  })
})

describe('Workspace de entrada depois do login', () => {
  /** Uma aba nova, com a mesma Conta de usuário entrando pela senha. */
  async function entrarNumaAbaNova(tabelas: Record<string, Record<string, unknown>[]>) {
    cleanup()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/sequencias')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], tabelas })
    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)
    return usuario
  }

  it('entra no último Workspace usado com Participação ativa; sem ela, no Workspace pessoal', async () => {
    const tabelas = {
      workspace_memberships: [participacao('ws-norte', 'member')],
      sequences: [sequenciaDeOutroVendedor('ws-norte', 'conta-do-norte')],
    }

    // No primeiro login, sem Workspace usado antes, abre o pessoal; a pessoa troca para o da empresa.
    const usuario = await entrarNumaAbaNova(tabelas)
    await usuario.click(await screen.findByRole('button', { name: 'Trocar de Workspace' }))
    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Selecione o Workspace' }), 'ws-norte')
    expect(await screen.findByRole('link', { name: 'conta-do-norte' })).toBeInTheDocument()

    // No login seguinte, noutra aba, volta ao Workspace da empresa.
    await entrarNumaAbaNova(tabelas)
    expect(await screen.findByRole('link', { name: 'conta-do-norte' })).toBeInTheDocument()
    expect(screen.queryByText('Marina Souza')).not.toBeInTheDocument()

    // Removida do Workspace da empresa, cai no pessoal e não vê nada do Workspace anterior.
    tabelas.workspace_memberships[0].active = false
    await entrarNumaAbaNova(tabelas)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'conta-do-norte' })).not.toBeInTheDocument()
  })
})

describe('Esqueci a senha', () => {
  const NOVA_SENHA = 'outra frase bem longa 42'

  /** A pessoa pede a redefinição em /esqueci-a-senha para `email`. */
  async function pedirRedefinicao(usuario: ReturnType<typeof userEvent.setup>, email: string) {
    await usuario.type(await screen.findByLabelText('E-mail'), email)
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
  }

  /** Na definição da nova senha: a mesma política do cadastro, e depois a nova senha é salva. */
  async function definirNovaSenha(usuario: ReturnType<typeof userEvent.setup>) {
    expect(await screen.findByRole('heading', { name: 'Defina uma nova senha' })).toBeInTheDocument()
    const senha = screen.getByLabelText('Nova senha')
    expect(senha).toHaveAttribute('autocomplete', 'new-password')
    expect(senha).toHaveAttribute('type', 'password')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha).toHaveAttribute('type', 'text')
    await usuario.click(screen.getByRole('button', { name: 'Ocultar senha' }))

    await usuario.type(senha, '1234567')
    expect(screen.getByText('Força da senha: muito curta')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A senha precisa ter pelo menos 8 caracteres.')

    await usuario.clear(senha)
    await usuario.type(senha, NOVA_SENHA)
    expect(screen.getByText('Força da senha: forte')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  }

  it('"Esqueci a senha" em /entrar abre o pedido, que responde igual exista ou não a Conta de usuário', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, codigoEnviadoPara, linkEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await usuario.click(await screen.findByRole('link', { name: 'Esqueci a senha' }))
    expect(await screen.findByRole('heading', { name: 'Esqueci a senha' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/esqueci-a-senha')

    await pedirRedefinicao(usuario, 'ninguem@cliente.com.br')
    const semConta = (await screen.findByRole('status')).textContent!.replace('ninguem@cliente.com.br', '<e-mail>')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(codigoEnviadoPara('ninguem@cliente.com.br')).toBeUndefined()

    await usuario.click(screen.getByRole('button', { name: 'Corrigir e-mail' }))
    await usuario.clear(screen.getByLabelText('E-mail'))
    await pedirRedefinicao(usuario, MARINA.email)
    expect((await screen.findByRole('status')).textContent!.replace(MARINA.email, '<e-mail>')).toBe(semConta)
    expect(codigoEnviadoPara(MARINA.email)).toBeDefined()
    expect(new URL(linkEnviadoPara(MARINA.email)!).pathname).toBe('/redefinir-a-senha')
  })

  it('redefinição por código: a nova senha encerra as outras sessões e a pessoa entra no Workspace de entrada', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const contas = [{ ...CONTA_DA_MARINA }]
    const { usuario, codigoEnviadoPara, abrirSessaoEmOutroAparelho, sessoesAbertasDe } = abrirAlthius({ ultimoAmbiente: 'real', contas })
    const noCelular = abrirSessaoEmOutroAparelho(MARINA.email)

    await pedirRedefinicao(usuario, MARINA.email)
    const codigo = await screen.findByLabelText('Código de 6 dígitos')
    expect(codigo).toHaveAttribute('autocomplete', 'one-time-code')
    await usuario.type(codigo, '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado')
    await usuario.clear(codigo)
    await usuario.type(codigo, codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))

    // Com o código aceito, a pessoa ainda não entra: primeiro define a nova senha.
    expect(await screen.findByRole('heading', { name: 'Defina uma nova senha' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
    await definirNovaSenha(usuario)

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
    expect(sessoesAbertasDe(MARINA.email)).toHaveLength(1)
    expect(sessoesAbertasDe(MARINA.email)).not.toContain(noCelular)

    // A senha antiga deixa de valer; a nova entra.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)
    expect(await screen.findByRole('alert')).toHaveTextContent(/^E-mail ou senha incorretos$/)
    await usuario.clear(screen.getByLabelText('E-mail'))
    await usuario.clear(screen.getByLabelText('Senha'))
    await entrarComSenha(usuario, MARINA.email, NOVA_SENHA)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('o link do e-mail, aberto neste navegador, também leva à nova senha e depois ao destino lembrado', async () => {
    window.history.replaceState(null, '', `/esqueci-a-senha?${new URLSearchParams({ destino: '/sinais' })}`)
    const supabase = abrirAlthius({
      ultimoAmbiente: 'real',
      contas: [{ ...CONTA_DA_MARINA }],
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })
    await pedirRedefinicao(supabase.usuario, MARINA.email)
    await screen.findByRole('status')
    const link = new URL(supabase.linkEnviadoPara(MARINA.email)!)

    cleanup()
    window.history.replaceState(null, '', link.pathname + link.search)
    supabase.abrirLinkDeRedefinicao(MARINA.email)
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={supabase.servicos} />)

    await definirNovaSenha(supabase.usuario)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/sinais')
  })

  it('quem só entra com Google, sem senha, define a primeira senha pelo mesmo caminho', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas: [{ ...MARINA }] })

    await pedirRedefinicao(usuario, MARINA.email)
    await usuario.type(await screen.findByLabelText('Código de 6 dígitos'), codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await definirNovaSenha(usuario)

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('/redefinir-a-senha sem link válido explica e oferece pedir outro', async () => {
    window.history.replaceState(null, '', '/redefinir-a-senha')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    expect(await screen.findByText(/O link de redefinição expirou ou já foi usado/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Pedir um novo link' }))
    expect(await screen.findByRole('heading', { name: 'Esqueci a senha' })).toBeInTheDocument()
  })
})

describe('Bloqueio de senhas vazadas', () => {
  const VAZADA = 'senha123senha123'
  const BOA = 'correta cavalo bateria'
  const MENSAGEM = 'Esta senha já apareceu em vazamentos de dados. Escolha outra senha.'

  /** Preenche /cadastro (nome e e-mail só na primeira vez) com `senha` e confirma. */
  async function tentarCadastro(usuario: ReturnType<typeof userEvent.setup>, senha: string) {
    const campo = await screen.findByLabelText('Senha')
    if (!screen.getByLabelText<HTMLInputElement>('Nome').value) {
      await usuario.type(screen.getByLabelText('Nome'), 'Marina Souza')
      await usuario.type(screen.getByLabelText('E-mail'), MARINA.email)
    }
    await usuario.clear(campo)
    await usuario.type(campo, senha)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
  }

  /** A Marina pede a redefinição por código e chega à tela da nova senha. */
  async function chegarANovaSenha(supabase: ReturnType<typeof abrirAlthius>) {
    await supabase.usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await supabase.usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    await supabase.usuario.type(await screen.findByLabelText('Código de 6 dígitos'), supabase.codigoEnviadoPara(MARINA.email)!)
    await supabase.usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await screen.findByRole('heading', { name: 'Defina uma nova senha' })
  }

  async function salvarNovaSenha(usuario: ReturnType<typeof userEvent.setup>, senha: string) {
    const campo = screen.getByLabelText('Nova senha')
    await usuario.clear(campo)
    await usuario.type(campo, senha)
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  }

  it('no cadastro, a senha vazada é recusada com mensagem clara e sem criar a conta; outra senha segue', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const { usuario, codigoEnviadoPara, nomeCadastrado } = abrirAlthius({ ultimoAmbiente: 'real', navegador: { senhasVazadas: [VAZADA] } })

    await tentarCadastro(usuario, VAZADA)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(nomeCadastrado(MARINA.email)).toBeUndefined()
    expect(codigoEnviadoPara(MARINA.email)).toBeUndefined()

    await tentarCadastro(usuario, BOA)
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
  })

  it('na redefinição, a senha vazada é recusada com a mesma mensagem, sem trocar a senha', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const contas = [{ ...CONTA_DA_MARINA }]
    const supabase = abrirAlthius({ ultimoAmbiente: 'real', contas, navegador: { senhasVazadas: [VAZADA] } })
    await chegarANovaSenha(supabase)

    await salvarNovaSenha(supabase.usuario, VAZADA)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(contas[0].senha).toBe(CONTA_DA_MARINA.senha)
    expect(screen.getByRole('heading', { name: 'Defina uma nova senha' })).toBeInTheDocument()

    await salvarNovaSenha(supabase.usuario, BOA)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(contas[0].senha).toBe(BOA)
  })

  it('se a consulta de vazadas falhar, o cadastro e a redefinição seguem', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const cadastro = abrirAlthius({ ultimoAmbiente: 'real', navegador: { consultaDeVazadas: 'falha' } })
    await tentarCadastro(cadastro.usuario, BOA)
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(cadastro.senhasConsultadas()).toEqual([BOA])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    cleanup()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const contas = [{ ...CONTA_DA_MARINA }]
    const redefinicao = abrirAlthius({ ultimoAmbiente: 'real', contas, navegador: { consultaDeVazadas: 'falha' } })
    await chegarANovaSenha(redefinicao)
    await salvarNovaSenha(redefinicao.usuario, BOA)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(contas[0].senha).toBe(BOA)
  })

  it('se a consulta de vazadas demorar, o cadastro segue depois de um tempo curto', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      window.history.replaceState(null, '', '/cadastro')
      const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', navegador: { consultaDeVazadas: 'demora' } })
      await tentarCadastro(usuario, BOA)
      expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled()

      await act(() => vi.advanceTimersByTimeAsync(3_000))
      expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a recusa weak_password do Supabase Auth mostra a mesma mensagem, no cadastro e na redefinição', async () => {
    window.history.replaceState(null, '', '/cadastro')
    const cadastro = abrirAlthius({ ultimoAmbiente: 'real', senhasVazadasNoServidor: [VAZADA] })
    await tentarCadastro(cadastro.usuario, VAZADA)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)

    cleanup()
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const redefinicao = abrirAlthius({ ultimoAmbiente: 'real', contas: [{ ...CONTA_DA_MARINA }], senhasVazadasNoServidor: [VAZADA] })
    await chegarANovaSenha(redefinicao)
    await salvarNovaSenha(redefinicao.usuario, VAZADA)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
  })
})
