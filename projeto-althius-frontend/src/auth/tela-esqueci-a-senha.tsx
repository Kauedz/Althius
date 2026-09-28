import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CampoDoCodigo } from './campo-do-codigo'
import { useAutenticacao } from './contexto'
import { CampoDeEmailDoAcesso, useEmailDoAcesso } from './campo-de-email-do-acesso'
import { ComOConviteDoAcesso } from './convite-do-acesso'
import { ROTA_DE_ENTRADA, ROTA_ESQUECI_A_SENHA, destinoDepoisDoAcesso } from './destino'
import { CampoDeNovaSenha, TAMANHO_MINIMO_DA_SENHA } from './nova-senha'

/**
 * `/esqueci-a-senha`: o e-mail e, na mesma tela, o código de 6 dígitos da redefinição. O link do mesmo e-mail também
 * serve, se aberto neste navegador. A resposta é igual exista ou não a Conta de usuário. Aberta a partir de um convite
 * pendente, o e-mail é o do convite, travado.
 */
export function TelaEsqueciASenha() {
  return <ComOConviteDoAcesso>{(emailTravado) => <EsqueciASenha key={emailTravado} emailTravado={emailTravado} />}</ComOConviteDoAcesso>
}

function EsqueciASenha({ emailTravado }: { emailTravado: string | null }) {
  const { pedirRedefinicaoDeSenha, confirmarCodigoDeRedefinicao, carregando } = useAutenticacao()
  const { search } = useLocation()
  const { email, campo: campoDeEmail } = useEmailDoAcesso(emailTravado)
  /** O e-mail para o qual a redefinição foi pedida; enquanto houver, a tela pede o código. */
  const [emailDoCodigo, setEmailDoCodigo] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  async function tentar(acao: () => Promise<void>) {
    setErro('')
    try {
      await acao()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.')
    }
  }

  function pedir(e: FormEvent) {
    e.preventDefault()
    void tentar(async () => {
      await pedirRedefinicaoDeSenha(email, destinoDepoisDoAcesso() ?? '/')
      setCodigo('')
      setMensagem('')
      setEmailDoCodigo(email.trim())
    })
  }

  function reenviar() {
    if (!emailDoCodigo) return
    void tentar(async () => {
      await pedirRedefinicaoDeSenha(emailDoCodigo, destinoDepoisDoAcesso() ?? '/')
      setMensagem('Se houver uma conta, enviamos um novo código.')
    })
  }

  function confirmar(e: FormEvent) {
    e.preventDefault()
    if (emailDoCodigo) void tentar(() => confirmarCodigoDeRedefinicao(emailDoCodigo, codigo))
  }

  if (emailDoCodigo) {
    return (
      <form onSubmit={confirmar} className="flex flex-col gap-5">
        <div>
          <h1 className="titulo-secao text-2xl">Redefinir a senha</h1>
          <p role="status" className="mt-2 text-sm text-al-muted">
            Se houver uma conta com {emailDoCodigo}, enviamos um código de 6 dígitos e um link para redefinir a senha. O
            link só funciona neste navegador.
          </p>
        </div>
        <CampoDoCodigo id="codigo-de-redefinicao" rotulo="Código de 6 dígitos" codigo={codigo} aoMudar={setCodigo} />
        {mensagem && <p className="text-sm text-al-sucesso">{mensagem}</p>}
        {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
        <Button type="submit" disabled={carregando}>{carregando ? 'Confirmando…' : 'Confirmar código'}</Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={carregando} onClick={reenviar}>Reenviar código</Button>
          {!emailTravado && (
            <Button type="button" variant="outline" onClick={() => { setErro(''); setEmailDoCodigo(null) }}>Corrigir e-mail</Button>
          )}
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={pedir} className="flex flex-col gap-5">
      <div>
        <h1 className="titulo-secao text-2xl">Esqueci a senha</h1>
        <p className="mt-2 text-sm text-al-muted">
          Enviaremos um código e um link para definir uma nova senha. Também serve para quem só entra com Google criar uma senha.
        </p>
      </div>
      <CampoDeEmailDoAcesso id="email-redefinicao" {...campoDeEmail} />
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <Button type="submit" disabled={carregando}>{carregando ? 'Enviando…' : 'Enviar código'}</Button>
      <p className="text-sm text-al-muted">Lembrou a senha? <Link to={{ pathname: ROTA_DE_ENTRADA, search }} className="text-al-accent underline">Entrar</Link></p>
    </form>
  )
}

/** `/redefinir-a-senha` sem sessão: o link expirou, já foi usado ou foi aberto noutro navegador. */
export function LinkDeRedefinicaoInvalido() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="titulo-secao text-2xl">Redefinir a senha</h1>
      <p className="text-sm text-al-muted">
        O link de redefinição expirou ou já foi usado. Ele também só funciona no navegador em que foi pedido.
      </p>
      <Link to={ROTA_ESQUECI_A_SENHA} className="text-sm text-al-accent underline">Pedir um novo link</Link>
    </div>
  )
}

/** A sessão de redefinição já começou: a pessoa define a nova senha, com a mesma política do cadastro. */
export function TelaDeNovaSenha() {
  const { definirNovaSenha, carregando } = useAutenticacao()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
      setErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`)
      return
    }
    try {
      await definirNovaSenha(senha)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a nova senha.')
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="titulo-secao text-2xl">Defina uma nova senha</h1>
        <p className="mt-2 text-sm text-al-muted">Ao salvar, as outras sessões da sua conta são encerradas.</p>
      </div>
      <CampoDeNovaSenha id="nova-senha" rotulo="Nova senha" senha={senha} aoMudar={setSenha} />
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <Button type="submit" disabled={carregando}>{carregando ? 'Salvando…' : 'Salvar nova senha'}</Button>
    </form>
  )
}
