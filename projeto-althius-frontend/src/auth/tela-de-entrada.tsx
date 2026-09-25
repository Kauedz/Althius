import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoDoCodigo } from './campo-do-codigo'
import { useAutenticacao } from './contexto'
import { destinoDepoisDoAcesso } from './destino'

/**
 * `/entrar`: e-mail e senha, ou "Entrar com código" — o código de 6 dígitos é pedido nesta mesma tela, e o link do
 * mesmo e-mail também entra, se aberto neste navegador.
 */
export function TelaDeEntrada({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  const { entrarComSenha, pedirCodigoDeEntrada, confirmarCodigoDeEntrada, carregando } = useAutenticacao()
  const campoDeEmail = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  /** O e-mail para o qual o código foi enviado; enquanto houver, a tela pede o código. */
  const [emailDoCodigo, setEmailDoCodigo] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')

  async function tentar(acao: () => Promise<void>) {
    setErro('')
    try {
      await acao()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar. Tente novamente.')
    }
  }

  function entrar(e: FormEvent) {
    e.preventDefault()
    void tentar(() => entrarComSenha(email, senha))
  }

  function pedirCodigo() {
    if (!campoDeEmail.current?.reportValidity()) return
    void tentar(async () => {
      await pedirCodigoDeEntrada(email, destinoDepoisDoAcesso() ?? '/')
      setCodigo('')
      setEmailDoCodigo(email.trim())
    })
  }

  function confirmarCodigo(e: FormEvent) {
    e.preventDefault()
    if (emailDoCodigo) void tentar(() => confirmarCodigoDeEntrada(emailDoCodigo, codigo))
  }

  if (emailDoCodigo) {
    return (
      <form onSubmit={confirmarCodigo} className="flex flex-col gap-5">
        <div>
          <h1 className="titulo-secao text-2xl">Entrar com código</h1>
          <p role="status" className="mt-2 text-sm text-al-muted">
            Se houver uma conta com {emailDoCodigo}, enviamos um código de 6 dígitos e um link para entrar. O link só
            funciona neste navegador.
          </p>
        </div>
        <CampoDoCodigo id="codigo-de-entrada" rotulo="Código" codigo={codigo} aoMudar={setCodigo} />
        {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
        <Button type="submit" disabled={carregando}>{carregando ? 'Confirmando…' : 'Confirmar código'}</Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-al-accent hover:underline" disabled={carregando} onClick={pedirCodigo}>Reenviar código</button>
          <button type="button" className="text-al-muted hover:underline" onClick={() => { setErro(''); setEmailDoCodigo(null) }}>Usar senha</button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      <div>
        <h1 className="titulo-secao text-2xl">Entrar</h1>
        <p className="mt-2 text-sm text-al-muted">
          Ainda não tem conta? <Link to="/cadastro" className="text-al-accent hover:underline">Criar conta</Link>
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="email-acesso">E-mail
        <input ref={campoDeEmail} id="email-acesso" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="campo h-10 bg-al-bg px-3 text-al-ink" />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="senha-acesso">Senha</label>
          <Link to="/esqueci-a-senha" className="text-xs text-al-accent hover:underline">Esqueci a senha</Link>
        </div>
        <div className="relative">
          <input
            id="senha-acesso"
            type={senhaVisivel ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="campo h-10 w-full bg-al-bg pl-3 pr-10 text-al-ink"
          />
          <button
            type="button"
            aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={() => setSenhaVisivel((visivel) => !visivel)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-al-muted hover:text-al-ink"
          >
            {senhaVisivel ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <Button type="submit" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</Button>
      <Button type="button" variant="outline" disabled={carregando} onClick={pedirCodigo}>Entrar com código</Button>
      {aoAcessarDemonstracao && (
        <>
          <div className="relative my-1 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-al-line" />
            </div>
            <span className="relative bg-al-bg px-2 text-xs uppercase tracking-wider text-al-muted">ou</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={aoAcessarDemonstracao}
            className="border-al-accent/40 text-al-accent hover:bg-al-accent/10"
          >
            Abrir Demonstração (sem login)
          </Button>
        </>
      )}
    </form>
  )
}
