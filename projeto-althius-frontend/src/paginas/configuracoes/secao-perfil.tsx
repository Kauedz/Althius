import { useRef, useState, type FormEvent } from 'react'
import { AvatarDePessoa, Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { ehEmailValido, ERRO_DE_EMAIL, ROTULO_DO_PAPEL } from '@/fonte/regras'
import type { Workspace } from '@/fonte/tipos'
import { BlocoSenha } from './bloco-senha'
import { Bloco } from './componentes'

/**
 * Meu perfil: nome, e-mail e foto da Conta de usuário (a mesma fonte alimenta o menu pessoal da Casca),
 * as Participações dela em cada Workspace e a alteração demonstrativa de senha.
 */
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
      {!workspace ? <Carregando /> : <FormularioDePerfil usuario={workspace.usuario} />}
      {workspace && <SeusWorkspaces contaId={workspace.usuario.id} />}
      <BlocoSenha />
    </section>
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
    setErroEmail(emailValido ? '' : ERRO_DE_EMAIL)
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

/** A Conta de usuário existe por si e participa de um ou mais Workspaces, com um papel em cada. */
function SeusWorkspaces({ contaId }: { contaId: string }) {
  const contaComParticipacoes = useDados((fonte) => fonte.contaDeUsuario(contaId), [contaId])

  return (
    <Bloco titulo="Seus Workspaces" descricao="Sua Conta de usuário pode participar de mais de um Workspace, com um papel em cada.">
      {!contaComParticipacoes ? (
        <Carregando />
      ) : (
        <ul className="flex flex-col">
          {contaComParticipacoes.participacoes.map((participacao) => (
            <li
              key={participacao.workspaceId}
              aria-label={participacao.nomeDoWorkspace}
              className="flex items-center gap-3 border-b border-al-line py-3 last:border-b-0"
            >
              <span className="grid size-7 shrink-0 place-items-center bg-al-ink text-sm font-medium text-al-bg" aria-hidden>
                {participacao.nomeDoWorkspace[0]}
              </span>
              <span className="font-normal">{participacao.nomeDoWorkspace}</span>
              {participacao.atual && <span className="selo">Atual</span>}
              <span className="rotulo ml-auto">{ROTULO_DO_PAPEL[participacao.papel]}</span>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  )
}
