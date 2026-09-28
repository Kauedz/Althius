import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { navegadorComNotificacoes } from '@/test/notificacoes'
import { renderizarApp } from '@/test/renderizar'
import { criarServicosDoNavegadorFalsos, type OpcoesDosServicosFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe, type ContaDoAuth, type OpcoesDoSupabaseFalso } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL_DA_MARINA = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** Uma recusa do banco, com o SQLSTATE e a mensagem que a função levanta. */
function recusa(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

interface PerfilNoBanco {
  name: string | null
  avatar_data_url: string | null
}

interface PreferenciasNoBanco {
  theme: 'escuro' | 'claro' | null
  browser_notifications: boolean
}

/**
 * O perfil e as preferências da Marina como as funções do banco os guardam, entre uma sessão e outra e entre
 * dispositivos. As regras de quem lê e grava o quê são do banco (pgTAP); aqui ele só guarda o que as funções gravariam.
 * Com `segurar`, cada gravação espera `liberar()`; `falhas` faz as próximas gravações falharem como uma queda de rede.
 */
function bancoDaMarina({
  perfil = { name: 'Marina Souza', avatar_data_url: null },
  preferencias = { theme: null, browser_notifications: false },
}: { perfil?: PerfilNoBanco; preferencias?: PreferenciasNoBanco } = {}) {
  const banco = {
    perfil: { ...perfil },
    preferencias: { ...preferencias },
    segurar: false,
    falhas: 0,
    /** O perfil não é lido enquanto o teste não religar a leitura, como numa queda de rede. */
    leituraFora: false,
    pendentes: [] as (() => void)[],
    liberar() {
      banco.pendentes.splice(0).forEach((continuar) => continuar())
    },
  }

  /** Uma gravação: espera, se o teste segura, e falha, se o teste pediu. */
  async function gravar<T>(aplicar: () => T): Promise<T> {
    if (banco.segurar) await new Promise<void>((continuar) => banco.pendentes.push(continuar))
    if (banco.falhas > 0) {
      banco.falhas--
      throw new Error('Failed to fetch')
    }
    return aplicar()
  }

  const rpcs: Record<string, (p: Record<string, unknown>) => unknown> = {
    bootstrap_personal_workspace: () => PESSOAL_DA_MARINA,
    list_owned_sender_accounts: () => [],
    get_my_profile: () => {
      if (banco.leituraFora) throw new Error('Failed to fetch')
      return [{ ...banco.perfil, email: MARINA.email }]
    },
    save_my_profile: ({ p_display_name, p_avatar_data_url }) =>
      gravar(() => {
        const nome = String(p_display_name ?? '').trim()
        if (!nome) throw recusa('22023', 'invalid name')
        banco.perfil = { name: nome, avatar_data_url: (p_avatar_data_url as string | null) ?? null }
        return [{ ...banco.perfil, email: MARINA.email }]
      }),
    get_my_preferences: () => [{ ...banco.preferencias }],
    save_my_preferences: ({ p_theme, p_browser_notifications }) =>
      gravar(() => {
        banco.preferencias = {
          theme: (p_theme as PreferenciasNoBanco['theme']) ?? banco.preferencias.theme,
          browser_notifications: (p_browser_notifications as boolean | null) ?? banco.preferencias.browser_notifications,
        }
        return [{ ...banco.preferencias }]
      }),
  }
  return Object.assign(banco, { rpcs })
}

type Banco = ReturnType<typeof bancoDaMarina>

/**
 * A Marina abre a Althius no seu Workspace pessoal, com a sessão já guardada neste navegador. `contas` simula as
 * Contas de usuário do Supabase Auth, para a troca de senha e o login.
 */
function abrir(
  banco: Banco,
  rota: string,
  {
    contas,
    navegador,
    metodos,
    auth = {},
  }: {
    contas?: ContaDoAuth[]
    navegador?: OpcoesDosServicosFalsos
    metodos?: string[]
    /** Como o Supabase Auth do teste se comporta (ex.: falha ao encerrar as outras sessões). */
    auth?: Pick<OpcoesDoSupabaseFalso, 'falhaAoEncerrarOutrasSessoes'>
  } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  window.history.replaceState(null, '', rota)
  const sessao = sessaoDe(MARINA)
  // Os métodos de acesso da Conta de usuário, como o Supabase Auth os lista na sessão (ex.: só `google`).
  if (metodos) sessao.user.app_metadata = { provider: metodos[0], providers: metodos }
  const supabase = criarSupabaseFalso({
    ...auth,
    sessao,
    contas,
    tabelas: {
      workspace_memberships: [{ workspace_id: PESSOAL_DA_MARINA.id, role: 'admin', user_id: MARINA.id, active: true }],
      workspaces: [PESSOAL_DA_MARINA],
    },
    rpcs: banco.rpcs,
  })
  const servicos = criarServicosDoNavegadorFalsos(navegador)
  const usuario = userEvent.setup()
  const tela = render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { ...supabase, ...tela, usuario, google: servicos.google }
}

const formularioDoPerfil = async () => within(await screen.findByRole('form', { name: 'Dados do perfil' }))
const menuDoUsuario = (nome: string) => screen.findByRole('button', { name: `Menu do usuário: ${nome}` })

describe('Meu perfil no Workspace operacional', () => {
  it('mostra o nome e a foto guardados no backend e o e-mail da Conta de usuário, sem dados da Demonstração', async () => {
    abrir(bancoDaMarina({ perfil: { name: 'Marina Souza', avatar_data_url: 'data:image/png;base64,AAAA' } }), '/configuracoes/perfil')

    const formulario = await formularioDoPerfil()
    expect(await formulario.findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Souza')
    const email = formulario.getByRole('textbox', { name: 'E-mail' })
    expect(email).toHaveValue(MARINA.email)
    expect(email).toHaveAttribute('readonly')
    expect(formulario.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument()
    // O menu pessoal da Casca lê o mesmo perfil.
    expect(await menuDoUsuario('Marina Souza')).toBeInTheDocument()
    // As Contas remetentes continuam no perfil, e nada diz que o perfil está indisponível.
    expect(screen.getByRole('region', { name: 'Minhas Contas remetentes' })).toBeInTheDocument()
    expect(screen.queryByText(/ainda não estão disponíveis/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Marina Alves|Databricks|Demonstração: o novo e-mail/)).not.toBeInTheDocument()
  })

  it('só confirma o perfil salvo depois do backend, e o encontra salvo depois de sair e entrar de novo', async () => {
    const banco = bancoDaMarina()
    const contas = [{ ...MARINA, senha: 'senha-da-marina-123', nome: 'Marina Souza' }]
    const { usuario } = abrir(banco, '/configuracoes/perfil', { contas })

    const formulario = await formularioDoPerfil()
    const nome = await formulario.findByRole('textbox', { name: 'Nome' })
    await usuario.clear(nome)
    await usuario.type(nome, 'Marina S. Costa')
    await usuario.upload(screen.getByLabelText('Arquivo da foto'), new File(['foto'], 'foto.png', { type: 'image/png' }))
    await waitFor(() => expect(formulario.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument())

    banco.segurar = true
    await usuario.click(formulario.getByRole('button', { name: 'Salvar' }))
    expect(await formulario.findByText('Salvando o perfil…')).toBeInTheDocument()
    expect(formulario.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(screen.queryByText(/Perfil salvo/)).not.toBeInTheDocument()

    act(() => banco.liberar())
    const salvo = await formulario.findByText(/Perfil salvo/)
    // Os participantes do Workspace veem o nome; a foto, por enquanto, só aparece no menu pessoal.
    expect(salvo).toHaveTextContent('Seu nome e sua foto já aparecem no seu menu pessoal, e o nome também para as outras pessoas do Workspace.')
    expect(banco.perfil).toEqual({ name: 'Marina S. Costa', avatar_data_url: 'data:image/png;base64,Zm90bw==' })
    expect(await menuDoUsuario('Marina S. Costa')).toBeInTheDocument()

    // Sai e entra de novo, com a senha: o perfil volta do backend.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-da-marina-123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await (await formularioDoPerfil()).findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina S. Costa')
    expect((await formularioDoPerfil()).getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument()
  })

  it('uma falha ao salvar não alega sucesso, mantém o que foi digitado e deixa tentar de novo', async () => {
    const banco = bancoDaMarina()
    const { usuario } = abrir(banco, '/configuracoes/perfil')
    const formulario = await formularioDoPerfil()
    const nome = await formulario.findByRole('textbox', { name: 'Nome' })
    await usuario.clear(nome)
    await usuario.type(nome, 'Marina Costa')

    banco.falhas = 1
    await usuario.click(formulario.getByRole('button', { name: 'Salvar' }))
    expect(await formulario.findByRole('alert')).toHaveTextContent('Não foi possível salvar o perfil')
    expect(screen.queryByText(/Perfil salvo/)).not.toBeInTheDocument()
    expect(nome).toHaveValue('Marina Costa')
    expect(banco.perfil.name).toBe('Marina Souza')

    await usuario.click(formulario.getByRole('button', { name: 'Tentar de novo' }))
    expect(await formulario.findByText(/Perfil salvo/)).toBeInTheDocument()
    expect(banco.perfil.name).toBe('Marina Costa')
  })

  it('valida o nome e a foto na tela, sem gravar nada', async () => {
    const banco = bancoDaMarina()
    const { usuario } = abrir(banco, '/configuracoes/perfil')
    const formulario = await formularioDoPerfil()
    await usuario.clear(await formulario.findByRole('textbox', { name: 'Nome' }))
    await usuario.click(formulario.getByRole('button', { name: 'Salvar' }))
    expect(await formulario.findByText('Informe seu nome.')).toBeInTheDocument()

    // Uma foto grande demais para guardar no perfil é recusada antes de salvar.
    const grande = new File([new Uint8Array(300 * 1024)], 'grande.png', { type: 'image/png' })
    await usuario.upload(screen.getByLabelText('Arquivo da foto'), grande)
    expect(await formulario.findByText(/até 256 KB/)).toBeInTheDocument()
    expect(formulario.getByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
    expect(banco.perfil).toEqual({ name: 'Marina Souza', avatar_data_url: null })
  })

  it('se o perfil não carrega, diz isso e deixa tentar de novo, sem mostrar um formulário vazio', async () => {
    const banco = bancoDaMarina()
    banco.leituraFora = true
    const { usuario } = abrir(banco, '/configuracoes/perfil')

    expect(await screen.findByText(/Não foi possível carregar seu perfil/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Dados do perfil' })).not.toBeInTheDocument()
    // O menu pessoal não para: mostra o e-mail enquanto o perfil não volta.
    expect(await menuDoUsuario(MARINA.email)).toBeInTheDocument()

    banco.leituraFora = false
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await (await formularioDoPerfil()).findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Souza')
  })
})

describe('Senha em Meu perfil', () => {
  const SENHA_ATUAL = 'senha-antiga-da-marina'
  const NOVA = 'uma frase longa e nova'

  async function abrirTrocaDeSenha(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(await screen.findByRole('button', { name: 'Alterar ou definir senha' }))
    return within(await screen.findByRole('form', { name: 'Alterar senha' }))
  }

  it('trocar a senha exige a senha atual; com ela, a nova senha vale e as outras sessões são encerradas', async () => {
    const { usuario, sessoesAbertasDe, abrirSessaoEmOutroAparelho } = abrir(bancoDaMarina(), '/configuracoes/perfil', {
      contas: [{ ...MARINA, senha: SENHA_ATUAL, nome: 'Marina Souza' }],
    })
    abrirSessaoEmOutroAparelho(MARINA.email)
    const formulario = await abrirTrocaDeSenha(usuario)
    expect(formulario.getByLabelText('Senha atual')).toHaveAttribute('autocomplete', 'current-password')
    expect(formulario.getByLabelText('Nova senha')).toHaveAttribute('autocomplete', 'new-password')

    // Sem a senha atual, nada acontece.
    await usuario.type(formulario.getByLabelText('Nova senha'), NOVA)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText('Informe a senha atual.')).toBeInTheDocument()

    // Com a senha atual errada, a senha não muda.
    await usuario.type(formulario.getByLabelText('Senha atual'), 'nao-e-a-senha')
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText(/A senha atual não confere/)).toBeInTheDocument()
    expect(sessoesAbertasDe(MARINA.email)).toHaveLength(2)

    await usuario.clear(formulario.getByLabelText('Senha atual'))
    await usuario.type(formulario.getByLabelText('Senha atual'), SENHA_ATUAL)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText(/Senha salva/)).toHaveTextContent('As outras sessões da sua conta foram encerradas')
    expect(screen.queryByRole('form', { name: 'Alterar senha' })).not.toBeInTheDocument()
    expect(sessoesAbertasDe(MARINA.email)).toHaveLength(1)

    // Sai e entra com a nova senha.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), NOVA)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await formularioDoPerfil()).toBeTruthy()
  })

  it('a nova senha segue a política do cadastro: curta ou vazada é recusada, e a senha atual continua valendo', async () => {
    const { usuario, sessoesAbertasDe, abrirSessaoEmOutroAparelho } = abrir(bancoDaMarina(), '/configuracoes/perfil', {
      contas: [{ ...MARINA, senha: SENHA_ATUAL }],
      navegador: { senhasVazadas: ['senha-vazada-conhecida'] },
    })
    abrirSessaoEmOutroAparelho(MARINA.email)
    const formulario = await abrirTrocaDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), SENHA_ATUAL)

    await usuario.type(formulario.getByLabelText('Nova senha'), 'curta')
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()

    await usuario.clear(formulario.getByLabelText('Nova senha'))
    await usuario.type(formulario.getByLabelText('Nova senha'), 'senha-vazada-conhecida')
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText(/já apareceu em vazamentos/)).toBeInTheDocument()
    expect(screen.queryByText(/Senha salva/)).not.toBeInTheDocument()
    expect(sessoesAbertasDe(MARINA.email)).toHaveLength(2)
  })

  it('cada tentativa confere de novo a senha atual: depois de uma recusa da nova senha, uma senha atual errada não passa', async () => {
    const { usuario } = abrir(bancoDaMarina(), '/configuracoes/perfil', { contas: [{ ...MARINA, senha: SENHA_ATUAL }] })
    const formulario = await abrirTrocaDeSenha(usuario)

    // A senha atual certa, mas a nova igual à atual: o Supabase Auth recusa.
    await usuario.type(formulario.getByLabelText('Senha atual'), SENHA_ATUAL)
    await usuario.type(formulario.getByLabelText('Nova senha'), SENHA_ATUAL)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText('A nova senha precisa ser diferente da atual.')).toBeInTheDocument()

    // Logo depois, com uma senha atual errada, nada muda.
    await usuario.clear(formulario.getByLabelText('Senha atual'))
    await usuario.type(formulario.getByLabelText('Senha atual'), 'qualquer-coisa')
    await usuario.clear(formulario.getByLabelText('Nova senha'))
    await usuario.type(formulario.getByLabelText('Nova senha'), NOVA)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText(/A senha atual não confere/)).toBeInTheDocument()
    expect(screen.queryByText(/Senha salva|senha foi trocada/)).not.toBeInTheDocument()

    // A senha atual continua valendo: sai e entra com ela.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), SENHA_ATUAL)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await formularioDoPerfil()).toBeTruthy()
  })

  it('se a senha foi trocada mas as outras sessões não caíram, avisa isso, sem pedir para salvar de novo', async () => {
    const { usuario, sessoesAbertasDe, abrirSessaoEmOutroAparelho } = abrir(bancoDaMarina(), '/configuracoes/perfil', {
      contas: [{ ...MARINA, senha: SENHA_ATUAL }],
      auth: { falhaAoEncerrarOutrasSessoes: true },
    })
    abrirSessaoEmOutroAparelho(MARINA.email)
    const formulario = await abrirTrocaDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), SENHA_ATUAL)
    await usuario.type(formulario.getByLabelText('Nova senha'), NOVA)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))

    const aviso = await screen.findByText(/A senha foi trocada/)
    expect(aviso).toHaveTextContent('não foi possível encerrar as outras sessões')
    expect(screen.queryByRole('form', { name: 'Alterar senha' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tentar de novo|Salvar nova senha/ })).not.toBeInTheDocument()
    expect(sessoesAbertasDe(MARINA.email).length).toBeGreaterThan(1)

    // A nova senha já vale.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), NOVA)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await formularioDoPerfil()).toBeTruthy()
  })

  it('um código errado não troca a senha: a senha atual continua valendo', async () => {
    const { usuario, codigoEnviadoPara } = abrir(bancoDaMarina(), '/configuracoes/perfil', {
      contas: [{ ...MARINA, senha: SENHA_ATUAL }],
    })
    const formulario = await abrirTrocaDeSenha(usuario)
    await usuario.click(formulario.getByRole('radio', { name: 'Com um código por e-mail' }))
    await usuario.click(formulario.getByRole('button', { name: 'Enviar código' }))
    expect(await formulario.findByText(`Enviamos um código para ${MARINA.email}.`)).toBeInTheDocument()
    const errado = codigoEnviadoPara(MARINA.email) === '000000' ? '111111' : '000000'
    await usuario.type(formulario.getByLabelText('Código'), errado)
    await usuario.type(formulario.getByLabelText('Nova senha'), NOVA)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText(/Código inválido ou expirado/)).toBeInTheDocument()
    expect(screen.queryByText(/Senha salva|senha foi trocada/)).not.toBeInTheDocument()

    // A nova senha não vale; a atual, sim.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), NOVA)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail ou senha incorretos')).toBeInTheDocument()
    await usuario.clear(screen.getByLabelText('Senha'))
    await usuario.type(screen.getByLabelText('Senha'), SENHA_ATUAL)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await formularioDoPerfil()).toBeTruthy()
  })

  it('quem entrou só com Google define uma senha confirmando por código, e continua entrando com o Google na mesma Conta de usuário', async () => {
    const MARINA_NO_GOOGLE = { email: MARINA.email, nome: 'Marina Souza' }
    const { usuario, codigoEnviadoPara, contasDoAuthCom, google } = abrir(bancoDaMarina(), '/configuracoes/perfil', {
      contas: [{ ...MARINA, nome: 'Marina Souza' }],
      navegador: { google: {} },
      metodos: ['google'],
    })
    const formulario = await abrirTrocaDeSenha(usuario)

    // Sem senha atual para informar, a confirmação começa pelo código.
    expect(formulario.getByRole('radio', { name: 'Com um código por e-mail' })).toBeChecked()
    expect(formulario.queryByLabelText('Senha atual')).not.toBeInTheDocument()
    await usuario.click(formulario.getByRole('button', { name: 'Enviar código' }))
    expect(await formulario.findByText(`Enviamos um código para ${MARINA.email}.`)).toBeInTheDocument()

    // O Supabase Auth confere o código antes da troca: um errado não troca nada.
    await usuario.type(formulario.getByLabelText('Código'), '000000')
    await usuario.type(formulario.getByLabelText('Nova senha'), NOVA)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await formulario.findByText(/Código inválido ou expirado/)).toBeInTheDocument()

    await usuario.clear(formulario.getByLabelText('Código'))
    await usuario.type(formulario.getByLabelText('Código'), codigoEnviadoPara(MARINA.email)!)
    await usuario.click(formulario.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText(/Senha salva/)).toBeInTheDocument()
    expect(contasDoAuthCom(MARINA.email)).toHaveLength(1)

    // Continua entrando com o Google, na mesma Conta de usuário, e agora também com a senha.
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
    act(() => google.escolherConta(MARINA_NO_GOOGLE))
    expect(await formularioDoPerfil()).toBeTruthy()
    expect(contasDoAuthCom(MARINA.email)).toHaveLength(1)

    await usuario.click(screen.getByRole('button', { name: 'Sair' }))
    await usuario.type(await screen.findByLabelText('E-mail'), MARINA.email)
    await usuario.type(screen.getByLabelText('Senha'), NOVA)
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await formularioDoPerfil()).toBeTruthy()
  })
})

describe('Preferências no Workspace operacional', () => {
  const tema = () => document.documentElement.dataset.theme

  it('o tema é salvo na Conta de usuário só depois da confirmação do backend e volta em outro dispositivo', async () => {
    const banco = bancoDaMarina()
    const { usuario, unmount } = abrir(banco, '/configuracoes/preferencias')
    expect(await screen.findByText(/fica salva na sua Conta de usuário/)).toBeInTheDocument()

    banco.segurar = true
    await usuario.click(await screen.findByRole('radio', { name: 'Claro' }))
    expect(await screen.findByText('Salvando o tema…')).toBeInTheDocument()
    expect(tema()).toBe('escuro')
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()

    act(() => banco.liberar())
    expect(await screen.findByText(/Tema salvo na sua Conta de usuário/)).toBeInTheDocument()
    expect(tema()).toBe('claro')
    expect(banco.preferencias.theme).toBe('claro')

    // Outro dispositivo: nada guardado no navegador, e o tema volta do backend ao entrar.
    unmount()
    localStorage.clear()
    document.documentElement.dataset.theme = 'escuro'
    abrir(banco, '/configuracoes/preferencias')
    await waitFor(() => expect(tema()).toBe('claro'))
    expect(await screen.findByRole('radio', { name: 'Claro' })).toBeChecked()
  })

  it('pelo menu pessoal, o tema também fica salvo na Conta de usuário', async () => {
    const banco = bancoDaMarina({ preferencias: { theme: 'claro', browser_notifications: false } })
    const { usuario } = abrir(banco, '/')
    await waitFor(() => expect(tema()).toBe('claro'))

    await usuario.click(await menuDoUsuario('Marina Souza'))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Tema escuro' }))
    await waitFor(() => expect(tema()).toBe('escuro'))
    expect(banco.preferencias.theme).toBe('escuro')
  })

  it('uma falha ao salvar o tema não o muda, avisa e deixa tentar de novo', async () => {
    const banco = bancoDaMarina()
    const { usuario } = abrir(banco, '/configuracoes/preferencias')
    banco.falhas = 1
    await usuario.click(await screen.findByRole('radio', { name: 'Claro' }))

    const regiao = within(screen.getByRole('region', { name: 'Tema' }))
    expect(await regiao.findByRole('alert')).toHaveTextContent('Não foi possível salvar o tema')
    expect(tema()).toBe('escuro')
    expect(banco.preferencias.theme).toBeNull()

    await usuario.click(regiao.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(tema()).toBe('claro'))
    expect(banco.preferencias.theme).toBe('claro')
  })

  it('as notificações ativadas ficam salvas na Conta de usuário e voltam ao entrar de novo', async () => {
    navegadorComNotificacoes({ permissao: 'granted' })
    const banco = bancoDaMarina()
    const { usuario, unmount } = abrir(banco, '/configuracoes/preferencias')
    const interruptor = await screen.findByRole('switch', { name: 'Ativar notificações do navegador' })
    expect(interruptor).not.toBeChecked()

    banco.segurar = true
    await usuario.click(interruptor)
    const bloco = within(screen.getByRole('region', { name: 'Notificações do navegador' }))
    expect(await bloco.findByText('Salvando a preferência…')).toBeInTheDocument()
    expect(bloco.queryByText('Ativadas')).not.toBeInTheDocument()
    act(() => banco.liberar())
    expect(await bloco.findByText('Ativadas')).toBeInTheDocument()
    expect(banco.preferencias.browser_notifications).toBe(true)

    unmount()
    abrir(banco, '/configuracoes/preferencias')
    expect(await screen.findByRole('switch', { name: 'Ativar notificações do navegador' })).toBeChecked()
  })

  it('uma falha ao salvar as notificações não as ativa e deixa tentar de novo', async () => {
    navegadorComNotificacoes({ permissao: 'granted' })
    const banco = bancoDaMarina()
    const { usuario } = abrir(banco, '/configuracoes/preferencias')
    banco.falhas = 1
    await usuario.click(await screen.findByRole('switch', { name: 'Ativar notificações do navegador' }))

    const bloco = within(screen.getByRole('region', { name: 'Notificações do navegador' }))
    expect(await bloco.findByRole('alert')).toHaveTextContent('Não foi possível salvar')
    expect(bloco.getByText('Desligadas')).toBeInTheDocument()

    await usuario.click(bloco.getByRole('button', { name: 'Tentar de novo' }))
    expect(await bloco.findByText('Ativadas')).toBeInTheDocument()
    expect(banco.preferencias.browser_notifications).toBe(true)
  })
})

describe('Plano fora do escopo de billing', () => {
  it('na Demonstração, o plano e o consumo aparecem identificados como demonstrativos', async () => {
    renderizarApp('/configuracoes/plano')
    expect(await screen.findByText(/Os números abaixo são demonstrativos/)).toBeInTheDocument()
  })

  it('no Workspace operacional, o Plano diz que plano e consumo são só demonstrativos, sem números de exemplo', async () => {
    abrir(bancoDaMarina(), '/configuracoes/plano')
    expect(await screen.findByText(/Plano e consumo ainda são só demonstrativos/)).toBeInTheDocument()
    expect(screen.getByText(/fora do escopo de cobrança/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Plano atual' })).not.toBeInTheDocument()
  })
})
