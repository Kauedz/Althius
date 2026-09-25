import { ShieldCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { AvatarDePessoa, Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Opcao } from '@/components/opcao'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { ERRO_SEM_PARTICIPACAO, PAPEIS, ROTULO_DO_PAPEL } from '@/fonte/regras'
import type { InformacoesDoWorkspace, Papel, Participante, ParticipantesDoWorkspace } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

type Resultado = { tipo: 'sucesso' | 'erro'; texto: string }
type AoConcluir = (resultado: Resultado) => void

/**
 * Workspace / Pessoas e acesso: todos os Participantes consultam as informações, quem participa e os
 * convites; só Administradores alteram. A fonte valida o papel em cada operação, não só esta tela.
 */
export function SecaoWorkspace() {
  const dados = useDados((fonte) => fonte.participantesDoWorkspace(), [])
  const [resultado, setResultado] = useState<Resultado | null>(null)

  return (
    <SecaoDeConfiguracoes
      id="pessoas"
      titulo="Pessoas e acesso"
      alcance="workspace"
      descricao="O que muda aqui vale para todas as pessoas do Workspace."
    >
      {!dados ? (
        <Carregando />
      ) : (
        <>
          {dados.papel !== 'administrador' && (
            <Mensagem tipo="info">
              {dados.papel === 'membro'
                ? 'Você é Membro: consulta quem participa, mas só Administradores alteram as informações do Workspace, convidam, mudam papéis e removem pessoas.'
                : ERRO_SEM_PARTICIPACAO}
            </Mensagem>
          )}
          {resultado && <Mensagem tipo={resultado.tipo}>{resultado.texto}</Mensagem>}
          <Informacoes dados={dados} aoConcluir={setResultado} />
          <Participantes dados={dados} aoConcluir={setResultado} />
          <Convites dados={dados} aoConcluir={setResultado} />
        </>
      )}
    </SecaoDeConfiguracoes>
  )
}

function Informacoes({ dados, aoConcluir }: { dados: ParticipantesDoWorkspace; aoConcluir: AoConcluir }) {
  const { informacoes, papel, participantes } = dados
  const [editando, setEditando] = useState(false)

  return (
    <Bloco
      titulo="Workspace"
      acoes={
        papel === 'administrador' &&
        !editando && (
          <button type="button" onClick={() => setEditando(true)} className={BOTAO_SECUNDARIO}>
            Editar informações
          </button>
        )
      }
    >
      {editando && (
        <FormularioDeInformacoes
          atuais={informacoes}
          aoFechar={() => setEditando(false)}
          aoConcluir={(resultado) => {
            aoConcluir(resultado)
            setEditando(false)
          }}
        />
      )}
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-6 gap-y-3">
        {!editando && (
          <>
            <dt className="rotulo">Nome</dt>
            <dd className="font-normal">{informacoes.nome}</dd>
            <dt className="rotulo">Descrição</dt>
            <dd>{informacoes.descricao || <span className="text-al-muted">Sem descrição</span>}</dd>
          </>
        )}
        <dt className="rotulo">Criado em</dt>
        <dd>{formatarDiaIsoPorExtenso(informacoes.criadoEm)}</dd>
        <dt className="rotulo">Participantes</dt>
        <dd>{papel ? participantes.length : '—'}</dd>
        <dt className="rotulo">Seu papel</dt>
        <dd>{papel ? ROTULO_DO_PAPEL[papel] : 'Sem Participação'}</dd>
      </dl>
    </Bloco>
  )
}

/** O nome é também como os Agentes chamam o Cliente: muda em todo o aplicativo, que o lê da mesma fonte. */
function FormularioDeInformacoes({
  atuais,
  aoFechar,
  aoConcluir,
}: {
  atuais: InformacoesDoWorkspace
  aoFechar: () => void
  aoConcluir: AoConcluir
}) {
  const fonte = useFonte()
  const [nome, setNome] = useState(atuais.nome)
  const [descricao, setDescricao] = useState(atuais.descricao)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    try {
      await fonte.salvarInformacoesDoWorkspace({ nome, descricao })
      aoConcluir({ tipo: 'sucesso', texto: 'Informações do Workspace salvas. Todas as pessoas do Workspace já veem a mudança.' })
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form aria-label="Informações do Workspace" noValidate onSubmit={salvar} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-nome" className="rotulo">
          Nome
        </label>
        <input
          id="workspace-nome"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
            setErro('')
          }}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? 'workspace-informacoes-erro' : undefined}
          className="campo"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-descricao" className="rotulo">
          Descrição
        </label>
        <input
          id="workspace-descricao"
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value)
            setErro('')
          }}
          className="campo"
        />
      </div>
      {erro && (
        <p id="workspace-informacoes-erro" role="alert" className="text-sm text-al-erro">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
          Salvar
        </button>
        <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Participantes({ dados, aoConcluir }: { dados: ParticipantesDoWorkspace; aoConcluir: AoConcluir }) {
  const fonte = useFonte()
  const { participantes, papel, contaId } = dados
  const ehAdministrador = papel === 'administrador'
  const [removendo, setRemovendo] = useState<Participante | null>(null)

  async function mudarPapel(participante: Participante, novo: Papel) {
    try {
      await fonte.mudarPapel(participante.conta.id, novo)
      aoConcluir({ tipo: 'sucesso', texto: `${participante.conta.nome} agora é ${ROTULO_DO_PAPEL[novo]} neste Workspace.` })
    } catch (e) {
      aoConcluir({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
  }

  return (
    <Bloco
      titulo="Participantes"
      descricao={
        <>
          <strong className="font-normal text-al-ink">Administrador</strong> gerencia o Workspace e as pessoas.{' '}
          <strong className="font-normal text-al-ink">Membro</strong> consulta, ajusta as próprias preferências e pede revisões aos
          Agentes.
        </>
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-al-line">
            <th className="rotulo py-2 font-normal">Pessoa</th>
            <th className="rotulo w-52 py-2 font-normal">Papel</th>
            <th className="w-52 py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {participantes.map((participante) => {
            const { conta, ultimoAdministrador: ultimo } = participante
            const voce = conta.id === contaId
            return (
              <tr key={conta.id} aria-label={conta.nome} className="border-b border-al-line">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <AvatarDePessoa nome={conta.nome} foto={conta.foto} />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="flex items-center gap-2 font-normal">
                        {conta.nome}
                        {voce && <span className="selo h-5">Você</span>}
                      </span>
                      <span className="truncate text-sm text-al-muted">{conta.email}</span>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  {ehAdministrador ? (
                    <div className="flex flex-col gap-1">
                      <select
                        aria-label={`Papel de ${conta.nome}`}
                        value={participante.papel}
                        disabled={ultimo}
                        onChange={(e) => mudarPapel(participante, e.target.value as Papel)}
                        className="campo py-1.5 text-sm disabled:opacity-60"
                      >
                        {PAPEIS.map((opcao) => (
                          <option key={opcao} value={opcao}>
                            {ROTULO_DO_PAPEL[opcao]}
                          </option>
                        ))}
                      </select>
                      {ultimo && (
                        <span className="inline-flex items-center gap-1 text-xs text-al-muted">
                          <ShieldCheck strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
                          Último Administrador
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm">{ROTULO_DO_PAPEL[participante.papel]}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  {/* Ninguém remove a si mesmo por aqui; o último Administrador aparece travado, para mostrar a proteção. */}
                  {ehAdministrador && (!voce || ultimo) && (
                    <button
                      type="button"
                      disabled={ultimo}
                      title={ultimo ? 'O Workspace precisa de pelo menos um Administrador.' : undefined}
                      onClick={() => setRemovendo(participante)}
                      className={cn(BOTAO_DISCRETO, 'hover:text-al-erro disabled:pointer-events-none disabled:opacity-40')}
                    >
                      Remover do Workspace
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {ehAdministrador && (
        <p className="text-sm text-al-muted">
          Para rebaixar ou remover o último Administrador, torne outra pessoa Administrador antes. O Workspace nunca fica sem
          responsável.
        </p>
      )}

      <DialogoDeRemocao
        participante={removendo}
        nomeDoWorkspace={dados.informacoes.nome}
        aoFechar={() => setRemovendo(null)}
        aoConcluir={(resultado) => {
          aoConcluir(resultado)
          setRemovendo(null)
        }}
      />
    </Bloco>
  )
}

function DialogoDeRemocao({
  participante,
  nomeDoWorkspace,
  aoFechar,
  aoConcluir,
}: {
  participante: Participante | null
  nomeDoWorkspace: string
  aoFechar: () => void
  aoConcluir: AoConcluir
}) {
  const fonte = useFonte()
  const [removendo, setRemovendo] = useState(false)
  const outras = participante?.outrasParticipacoes ?? []

  async function remover() {
    if (!participante) return
    setRemovendo(true)
    try {
      await fonte.removerDoWorkspace(participante.conta.id)
      const preservadas = outras.length > 0 ? `, assim como a participação em ${outras.map((p) => p.nomeDoWorkspace).join(', ')}` : ''
      aoConcluir({
        tipo: 'sucesso',
        texto: `O acesso de ${participante.conta.nome} ao Workspace ${nomeDoWorkspace} foi encerrado. A Conta de usuário continua ativa${preservadas}.`,
      })
    } catch (e) {
      aoConcluir({ tipo: 'erro', texto: mensagemDeErro(e) })
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <Dialog open={participante !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogTitle className="titulo-secao text-2xl">Remover do Workspace</DialogTitle>
        <DialogDescription className="text-al-muted">
          {participante?.conta.nome} perde o acesso ao Workspace {nomeDoWorkspace}. A Conta de usuário será mantida: ela não é excluída.
        </DialogDescription>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="rotulo text-al-erro">Encerra</dt>
          <dd>Acesso e Participação no Workspace {nomeDoWorkspace}</dd>
          <dt className="rotulo text-al-sucesso">Continua</dt>
          <dd className="flex flex-col">
            <span>Conta de usuário ({participante?.conta.email})</span>
            {outras.length > 0 ? (
              outras.map((p) => (
                <span key={p.workspaceId}>
                  Workspace {p.nomeDoWorkspace} · {ROTULO_DO_PAPEL[p.papel]}
                </span>
              ))
            ) : (
              <span className="text-al-muted">Participações em outros Workspaces, se houver</span>
            )}
          </dd>
        </dl>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={removendo}
            onClick={remover}
            className={cn(BOTAO_PRIMARIO, 'border-al-erro bg-al-erro text-white hover:border-al-erro hover:bg-al-erro/85')}
          >
            Remover do Workspace
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Convites({ dados, aoConcluir }: { dados: ParticipantesDoWorkspace; aoConcluir: AoConcluir }) {
  const fonte = useFonte()
  const { convites, papel } = dados
  const ehAdministrador = papel === 'administrador'
  const [convidando, setConvidando] = useState(false)

  async function cancelar(conviteId: string, email: string) {
    try {
      await fonte.cancelarConvite(conviteId)
      aoConcluir({ tipo: 'sucesso', texto: `Convite para ${email} cancelado.` })
    } catch (e) {
      aoConcluir({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
  }

  return (
    <Bloco
      titulo="Convites pendentes"
      descricao="Quem recebe um convite ainda não participa: entra no Workspace só depois de aceitar."
      acoes={
        ehAdministrador && (
          <button type="button" onClick={() => setConvidando(true)} className={BOTAO_PRIMARIO}>
            <UserPlus strokeWidth={1.8} className="size-4" aria-hidden />
            Convidar pessoa
          </button>
        )
      }
    >
      {convites.length === 0 ? (
        <p className="anotacao text-lg">nenhum convite esperando resposta</p>
      ) : (
        <ul aria-label="Convites pendentes" className="flex flex-col">
          {convites.map((convite) => (
            <li
              key={convite.id}
              aria-label={convite.email}
              className="flex items-center gap-3 border-b border-dashed border-al-line py-3"
            >
              <span
                className="grid size-9 place-items-center rounded-full border border-dashed border-al-line text-al-muted"
                aria-hidden
              >
                <UserPlus strokeWidth={1.8} className="size-4" />
              </span>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-normal">{convite.email}</span>
                <span className="text-sm text-al-muted">
                  {ROTULO_DO_PAPEL[convite.papel]} · registrado em {formatarDiaIsoPorExtenso(convite.registradoEm)}
                </span>
              </div>
              <span className="selo">Convite pendente</span>
              {ehAdministrador && (
                <button type="button" onClick={() => cancelar(convite.id, convite.email)} className={BOTAO_DISCRETO}>
                  Cancelar convite
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <DialogoDeConvite
        aberto={convidando}
        nomeDoWorkspace={dados.informacoes.nome}
        aoFechar={() => setConvidando(false)}
        aoConcluir={aoConcluir}
      />
    </Bloco>
  )
}

function DialogoDeConvite({
  aberto,
  nomeDoWorkspace,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean
  nomeDoWorkspace: string
  aoFechar: () => void
  aoConcluir: AoConcluir
}) {
  const fonte = useFonte()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('membro')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  function fechar() {
    setEmail('')
    setPapel('membro')
    setErro('')
    aoFechar()
  }

  async function registrar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    try {
      const convite = await fonte.convidarParaWorkspace({ email, papel })
      aoConcluir({
        tipo: 'sucesso',
        texto: `Convite registrado para ${convite.email} como ${ROTULO_DO_PAPEL[convite.papel]}. Demonstração: nenhum e-mail foi enviado.`,
      })
      fechar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogTitle className="titulo-secao text-2xl">Convidar pessoa</DialogTitle>
        <DialogDescription className="text-al-muted">
          A pessoa entra no Workspace {nomeDoWorkspace} com o papel escolhido depois de aceitar. Demonstração: nenhum e-mail é
          enviado.
        </DialogDescription>
        <form aria-label="Convidar pessoa" noValidate onSubmit={registrar} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="convite-email" className="rotulo">
              E-mail
            </label>
            <input
              id="convite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErro('')
              }}
              aria-invalid={Boolean(erro)}
              aria-describedby={erro ? 'convite-email-erro' : undefined}
              className="campo"
            />
            {erro && (
              <span id="convite-email-erro" role="alert" className="text-sm text-al-erro">
                {erro}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="rotulo" id="convite-papel">
              Papel
            </span>
            <div role="radiogroup" aria-labelledby="convite-papel" className="flex gap-2">
              {PAPEIS.map((opcao) => (
                <Opcao key={opcao} papel="radio" marcada={papel === opcao} aoClicar={() => setPapel(opcao)}>
                  {ROTULO_DO_PAPEL[opcao]}
                </Opcao>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className={BOTAO_PRIMARIO}>
              Registrar convite
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
