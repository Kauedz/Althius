import { useRef, useState, type FormEvent } from 'react'
import { AvatarDePessoa, Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useCarregamento, useDados, useFonte } from '@/fonte/contexto'
import { ehEmailValido, ERRO_DE_EMAIL, ROTULO_DO_PAPEL } from '@/fonte/regras'
import type { Perfil } from '@/fonte/tipos'
import { BlocoDeContasRemetentes } from './bloco-contas-remetentes'
import { BlocoSenha } from './bloco-senha'
import { BlocoDeSenhaDaConta } from './bloco-senha-da-conta'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

const DESCRICAO_DO_PERFIL = 'Como você aparece para as outras pessoas do Workspace. Vale só para a sua Conta de usuário.'

/**
 * Meu perfil: nome, e-mail e foto da Conta de usuário (a mesma fonte alimenta o menu pessoal da Casca),
 * as Participações dela em cada Workspace, as Contas remetentes do titular e a alteração demonstrativa de senha.
 */
export function SecaoPerfil() {
  const workspace = useDados((fonte) => fonte.workspace(), [])

  return (
    <SecaoDeConfiguracoes id="perfil" titulo="Meu perfil" alcance="pessoal" descricao={DESCRICAO_DO_PERFIL} estreita>
      {!workspace ? (
        <Carregando />
      ) : (
        <FormularioDePerfil
          inicial={workspace.usuario}
          sucesso="Perfil salvo. Seu nome e sua foto já aparecem no menu pessoal. Demonstração: o novo e-mail não passa por verificação."
        />
      )}
      {workspace && <SeusWorkspaces contaId={workspace.usuario.id} />}
      <BlocoDeContasRemetentes />
      <BlocoSenha />
    </SecaoDeConfiguracoes>
  )
}

/** O maior arquivo de foto que o perfil guarda no Workspace operacional, e os tipos de imagem aceitos. */
const LIMITE_DA_FOTO = { bytes: 256 * 1024, tipos: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }

/**
 * Meu perfil no Workspace operacional: nome e foto salvos na Conta de usuário, o e-mail do acesso, as Contas remetentes
 * do titular e a senha, trocada pelo Supabase Auth. Nada da Demonstração (nem a lista de Workspaces dela) aparece.
 */
export function SecaoPerfilDoWorkspaceOperacional() {
  const fonte = useFonte()
  const { dados: perfil, erro, recarregar } = useCarregamento(fonte, (f) => f.perfil(), [])

  return (
    <SecaoDeConfiguracoes id="perfil" titulo="Meu perfil" alcance="pessoal" descricao={DESCRICAO_DO_PERFIL} estreita>
      {erro ? (
        <div className="flex flex-wrap items-center gap-3">
          <Mensagem tipo="erro">{erro.message}</Mensagem>
          <Button type="button" variant="outline" onClick={recarregar}>
            Tentar de novo
          </Button>
        </div>
      ) : !perfil ? (
        <Carregando />
      ) : (
        <FormularioDePerfil
          inicial={perfil}
          emailDoAcesso
          limiteDaFoto={LIMITE_DA_FOTO}
          sucesso="Perfil salvo. Seu nome e sua foto já aparecem no seu menu pessoal, e o nome também para as outras pessoas do Workspace."
        />
      )}
      <BlocoDeContasRemetentes />
      <BlocoDeSenhaDaConta />
    </SecaoDeConfiguracoes>
  )
}

/**
 * O formulário de nome, e-mail e foto. Só confirma o perfil salvo depois de a fonte gravar; numa falha, mantém o que
 * foi digitado e deixa tentar de novo. Com `emailDoAcesso`, o e-mail é o do acesso à Althius e só aparece. Com
 * `limiteDaFoto`, a foto é recusada na tela acima do tamanho ou fora dos tipos que o perfil guarda.
 */
function FormularioDePerfil({
  inicial,
  emailDoAcesso = false,
  limiteDaFoto,
  sucesso,
}: {
  inicial: Perfil
  emailDoAcesso?: boolean
  limiteDaFoto?: { bytes: number; tipos: string[] }
  sucesso: string
}) {
  const fonte = useFonte()
  const [nome, setNome] = useState(inicial.nome)
  const [email, setEmail] = useState(inicial.email)
  const [foto, setFoto] = useState(inicial.foto)
  const [erroNome, setErroNome] = useState('')
  const [erroEmail, setErroEmail] = useState('')
  const [erroFoto, setErroFoto] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const alterado = nome !== inicial.nome || email !== inicial.email || foto !== inicial.foto

  function limparResultado() {
    setErro('')
    setMensagem('')
  }

  function escolherFoto(lista: FileList | null) {
    const escolhido = lista?.[0]
    if (!escolhido) return
    limparResultado()
    if (!escolhido.type.startsWith('image/') || (limiteDaFoto && !limiteDaFoto.tipos.includes(escolhido.type))) {
      setErroFoto(limiteDaFoto ? 'Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).' : 'Escolha um arquivo de imagem (JPG, PNG ou WebP).')
      return
    }
    if (limiteDaFoto && escolhido.size > limiteDaFoto.bytes) {
      setErroFoto(`Escolha uma imagem de até ${limiteDaFoto.bytes / 1024} KB.`)
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

  async function salvar(evento?: FormEvent) {
    evento?.preventDefault()
    const nomeValido = nome.trim() !== ''
    const emailValido = emailDoAcesso || ehEmailValido(email)
    setErroNome(nomeValido ? '' : 'Informe seu nome.')
    setErroEmail(emailValido ? '' : ERRO_DE_EMAIL)
    if (!nomeValido || !emailValido) {
      limparResultado()
      return
    }
    setSalvando(true)
    limparResultado()
    try {
      const nomeSalvo = nome.trim()
      const emailSalvo = email.trim().toLowerCase()
      await fonte.salvarPerfil({ nome: nomeSalvo, email: emailSalvo, foto })
      setNome(nomeSalvo)
      setEmail(emailSalvo)
      setMensagem(sucesso)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o perfil.')
    } finally {
      setSalvando(false)
    }
  }

  function cancelar() {
    setNome(inicial.nome)
    setEmail(inicial.email)
    setFoto(inicial.foto)
    setErroNome('')
    setErroEmail('')
    setErroFoto('')
    limparResultado()
  }

  return (
    <form aria-label="Dados do perfil" noValidate onSubmit={salvar} className="flex flex-col gap-8">
      <div className="flex items-center gap-6">
        <AvatarDePessoa nome={nome || inicial.nome} foto={foto} tamanho="lg" />
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
            maxLength={120}
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
            readOnly={emailDoAcesso}
            onChange={(e) => {
              setEmail(e.target.value)
              setErroEmail('')
              limparResultado()
            }}
            aria-invalid={Boolean(erroEmail)}
            aria-describedby={erroEmail ? 'perfil-email-erro' : emailDoAcesso ? 'perfil-email-acesso' : undefined}
            className={emailDoAcesso ? 'campo text-al-muted' : 'campo'}
          />
          {emailDoAcesso && (
            <p id="perfil-email-acesso" className="text-sm text-al-muted">
              É o e-mail com que você entra na Althius; ele não muda por aqui.
            </p>
          )}
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
          <>
            <p role="alert" className="text-al-erro">
              {erro}
            </p>
            <Button type="button" variant="outline" disabled={salvando} onClick={() => void salvar()}>
              Tentar de novo
            </Button>
          </>
        ) : (
          <p role="status" className={salvando ? 'text-al-muted' : 'text-al-sucesso'}>
            {salvando ? 'Salvando o perfil…' : mensagem}
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
