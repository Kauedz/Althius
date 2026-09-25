import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAutenticacao } from './contexto'
import { ROTA_DE_ENTRADA, destinoDepoisDoAcesso } from './destino'
import { ENDERECO_DA_POLITICA_DE_PRIVACIDADE, ENDERECO_DOS_TERMOS_DE_USO } from './termos'
import { CascaDeAcesso } from './telas-de-acesso'

/** A etapa do código nesta aba, para atualizar a página não recomeçar o cadastro. Nunca guarda a senha. */
const CHAVE_DA_ETAPA_DO_CODIGO = 'althius:cadastro'

/** O intervalo mínimo entre dois envios do código, mostrado na tela. */
const INTERVALO_PARA_REENVIAR_MS = 60_000

const TAMANHO_MINIMO_DA_SENHA = 8

interface EtapaDoCodigo {
  nome: string
  email: string
  /** Quando o último código foi enviado, em milissegundos. */
  enviadoEm: number
}

function etapaGuardada(): EtapaDoCodigo | null {
  try {
    const salva = sessionStorage.getItem(CHAVE_DA_ETAPA_DO_CODIGO)
    return salva ? (JSON.parse(salva) as EtapaDoCodigo) : null
  } catch {
    return null
  }
}

function guardarEtapa(etapa: EtapaDoCodigo | null) {
  try {
    if (etapa) sessionStorage.setItem(CHAVE_DA_ETAPA_DO_CODIGO, JSON.stringify(etapa))
    else sessionStorage.removeItem(CHAVE_DA_ETAPA_DO_CODIGO)
  } catch {
    // Sem armazenamento, a etapa só não sobrevive a atualizar a página.
  }
}

/**
 * A força da senha, sem regras de composição: o tamanho pesa mais, e misturar tipos de caractere ajuda.
 * Abaixo do mínimo, a senha é recusada.
 */
function forcaDaSenha(senha: string): 'muito curta' | 'fraca' | 'razoável' | 'boa' | 'forte' {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) return 'muito curta'
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((tipo) => tipo.test(senha)).length
  const pontos = Number(senha.length >= 12) + Number(senha.length >= 16) + Number(tipos >= 3)
  return (['fraca', 'razoável', 'boa', 'forte'] as const)[pontos]
}

/** /cadastro: nome, e-mail e senha; depois, na mesma tela, o código de 6 dígitos enviado por e-mail. */
export function TelaDeCadastro() {
  const [etapa, setEtapa] = useState<EtapaDoCodigo | null>(etapaGuardada)
  const [nome, setNome] = useState(etapa?.nome ?? '')
  const [email, setEmail] = useState(etapa?.email ?? '')
  const [senha, setSenha] = useState('')

  function irParaOCodigo(nova: EtapaDoCodigo) {
    guardarEtapa(nova)
    setEtapa(nova)
  }

  function corrigirEmail() {
    guardarEtapa(null)
    setEtapa(null)
  }

  return (
    <CascaDeAcesso>
      {etapa ? (
        <EtapaDoCodigoDoCadastro etapa={etapa} aoReenviar={irParaOCodigo} aoCorrigirEmail={corrigirEmail} />
      ) : (
        <FormularioDeCadastro
          nome={nome}
          email={email}
          senha={senha}
          aoMudarNome={setNome}
          aoMudarEmail={setEmail}
          aoMudarSenha={setSenha}
          aoEnviar={() => irParaOCodigo({ nome, email: email.trim(), enviadoEm: Date.now() })}
        />
      )}
    </CascaDeAcesso>
  )
}

function FormularioDeCadastro({
  nome,
  email,
  senha,
  aoMudarNome,
  aoMudarEmail,
  aoMudarSenha,
  aoEnviar,
}: {
  nome: string
  email: string
  senha: string
  aoMudarNome: (nome: string) => void
  aoMudarEmail: (email: string) => void
  aoMudarSenha: (senha: string) => void
  aoEnviar: () => void
}) {
  const { cadastrar } = useAutenticacao()
  const { search } = useLocation()
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const idDaForca = useId()
  const forca = forcaDaSenha(senha)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
      setErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`)
      return
    }
    setEnviando(true)
    try {
      await cadastrar({ nome, email, senha }, destinoDepoisDoAcesso() ?? '/')
      aoEnviar()
    } catch {
      setErro('Não foi possível criar a conta agora. Tente novamente em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="titulo-secao text-2xl">Criar conta</h1>
        <p className="mt-2 text-sm text-al-muted">Só o essencial agora. Os dados da empresa ficam para depois.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="nome-cadastro">Nome
        <input id="nome-cadastro" type="text" autoComplete="name" required value={nome} onChange={(e) => aoMudarNome(e.target.value)} className="campo h-10 bg-al-bg px-3 text-al-ink" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="email-cadastro">E-mail
        <input id="email-cadastro" type="email" autoComplete="email" required value={email} onChange={(e) => aoMudarEmail(e.target.value)} className="campo h-10 bg-al-bg px-3 text-al-ink" />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="senha-cadastro">Senha</label>
        <div className="flex gap-2">
          <input
            id="senha-cadastro"
            type={senhaVisivel ? 'text' : 'password'}
            autoComplete="new-password"
            required
            aria-describedby={idDaForca}
            value={senha}
            onChange={(e) => aoMudarSenha(e.target.value)}
            className="campo h-10 min-w-0 flex-1 bg-al-bg px-3 text-al-ink"
          />
          <Button type="button" variant="outline" onClick={() => setSenhaVisivel((v) => !v)}>
            {senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
          </Button>
        </div>
        <p id={idDaForca} aria-live="polite" className="text-xs text-al-muted">
          {senha ? `Força da senha: ${forca}` : `Mínimo de ${TAMANHO_MINIMO_DA_SENHA} caracteres. Uma frase longa é mais forte.`}
        </p>
      </div>
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <Button type="submit" disabled={enviando}>{enviando ? 'Criando…' : 'Criar conta'}</Button>
      <p className="text-xs text-al-muted">
        Ao continuar, você concorda com os{' '}
        <a href={ENDERECO_DOS_TERMOS_DE_USO} target="_blank" rel="noreferrer" className="underline">Termos de Uso</a> e a{' '}
        <a href={ENDERECO_DA_POLITICA_DE_PRIVACIDADE} target="_blank" rel="noreferrer" className="underline">Política de Privacidade</a>.
      </p>
      <p className="text-sm text-al-muted">Já tem conta? <Link to={{ pathname: ROTA_DE_ENTRADA, search }} className="text-al-accent underline">Entrar</Link></p>
    </form>
  )
}

function EtapaDoCodigoDoCadastro({
  etapa,
  aoReenviar,
  aoCorrigirEmail,
}: {
  etapa: EtapaDoCodigo
  aoReenviar: (etapa: EtapaDoCodigo) => void
  aoCorrigirEmail: () => void
}) {
  const { confirmarCodigoDoCadastro, reenviarCodigoDoCadastro } = useAutenticacao()
  const [codigo, setCodigo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [agora, setAgora] = useState(Date.now)
  const segundosParaReenviar = Math.max(0, Math.ceil((etapa.enviadoEm + INTERVALO_PARA_REENVIAR_MS - agora) / 1000))

  useEffect(() => {
    if (segundosParaReenviar === 0) return
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [segundosParaReenviar])

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setMensagem('')
    setConfirmando(true)
    try {
      await confirmarCodigoDoCadastro(etapa.email, codigo)
      guardarEtapa(null)
    } catch {
      setErro('Código inválido ou expirado. Confira o e-mail mais recente ou peça um novo código.')
      setConfirmando(false)
    }
  }

  async function reenviar() {
    setErro('')
    setMensagem('')
    try {
      await reenviarCodigoDoCadastro(etapa.email, destinoDepoisDoAcesso() ?? '/')
      const enviadoEm = Date.now()
      setAgora(enviadoEm)
      aoReenviar({ ...etapa, enviadoEm })
      setMensagem('Enviamos um novo código para o seu e-mail.')
    } catch {
      setErro('Não foi possível reenviar o código agora. Tente novamente em instantes.')
    }
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-5">
      <div>
        <h1 className="titulo-secao text-2xl">Confirme seu e-mail</h1>
        <p className="mt-2 text-sm text-al-muted">
          Enviamos um código de 6 dígitos e um link para <strong className="text-al-ink">{etapa.email}</strong>. Digite o
          código aqui ou abra o link neste navegador.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="codigo-cadastro">Código de 6 dígitos
        <input
          id="codigo-cadastro"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          className="campo h-10 bg-al-bg px-3 tracking-[0.3em] text-al-ink"
        />
      </label>
      {mensagem && <p role="status" className="text-sm text-al-sucesso">{mensagem}</p>}
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <Button type="submit" disabled={confirmando}>{confirmando ? 'Confirmando…' : 'Confirmar'}</Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={segundosParaReenviar > 0} onClick={reenviar}>
          {segundosParaReenviar > 0 ? `Reenviar código em ${segundosParaReenviar} s` : 'Reenviar código'}
        </Button>
        <Button type="button" variant="outline" onClick={aoCorrigirEmail}>Corrigir e-mail</Button>
      </div>
    </form>
  )
}
