import { useRef, useState, type FormEvent } from 'react'
import { AvatarDePessoa, Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { ehEmailValido } from '@/fonte/regras'
import type { Workspace } from '@/fonte/tipos'

/** Meu perfil: nome, e-mail e foto da Conta de usuário. A mesma fonte alimenta o menu pessoal da Casca. */
export function SecaoPerfil() {
  const workspace = useDados((fonte) => fonte.workspace(), [])

  return (
    <section aria-labelledby="titulo-perfil" className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="titulo-perfil" className="titulo-secao text-3xl">
            Meu perfil
          </h2>
          <span className="selo">Só você</span>
        </div>
        <p className="text-al-muted">
          Como você aparece para as outras pessoas do Workspace. Vale só para a sua Conta de usuário.
        </p>
      </div>
      {!workspace ? (
        <Carregando />
      ) : (
        <>
          <FormularioDePerfil usuario={workspace.usuario} />
          <SenhaDemonstrativa />
        </>
      )}
    </section>
  )
}

function SenhaDemonstrativa() {
  const [aberta, setAberta] = useState(false)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<{ atual?: string; nova?: string; confirmacao?: string }>({})
  const [concluida, setConcluida] = useState(false)
  const abrirRef = useRef<HTMLButtonElement>(null)
  const atualRef = useRef<HTMLInputElement>(null)
  const novaRef = useRef<HTMLInputElement>(null)
  const confirmacaoRef = useRef<HTMLInputElement>(null)

  function limparCampos() {
    setAtual('')
    setNova('')
    setConfirmacao('')
    setErros({})
  }

  function cancelar() {
    limparCampos()
    setAberta(false)
    requestAnimationFrame(() => abrirRef.current?.focus())
  }

  function alterar(evento: FormEvent) {
    evento.preventDefault()
    const novosErros = {
      atual: atual ? undefined : 'Informe a senha atual.',
      nova: nova ? undefined : 'Informe a nova senha.',
      confirmacao: !confirmacao
        ? 'Repita a nova senha.'
        : confirmacao !== nova
          ? 'A confirmação não é igual à nova senha.'
          : undefined,
    }
    setErros(novosErros)

    if (novosErros.atual || novosErros.nova || novosErros.confirmacao) {
      if (novosErros.atual) atualRef.current?.focus()
      else if (novosErros.nova) novaRef.current?.focus()
      else confirmacaoRef.current?.focus()
      return
    }

    // Este formulário é apenas demonstrativo: não valida nem transmite a senha atual.
    limparCampos()
    setAberta(false)
    setConcluida(true)
    requestAnimationFrame(() => abrirRef.current?.focus())
  }

  return (
    <section aria-labelledby="titulo-senha" className="flex flex-col gap-5 border-t border-al-line pt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h3 id="titulo-senha" className="text-lg font-medium">
            Senha
          </h3>
          <p className="text-sm text-al-muted">A demonstração não mostra nem verifica uma senha existente.</p>
        </div>
        {!aberta && (
          <Button
            ref={abrirRef}
            type="button"
            variant="outline"
            onClick={() => {
              setConcluida(false)
              setAberta(true)
            }}
          >
            Alterar senha
          </Button>
        )}
      </div>

      {aberta && (
        <form aria-label="Alterar senha" noValidate onSubmit={alterar} className="flex max-w-sm flex-col gap-5">
          <CampoDeSenha
            id="senha-atual"
            rotulo="Senha atual"
            valor={atual}
            erro={erros.atual}
            referencia={atualRef}
            aoAlterar={(valor) => {
              setAtual(valor)
              setErros((atuais) => ({ ...atuais, atual: undefined }))
            }}
          />
          <CampoDeSenha
            id="senha-nova"
            rotulo="Nova senha"
            valor={nova}
            erro={erros.nova}
            referencia={novaRef}
            aoAlterar={(valor) => {
              setNova(valor)
              setErros((atuais) => ({ ...atuais, nova: undefined, confirmacao: undefined }))
            }}
          />
          <CampoDeSenha
            id="senha-confirmacao"
            rotulo="Confirmar nova senha"
            valor={confirmacao}
            erro={erros.confirmacao}
            referencia={confirmacaoRef}
            aoAlterar={(valor) => {
              setConfirmacao(valor)
              setErros((atuais) => ({ ...atuais, confirmacao: undefined }))
            }}
          />
          <div className="flex gap-2">
            <Button type="submit">Alterar senha</Button>
            <Button type="button" variant="ghost" onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {concluida && (
        <p role="status" className="max-w-2xl border border-al-line bg-al-surface px-4 py-3 text-sm text-al-muted">
          Demonstração: nenhuma senha foi alterada. A senha atual não foi validada e os campos foram limpos sem guardar o que você digitou.
        </p>
      )}
    </section>
  )
}

function CampoDeSenha({
  id,
  rotulo,
  valor,
  erro,
  referencia,
  aoAlterar,
}: {
  id: string
  rotulo: string
  valor: string
  erro?: string
  referencia: React.RefObject<HTMLInputElement | null>
  aoAlterar: (valor: string) => void
}) {
  const idErro = `${id}-erro`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <input
        ref={referencia}
        id={id}
        type="password"
        autoComplete="off"
        value={valor}
        onChange={(evento) => aoAlterar(evento.target.value)}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? idErro : undefined}
        className="campo"
      />
      {erro && (
        <p id={idErro} role="alert" className="text-sm text-al-erro">
          {erro}
        </p>
      )}
    </div>
  )
}

function FormularioDePerfil({ usuario }: { usuario: Workspace['usuario'] }) {
  const fonte = useFonte()
  const [nome, setNome] = useState(usuario.nome)
  const [email, setEmail] = useState(usuario.email)
  const [foto, setFoto] = useState(usuario.foto)
  const [erroNome, setErroNome] = useState('')
  const [erroEmail, setErroEmail] = useState('')
  const [erroFoto, setErroFoto] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const alterado = nome !== usuario.nome || email !== usuario.email || foto !== usuario.foto

  function limparResultado() {
    setErro('')
    setMensagem('')
  }

  function escolherFoto(lista: FileList | null) {
    const escolhido = lista?.[0]
    if (!escolhido) return
    limparResultado()
    if (!escolhido.type.startsWith('image/')) {
      setErroFoto('Escolha um arquivo de imagem (JPG, PNG ou WebP).')
      return
    }
    setErroFoto('')
    const leitor = new FileReader()
    leitor.onload = () => setFoto(String(leitor.result))
    leitor.readAsDataURL(escolhido)
  }

  function removerFoto() {
    setFoto(undefined)
    setErroFoto('')
    limparResultado()
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    const nomeValido = nome.trim() !== ''
    const emailValido = ehEmailValido(email)
    setErroNome(nomeValido ? '' : 'Informe seu nome.')
    setErroEmail(emailValido ? '' : 'Informe um e-mail em formato válido, como nome@empresa.com.')
    if (!nomeValido || !emailValido) {
      limparResultado()
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const nomeSalvo = nome.trim()
      const emailSalvo = email.trim().toLowerCase()
      await fonte.salvarPerfil({ nome: nomeSalvo, email: emailSalvo, foto })
      setNome(nomeSalvo)
      setEmail(emailSalvo)
      setMensagem(
        'Perfil salvo. Seu nome e sua foto já aparecem no menu pessoal. Demonstração: o novo e-mail não passa por verificação.',
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o perfil.')
    } finally {
      setSalvando(false)
    }
  }

  function cancelar() {
    setNome(usuario.nome)
    setEmail(usuario.email)
    setFoto(usuario.foto)
    setErroNome('')
    setErroEmail('')
    setErroFoto('')
    limparResultado()
  }

  return (
    <form aria-label="Dados do perfil" noValidate onSubmit={salvar} className="flex flex-col gap-8">
      <div className="flex items-center gap-6">
        <AvatarDePessoa nome={nome || usuario.nome} foto={foto} tamanho="lg" />
        <div className="flex flex-col gap-2">
          <span className="rotulo">Foto</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => arquivo.current?.click()}>
              {foto ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            {foto && (
              <Button type="button" variant="ghost" onClick={removerFoto}>
                Remover foto
              </Button>
            )}
          </div>
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            aria-label="Arquivo da foto"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              escolherFoto(e.target.files)
              e.target.value = ''
            }}
          />
          {erroFoto ? (
            <p role="alert" className="text-sm text-al-erro">
              {erroFoto}
            </p>
          ) : (
            <p className="text-sm text-al-muted">Sem foto, mostramos as iniciais do seu nome.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="perfil-nome" className="rotulo">
            Nome
          </label>
          <input
            id="perfil-nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setErroNome('')
              limparResultado()
            }}
            aria-invalid={Boolean(erroNome)}
            aria-describedby={erroNome ? 'perfil-nome-erro' : undefined}
            className="campo"
          />
          {erroNome && (
            <p id="perfil-nome-erro" role="alert" className="text-sm text-al-erro">
              {erroNome}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="perfil-email" className="rotulo">
            E-mail
          </label>
          <input
            id="perfil-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErroEmail('')
              limparResultado()
            }}
            aria-invalid={Boolean(erroEmail)}
            aria-describedby={erroEmail ? 'perfil-email-erro' : undefined}
            className="campo"
          />
          {erroEmail && (
            <p id="perfil-email-erro" role="alert" className="text-sm text-al-erro">
              {erroEmail}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={!alterado || salvando} className="px-6 tracking-rotulo uppercase">
          Salvar
        </Button>
        <Button type="button" variant="ghost" disabled={!alterado || salvando} onClick={cancelar}>
          Cancelar
        </Button>
        {erro ? (
          <p role="alert" className="text-al-erro">
            {erro}
          </p>
        ) : (
          <p role="status" className="text-al-sucesso">
            {mensagem}
          </p>
        )}
      </div>
    </form>
  )
}
