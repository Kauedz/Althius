import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoStripe } from '@/auth/assinatura'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, type RespostaDaFuncao, sessaoDe } from '@/test/supabase-falso'
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
 * O único caminho para criar conta (acesso-e-planos) é o link de um convite pendente: `/cadastro?destino=/convite/<token>`.
 * O token destes testes carrega o e-mail convidado, que a prévia do convite devolve como o e-mail travado.
 */
const PREFIXO_DO_CONVITE = 'convite-de-'
const cadastroPeloConvite = (email = MARINA.email) =>
  `/cadastro?${new URLSearchParams({ destino: `/convite/${PREFIXO_DO_CONVITE}${email}` })}`
const CADASTRO = cadastroPeloConvite()

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
  /** Como os serviços do navegador (Pwned Passwords, Google, Turnstile) respondem; nenhum chama a rede. */
  navegador?: OpcoesDosServicosFalsos
} = {}) {
  if (ultimoAmbiente) localStorage.setItem('althius:modo_demo', String(ultimoAmbiente === 'demonstracao'))
  if (ultimoWorkspace) sessionStorage.setItem('althius:workspace', ultimoWorkspace)
  const supabase = criarSupabaseFalso({
    ...opcoes,
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: workspacePessoalDaMarinaNoBanco(tabelas),
      // O convite de quem cria conta: pendente, para o e-mail do token, e aceito no Workspace que a Marina já tinha.
      workspace_invitation_preview: ({ p_token }) =>
        typeof p_token === 'string' && p_token.startsWith(PREFIXO_DO_CONVITE)
          ? [{ email: p_token.slice(PREFIXO_DO_CONVITE.length), workspace_name: WORKSPACE_PESSOAL_DA_MARINA.name, role: 'member', status: 'pendente' }]
          : [],
      accept_workspace_invitation: () => WORKSPACE_PESSOAL_DA_MARINA,
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      ...rpcs,
    },
  })
  const { servicos, senhasConsultadas, google, captchasPedidos } = criarServicosDoNavegadorFalsos(navegador)
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, servicos, senhasConsultadas, google, captchasPedidos, usuario }
}

function participacao(workspaceId: string, role: 'admin' | 'member' = 'admin') {
  return { workspace_id: workspaceId, role, user_id: MARINA.id, active: true }
}

/**
 * O bootstrap como o banco o executa depois do fechamento do acesso: devolve o Workspace pessoal que a Marina já tinha, com a
 * Participação de Administrador, sem criar nada. (Os testes de quem não tem Workspace respondem o bootstrap vazio.)
 */
function workspacePessoalDaMarinaNoBanco(tabelas: Record<string, Record<string, unknown>[]>) {
  return () => {
    const workspaces = (tabelas.workspaces ??= [])
    if (!workspaces.some((w) => w.id === WORKSPACE_PESSOAL_DA_MARINA.id)) workspaces.push(WORKSPACE_PESSOAL_DA_MARINA)
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
    // A navegação lista os Agentes padrão do Workspace, e nenhum Agente criado da Demonstração.
    const especialistas = await within(navegacao()).findByRole('navigation', { name: 'Especialistas' })
    expect(within(especialistas).getAllByRole('link').map((link) => link.textContent)).toEqual(['Scopus', 'Ethos', 'Rhetor', 'Oraculum'])
  })

  it.each([
    ['/', 'Conversas e Coordenação com os Agentes ainda não estão disponíveis neste Workspace.', 'Enterprise LATAM'],
    ['/agentes/agente-scopus/conversa', 'Conversas e Coordenação com os Agentes ainda não estão disponíveis neste Workspace.', 'Peça algo a Scopus'],
    ['/conversa', 'Conversas e Coordenação com os Agentes ainda não estão disponíveis neste Workspace.', 'Peça algo aos agentes'],
    ['/contas', 'Nenhuma Conta-alvo ainda.', 'OpenAI'],
    ['/contas/openai', 'Conta não encontrada', 'OpenAI'],
    ['/contatos', 'Nenhum Contato ainda.', 'Sarah Chen'],
    ['/sinais', 'Sinais ainda não estão disponíveis neste Workspace.', 'Vagas'],
    ['/sinais/contas/openai', 'Sinais ainda não estão disponíveis neste Workspace.', 'OpenAI'],
    ['/aprovacoes', 'Aprovações ainda não estão disponíveis neste Workspace.', 'Meta Ads'],
    ['/onboarding', 'Conversas e Coordenação com os Agentes ainda não estão disponíveis neste Workspace.', 'Qual é o seu papel'],
  ])('%s mostra que o módulo está indisponível, sem dados da Demonstração', async (rota, aviso, daDemonstracao) => {
    window.history.replaceState(null, '', rota)
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect((await screen.findAllByText(new RegExp(aviso))).length).toBeGreaterThan(0)
    expect(screen.queryByText(new RegExp(daDemonstracao))).not.toBeInTheDocument()
  })

  // Workspace / Pessoas e acesso já é real (CRM-03): `paginas/configuracoes/participantes-reais.test.tsx`. Meu perfil e
  // Preferências também (CRM-08), e o Plano diz que é só demonstrativo: `paginas/configuracoes/perfil-e-preferencias-reais.test.tsx`.
  it.each(['/configuracoes/memoria/icp', '/configuracoes/memoria/personas'])(
    '%s mostra a seção do Playbook sem versão aprovada (CRM-09), sem documento da Demonstração nem edição direta',
    async (rota) => {
      window.history.replaceState(null, '', rota)
      abrirAlthius({
        ultimoAmbiente: 'real',
        sessao: sessaoDe(MARINA),
        tabelas: { workspace_memberships: [participacao('ws-norte')] },
        rpcs: {
          list_approvals: () => [],
          list_workspace_participants: () => [],
          get_playbook_section: (p: Record<string, unknown>) => ({
            section: p.p_section, name: String(p.p_section), version: null, content: null,
            updated_by: null, updated_at: null, history: [],
          }),
        },
      })

      expect(await screen.findByText(/^Ainda não há (ICP|Personas)\. Importe o Playbook ou peça ao/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Abrir o Playbook' })).toBeInTheDocument()
      expect(screen.queryByText(/Databricks|Marina Alves|2.000 funcionários/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Pedir revisão|Editar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

    expect(await screen.findByText(/^Ainda não enviado\./)).toBeInTheDocument()
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

    // Com Contatos reais, a Sequência pode nascer de uma Conta-alvo; o Rhetor (Agentes) ainda não está disponível.
    expect(await screen.findByText(/Nenhuma sequência ainda/)).toHaveTextContent(
      'Nenhuma sequência ainda. Crie uma nova sequência para uma Conta-alvo.',
    )
    expect(screen.getByRole('button', { name: /Nova sequência/ })).toBeInTheDocument()
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

const ID_DA_ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DA_BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'

/** Uma Conta-alvo como o banco a guarda no Workspace da empresa. */
function contaNoBanco(id: string, nome: string, dominio: string) {
  return {
    id,
    workspace_id: 'ws-norte',
    name: nome,
    canonical_url: `https://${dominio}`,
    domain: dominio,
    linkedin_url: null,
    segment: null,
    last_interaction_at: null,
  }
}

/** Um Contato com Vínculo ativo numa Conta, como a visão `target_contacts` o devolve. */
function contatoNoBanco(id: string, contaId: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id, workspace_id: 'ws-norte', target_account_id: contaId, name: nome, role: null,
    email: null, whatsapp: null, linkedin: null, last_interaction_at: null, ...extra,
  }
}

/** O Workspace da empresa com a Alfa, da Marina, e a Beta, de outro Vendedor responsável; as RPCs gravam nas tabelas. */
function abrirContasDoNorte(
  rota: string,
  { sequencias = [], rpcs = {}, esperarLeitura, funcoes, ajustarTabelas }: Pick<OpcoesDoSupabaseFalso, 'rpcs' | 'esperarLeitura' | 'funcoes'> & {
    sequencias?: Record<string, unknown>[]
    /** Mexe nas tabelas antes de o app abrir, para o teste partir de um Workspace com um dado a mais. */
    ajustarTabelas?: (tabelas: Record<string, Record<string, unknown>[]>) => void
  } = {},
) {
  window.history.replaceState(null, '', rota)
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [participacao('ws-norte', 'member')],
    target_accounts: [contaNoBanco(ID_DA_ALFA, 'Alfa Varejo', 'alfa.com.br'), contaNoBanco(ID_DA_BETA, 'Beta Logística', 'beta.com.br')],
    sales_responsibilities: [
      { workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id },
      { workspace_id: 'ws-norte', target_account_id: ID_DA_BETA, owner_user_id: 'usuario-outro-vendedor' },
    ],
    account_interactions: [],
    target_contacts: [
      contatoNoBanco('7a1c2d3e-4a5b-4c6d-8e7f-000000000001', ID_DA_ALFA, 'Maria Souza', {
        role: 'CFO', email: 'maria@alfa.com.br', whatsapp: '+5511988887777',
      }),
      contatoNoBanco('7a1c2d3e-4a5b-4c6d-8e7f-000000000002', ID_DA_BETA, 'Rui Lima'),
    ],
    sequences: sequencias,
  }
  ajustarTabelas?.(tabelas)
  const aberto = abrirAlthius({
    ultimoAmbiente: 'real',
    ultimoWorkspace: 'ws-norte',
    sessao: sessaoDe(MARINA),
    tabelas,
    esperarLeitura,
    funcoes,
    rpcs: {
      // Nenhum Sinal gravado nas Contas do Norte: a leitura responde vazio (CRM-10 mostra o erro quando ela falha).
      list_signals: () => [],
      save_target_account: ({ p_name, p_url }) => {
        const dominio = String(p_url).replace(/^https?:\/\//, '').replace(/\/$/, '')
        const nova = contaNoBanco('6f1c2d3e-4a5b-4c6d-8e7f-000000000003', String(p_name), dominio)
        tabelas.target_accounts.push(nova)
        tabelas.sales_responsibilities.push({ workspace_id: 'ws-norte', target_account_id: nova.id, owner_user_id: MARINA.id })
        return nova
      },
      create_contact: ({ p_target_account_id, p_name, p_role }) => {
        const id = `7a1c2d3e-4a5b-4c6d-8e7f-00000000010${tabelas.target_contacts.length}`
        tabelas.target_contacts.push(contatoNoBanco(id, String(p_target_account_id), String(p_name), { role: p_role }))
        return { id }
      },
      link_contact: ({ p_contact_id, p_target_account_id }) => {
        const existente = tabelas.target_contacts.find((c) => c.id === p_contact_id)!
        tabelas.target_contacts.push({ ...existente, target_account_id: p_target_account_id })
        return {}
      },
      end_contact_link: ({ p_contact_id, p_target_account_id }) => {
        tabelas.target_contacts = tabelas.target_contacts.filter(
          (c) => !(c.id === p_contact_id && c.target_account_id === p_target_account_id),
        )
        return {}
      },
      register_account_interaction: ({ p_target_account_id, p_kind }) => {
        const interacao = {
          id: `interacao-${tabelas.account_interactions.length + 1}`,
          workspace_id: 'ws-norte',
          target_account_id: p_target_account_id,
          kind: p_kind,
          occurred_at: new Date().toISOString(),
        }
        tabelas.account_interactions.push(interacao)
        return interacao
      },
      ...rpcs,
    },
  })
  return { ...aberto, tabelas }
}

describe('Contas-alvo reais no Workspace operacional', () => {
  it('lista as Contas do Workspace, busca, abre o detalhe e volta com a busca', async () => {
    const { usuario } = abrirContasDoNorte('/contas?busca=alfa')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    expect(within(tabela).getByRole('link', { name: 'Alfa Varejo' })).toBeInTheDocument()
    expect(within(tabela).queryByRole('link', { name: 'Beta Logística' })).not.toBeInTheDocument()
    expect(screen.queryByText(/OpenAI|Databricks/)).not.toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('link', { name: 'Alfa Varejo' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Alfa Varejo' })).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/contas/${ID_DA_ALFA}`)

    await usuario.click(screen.getByRole('link', { name: 'Contas' }))
    expect(await screen.findByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('alfa')
  })

  it('o detalhe mostra só o que existe, com estados vazios, sem preencher lacunas com a Demonstração', async () => {
    abrirContasDoNorte(`/contas/${ID_DA_ALFA}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Alfa Varejo' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhum sinal')).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma interação registrada')).toBeInTheDocument()
    expect(screen.queryByText(/Recomendada pela Althius|Importada por/)).not.toBeInTheDocument()
  })

  it('uma Conta que não existe no Workspace aparece como não encontrada', async () => {
    abrirContasDoNorte('/contas/6f1c2d3e-4a5b-4c6d-8e7f-00000000ffff')

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta não encontrada' })).toBeInTheDocument()
  })

  it('a pessoa cadastra uma Conta-alvo manualmente e ela entra na lista', async () => {
    const { usuario, tabelas } = abrirContasDoNorte('/contas')

    await usuario.click(await screen.findByRole('button', { name: 'Nova Conta-alvo' }))
    const formulario = screen.getByRole('form', { name: 'Nova Conta-alvo' })
    await usuario.type(within(formulario).getByLabelText('Nome da empresa'), 'Gama Energia')
    await usuario.type(within(formulario).getByLabelText('URL da empresa'), 'gama.com.br')
    await usuario.click(within(formulario).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('link', { name: 'Gama Energia' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Nova Conta-alvo' })).not.toBeInTheDocument()
    expect(tabelas.sales_responsibilities.at(-1)).toMatchObject({ owner_user_id: MARINA.id })
  })

  it('o Vendedor responsável registra uma Interação manual e a vê no histórico da Conta', async () => {
    const { usuario } = abrirContasDoNorte(`/contas/${ID_DA_ALFA}`)

    const formulario = await screen.findByRole('form', { name: 'Registrar interação' })
    await usuario.selectOptions(within(formulario).getByLabelText('Tipo de interação'), 'ligacao')
    await usuario.click(within(formulario).getByRole('button', { name: 'Registrar' }))

    const historico = await screen.findByRole('list', { name: 'Interações' })
    expect(within(historico).getByText(/Ligação/)).toBeInTheDocument()
    expect(within(historico).getByText(/Registro manual/)).toBeInTheDocument()
  })

  it('quem não é o Vendedor responsável consulta a Conta, mas não registra Interação nela', async () => {
    abrirContasDoNorte(`/contas/${ID_DA_BETA}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Beta Logística' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma interação registrada')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Registrar interação' })).not.toBeInTheDocument()
  })
})

describe('Nomes no lugar de identificadores no Workspace operacional', () => {
  it('o seletor lista os Workspaces pelo nome, e a navegação mostra o nome do Workspace escolhido', async () => {
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: {
        workspace_memberships: [participacao('ws-norte'), participacao('ws-sul', 'member')],
        workspaces: [
          { id: 'ws-norte', kind: 'empresa', name: 'Norte Distribuidora', owner_user_id: null },
          { id: 'ws-sul', kind: 'empresa', name: 'Sul Varejo', owner_user_id: null },
        ],
      },
    })

    // Sem outro destino, a entrada abre o Workspace pessoal, que a navegação apresenta pelo nome.
    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByRole('button', { name: 'Workspace: Marina Souza' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Trocar de Workspace' }))

    const seletor = await screen.findByRole('combobox', { name: 'Selecione o Workspace' })
    const opcoes = within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)
    expect(opcoes).toEqual(['Escolher participação…', 'Marina Souza', 'Norte Distribuidora', 'Sul Varejo'])
    await usuario.selectOptions(seletor, 'Sul Varejo')

    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByRole('button', { name: 'Workspace: Sul Varejo' })).toBeInTheDocument()
    expect(within(navegacao()).getByText('Sul Varejo')).toBeInTheDocument()
    expect(screen.queryByText('ws-sul')).not.toBeInTheDocument()
  })

  it('dois Workspaces com o mesmo nome aparecem no seletor com o início do identificador', async () => {
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: {
        workspace_memberships: [participacao('ca40c1d2-0000-4000-8000-000000000001'), participacao('05bb7bb8-0000-4000-8000-000000000002', 'member')],
        workspaces: [
          { id: 'ca40c1d2-0000-4000-8000-000000000001', kind: 'empresa', name: 'Workspace da empresa', owner_user_id: null },
          { id: '05bb7bb8-0000-4000-8000-000000000002', kind: 'empresa', name: 'Workspace da empresa', owner_user_id: null },
        ],
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Trocar de Workspace' }))
    const seletor = await screen.findByRole('combobox', { name: 'Selecione o Workspace' })
    expect(within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Escolher participação…', 'Marina Souza', 'Workspace da empresa (05bb7bb8)', 'Workspace da empresa (ca40c1d2)',
    ])
  })

  it('o Resumo da Conta-alvo que outro participante vê mostra o nome da Conta-alvo', async () => {
    const sequenciaDaBeta = sequenciaDeOutroVendedor('ws-norte', ID_DA_BETA)
    abrirContasDoNorte(`/sequencias/${sequenciaDaBeta.id}`, { sequencias: [sequenciaDaBeta] })

    const resumo = await screen.findByRole('region', { name: 'Resumo público da sequência' })
    expect(within(resumo).getByText('Beta Logística')).toBeInTheDocument()
    expect(within(resumo).queryByText(ID_DA_BETA)).not.toBeInTheDocument()
  })

  it('o detalhe da Sequência recém-criada mostra o nome da Conta-alvo desde a primeira renderização', async () => {
    // O banco grava a Sequência da Marina e devolve o documento privado só a ela.
    const sequencias: Record<string, unknown>[] = []
    const documentos = new Map<unknown, unknown>()
    let contasChegando: Promise<void> | undefined
    const { usuario } = abrirContasDoNorte('/sequencias', {
      sequencias,
      esperarLeitura: (tabela) => (tabela === 'target_accounts' ? contasChegando : undefined),
      rpcs: {
        create_sequence: ({ p_workspace_id, p_target_account_id, p_private_document, p_public_summary }) => {
          const nova = {
            id: 'sequencia-da-alfa', workspace_id: p_workspace_id, target_account_id: p_target_account_id,
            owner_user_id: MARINA.id, status: 'ativa', public_summary: p_public_summary,
            created_at: '2026-09-27T12:00:00Z', updated_at: '2026-09-27T12:00:00Z',
          }
          sequencias.push(nova)
          documentos.set(nova.id, p_private_document)
          return [nova]
        },
        get_owned_sequence: ({ p_sequence_id }) => sequencias
          .filter((s) => s.id === p_sequence_id)
          .map((s) => ({ ...s, public_summary: { ...(s.public_summary as object), _document: documentos.get(s.id) } })),
        list_sequence_step_sends: () => [],
        list_received_emails: () => [],
        get_sequence_authorization: () => [],
      },
    })

    await usuario.click(await screen.findByRole('button', { name: /Nova sequência/ }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.selectOptions(within(dialogo).getByRole('combobox', { name: 'Conta-alvo' }), ID_DA_ALFA)
    await within(dialogo).findByRole('checkbox', { name: /Maria Souza/ })
    let liberarContas!: () => void
    contasChegando = new Promise((resolver) => { liberarContas = resolver })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar sequência' }))

    // A Sequência criada já chegou ao detalhe; as Contas-alvo ainda não. O identificador não aparece no lugar do nome.
    await waitFor(() => expect(window.location.pathname).toBe('/sequencias/sequencia-da-alfa'))
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando')
    expect(screen.queryByText(new RegExp(ID_DA_ALFA))).not.toBeInTheDocument()

    liberarContas()
    const titulo = await screen.findByRole('heading', { level: 2, name: /sequência$/ })
    expect(titulo).toHaveTextContent('Alfa Varejo sequência')
    expect(screen.getByRole('link', { name: 'Sequências / Alfa Varejo' })).toBeInTheDocument()
  })
})

describe('Contatos reais no Workspace operacional', () => {
  it('lista os Contatos do Workspace com a empresa, busca e filtra por dados de contato', async () => {
    const { usuario } = abrirContasDoNorte('/contatos')

    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByText('Maria Souza')).toBeInTheDocument()
    expect(within(tabela).getByRole('link', { name: 'Beta Logística' })).toBeInTheDocument()
    expect(screen.queryByText(/Sarah Chen|OpenAI/)).not.toBeInTheDocument()
    // Sem foto nem canais, o Rui aparece com as iniciais e os canais apagados.
    expect(within(tabela).getByRole('img', { name: 'Rui Lima' })).toHaveTextContent('RL')

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar contatos' }), 'beta')
    expect(within(await screen.findByRole('table')).queryByText('Maria Souza')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Rui Lima')).toBeInTheDocument()
  })

  it('o detalhe da Conta mostra os Contatos dela e a lista de Contas os conta', async () => {
    abrirContasDoNorte(`/contas/${ID_DA_ALFA}`)

    const secao = await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    expect(within(secao).getByText('Maria Souza')).toBeInTheDocument()
    expect(within(secao).queryByText('Rui Lima')).not.toBeInTheDocument()
  })

  it('o Vendedor responsável cadastra um Contato na Conta, mesmo com o nome de outro', async () => {
    const { usuario, tabelas } = abrirContasDoNorte(`/contas/${ID_DA_ALFA}`)

    await usuario.click(await screen.findByRole('button', { name: 'Novo Contato' }))
    const formulario = screen.getByRole('form', { name: 'Novo Contato' })
    await usuario.type(within(formulario).getByLabelText('Nome'), 'Maria Souza')
    await usuario.type(within(formulario).getByLabelText('Cargo (opcional)'), 'Compras')
    await usuario.click(within(formulario).getByRole('button', { name: 'Salvar' }))

    const secao = await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    await waitFor(() => expect(within(secao).getAllByText('Maria Souza')).toHaveLength(2))
    expect(tabelas.target_contacts.filter((c) => c.name === 'Maria Souza')).toHaveLength(2)
  })

  it('quem não é o Vendedor responsável não cadastra Contato na Conta', async () => {
    abrirContasDoNorte(`/contas/${ID_DA_BETA}`)

    expect(await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo Contato' })).not.toBeInTheDocument()
  })

  it('o responsável vincula um Contato de outra Conta e encerra o Vínculo', async () => {
    const { usuario } = abrirContasDoNorte(`/contas/${ID_DA_ALFA}`)

    const vincular = await screen.findByRole('form', { name: 'Vincular Contato' })
    await usuario.selectOptions(within(vincular).getByLabelText('Contato de outra Conta'), 'Rui Lima')
    await usuario.click(within(vincular).getByRole('button', { name: 'Vincular' }))
    const secao = await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    expect(await within(secao).findByText('Rui Lima')).toBeInTheDocument()

    const encerrar = screen.getByRole('form', { name: 'Encerrar Vínculo' })
    await usuario.selectOptions(within(encerrar).getByLabelText('Contato desta Conta'), 'Maria Souza')
    await usuario.click(within(encerrar).getByRole('button', { name: 'Encerrar vínculo' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Contatos da Conta-alvo' })).queryByText('Maria Souza')).not.toBeInTheDocument())
  })
})

describe('Foto pública do Contato no Workspace operacional', () => {
  const ID_DA_MARIA = '7a1c2d3e-4a5b-4c6d-8e7f-000000000001'
  const FOTO = 'https://media.licdn.com/dms/image/maria.jpg'

  /** A Maria passa a ter LinkedIn, o que habilita a busca da foto; o Rui segue sem. */
  const comLinkedinNaMaria = (tabelas: Record<string, Record<string, unknown>[]>) => {
    tabelas.target_contacts[0].linkedin = 'https://www.linkedin.com/in/maria-souza'
    tabelas.contact_photo_status = []
  }

  it('mostra a foto que o Actor trouxe e não oferece a busca de novo', async () => {
    const buscar = vi.fn()
    abrirContasDoNorte('/contatos', {
      funcoes: { 'contact-photo-lookup': buscar },
      ajustarTabelas: (tabelas) => {
        comLinkedinNaMaria(tabelas)
        tabelas.contact_photo_status.push({ workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'found', photo_url: FOTO })
      },
    })

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    const foto = within(tabela).getByRole('img', { name: 'Maria Souza' })
    expect(foto).toHaveAttribute('src', FOTO)
    expect(within(tabela).queryByRole('button', { name: /Buscar foto/ })).not.toBeInTheDocument()
    // Listar a tabela nunca dispara a consulta.
    expect(buscar).not.toHaveBeenCalled()
  })

  it('sem foto, o avatar mostra as iniciais e a busca só existe para quem tem LinkedIn; ao clicar, a foto aparece', async () => {
    const pedidos: Record<string, unknown>[] = []
    const { usuario, tabelas } = abrirContasDoNorte('/contatos', {
      ajustarTabelas: comLinkedinNaMaria,
      funcoes: {
        'contact-photo-lookup': (corpo) => {
          pedidos.push(corpo)
          tabelas.contact_photo_status.push({ workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'found', photo_url: FOTO })
          return { corpo: { status: 'found' } }
        },
      },
    })

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(within(tabela).getByRole('img', { name: 'Maria Souza' })).toHaveTextContent('MS')
    // O Rui não tem LinkedIn: não há de onde buscar.
    expect(within(tabela).getAllByRole('button', { name: /Buscar foto/ })).toHaveLength(1)
    expect(pedidos).toEqual([])

    await usuario.click(within(tabela).getByRole('button', { name: 'Buscar foto de Maria Souza' }))

    await waitFor(() => expect(within(screen.getByRole('table')).getByRole('img', { name: 'Maria Souza' })).toHaveAttribute('src', FOTO))
    expect(pedidos).toEqual([{ contactId: ID_DA_MARIA }])
    expect(screen.queryByRole('button', { name: /Buscar foto/ })).not.toBeInTheDocument()
  })

  it('uma foto cuja URL expirou (a imagem não carrega) volta às iniciais', async () => {
    abrirContasDoNorte('/contatos', {
      ajustarTabelas: (tabelas) => {
        comLinkedinNaMaria(tabelas)
        tabelas.contact_photo_status.push({ workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'found', photo_url: FOTO })
      },
    })

    const foto = await within(await screen.findByRole('table', { name: 'Tabela de Contatos' })).findByRole('img', { name: 'Maria Souza' })
    fireEvent.error(foto)

    const avatar = within(screen.getByRole('table')).getByRole('img', { name: 'Maria Souza' })
    expect(avatar.tagName).toBe('SPAN')
    expect(avatar).toHaveTextContent('MS')
  })

  it('quando a busca falha, mostra o motivo e o Contato segue com as iniciais', async () => {
    const { usuario } = abrirContasDoNorte('/contatos', {
      ajustarTabelas: comLinkedinNaMaria,
      funcoes: {
        'contact-photo-lookup': () => ({ status: 429, corpo: { error: 'O Workspace atingiu o limite diário de buscas de foto. Tente de novo amanhã.' } }),
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Buscar foto de Maria Souza' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O Workspace atingiu o limite diário de buscas de foto')
    const tabela = screen.getByRole('table', { name: 'Tabela de Contatos' })
    expect(within(tabela).getByRole('img', { name: 'Maria Souza' })).toHaveTextContent('MS')
    expect(within(tabela).getByRole('button', { name: 'Buscar foto de Maria Souza' })).toBeEnabled()
  })

  it('a busca sem resposta do Apify explica a falha em vez de quebrar o Contato', async () => {
    const { usuario } = abrirContasDoNorte('/contatos', {
      ajustarTabelas: comLinkedinNaMaria,
      funcoes: { 'contact-photo-lookup': () => ({ status: 500, corpo: {} }) },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Buscar foto de Maria Souza' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('contact-photo-lookup respondeu HTTP 500')
    expect(within(screen.getByRole('table')).getByText('Maria Souza')).toBeInTheDocument()
  })

  it('uma busca que não achou foto deixa a dica de buscar de novo, sem foto inventada', async () => {
    abrirContasDoNorte('/contatos', {
      ajustarTabelas: (tabelas) => {
        comLinkedinNaMaria(tabelas)
        tabelas.contact_photo_status.push({ workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'not_found', photo_url: null })
      },
    })

    const botao = await screen.findByRole('button', { name: 'Buscar foto de Maria Souza' })
    expect(botao).toHaveAttribute('title', 'O perfil não tem foto pública. Buscar de novo')
    expect(within(screen.getByRole('table')).getByRole('img', { name: 'Maria Souza' })).toHaveTextContent('MS')
  })

  it('sem estado de foto no banco, os Contatos continuam na lista, com as iniciais', async () => {
    abrirContasDoNorte('/contatos', {})

    // A foto é enfeite: a lista não depende da leitura do estado dela.
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(within(tabela).getByText('Maria Souza')).toBeInTheDocument()
  })

  it('na Demonstração não há busca de foto nem foto simulada como consultada', async () => {
    renderizarApp('/contatos')

    await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(screen.queryByRole('button', { name: /Buscar foto/ })).not.toBeInTheDocument()
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
    expect(await screen.findByText(/Nenhuma Conta-alvo ainda\./)).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'OpenAI' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir Demonstração' }))
    expect(await screen.findByRole('link', { name: 'OpenAI' })).toBeInTheDocument()
    expect(within(navegacao()).getByText('Demonstração')).toBeInTheDocument()
  })
})

/** A Sequência de que a sessão é a Vendedora responsável, aberta no detalhe, com o documento privado dela. */
function abrirASequenciaDaMarina({
  status = 'ativa',
  motivoPause,
  rpcs = {},
  funcoes = {},
}: {
  status?: 'ativa' | 'pausada' | 'reuniao' | 'esgotada'
  motivoPause?: string
  rpcs?: OpcoesDoSupabaseFalso['rpcs']
  funcoes?: OpcoesDoSupabaseFalso['funcoes']
} = {}) {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  const sequencia = {
    ...sequenciaDeOutroVendedor('ws-norte', 'conta-do-norte'),
    id: 'sequencia-da-marina',
    owner_user_id: MARINA.id,
    status,
  }
  const documento = {
    participantesIds: ['contato-1'],
    steps: [{ id: 'passo-1', ordem: 1, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 0, titulo: 'Primeiro contato', assunto: 'Olá', corpo: 'Oi! {{remetente.nome}}' }],
    ...(motivoPause ? { motivoPause } : {}),
  }
  return abrirAlthius({
    ultimoAmbiente: 'real',
    ultimoWorkspace: 'ws-norte',
    sessao: sessaoDe(MARINA),
    tabelas: { workspace_memberships: [participacao('ws-norte')], sequences: [sequencia] },
    rpcs: {
      get_owned_sequence: () => [{ ...sequencia, public_summary: { ...sequencia.public_summary, _document: documento } }],
      list_sequence_step_sends: () => [],
      list_received_emails: () => [],
      get_sequence_authorization: () => [],
      ...rpcs,
    },
    funcoes,
  })
}

/** O backend em memória dos Envios da Marina: confirmar cria a linha; o resultado do envio vem da Edge Function. */
function enviosDaMarina(respostaDaFuncao: { status?: number; corpo: unknown }) {
  const envios: Record<string, unknown>[] = []
  const pedidosDeEnvio: Record<string, unknown>[] = []
  const linha = (status: string) => ({
    id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: 'maria@empresa-alvo.test', status,
    attempts: 0, confirmed_at: '2026-09-26T15:00:00Z', sent_at: status === 'sent' ? '2026-09-26T15:00:05Z' : null,
    last_error: null, last_error_at: null, updated_at: '2026-09-26T15:00:00Z',
  })
  return {
    rpcs: {
      list_sequence_step_sends: () => envios,
      confirm_sequence_step: () => {
        envios.splice(0, envios.length, linha('confirmed'))
        return [linha('confirmed')]
      },
    },
    funcoes: {
      'sequence-step-sends': (corpo: Record<string, unknown>) => {
        pedidosDeEnvio.push(corpo)
        const desfecho = (respostaDaFuncao.corpo as { outcome?: string }).outcome
        if (desfecho === 'sent') envios.splice(0, envios.length, linha('sent'))
        return respostaDaFuncao
      },
    },
    pedidosDeEnvio,
  }
}

describe('Envios automáticos da Sequência no Workspace operacional', () => {
  const linhaDoEnvio = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: 'maria@empresa-alvo.test', status,
    attempts: 0, confirmed_at: '2026-09-26T15:00:00Z', sent_at: null, last_error: null, last_error_at: null,
    updated_at: '2026-09-26T15:00:00Z', mode: 'auto', scheduled_for: '2026-09-30T13:00:00Z', ...extra,
  })

  it('a Vendedora ativa os envios, confere o passo antes e vê quando ele sai sozinho', async () => {
    const pedidos: Record<string, unknown>[] = []
    let ativada = false
    const { usuario } = abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => ativada
          ? [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }]
          : [],
        list_sequence_step_sends: () => ativada ? [linhaDoEnvio('scheduled')] : [],
        activate_sequence: (parametros) => {
          pedidos.push(parametros)
          ativada = true
          return [{ outcome: 'activated', step_id: 'passo-1', version: 1, scheduled_for: '2026-09-30T13:00:00Z' }]
        },
      },
    })

    const painel = await screen.findByRole('region', { name: 'Envios automáticos' })
    expect(within(painel).getByText(/só saem sozinhos, mesmo com o navegador fechado, depois que você ativar/)).toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Ativar envios' }))

    const dialogo = await screen.findByRole('dialog')
    const passos = within(dialogo).getByRole('list', { name: 'Passos a ativar' })
    expect(within(passos).getByText('Primeiro contato')).toBeInTheDocument()
    expect(within(passos).getByText(/automático/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ativar' }))

    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina' }])
    expect(await within(painel).findByRole('status')).toHaveTextContent('Envios ativados. "Primeiro contato" sai qua., 30/09, 10:00.')
    expect(await within(painel).findByText('Envios ativos. Próximo: "Primeiro contato", qua., 30/09, 10:00.')).toBeInTheDocument()
    expect(within(painel).queryByRole('button', { name: /Ativar/ })).not.toBeInTheDocument()
    expect(await screen.findByText('Programado')).toBeInTheDocument()
    expect(screen.getByText(/^Sai sozinho qua\., 30\/09, 10:00 para maria@empresa-alvo\.test, mesmo com o navegador fechado\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar e enviar/ })).not.toBeInTheDocument()
  })

  it('uma ativação barrada diz o motivo e o passo', async () => {
    const { usuario } = abrirASequenciaDaMarina({
      rpcs: { activate_sequence: () => [{ outcome: 'contact_without_email', step_id: 'passo-1', version: null, scheduled_for: null }] },
    })
    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ativar' }))
    const painel = screen.getByRole('region', { name: 'Envios automáticos' })
    expect(await within(painel).findByRole('status')).toHaveTextContent(
      'O Contato de um passo não tem e-mail. Cadastre o e-mail antes de ativar. Passo: "Primeiro contato".')
  })

  it('uma ativação barrada por um número de e-mail que o Contato não tem diz o motivo e o passo', async () => {
    const { usuario } = abrirASequenciaDaMarina({
      rpcs: { activate_sequence: () => [{ outcome: 'destination_not_found', step_id: 'passo-1', version: null, scheduled_for: null }] },
    })
    await usuario.click(await screen.findByRole('button', { name: 'Ativar envios' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ativar' }))
    const painel = screen.getByRole('region', { name: 'Envios automáticos' })
    expect(await within(painel).findByRole('status')).toHaveTextContent(
      'Um passo escolhe um número de e-mail que o Contato não tem. Ajuste o passo antes de ativar. Passo: "Primeiro contato".')
  })

  it('depois de uma edição num passo pendente, o painel avisa que os envios pararam', async () => {
    abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: false, revoked_reason: 'edited' }],
        list_sequence_step_sends: () => [linhaDoEnvio('cancelled', { scheduled_for: null })],
      },
    })
    const painel = await screen.findByRole('region', { name: 'Envios automáticos' })
    expect(await within(painel).findByText(/Você alterou passos depois da ativação\. Os envios automáticos pararam/)).toBeInTheDocument()
    expect(within(painel).getByRole('button', { name: 'Ativar de novo' })).toBeInTheDocument()
    expect(await screen.findByText('Cancelado: a Sequência mudou depois da ativação.')).toBeInTheDocument()
  })

  it('um passo manual espera a Vendedora, que o envia com um clique', async () => {
    abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [linhaDoEnvio('confirmed', { mode: 'manual' })],
      },
    })
    expect(await screen.findByText(/^Passo manual: não sai sozinho\. Pronto para você enviar a partir de qua\., 30\/09, 10:00/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
    expect(screen.getByText('Envios ativos. Próximo: "Primeiro contato", passo manual que espera você enviar.')).toBeInTheDocument()
  })

  it('um envio incerto pede à Vendedora que diga se o e-mail saiu', async () => {
    const pedidos: Record<string, unknown>[] = []
    let resolvido = false
    const { usuario } = abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [resolvido ? linhaDoEnvio('sent', { sent_at: '2026-09-30T13:00:05Z' }) : linhaDoEnvio('uncertain')],
        resolve_uncertain_step: (parametros) => {
          pedidos.push(parametros)
          resolvido = true
          return 'sent'
        },
      },
    })
    expect(await screen.findByText(/Confira sua caixa de saída: o e-mail saiu\?/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Saiu' }))
    expect(pedidos).toEqual([{ p_sequence_id: 'sequencia-da-marina', p_step_id: 'passo-1', p_went_out: true }])
    expect(await screen.findByText('Registrado como enviado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não saiu' })).not.toBeInTheDocument()
  })
})

describe('Envio e resposta da Sequência no Workspace operacional', () => {
  it('a Vendedora responsável confirma o passo e o envia pela sua Conta remetente', async () => {
    const backend = enviosDaMarina({ corpo: { outcome: 'sent', sendId: 'envio-1' } })
    const { usuario } = abrirASequenciaDaMarina(backend)

    expect(await screen.findByText(/^Ainda não enviado\./)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e enviar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('E-mail enviado para maria@empresa-alvo.test.')
    expect(backend.pedidosDeEnvio).toEqual([{ action: 'send', workspaceId: 'ws-norte', sendId: 'envio-1' }])
    expect(await screen.findByText(/^Enviado em .* para maria@empresa-alvo\.test\. Aceito pelo provedor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar e enviar|Reconfirmar e enviar/ })).not.toBeInTheDocument()
  })

  it('um envio bloqueado pelo backend explica o motivo e deixa o passo confirmado, não enviado', async () => {
    const backend = enviosDaMarina({
      status: 409,
      corpo: { outcome: 'sender_not_ready', message: 'Sua Conta remetente de E-mail não está pronta para enviar.' },
    })
    const { usuario } = abrirASequenciaDaMarina(backend)

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar e enviar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Sua Conta remetente de E-mail não está pronta para enviar.')
    expect(await screen.findByText(/^Confirmado para maria@empresa-alvo\.test\. Ainda não enviado\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e enviar' })).toBeInTheDocument()
  })

  function respostaComAnexos(attachments: Record<string, unknown>[]) {
    return {
      list_sequence_step_sends: () => [{
        id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: 'maria@empresa-alvo.test', status: 'sent',
        attempts: 1, confirmed_at: '2026-09-26T15:00:00Z', sent_at: '2026-09-26T15:00:05Z', last_error: null, last_error_at: null,
        updated_at: '2026-09-26T15:00:05Z',
      }],
      list_received_emails: () => [{
        interaction_id: 'inter-1', sequence_id: 'sequencia-da-marina', send_id: 'envio-1', contact_id: 'contato-1',
        from_email: 'maria@empresa-alvo.test', from_name: 'Maria Souza', subject: 'Re: Olá', body: 'Podemos falar amanhã às 10h?',
        snippet: 'Podemos falar', received_at: '2026-09-26T16:00:00Z', attachments,
      }],
    }
  }

  /** O armazenamento devolve os bytes pela URL assinada; a tela vira isso num blob: local. */
  function simularArmazenamento() {
    const buscados: string[] = []
    const criados: Blob[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      buscados.push(url)
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'application/octet-stream' } })
    }))
    URL.createObjectURL = vi.fn((arquivo: Blob) => {
      criados.push(arquivo)
      return `blob:althius/${criados.length}`
    })
    URL.revokeObjectURL = vi.fn()
    return { buscados, criados }
  }

  const urlAssinada = (corpo: Record<string, unknown>) => ({
    corpo: { url: `https://storage.test/recebidos/inter-1/${String(corpo.attachmentId)}?token=abc`, expiresIn: 300 },
  })

  it('a resposta recebida aparece com o conteúdo só para a Vendedora responsável, e o PDF abre no leitor do navegador', async () => {
    const { criados } = simularArmazenamento()
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    const pedidosDeAnexo: Record<string, unknown>[] = []
    const { usuario } = abrirASequenciaDaMarina({
      status: 'pausada',
      motivoPause: 'Contato respondeu',
      rpcs: respostaComAnexos([{ id: 'att-1', name: 'proposta.pdf', mime: 'application/pdf', size: 1234, status: 'stored' }]),
      funcoes: {
        'received-email-attachments': (corpo) => {
          pedidosDeAnexo.push(corpo)
          return urlAssinada(corpo)
        },
      },
    })

    expect(await screen.findByText(/Sequência pausada: Contato respondeu/)).toBeInTheDocument()
    const respostas = await screen.findByRole('region', { name: 'Respostas recebidas' })
    expect(within(respostas).getByText('Maria Souza')).toBeInTheDocument()
    expect(within(respostas).getByText('Re: Olá')).toBeInTheDocument()
    expect(within(respostas).getByText('Podemos falar amanhã às 10h?')).toBeInTheDocument()
    expect(screen.getByText('Respondeu')).toBeInTheDocument()

    // A aba abre no clique (o bloqueador de pop-ups exige o gesto); sem ela, o PDF abre numa aba nova depois.
    await usuario.click(within(respostas).getByRole('button', { name: 'Abrir proposta.pdf' }))
    await waitFor(() => expect(abrir).toHaveBeenLastCalledWith('blob:althius/1', '_blank', 'noopener'))
    expect(criados[0].type).toBe('application/pdf')
    expect(pedidosDeAnexo).toEqual([{ interactionId: 'inter-1', attachmentId: 'att-1' }])
    abrir.mockRestore()
    vi.unstubAllGlobals()
  })

  it('a imagem recebida aparece em miniatura e amplia na própria página', async () => {
    const { buscados, criados } = simularArmazenamento()
    const { usuario } = abrirASequenciaDaMarina({
      status: 'pausada',
      motivoPause: 'Contato respondeu',
      rpcs: respostaComAnexos([{ id: 'att-img', name: 'image.png', mime: 'application/octet-stream', status: 'stored' }]),
      funcoes: { 'received-email-attachments': urlAssinada },
    })

    const respostas = await screen.findByRole('region', { name: 'Respostas recebidas' })
    const miniatura = await within(respostas).findByRole('button', { name: 'Ampliar image.png' })
    expect(within(miniatura).getByRole('img', { name: 'image.png' })).toHaveAttribute('src', 'blob:althius/1')
    expect(buscados).toEqual(['https://storage.test/recebidos/inter-1/att-img?token=abc'])
    // O tipo vem da tela, não do que o armazenamento declarou.
    expect(criados[0].type).toBe('image/png')

    await usuario.click(miniatura)
    const janela = await screen.findByRole('dialog')
    expect(within(janela).getByRole('img', { name: 'image.png' })).toHaveAttribute('src', 'blob:althius/1')
    expect(within(janela).getByRole('link', { name: 'Baixar image.png' })).toHaveAttribute('download', 'image.png')
    vi.unstubAllGlobals()
  })

  it('um anexo que o navegador não mostra baixa com o nome original', async () => {
    const { criados } = simularArmazenamento()
    const cliques: { href: string; download: string }[] = []
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      cliques.push({ href: this.href, download: this.download })
    })
    const { usuario } = abrirASequenciaDaMarina({
      status: 'pausada',
      motivoPause: 'Contato respondeu',
      rpcs: respostaComAnexos([{ id: 'att-x', name: 'planilha.xlsx', status: 'stored' }]),
      funcoes: { 'received-email-attachments': urlAssinada },
    })

    const respostas = await screen.findByRole('region', { name: 'Respostas recebidas' })
    await usuario.click(await within(respostas).findByRole('button', { name: 'Baixar planilha.xlsx' }))
    await waitFor(() => expect(cliques).toEqual([{ href: 'blob:althius/1', download: 'planilha.xlsx' }]))
    expect(criados[0].type).toBe('application/octet-stream')
    clicar.mockRestore()
    vi.unstubAllGlobals()
  })

  it('sem conseguir carregar os Envios, a tela não oferece o envio de um passo que pode já ter saído', async () => {
    abrirASequenciaDaMarina({
      rpcs: { list_sequence_step_sends: () => { throw new Error('banco indisponível') } },
    })

    expect(await screen.findByText(/Não foi possível carregar a situação do envio deste passo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar e enviar/ })).not.toBeInTheDocument()
  })

  it('outro participante vê que o Contato respondeu e a sequência pausou, sem o conteúdo', async () => {
    window.history.replaceState(null, '', '/sequencias/sequencia-conta-do-norte')
    abrirAlthius({
      ultimoAmbiente: 'real',
      ultimoWorkspace: 'ws-norte',
      sessao: sessaoDe(MARINA),
      tabelas: {
        workspace_memberships: [participacao('ws-norte')],
        sequences: [{ ...sequenciaDeOutroVendedor('ws-norte', 'conta-do-norte'), status: 'pausada' }],
      },
    })

    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Respostas recebidas' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Podemos falar/)).not.toBeInTheDocument()
  })
})

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

  it.each([
    [CADASTRO, 'Criar conta'],
    ['/esqueci-a-senha', 'Esqueci a senha'],
    // O link de redefinição aberto noutro navegador: ele só vale onde foi pedido, e a tela explica.
    ['/redefinir-a-senha', 'Redefinir a senha'],
  ])('quem abre %s pela primeira vez neste navegador vê a tela de acesso, e não a Demonstração', async (rota, titulo) => {
    window.history.replaceState(null, '', rota)
    abrirAlthius()

    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
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
    expect(await screen.findByText(/Nenhuma Conta-alvo ainda\./)).toBeInTheDocument()
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

  it('num navegador novo, a Demonstração aberta a partir de /entrar continua aberta ao atualizar a página', async () => {
    demonstracaoJaIniciada()
    window.history.replaceState(null, '', '/entrar')
    const { usuario, cliente, servicos } = abrirAlthius()

    await usuario.click(await screen.findByRole('button', { name: 'Abrir Demonstração (sem login)' }))
    expect(await within(navegacao()).findByText('Demonstração')).toBeInTheDocument()

    cleanup()
    render(<RaizDoAplicativo cliente={cliente} servicos={servicos} />)
    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Demonstração')).toBeInTheDocument()
  })
})

describe('Primeiro acesso depois do fechamento do acesso', () => {
  it('uma Conta de usuário sem Participação entra e cai no Workspace visitante, sem Workspace pessoal novo', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { iniciarSessao } = abrirAlthius({
      ultimoAmbiente: 'real',
      rpcs: { bootstrap_personal_workspace: () => ({ id: null, kind: null, name: null, owner_user_id: null }) },
    })
    await screen.findByRole('heading', { name: 'Entrar' })

    act(() => iniciarSessao(sessaoDe(MARINA)))

    expect(await screen.findByText('Você está vendo uma demonstração')).toBeInTheDocument()
    expect(screen.queryByText('Operacional')).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhum Workspace ativo')).not.toBeInTheDocument()
  })

  it('quem já tem Participação num Workspace da empresa e um Workspace pessoal contratados, sem outro destino, abre o pessoal', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar de Workspace' })).toBeInTheDocument()
  })

  it('enquanto o acesso é preparado, a pessoa vê o carregamento; se falhar, pode tentar de novo', async () => {
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

    expect(await screen.findByText('Preparando seu acesso…')).toBeInTheDocument()
    // O carregamento aparece antes de o efeito chamar o bootstrap; rejeitar antes disso cairia no vazio.
    await waitFor(() => expect(tentativas).toBe(1))
    await act(async () => concluirPrimeira(new Error('connection reset')))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível preparar seu acesso.')
    expect(screen.queryByText('connection reset')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Cadastro com senha', () => {
  const SENHA = 'correta cavalo bateria'

  async function preencherCadastro(usuario: ReturnType<typeof userEvent.setup>, { email = MARINA.email, senha = SENHA } = {}) {
    await usuario.type(await screen.findByLabelText('Nome'), 'Marina Souza')
    // O e-mail do convite vem travado; só um cadastro sem convite (que já não existe) o digitaria.
    if (!screen.getByLabelText<HTMLInputElement>('E-mail').readOnly) await usuario.type(screen.getByLabelText('E-mail'), email)
    await usuario.type(screen.getByLabelText('Senha'), senha)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
  }

  it('o cadastro pelo convite pede nome e senha, com o e-mail do convite travado, link para entrar e o aceite passivo dos Termos', async () => {
    window.history.replaceState(null, '', CADASTRO)
    abrirAlthius({ ultimoAmbiente: 'real' })

    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByLabelText('E-mail')).toHaveValue(MARINA.email)
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly')
    expect(screen.getByText(`Este convite é para ${MARINA.email}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', expect.stringMatching(/^\/entrar/))
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
  })

  it('/entrar não oferece cadastro aberto: não há "Criar conta" e o texto explica o contrato', async () => {
    window.history.replaceState(null, '', '/entrar')
    abrirAlthius({ ultimoAmbiente: 'real' })

    await screen.findByRole('heading', { name: 'Entrar' })
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
    expect(screen.getByText(/O Workspace da sua empresa nasce do contrato com a Althius/)).toBeInTheDocument()
  })

  it('/cadastro sem um convite pendente leva à entrada, e um convite que não vale mais também', async () => {
    window.history.replaceState(null, '', '/cadastro')
    abrirAlthius({ ultimoAmbiente: 'real' })
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/entrar')
    cleanup()

    window.history.replaceState(null, '', `/cadastro?${new URLSearchParams({ destino: '/convite/token-que-nao-existe' })}`)
    abrirAlthius({ ultimoAmbiente: 'real' })
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Criar conta' })).not.toBeInTheDocument()
  })

  it('a senha tem medidor de força e pode ser mostrada e ocultada', async () => {
    window.history.replaceState(null, '', CADASTRO)
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
    window.history.replaceState(null, '', CADASTRO)
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real' })

    await preencherCadastro(usuario, { senha: '1234567' })

    expect(await screen.findByRole('alert')).toHaveTextContent('A senha precisa ter pelo menos 8 caracteres.')
    expect(codigoEnviadoPara(MARINA.email)).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
  })

  it('caminho completo: cria a conta, confirma o código e cai no Workspace pessoal, com o aceite gravado pelo bootstrap', async () => {
    window.history.replaceState(null, '', CADASTRO)
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
    window.history.replaceState(null, '', CADASTRO)
    const { usuario, linkEnviadoPara, abrirLinkDeConfirmacao } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
    })

    await preencherCadastro(usuario)
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
    expect(new URL(linkEnviadoPara(MARINA.email)!).pathname).toBe(`/convite/${PREFIXO_DO_CONVITE}${MARINA.email}`)

    act(() => abrirLinkDeConfirmacao(MARINA.email))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('o link do e-mail abre o Workspace pessoal, e não a Demonstração, num navegador que nunca escolheu o Workspace operacional', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const supabase = abrirAlthius()
    await preencherCadastro(supabase.usuario)
    await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
    const link = new URL(supabase.linkEnviadoPara(MARINA.email)!)

    // A pessoa abre o link do e-mail numa nova aba deste navegador.
    cleanup()
    sessionStorage.clear()
    window.history.replaceState(null, '', link.pathname + link.search)
    supabase.abrirLinkDeConfirmacao(MARINA.email)
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={supabase.servicos} />)

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
  })

  it('cadastro com e-mail que já tem conta mostra a mesma resposta do cadastro novo', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** A Edge Function que avisa por e-mail quem já tem Conta de usuário; guarda cada pedido e responde como `resposta`. */
  function avisoDeContaExistente(resposta: RespostaDaFuncao | Promise<RespostaDaFuncao> = { status: 202, corpo: { accepted: true } }) {
    const pedidos: Record<string, unknown>[] = []
    const funcoes = {
      'existing-account-email': (corpo: Record<string, unknown>) => {
        pedidos.push(corpo)
        return resposta
      },
    }
    return { pedidos, funcoes }
  }

  it('cadastro com o e-mail de uma Conta de usuário pede o e-mail que explica como entrar, sem a tela revelar nada', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const aviso = avisoDeContaExistente()
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], funcoes: aviso.funcoes })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(aviso.pedidos).toEqual([{ email: MARINA.email }]))
    // O Supabase Auth não manda código para uma Conta de usuário que já existe: o e-mail que chega é só o aviso.
    expect(codigoEnviadoPara(MARINA.email)).toBeUndefined()
  })

  it('um cadastro novo recebe o código, e não o aviso de Conta de usuário existente', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const aviso = avisoDeContaExistente()
    const { usuario, codigoEnviadoPara } = abrirAlthius({ ultimoAmbiente: 'real', contas: [], funcoes: aviso.funcoes })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(codigoEnviadoPara(MARINA.email)).toBeDefined()
    expect(aviso.pedidos).toEqual([])
  })

  it('uma falha no envio do aviso de Conta de usuário existente não aparece na tela', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const aviso = avisoDeContaExistente({ status: 500, corpo: { error: 'falhou' } })
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], funcoes: aviso.funcoes })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    await waitFor(() => expect(aviso.pedidos).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a tela não espera o aviso de Conta de usuário existente', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const aviso = avisoDeContaExistente(new Promise<RespostaDaFuncao>(() => {}))
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], funcoes: aviso.funcoes })

    await preencherCadastro(usuario)

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(aviso.pedidos).toHaveLength(1)
  })

  it('o e-mail do convite não se corrige: quem digitaria outro não consegue, e a etapa do código leva à entrada', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real' })

    await preencherCadastro(usuario, { email: 'marina@errado.com.br' })

    expect(await screen.findByText(MARINA.email)).toBeInTheDocument()
    expect(screen.queryByText('marina@errado.com.br')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corrigir e-mail' })).not.toBeInTheDocument()
  })

  it('atualizar a página na etapa do código mantém a etapa, sem guardar a senha', async () => {
    window.history.replaceState(null, '', CADASTRO)
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
      window.history.replaceState(null, '', CADASTRO)
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

describe('Termos de Uso e Política de Privacidade', () => {
  it.each([
    ['/termos', 'Termos de serviço', 'Aceitação dos termos'],
    ['/privacidade', 'Política de privacidade', 'Direitos do titular'],
  ])('%s abre o documento sem login e sem a Demonstração, num navegador que nunca escolheu um ambiente', async (rota, titulo, secao) => {
    window.history.replaceState(null, '', rota)
    abrirAlthius()

    expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: secao })).toBeInTheDocument()
    expect(screen.getByText(/O texto definitivo ainda será fornecido/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Modo Protótipo (Completo)')).not.toBeInTheDocument()
    // Nada na página leva ao início, que abriria a Demonstração.
    expect(screen.queryAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain('/')
    // Ler os Termos não escolhe ambiente: o próximo acesso a este navegador abre como antes.
    expect(localStorage.getItem('althius:modo_demo')).toBeNull()
  })

  it('/termos mostra o documento também a quem já tem sessão, sem abrir o Workspace', async () => {
    window.history.replaceState(null, '', '/termos')
    abrirAlthius({ ultimoAmbiente: 'real', sessao: sessaoDe(MARINA), tabelas: { workspace_memberships: [participacao('ws-norte')] } })

    expect(await screen.findByRole('heading', { level: 1, name: 'Termos de serviço' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
  })

  it('/privacidade abre mesmo sem Supabase configurado', async () => {
    window.history.replaceState(null, '', '/privacidade')
    const { servicos } = criarServicosDoNavegadorFalsos()
    render(<RaizDoAplicativo cliente={null} servicos={servicos} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeInTheDocument()
  })
})

/** A pessoa preenche /entrar com e-mail e senha e confirma. */
async function entrarComSenha(usuario: ReturnType<typeof userEvent.setup>, email: string, senha: string) {
  await usuario.type(await screen.findByLabelText('E-mail'), email)
  await usuario.type(screen.getByLabelText('Senha'), senha)
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Entrar com senha ou com código', () => {
  it('/entrar oferece senha, código e "Esqueci a senha", sem cadastro aberto e sem o formulário de link antigo', async () => {
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
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
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

  it('"Entrar com código" responde igual para um e-mail sem conta e para uma conta no limite de envio do Auth', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], limiteDeEnvioAtingido: [MARINA.email] })

    await usuario.type(await screen.findByLabelText('E-mail'), 'ninguem@cliente.com.br')
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    const semConta = (await screen.findByRole('status')).textContent!.replace('ninguem@cliente.com.br', '<e-mail>')

    await usuario.click(screen.getByRole('button', { name: 'Usar senha' }))
    await usuario.clear(screen.getByLabelText('E-mail'))
    await usuario.type(screen.getByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))

    expect((await screen.findByRole('status')).textContent!.replace(MARINA.email, '<e-mail>')).toBe(semConta)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

const opcoesDoSeletor = async () =>
  within(await screen.findByRole('combobox', { name: 'Selecione o Workspace' })).getAllByRole('option').map((opcao) => opcao.textContent)

const workspaceNaNavegacao = async (nome: string) =>
  within(await screen.findByRole('complementary', { name: 'Navegação' })).findByRole('button', { name: `Workspace: ${nome}` })

describe('Entrada fechada: o Workspace da empresa nasce do contrato', () => {
  const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte', owner_user_id: null }

  it('não há botão para criar Workspace da empresa, nem no Workspace pessoal, e nada é pedido ao banco', async () => {
    const criacoes: unknown[] = []
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte', 'member')], workspaces: [NORTE] },
      rpcs: { create_company_workspace: (parametros) => { criacoes.push(parametros); return NORTE } },
    })

    expect(await workspaceNaNavegacao('Marina Souza')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar Workspace da empresa' })).not.toBeInTheDocument()
    expect(criacoes).toEqual([])
  })

  it('o seletor lista os Workspaces e marca "sem contrato" o que não tem, sem apagar nada', async () => {
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte', 'member')], workspaces: [NORTE] },
      // Só o Norte tem contrato; o Workspace pessoal que a Marina já tinha continua, sem contrato.
      rpcs: { list_my_contracted_workspaces: () => [{ workspace_id: 'ws-norte', tier_name: 'Essencial', billing_mode: 'contrato' }] },
    })

    // O Norte é o único contratado e abre na hora, em vez do pessoal.
    expect(await workspaceNaNavegacao('Norte')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Trocar de Workspace' }))
    expect(await opcoesDoSeletor()).toEqual(['Escolher participação…', 'Marina Souza (sem contrato)', 'Norte'])
  })

  it('só Workspaces sem contrato: a pessoa é visitante e vê a demonstração', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte', 'member')], workspaces: [NORTE] },
      rpcs: { list_my_contracted_workspaces: () => [] },
    })

    expect(await screen.findByText('Você está vendo uma demonstração')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar de Workspace' })).not.toBeInTheDocument()
  })

  it('se o banco não diz quais Workspaces têm contrato, a entrada avisa em vez de adivinhar', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte', 'member')], workspaces: [NORTE] },
      rpcs: { list_my_contracted_workspaces: () => { throw new Error('connection reset') } },
    })

    expect(await screen.findByText(/Não foi possível validar seu acesso ao Workspace/)).toBeInTheDocument()
    expect(screen.queryByText('Você está vendo uma demonstração')).not.toBeInTheDocument()
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

  it('o pedido responde igual para um e-mail sem conta e para uma conta no limite de envio do Auth', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const { usuario } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], limiteDeEnvioAtingido: [MARINA.email] })

    await pedirRedefinicao(usuario, 'ninguem@cliente.com.br')
    const semConta = (await screen.findByRole('status')).textContent!.replace('ninguem@cliente.com.br', '<e-mail>')

    await usuario.click(screen.getByRole('button', { name: 'Corrigir e-mail' }))
    await usuario.clear(screen.getByLabelText('E-mail'))
    await pedirRedefinicao(usuario, MARINA.email)

    expect((await screen.findByRole('status')).textContent!.replace(MARINA.email, '<e-mail>')).toBe(semConta)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('o link do e-mail abre a nova senha, e não a Demonstração, num navegador que nunca escolheu o Workspace operacional', async () => {
    window.history.replaceState(null, '', '/entrar')
    const supabase = abrirAlthius({ contas: [{ ...CONTA_DA_MARINA }] })
    await supabase.usuario.click(await screen.findByRole('link', { name: 'Esqueci a senha' }))
    await pedirRedefinicao(supabase.usuario, MARINA.email)
    await screen.findByRole('status')
    const link = new URL(supabase.linkEnviadoPara(MARINA.email)!)

    // A pessoa abre o link do e-mail numa nova aba deste navegador.
    cleanup()
    sessionStorage.clear()
    window.history.replaceState(null, '', link.pathname + link.search)
    supabase.abrirLinkDeRedefinicao(MARINA.email)
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={supabase.servicos} />)

    await definirNovaSenha(supabase.usuario)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(within(navegacao()).getByText('Operacional')).toBeInTheDocument()
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

  // "Require current password when updating" no Supabase Auth (CRM-08): a sessão aberta pelo código ou pelo link de
  // redefinição é de recuperação, e o Auth não pede a senha atual a ela. O "Esqueci a senha" não pode quebrar.
  it('com a senha atual exigida pelo Supabase Auth, a redefinição por código continua trocando a senha', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const { usuario, codigoEnviadoPara } = abrirAlthius({
      ultimoAmbiente: 'real',
      contas: [{ ...CONTA_DA_MARINA }],
      exigeSenhaAtualAoTrocarSenha: true,
    })

    await pedirRedefinicao(usuario, MARINA.email)
    await usuario.type(await screen.findByLabelText('Código de 6 dígitos'), codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await definirNovaSenha(usuario)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await entrarComSenha(usuario, MARINA.email, NOVA_SENHA)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('com a senha atual exigida pelo Supabase Auth, o link do e-mail também leva à nova senha', async () => {
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const supabase = abrirAlthius({ ultimoAmbiente: 'real', contas: [{ ...CONTA_DA_MARINA }], exigeSenhaAtualAoTrocarSenha: true })
    await pedirRedefinicao(supabase.usuario, MARINA.email)
    await screen.findByRole('status')
    const link = new URL(supabase.linkEnviadoPara(MARINA.email)!)

    cleanup()
    window.history.replaceState(null, '', link.pathname + link.search)
    supabase.abrirLinkDeRedefinicao(MARINA.email)
    render(<RaizDoAplicativo cliente={supabase.cliente} servicos={supabase.servicos} />)

    await definirNovaSenha(supabase.usuario)
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
    window.history.replaceState(null, '', CADASTRO)
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
    window.history.replaceState(null, '', CADASTRO)
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
      window.history.replaceState(null, '', CADASTRO)
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
    window.history.replaceState(null, '', CADASTRO)
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

describe('Continuar com Google', () => {
  const MARINA_NO_GOOGLE = { email: MARINA.email, nome: 'Marina Souza' }
  const NOVA_SENHA = 'outra frase bem longa 42'

  /** O botão oficial do Google, que o Google Identity Services desenha na tela. */
  const botaoDoGoogle = () => screen.findByRole('button', { name: 'Continuar com Google' })

  it.each(['/entrar', CADASTRO])('sem o Client ID do Google, %s não mostra o Google', async (rota) => {
    window.history.replaceState(null, '', rota)
    abrirAlthius({ ultimoAmbiente: 'real' })

    await screen.findByLabelText('E-mail')
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  })

  it('cadastro pelo botão no topo de /cadastro: o nome vem do Google e o aceite dos Termos é gravado', async () => {
    window.history.replaceState(null, '', CADASTRO)
    const versoesAceitas: unknown[] = []
    const tabelas: Record<string, Record<string, unknown>[]> = {}
    const noBanco = workspacePessoalDaMarinaNoBanco(tabelas)
    const { usuario, google, nomeCadastrado, contasDoAuthCom } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas,
      rpcs: { bootstrap_personal_workspace: (p) => { versoesAceitas.push(p.p_terms_version); return noBanco() } },
      navegador: { google: {} },
    })

    const botao = await botaoDoGoogle()
    expect(botao.compareDocumentPosition(screen.getByLabelText('Nome')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('ou')).toBeInTheDocument()
    // O Google recebe só o hash do nonce; o Supabase falso confere o nonce cru contra ele.
    expect(google.noncesRecebidos().at(-1)).toMatch(/^[0-9a-f]{64}$/)

    await usuario.click(botao)
    act(() => google.escolherConta(MARINA_NO_GOOGLE))

    expect(await within(await screen.findByRole('complementary', { name: 'Navegação' })).findByText('Operacional')).toBeInTheDocument()
    expect(nomeCadastrado(MARINA.email)).toBe('Marina Souza')
    expect(contasDoAuthCom(MARINA.email)).toHaveLength(1)
    expect(versoesAceitas).toEqual([VERSAO_DOS_TERMOS])
    // Dentro do app, nem botão nem One Tap.
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
    expect(google.oneTapVisivel()).toBe(false)
  })

  it('o One Tap em /entrar leva quem se cadastrou com senha à mesma Conta de usuário, sem Workspace duplicado', async () => {
    window.history.replaceState(null, '', '/entrar')
    const tabelas: Record<string, Record<string, unknown>[]> = {}
    const { usuario, google, contasDoAuthCom } = abrirAlthius({
      ultimoAmbiente: 'real',
      tabelas,
      contas: [{ ...CONTA_DA_MARINA }],
      navegador: { google: { contaNoNavegador: MARINA_NO_GOOGLE } },
    })

    const botao = await botaoDoGoogle()
    expect(botao.compareDocumentPosition(screen.getByLabelText('E-mail')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/Ao continuar com Google, você concorda com os/)).toBeInTheDocument()
    await waitFor(() => expect(google.oneTapVisivel()).toBe(true))
    act(() => google.aceitarOneTap())

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(contasDoAuthCom(MARINA.email)).toEqual([MARINA.id])
    expect(google.oneTapVisivel()).toBe(false)

    // A senha continua valendo para a mesma conta, e o Workspace pessoal não se repete.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(contasDoAuthCom(MARINA.email)).toEqual([MARINA.id])
    expect(tabelas.workspace_memberships).toEqual([participacao(WORKSPACE_PESSOAL_DA_MARINA.id)])
  })

  it('cancelar a escolha de conta volta à tela sem mensagem de erro', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, google } = abrirAlthius({ ultimoAmbiente: 'real', contas: [{ ...CONTA_DA_MARINA }], navegador: { google: {} } })

    await usuario.click(await botaoDoGoogle())
    act(() => google.cancelarEscolha())

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('quem se cadastrou com Google define uma senha pelo "Esqueci a senha" e entra com ela na mesma Conta de usuário', async () => {
    window.history.replaceState(null, '', '/entrar')
    const tabelas: Record<string, Record<string, unknown>[]> = {}
    const { usuario, google, codigoEnviadoPara, contasDoAuthCom } = abrirAlthius({ ultimoAmbiente: 'real', tabelas, navegador: { google: {} } })

    await usuario.click(await botaoDoGoogle())
    act(() => google.escolherConta(MARINA_NO_GOOGLE))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    const [contaDoGoogle] = contasDoAuthCom(MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))

    await usuario.click(await screen.findByRole('link', { name: 'Esqueci a senha' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    await usuario.type(await screen.findByLabelText('Código de 6 dígitos'), codigoEnviadoPara(MARINA.email)!)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await usuario.type(await screen.findByLabelText('Nova senha'), NOVA_SENHA)
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await entrarComSenha(usuario, MARINA.email, NOVA_SENHA)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(contasDoAuthCom(MARINA.email)).toEqual([contaDoGoogle])
    expect(tabelas.workspace_memberships).toEqual([participacao(WORKSPACE_PESSOAL_DA_MARINA.id)])
  })

  it('o One Tap nunca aparece dentro do app', async () => {
    const { google } = abrirAlthius({
      ultimoAmbiente: 'real',
      sessao: sessaoDe(MARINA),
      navegador: { google: { contaNoNavegador: MARINA_NO_GOOGLE } },
    })

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(google.vezesIniciado()).toBe(0)
    expect(google.oneTapVisivel()).toBe(false)
  })
})

describe('CAPTCHA invisível', () => {
  const SENHA_NOVA = 'correta cavalo bateria'
  const MENSAGEM = 'Não foi possível confirmar que você é uma pessoa. Tente novamente.'

  it('cadastro, login com senha, envio de código, reenvio e redefinição mandam um token novo ao Supabase Auth, sem desafio na tela', async () => {
    window.history.replaceState(null, '', cadastroPeloConvite('ana@cliente.com.br'))
    const { usuario, captchasRecebidos, captchasPedidos } = abrirAlthius({
      ultimoAmbiente: 'real',
      contas: [CONTA_DA_MARINA],
      exigeCaptcha: true,
      navegador: { captcha: 'ligado' },
    })

    await usuario.type(await screen.findByLabelText('Nome'), 'Ana Lima')
    await usuario.type(screen.getByLabelText('E-mail'), 'ana@cliente.com.br')
    await usuario.type(screen.getByLabelText('Senha'), SENHA_NOVA)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    cleanup()
    window.history.replaceState(null, '', '/entrar')
    const entrada = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], exigeCaptcha: true, navegador: { captcha: 'ligado' } })
    await entrada.usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await entrada.usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um código de 6 dígitos')
    await entrada.usuario.click(screen.getByRole('button', { name: 'Usar senha' }))
    await entrada.usuario.click(await screen.findByRole('link', { name: 'Esqueci a senha' }))
    await entrada.usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await entrada.usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByRole('status')).toHaveTextContent(MARINA.email)
    expect(entrada.codigoEnviadoPara(MARINA.email)).toBeDefined()

    cleanup()
    window.history.replaceState(null, '', '/entrar')
    const login = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], exigeCaptcha: true, navegador: { captcha: 'ligado' } })
    await entrarComSenha(login.usuario, MARINA.email, CONTA_DA_MARINA.senha)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()

    expect(captchasPedidos()).toEqual(['cadastro'])
    expect(captchasRecebidos()).toEqual([{ chamada: 'signUp', token: 'token-captcha-1' }])
    expect(entrada.captchasPedidos()).toEqual(['codigo_de_entrada', 'redefinicao_de_senha'])
    expect(entrada.captchasRecebidos()).toEqual([
      { chamada: 'signInWithOtp', token: 'token-captcha-1' },
      { chamada: 'resetPasswordForEmail', token: 'token-captcha-2' },
    ])
    expect(login.captchasPedidos()).toEqual(['login_com_senha'])
    expect(login.captchasRecebidos()).toEqual([{ chamada: 'signInWithPassword', token: 'token-captcha-1' }])
  })

  it('o reenvio do código do cadastro também leva um token', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      window.history.replaceState(null, '', cadastroPeloConvite('ana@cliente.com.br'))
      const { usuario, captchasRecebidos } = abrirAlthius({ ultimoAmbiente: 'real', exigeCaptcha: true, navegador: { captcha: 'ligado' } })
      await usuario.type(await screen.findByLabelText('Nome'), 'Ana Lima')
      await usuario.type(screen.getByLabelText('E-mail'), 'ana@cliente.com.br')
      await usuario.type(screen.getByLabelText('Senha'), SENHA_NOVA)
      await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
      await screen.findByRole('heading', { name: 'Confirme seu e-mail' })
      act(() => vi.advanceTimersByTime(60_000))
      await usuario.click(await screen.findByRole('button', { name: 'Reenviar código' }))

      await waitFor(() => expect(captchasRecebidos()).toEqual([
        { chamada: 'signUp', token: 'token-captcha-1' },
        { chamada: 'resend', token: 'token-captcha-2' },
      ]))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('se o Turnstile não confirmar a pessoa, a tela explica e a nova tentativa pede outro token e entra', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, captchasRecebidos } = abrirAlthius({
      ultimoAmbiente: 'real',
      contas: [CONTA_DA_MARINA],
      exigeCaptcha: true,
      navegador: { captcha: 'ligado', falhasDoCaptcha: 1 },
    })

    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(captchasRecebidos()).toEqual([])

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(captchasRecebidos()).toEqual([{ chamada: 'signInWithPassword', token: 'token-captcha-2' }])
  })

  it('se o Supabase Auth recusar o CAPTCHA, cadastro, envio de código e redefinição mostram a mesma mensagem clara', async () => {
    window.history.replaceState(null, '', cadastroPeloConvite('ana@cliente.com.br'))
    const cadastro = abrirAlthius({ ultimoAmbiente: 'real', exigeCaptcha: true })
    await cadastro.usuario.type(await screen.findByLabelText('Nome'), 'Ana Lima')
    await cadastro.usuario.type(screen.getByLabelText('E-mail'), 'ana@cliente.com.br')
    await cadastro.usuario.type(screen.getByLabelText('Senha'), SENHA_NOVA)
    await cadastro.usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(cadastro.nomeCadastrado('ana@cliente.com.br')).toBeUndefined()

    cleanup()
    window.history.replaceState(null, '', '/entrar')
    const entrada = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], exigeCaptcha: true })
    await entrada.usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await entrada.usuario.click(screen.getByRole('button', { name: 'Entrar com código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    await entrada.usuario.type(screen.getByLabelText('Senha'), CONTA_DA_MARINA.senha)
    await entrada.usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM))

    cleanup()
    window.history.replaceState(null, '', '/esqueci-a-senha')
    const redefinicao = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA], exigeCaptcha: true })
    await redefinicao.usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await redefinicao.usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(redefinicao.codigoEnviadoPara(MARINA.email)).toBeUndefined()
  })

  it('o login com Google também leva um token do Turnstile ao Supabase Auth', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, google, captchasPedidos, captchasRecebidos } = abrirAlthius({
      ultimoAmbiente: 'real',
      exigeCaptcha: true,
      navegador: { captcha: 'ligado', google: {} },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
    act(() => google.escolherConta({ email: MARINA.email, nome: 'Marina Souza' }))

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(captchasPedidos()).toEqual(['login_com_google'])
    expect(captchasRecebidos()).toEqual([{ chamada: 'signInWithIdToken', token: 'token-captcha-1' }])
  })

  it('se o Turnstile não confirmar a pessoa no login com Google, a tela explica e não abre sessão', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, google, captchasRecebidos } = abrirAlthius({
      ultimoAmbiente: 'real',
      exigeCaptcha: true,
      navegador: { captcha: 'ligado', falhasDoCaptcha: 1, google: {} },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
    act(() => google.escolherConta({ email: MARINA.email, nome: 'Marina Souza' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(captchasRecebidos()).toEqual([])
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('sem a site key do Turnstile, nenhum token é pedido nem enviado e o acesso funciona como antes', async () => {
    window.history.replaceState(null, '', '/entrar')
    const { usuario, captchasRecebidos, captchasPedidos } = abrirAlthius({ ultimoAmbiente: 'real', contas: [CONTA_DA_MARINA] })

    await entrarComSenha(usuario, MARINA.email, CONTA_DA_MARINA.senha)

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    expect(captchasPedidos()).toEqual([])
    expect(captchasRecebidos()).toEqual([{ chamada: 'signInWithPassword', token: undefined }])
  })
})

describe('Resultado do Envio no detalhe da Sequência (motor-hermes 03)', () => {
  const envioEnviado = {
    id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: 'maria@empresa-alvo.test', status: 'sent',
    attempts: 1, confirmed_at: '2026-09-26T15:00:00Z', sent_at: '2026-09-30T13:00:05Z', last_error: null,
    last_error_at: null, updated_at: '2026-09-30T13:00:05Z', mode: 'auto', scheduled_for: null,
  }

  it('o Envio que saiu mostra o resultado já registrado e a Vendedora o muda para positiva', async () => {
    const pedidos: Record<string, unknown>[] = []
    let desfecho = 'resposta'
    const { usuario } = abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [envioEnviado],
        list_send_outcomes: () => [{ send_id: 'envio-1', outcome: desfecho, classified_by_kind: 'sistema', classified_at: '2026-09-30T14:00:00Z' }],
        set_send_outcome: (parametros) => {
          pedidos.push(parametros)
          desfecho = String(parametros.p_outcome)
          return null
        },
      },
    })
    const seletor = await screen.findByRole('combobox', { name: 'Resultado do envio' })
    await waitFor(() => expect(seletor).toHaveValue('resposta'))

    await usuario.selectOptions(seletor, 'resposta_positiva')
    expect(pedidos).toEqual([{ p_send_id: 'envio-1', p_outcome: 'resposta_positiva' }])
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Resultado do envio' })).toHaveValue('resposta_positiva'))
  })

  it('sem desfecho registrado, o Envio aparece como sem resposta; um passo que não saiu não tem resultado', async () => {
    abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [envioEnviado],
        list_send_outcomes: () => [],
      },
    })
    const seletor = await screen.findByRole('combobox', { name: 'Resultado do envio' })
    expect(within(seletor).getByRole('option', { name: 'Sem resposta' })).toBeDisabled()
    expect(seletor).toHaveValue('')
  })

  it('um passo ainda confirmado não oferece resultado', async () => {
    abrirASequenciaDaMarina({
      rpcs: {
        get_sequence_authorization: () => [{ version: 1, authorized_at: '2026-09-30T12:59:00Z', active: true, revoked_reason: null }],
        list_sequence_step_sends: () => [{ ...envioEnviado, status: 'confirmed', sent_at: null, mode: 'manual' }],
        list_send_outcomes: () => [],
      },
    })
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Resultado do envio' })).not.toBeInTheDocument()
  })
})

describe('Plano do Workspace operacional pelo Stripe (creditos-e-planos 06)', () => {
  const semAssinatura = () => [{ released: false, reason: 'sem_assinatura', paid_seats: null, used_seats: 2 }]

  it('sem assinatura, o Workspace fecha e a Administradora assina pelo Stripe, com um assento por Participante', async () => {
    const pedidos: Record<string, unknown>[] = []
    const indo = vi.spyOn(idaAoStripe, 'ir').mockImplementation(() => {})
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      ultimoWorkspace: 'ws-norte',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
      rpcs: { workspace_access: semAssinatura },
      funcoes: { 'stripe-billing': (corpo) => (pedidos.push(corpo), { corpo: { url: 'https://checkout.stripe.test/s' } }) },
    })
    const tela = await screen.findByRole('region', { name: 'Plano do Workspace' })
    expect(within(tela).getByText(/tem hoje 2 assentos/)).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()

    await usuario.click(within(tela).getByRole('button', { name: 'Contratar o plano' }))
    expect(pedidos).toEqual([{ action: 'checkout', workspaceId: 'ws-norte' }])
    await waitFor(() => expect(indo).toHaveBeenCalledWith('https://checkout.stripe.test/s'))
    indo.mockRestore()
  })

  it('o Membro de um Workspace sem assinatura pede ao Administrador e ainda abre a Demonstração', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      ultimoWorkspace: 'ws-norte',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte', 'member')] },
      rpcs: { workspace_access: semAssinatura },
    })
    const tela = await screen.findByRole('region', { name: 'Plano do Workspace' })
    expect(within(tela).getByText('Peça a um Administrador do Workspace para contratar o plano.')).toBeInTheDocument()
    expect(within(tela).queryByRole('button', { name: 'Contratar o plano' })).not.toBeInTheDocument()
  })

  it('com a assinatura ativa, o Workspace abre e a Administradora ajusta os assentos quando entra gente nova', async () => {
    const pedidos: Record<string, unknown>[] = []
    const { usuario } = abrirAlthius({
      ultimoAmbiente: 'real',
      ultimoWorkspace: 'ws-norte',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
      rpcs: { workspace_access: () => [{ released: true, reason: 'ativa', paid_seats: 2, used_seats: 3 }] },
      funcoes: { 'stripe-billing': (corpo) => (pedidos.push(corpo), { corpo: { seats: 3 } }) },
    })
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Ajustar assentos (2 → 3)' }))
    expect(pedidos).toEqual([{ action: 'seats', workspaceId: 'ws-norte' }])
    await waitFor(() => expect(screen.queryByRole('button', { name: /Ajustar assentos/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Plano' })).toBeInTheDocument()
  })

  it('a liberação manual (pré-produção) abre sem botões de cobrança', async () => {
    abrirAlthius({
      ultimoAmbiente: 'real',
      ultimoWorkspace: 'ws-norte',
      sessao: sessaoDe(MARINA),
      tabelas: { workspace_memberships: [participacao('ws-norte')] },
      rpcs: { workspace_access: () => [{ released: true, reason: 'liberado_manual', paid_seats: null, used_seats: 1 }] },
    })
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plano' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Plano do Workspace' })).not.toBeInTheDocument()
  })
})
