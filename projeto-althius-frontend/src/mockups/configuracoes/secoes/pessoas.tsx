import { ShieldCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AcaoDoMockup, Avatar, Bloco, BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CabecalhoDaSecao, Campo, Mensagem, Opcao } from '../componentes'
import { ERRO_DE_EMAIL, FORMATO_DE_EMAIL, ROTULO_DO_PAPEL, WORKSPACE, type Papel, type Participante } from '../dados'
import { ehUltimoAdministrador, useMockup } from '../estado'

type Resultado = { tipo: 'sucesso' | 'erro'; texto: string }
type AoConcluir = (resultado: Resultado | null) => void

export function SecaoPessoas() {
  const { ehAdministrador, visitante } = useMockup()
  const [resultado, setResultado] = useState<Resultado | null>(null)

  return (
    <>
      <CabecalhoDaSecao titulo="Pessoas e acesso" alcance="workspace" />
      <InformacoesDoWorkspace papel={visitante.papel} />
      {!ehAdministrador && (
        <Mensagem tipo="info">
          Você é Membro: consulta quem participa, mas só Administradores convidam, mudam papéis e removem pessoas.
        </Mensagem>
      )}
      {resultado && <Mensagem tipo={resultado.tipo}>{resultado.texto}</Mensagem>}
      <Participantes aoConcluir={setResultado} />
      <Convites aoConcluir={setResultado} />
    </>
  )
}

function InformacoesDoWorkspace({ papel }: { papel: Papel }) {
  const { participantes } = useMockup()
  return (
    <Bloco titulo="Workspace">
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-6 gap-y-3">
        <dt className="rotulo">Nome</dt>
        <dd className="font-normal">{WORKSPACE.nome}</dd>
        <dt className="rotulo">Descrição</dt>
        <dd>{WORKSPACE.descricao}</dd>
        <dt className="rotulo">Criado em</dt>
        <dd>{WORKSPACE.criadoEm}</dd>
        <dt className="rotulo">Participantes</dt>
        <dd>{participantes.length}</dd>
        <dt className="rotulo">Seu papel</dt>
        <dd>{ROTULO_DO_PAPEL[papel]}</dd>
      </dl>
    </Bloco>
  )
}

function Participantes({ aoConcluir }: { aoConcluir: AoConcluir }) {
  const { participantes, ehAdministrador, visitanteId, mudarPapel } = useMockup()
  const [removendo, setRemovendo] = useState<Participante | null>(null)

  return (
    <Bloco
      titulo="Participantes"
      descricao={
        <>
          <strong className="font-normal text-al-ink">Administrador</strong> gerencia pessoas e decide as revisões do ICP e das Personas.{' '}
          <strong className="font-normal text-al-ink">Membro</strong> consulta, ajusta as próprias preferências e pede revisões aos Agentes.
        </>
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-al-line">
            <th className="rotulo py-2 font-normal">Pessoa</th>
            <th className="rotulo w-52 py-2 font-normal">Papel</th>
            <th className="w-48 py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {participantes.map((pessoa) => {
            const ultimo = ehUltimoAdministrador(participantes, pessoa.id)
            const voce = pessoa.id === visitanteId
            return (
              <tr key={pessoa.id} aria-label={pessoa.nome} className="border-b border-al-line">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <Avatar pessoa={pessoa} />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="flex items-center gap-2 font-normal">
                        {pessoa.nome}
                        {voce && <span className="selo h-5">Você</span>}
                      </span>
                      <span className="truncate text-sm text-al-muted">{pessoa.email}</span>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  {ehAdministrador ? (
                    <div className="flex flex-col gap-1">
                      <select
                        aria-label={`Papel de ${pessoa.nome}`}
                        value={pessoa.papel}
                        disabled={ultimo}
                        onChange={(e) => {
                          const erro = mudarPapel(pessoa.id, e.target.value as Papel)
                          aoConcluir(
                            erro
                              ? { tipo: 'erro', texto: erro }
                              : { tipo: 'sucesso', texto: `${pessoa.nome} agora é ${ROTULO_DO_PAPEL[e.target.value as Papel]} neste Workspace.` },
                          )
                        }}
                        className="campo py-1.5 text-sm disabled:opacity-60"
                      >
                        <option value="administrador">Administrador</option>
                        <option value="membro">Membro</option>
                      </select>
                      {ultimo && (
                        <span className="inline-flex items-center gap-1 text-xs text-al-muted">
                          <ShieldCheck strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
                          Último Administrador
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm">{ROTULO_DO_PAPEL[pessoa.papel]}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  {/* Ninguém remove a si mesmo por aqui; o último Administrador aparece travado, para mostrar a proteção. */}
                  {ehAdministrador && (!voce || ultimo) && (
                    <button
                      type="button"
                      disabled={ultimo}
                      title={ultimo ? 'O Workspace precisa de pelo menos um Administrador.' : undefined}
                      onClick={() => setRemovendo(pessoa)}
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
          Para rebaixar ou remover o último Administrador, torne outra pessoa Administrador antes. O Workspace nunca fica sem responsável.
        </p>
      )}

      <DialogoDeRemocao
        pessoa={removendo}
        aoFechar={() => setRemovendo(null)}
        aoConcluir={(resultado) => {
          aoConcluir(resultado)
          setRemovendo(null)
        }}
      />
    </Bloco>
  )
}

function DialogoDeRemocao({ pessoa, aoFechar, aoConcluir }: { pessoa: Participante | null; aoFechar: () => void; aoConcluir: AoConcluir }) {
  const { remover } = useMockup()
  const outros = pessoa?.outrosWorkspaces ?? []
  return (
    <Dialog open={pessoa !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogTitle className="titulo-secao text-2xl">Remover do Workspace</DialogTitle>
        <DialogDescription className="text-al-muted">
          {pessoa?.nome} perde o acesso ao Workspace {WORKSPACE.nome}. A Conta de usuário não é excluída.
        </DialogDescription>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="rotulo text-al-erro">Encerra</dt>
          <dd>Acesso ao Workspace {WORKSPACE.nome}</dd>
          <dt className="rotulo text-al-sucesso">Continua</dt>
          <dd className="flex flex-col">
            <span>Conta de usuário ({pessoa?.email})</span>
            {outros.length > 0 ? (
              outros.map((w) => (
                <span key={w.nome}>
                  Workspace {w.nome} · {ROTULO_DO_PAPEL[w.papel]}
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
            onClick={() => {
              if (!pessoa) return
              const erro = remover(pessoa.id)
              aoConcluir(
                erro
                  ? { tipo: 'erro', texto: erro }
                  : {
                      tipo: 'sucesso',
                      texto: `O acesso de ${pessoa.nome} ao Workspace ${WORKSPACE.nome} foi encerrado. A Conta de usuário continua ativa${
                        outros.length > 0 ? `, assim como a participação em ${outros.map((w) => w.nome).join(', ')}` : ''
                      }.`,
                    },
              )
            }}
            className={cn(BOTAO_PRIMARIO, 'border-al-erro bg-al-erro text-white hover:border-al-erro hover:bg-al-erro/85')}
          >
            Remover do Workspace
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Convites({ aoConcluir }: { aoConcluir: AoConcluir }) {
  const { convites, ehAdministrador, cancelarConvite, simularAceite } = useMockup()
  const [convidando, setConvidando] = useState(false)

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
            <li key={convite.id} aria-label={convite.email} className="flex items-center gap-3 border-b border-dashed border-al-line py-3">
              <span className="grid size-9 place-items-center rounded-full border border-dashed border-al-line text-al-muted" aria-hidden>
                <UserPlus strokeWidth={1.8} className="size-4" />
              </span>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-normal">{convite.email}</span>
                <span className="text-sm text-al-muted">
                  {ROTULO_DO_PAPEL[convite.papel]} · convite de {convite.enviadoEm}
                </span>
              </div>
              <span className="selo">Convite pendente</span>
              {ehAdministrador && (
                <>
                  <AcaoDoMockup aoClicar={() => simularAceite(convite.id)}>Simular aceite</AcaoDoMockup>
                  <button type="button" onClick={() => cancelarConvite(convite.id)} className={BOTAO_DISCRETO}>
                    Cancelar convite
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <DialogoDeConvite aberto={convidando} aoFechar={() => setConvidando(false)} aoConcluir={aoConcluir} />
    </Bloco>
  )
}

function DialogoDeConvite({ aberto, aoFechar, aoConcluir }: { aberto: boolean; aoFechar: () => void; aoConcluir: AoConcluir }) {
  const { convidar } = useMockup()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('membro')
  const [erro, setErro] = useState<string | undefined>()

  function fechar() {
    setEmail('')
    setPapel('membro')
    setErro(undefined)
    aoFechar()
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!FORMATO_DE_EMAIL.test(email.trim())) {
      setErro(ERRO_DE_EMAIL)
      return
    }
    const falha = convidar(email, papel)
    if (falha) {
      setErro(falha)
      return
    }
    aoConcluir({
      tipo: 'sucesso',
      texto: `Convite registrado para ${email.trim().toLowerCase()} como ${ROTULO_DO_PAPEL[papel]}. Demonstração: nenhum e-mail foi enviado.`,
    })
    fechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogTitle className="titulo-secao text-2xl">Convidar pessoa</DialogTitle>
        <DialogDescription className="text-al-muted">A pessoa entra no Workspace {WORKSPACE.nome} com o papel escolhido depois de aceitar.</DialogDescription>
        <form aria-label="Convidar pessoa" noValidate onSubmit={enviar} className="flex flex-col gap-5">
          <Campo rotulo="E-mail" id="convite-email" erro={erro}>
            <input id="convite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(erro)} className="campo" />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <span className="rotulo" id="convite-papel">
              Papel
            </span>
            <div role="radiogroup" aria-labelledby="convite-papel" className="flex gap-2">
              {(['membro', 'administrador'] as const).map((p) => (
                <Opcao key={p} papel="radio" marcada={papel === p} aoClicar={() => setPapel(p)}>
                  {ROTULO_DO_PAPEL[p]}
                </Opcao>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" className={BOTAO_PRIMARIO}>
              Registrar convite
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
