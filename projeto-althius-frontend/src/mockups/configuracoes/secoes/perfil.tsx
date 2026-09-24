import { useRef, useState, type FormEvent } from 'react'
import { Avatar, Bloco, BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CabecalhoDaSecao, Campo, Mensagem } from '../componentes'
import { ERRO_DE_EMAIL, FORMATO_DE_EMAIL, ROTULO_DO_PAPEL, WORKSPACE } from '../dados'
import { useMockup } from '../estado'

export function SecaoPerfil() {
  const { visitante } = useMockup()
  return (
    <>
      <CabecalhoDaSecao titulo="Meu perfil" alcance="pessoal" descricao="Como você aparece para as outras pessoas do Workspace. Vale para a sua Conta de usuário." />
      {/* A chave recomeça o formulário quando o mockup troca a pessoa que vê a tela. */}
      <DadosDoPerfil key={visitante.id} />
      <SeusWorkspaces />
      <Senha key={`senha-${visitante.id}`} />
    </>
  )
}

function DadosDoPerfil() {
  const { visitante, salvarPerfil } = useMockup()
  const [nome, setNome] = useState(visitante.nome)
  const [email, setEmail] = useState(visitante.email)
  const [foto, setFoto] = useState(visitante.foto)
  const [erros, setErros] = useState<{ nome?: string; email?: string; foto?: string }>({})
  const [resultado, setResultado] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const alterado = nome !== visitante.nome || email !== visitante.email || foto !== visitante.foto

  function escolherFoto(lista: FileList | null) {
    const escolhido = lista?.[0]
    if (!escolhido) return
    setResultado(null)
    if (!escolhido.type.startsWith('image/')) {
      setErros((e) => ({ ...e, foto: 'Escolha um arquivo de imagem (JPG, PNG ou WebP).' }))
      return
    }
    setErros((e) => ({ ...e, foto: undefined }))
    const leitor = new FileReader()
    leitor.onload = () => setFoto(String(leitor.result))
    leitor.readAsDataURL(escolhido)
  }

  function salvar(evento: FormEvent) {
    evento.preventDefault()
    const novos = {
      nome: nome.trim() ? undefined : 'Informe seu nome.',
      email: FORMATO_DE_EMAIL.test(email.trim()) ? undefined : ERRO_DE_EMAIL,
    }
    setErros(novos)
    if (novos.nome || novos.email) {
      setResultado(null)
      return
    }
    salvarPerfil({ nome: nome.trim(), email: email.trim().toLowerCase(), foto })
    setNome(nome.trim())
    setEmail(email.trim().toLowerCase())
    setResultado('Perfil salvo. Seu nome e sua foto já aparecem no menu pessoal. Demonstração: o novo e-mail não passa por verificação.')
  }

  function cancelar() {
    setNome(visitante.nome)
    setEmail(visitante.email)
    setFoto(visitante.foto)
    setErros({})
    setResultado(null)
  }

  return (
    <form aria-label="Dados do perfil" noValidate onSubmit={salvar} className="flex flex-col gap-6 border-t border-al-line pt-6">
      <div className="flex items-center gap-6">
        <Avatar pessoa={{ nome: nome || visitante.nome, foto }} tamanho="lg" />
        <div className="flex flex-col gap-2">
          <span className="rotulo">Foto</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => arquivo.current?.click()} className={BOTAO_SECUNDARIO}>
              {foto ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {foto && (
              <button type="button" onClick={() => setFoto(undefined)} className={BOTAO_DISCRETO}>
                Remover foto
              </button>
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
          {erros.foto ? (
            <span className="text-sm text-al-erro">{erros.foto}</span>
          ) : (
            <span className="text-sm text-al-muted">Sem foto, mostramos as iniciais do seu nome.</span>
          )}
        </div>
      </div>

      <div className="grid max-w-2xl grid-cols-2 gap-6">
        <Campo rotulo="Nome" id="perfil-nome" erro={erros.nome}>
          <input
            id="perfil-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={Boolean(erros.nome)}
            aria-describedby={erros.nome ? 'perfil-nome-erro' : undefined}
            className="campo"
          />
        </Campo>
        <Campo rotulo="E-mail" id="perfil-email" erro={erros.email}>
          <input
            id="perfil-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(erros.email)}
            aria-describedby={erros.email ? 'perfil-email-erro' : undefined}
            className="campo"
          />
        </Campo>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={!alterado} className={BOTAO_PRIMARIO}>
          Salvar
        </button>
        <button type="button" disabled={!alterado} onClick={cancelar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
      {resultado && <Mensagem tipo="sucesso">{resultado}</Mensagem>}
    </form>
  )
}

function SeusWorkspaces() {
  const { visitante } = useMockup()
  const vinculos = [{ nome: WORKSPACE.nome, papel: visitante.papel, atual: true }, ...visitante.outrosWorkspaces.map((w) => ({ ...w, atual: false }))]
  return (
    <Bloco titulo="Seus Workspaces" descricao="Sua Conta de usuário pode participar de mais de um Workspace, com um papel em cada.">
      <ul className="flex flex-col">
        {vinculos.map((w) => (
          <li key={w.nome} className="flex items-center gap-3 border-b border-al-line py-3 last:border-b-0">
            <span className="grid size-7 shrink-0 place-items-center bg-al-ink text-sm font-medium text-al-bg" aria-hidden>
              {w.nome[0]}
            </span>
            <span className="font-normal">{w.nome}</span>
            {w.atual && <span className="selo">Atual</span>}
            <span className="rotulo ml-auto">{ROTULO_DO_PAPEL[w.papel]}</span>
          </li>
        ))}
      </ul>
    </Bloco>
  )
}

function Senha() {
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<{ atual?: string; nova?: string; confirmacao?: string }>({})
  const [resultado, setResultado] = useState(false)

  function limpar() {
    setAtual('')
    setNova('')
    setConfirmacao('')
    setErros({})
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const novos = {
      atual: atual ? undefined : 'Informe a senha atual.',
      nova: nova ? undefined : 'Informe a nova senha.',
      confirmacao: !confirmacao ? 'Repita a nova senha.' : confirmacao !== nova ? 'A confirmação não é igual à nova senha.' : undefined,
    }
    setErros(novos)
    if (novos.atual || novos.nova || novos.confirmacao) return
    // Nada é guardado nem enviado: os valores só existem no formulário até aqui.
    limpar()
    setAberto(false)
    setResultado(true)
  }

  return (
    <Bloco
      titulo="Senha"
      descricao="Sua senha atual nunca é exibida."
      acoes={
        !aberto && (
          <button
            type="button"
            onClick={() => {
              setAberto(true)
              setResultado(false)
            }}
            className={BOTAO_SECUNDARIO}
          >
            Alterar senha
          </button>
        )
      }
    >
      {aberto && (
        <form aria-label="Alterar senha" noValidate onSubmit={enviar} className="flex max-w-sm flex-col gap-5">
          <Campo rotulo="Senha atual" id="senha-atual" erro={erros.atual}>
            <input id="senha-atual" type="password" autoComplete="off" value={atual} onChange={(e) => setAtual(e.target.value)} aria-invalid={Boolean(erros.atual)} className="campo" />
          </Campo>
          <Campo rotulo="Nova senha" id="senha-nova" erro={erros.nova}>
            <input id="senha-nova" type="password" autoComplete="off" value={nova} onChange={(e) => setNova(e.target.value)} aria-invalid={Boolean(erros.nova)} className="campo" />
          </Campo>
          <Campo rotulo="Confirmar nova senha" id="senha-confirmacao" erro={erros.confirmacao}>
            <input
              id="senha-confirmacao"
              type="password"
              autoComplete="off"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              aria-invalid={Boolean(erros.confirmacao)}
              className="campo"
            />
          </Campo>
          <div className="flex gap-2">
            <button type="submit" className={BOTAO_PRIMARIO}>
              Alterar senha
            </button>
            <button
              type="button"
              onClick={() => {
                limpar()
                setAberto(false)
              }}
              className={BOTAO_SECUNDARIO}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {resultado && (
        <Mensagem tipo="info">Demonstração: nenhuma senha foi alterada. Os campos foram limpos e nada do que você digitou foi guardado.</Mensagem>
      )}
    </Bloco>
  )
}
