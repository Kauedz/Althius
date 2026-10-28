import { ArrowRight, ArrowUp, Check, Copy, History, Pencil, Plus, Wrench, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BOTAO_DISCRETO } from '@/components/botoes'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { IconeAgente, Pulso } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Button } from '@/components/ui/button'
import { AnexosDaMensagem } from '@/conversa/anexos-da-mensagem'
import { Composer } from '@/conversa/composer'
import { useConversas, type ItemDaConversa } from '@/conversa/contexto'
import { GavetaDeHistorico, temHistorico } from '@/conversa/gaveta-de-historico'
import { MarcaDoSlack } from '@/conversa/linha-de-conversa'
import { LinkDoPasso } from '@/conversa/link-do-passo'
import { TextoDigitado } from '@/conversa/texto'
import { quemEstaRespondendo } from '@/conversa/vez'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import { nomeDaConversa, tituloAutomatico, type Agente, type AgenteId, type AprovacaoDeAcao, type ResumoDeConversa } from '@/fonte/tipos'
import { cn, mensagemDeErro, porId } from '@/lib/utils'
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { AprovacaoDoPasso } from '@/paginas/aprovacao-do-passo'
import { useSomenteLeituraDoAgente } from '@/paginas/secoes/somente-leitura'

export function SecaoConversa({ agente }: { agente: Agente }) {
  const { disponivel } = useAmbiente()
  const [parametros] = useSearchParams()
  // A Conversa do Slack só é lida aqui: não precisa do provedor de modelo.
  if (!parametros.get('slack') && !disponivel('conversas')) {
    return (
      <section aria-labelledby="titulo-conversa" className="flex max-w-3xl flex-col gap-6">
        <h2 id="titulo-conversa" className="sr-only">
          Conversa
        </h2>
        <AvisoDeModuloIndisponivel modulo="conversas" />
      </section>
    )
  }
  return <ConversaComHistorico agente={agente} />
}

/** O atalho do histórico não dispara enquanto a pessoa escreve. */
function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  return alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable
}

/**
 * A Conversa com o Agente, numa coluna central. No Workspace operacional, o histórico abre numa gaveta. A Conversa
 * aberta fica no endereço (?conversa=<id>, ou ?slack=<id>), para voltar a ela pelo link.
 */
function ConversaComHistorico({ agente }: { agente: Agente }) {
  const somenteLeitura = useSomenteLeituraDoAgente()
  const fonte = useFonte()
  const conversas = useConversas()
  const [parametros, setParametros] = useSearchParams()
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [versaoDoNome, setVersaoDoNome] = useState(0)
  const pedida = parametros.get('conversa')
  const slack = parametros.get('slack')
  const respondendo = conversas.respondendo(agente.id)
  const atual = fonte.conversaDoAgenteAtual?.(agente.id) ?? null
  const abrirDoAgente = conversas.abrirDoAgente
  const comHistorico = temHistorico(fonte)
  const itens = conversas.itens(agente.id)
  const idSalvo = slack ?? pedida ?? atual
  const lista = useDados(
    (f) => (f.historicoDeConversas ? f.historicoDeConversas(agente.id) : Promise.resolve([] as ResumoDeConversa[])),
    [agente.id, idSalvo, respondendo, versaoDoNome],
  )
  const resumo = idSalvo ? lista?.find((conversa) => conversa.id === idSalvo) : undefined
  const primeiro = slack ? undefined : itens.find((item) => item.tipo === 'usuario')
  const titulo = resumo
    ? nomeDaConversa(resumo)
    : primeiro?.tipo === 'usuario'
      ? tituloAutomatico(primeiro.texto)
      : ''
  const vazia = !slack && itens.length === 0 && !pedida && !atual

  useEffect(() => {
    if (slack) return
    if (!pedida || !fonte.abrirConversaDoAgente || fonte.conversaDoAgenteAtual?.(agente.id) === pedida) return
    abrirDoAgente(agente.id, pedida).catch((falha) => setErro(mensagemDeErro(falha)))
  }, [pedida, slack, agente.id, fonte, abrirDoAgente])

  // Depois do primeiro pedido de uma Conversa nova, o endereço passa a apontar para ela.
  useEffect(() => {
    if (slack || respondendo || !atual || atual === pedida) return
    setParametros((anteriores) => {
      const proximos = new URLSearchParams(anteriores)
      proximos.set('conversa', atual)
      return proximos
    }, { replace: true })
  }, [respondendo, atual, pedida, slack, setParametros])

  useEffect(() => {
    if (!comHistorico) return
    function noTeclado(evento: KeyboardEvent) {
      if (!(evento.ctrlKey || evento.metaKey) || !evento.shiftKey || evento.code !== 'KeyH') return
      if (emCampoDeTexto(evento.target)) return
      evento.preventDefault()
      setHistoricoAberto(true)
    }
    window.addEventListener('keydown', noTeclado)
    return () => window.removeEventListener('keydown', noTeclado)
  }, [comHistorico])

  function escolher(conversa: ResumoDeConversa) {
    setErro('')
    setParametros((anteriores) => {
      const proximos = new URLSearchParams(anteriores)
      if (conversa.doSlack) {
        proximos.delete('conversa')
        proximos.set('slack', conversa.id)
      } else {
        proximos.delete('slack')
        proximos.set('conversa', conversa.id)
      }
      return proximos
    })
  }

  function nova() {
    setErro('')
    setHistoricoAberto(false)
    conversas.novaDoAgente(agente.id)
    setParametros((anteriores) => {
      const proximos = new URLSearchParams(anteriores)
      proximos.delete('conversa')
      proximos.delete('slack')
      return proximos
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col">
      <BarraDaConversa
        idSalvo={idSalvo}
        titulo={titulo}
        nomeInicial={resumo?.titulo ?? ''}
        podeRenomear={!somenteLeitura && Boolean(idSalvo && fonte.renomearConversa)}
        aoRenomear={async (nome) => {
          if (!idSalvo) return
          await fonte.renomearConversa?.(idSalvo, nome)
          setVersaoDoNome((n) => n + 1)
        }}
        comHistorico={comHistorico}
        historicoAberto={historicoAberto}
        aoAbrirHistorico={() => setHistoricoAberto(true)}
        mostrarNova={!somenteLeitura && (!vazia || !comHistorico)}
        aoNova={nova}
      />
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {slack ? (
        <LeituraDoSlack key={slack} agente={agente} id={slack} />
      ) : (
        <ConversaComOAgente agente={agente} />
      )}
      <GavetaDeHistorico
        aberto={historicoAberto}
        aoMudar={setHistoricoAberto}
        agenteId={agente.id}
        nome={agente.nome}
        atual={slack ?? atual}
        aoAbrir={escolher}
        versao={`${respondendo}-${atual ?? ''}-${slack ?? ''}-${versaoDoNome}`}
      />
    </div>
  )
}

/** O nome da Conversa aberta. A chave é o id, para a edição recomeçar sem mexer no restante da faixa. */
function TituloDaConversa({
  titulo,
  nomeInicial,
  podeRenomear,
  aoRenomear,
  aoFalhar,
}: {
  titulo: string
  nomeInicial: string
  podeRenomear: boolean
  aoRenomear(nome: string): Promise<void>
  aoFalhar(mensagem: string): void
}) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const semTitulo = !titulo

  function cancelarNoEscape(evento: ReactKeyboardEvent) {
    if (evento.key !== 'Escape') return
    evento.preventDefault()
    evento.stopPropagation()
    setEditando(false)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    aoFalhar('')
    try {
      await aoRenomear(nome)
      setEditando(false)
    } catch (falha) {
      aoFalhar(mensagemDeErro(falha))
    }
  }

  if (editando) {
    return (
      <form onSubmit={(evento) => void salvar(evento)} onKeyDown={cancelarNoEscape} className="flex min-w-0 flex-1 items-center gap-1">
        <input
          aria-label="Novo nome da Conversa"
          value={nome}
          maxLength={80}
          placeholder={titulo}
          autoFocus
          onChange={(evento) => setNome(evento.target.value)}
          className="min-w-0 flex-1 rounded-[10px] border border-al-line bg-transparent px-2 py-1 text-sm"
        />
        <button type="submit" aria-label="Salvar o nome" className={BOTAO_DISCRETO}>
          <Check strokeWidth={1.8} className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Cancelar" onClick={() => setEditando(false)} className={BOTAO_DISCRETO}>
          <X strokeWidth={1.8} className="size-4" aria-hidden />
        </button>
      </form>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span className={cn('min-w-0 truncate text-sm', semTitulo ? 'text-al-muted' : 'text-al-ink')}>
        {semTitulo ? 'Nova conversa' : titulo}
      </span>
      {podeRenomear && (
        <button
          type="button"
          aria-label="Renomear conversa"
          onClick={() => {
            setNome(nomeInicial)
            aoFalhar('')
            setEditando(true)
          }}
          className={cn(BOTAO_DISCRETO, 'size-7 justify-center px-0')}
        >
          <Pencil strokeWidth={1.8} className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** A faixa de 52px: o título da Conversa aberta, o histórico e uma Conversa nova. */
function BarraDaConversa({
  idSalvo,
  titulo,
  nomeInicial,
  podeRenomear,
  aoRenomear,
  comHistorico,
  historicoAberto,
  aoAbrirHistorico,
  mostrarNova,
  aoNova,
}: {
  /** Trocar de Conversa recomeça a edição sem remontar os botões da faixa. */
  idSalvo: string | null
  titulo: string
  /** O nome já gravado, vazio enquanto vale o primeiro pedido. */
  nomeInicial: string
  podeRenomear: boolean
  aoRenomear(nome: string): Promise<void>
  comHistorico: boolean
  historicoAberto: boolean
  aoAbrirHistorico(): void
  mostrarNova: boolean
  aoNova(): void
}) {
  const [erro, setErro] = useState('')

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex h-[52px] items-center justify-between gap-3 border-b border-al-divisor">
        <TituloDaConversa
          key={idSalvo ?? 'nova'}
          titulo={titulo}
          nomeInicial={nomeInicial}
          podeRenomear={podeRenomear}
          aoRenomear={aoRenomear}
          aoFalhar={setErro}
        />
        <div className="flex shrink-0 items-center gap-2">
          {comHistorico && (
            <Button
              variant="outline"
              aria-haspopup="dialog"
              aria-expanded={historicoAberto}
              onClick={aoAbrirHistorico}
              className="rounded-full px-3"
            >
              <History strokeWidth={1.8} aria-hidden />
              Histórico
            </Button>
          )}
          {mostrarNova && (
            <Button variant="outline" onClick={aoNova} className="rounded-full px-3">
              <Plus strokeWidth={1.8} aria-hidden />
              Nova conversa
            </Button>
          )}
        </div>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}

/**
 * Uma Conversa que nasceu no Slack (slack-canal 06, Q15): os passos como em qualquer Conversa, só para leitura, porque
 * responder continua sendo pelo thread. A Conversa da Althius com o Agente fica onde estava.
 */
function LeituraDoSlack({ agente, id }: { agente: Agente; id: string }) {
  const fonte = useFonte()
  const agentes = useDados((f) => f.agentes(), []) ?? []
  const agentesPorId = porId(agentes)
  const [itens, setItens] = useState<ItemDaConversa[]>([])
  const [respondendo, setRespondendo] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    let proximo = 1
    const abrir = fonte.abrirConversaDoSlack
      ? fonte.abrirConversaDoSlack(id)
      : Promise.reject(new Error('Esta Conversa não está disponível aqui.'))
    abrir.then(
      async (conversa) => {
        if (!ativo) return
        if (conversa.agenteId !== agente.id) {
          setErro('Esta Conversa do Slack é de outro Agente.')
          return
        }
        setItens(
          conversa.turnos.flatMap((turno): ItemDaConversa[] => [
            { id: proximo++, tipo: 'usuario', texto: turno.pedido },
            ...turno.passos.map((passo) => ({ id: proximo++, ...passo })),
          ]),
        )
        if (!conversa.emAndamento) return
        setRespondendo(true)
        try {
          for await (const passo of conversa.emAndamento) {
            if (!ativo) return
            setItens((atuais) => [...atuais, { id: proximo++, ...passo }])
          }
        } finally {
          if (ativo) setRespondendo(false)
        }
      },
      (falha) => {
        if (ativo) setErro(mensagemDeErro(falha))
      },
    )
    return () => {
      ativo = false
    }
  }, [fonte, id, agente.id])

  return (
    <section aria-labelledby="titulo-conversa" className="flex w-full flex-col gap-6">
      <h2 id="titulo-conversa" className="sr-only">
        Conversa do Slack
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MarcaDoSlack />
        <Link to={`/agentes/${agente.id}/conversa`} className="text-sm underline underline-offset-4">
          Voltar à Conversa na Althius
        </Link>
      </div>

      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

      <div aria-live="polite" className="flex flex-col gap-6">
        {itens.map((item) => (
          <Item key={item.id} item={item} agentes={agentesPorId} animar={false} />
        ))}
        {respondendo && (
          <div role="status" className="flex items-center gap-4 text-al-muted">
            <span className="relative size-5">
              <Pulso className="absolute inset-0" />
            </span>
            <span className="rotulo">{agente.nome} está respondendo no Slack</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="composer flex-row items-center gap-2 p-1.5 pl-2 opacity-60">
          <label htmlFor="mensagem-do-slack" className="sr-only">
            {`Mensagem para ${agente.nome}`}
          </label>
          <input
            id="mensagem-do-slack"
            aria-describedby="conversa-continua-no-slack"
            disabled
            placeholder="Responda pelo thread do Slack."
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-[0.9375rem] placeholder:text-al-ink-3"
          />
          <Button type="button" disabled className="h-10 gap-1.5 rounded-full pr-3 pl-4 tracking-[0.04em]">
            Enviar
            <ArrowUp strokeWidth={1.8} className="size-4" aria-hidden />
          </Button>
        </div>
        <p id="conversa-continua-no-slack" className="text-sm text-al-muted">
          Esta Conversa continua no Slack
        </p>
      </div>
    </section>
  )
}

function ConversaComOAgente({ agente }: { agente: Agente }) {
  const somenteLeitura = useSomenteLeituraDoAgente()
  const fonteDaConversa = useFonte()
  const conversas = useConversas()
  const agentes = useDados((fonte) => fonte.agentes(), []) ?? []
  const itens = conversas.itens(agente.id)
  const respondendo = conversas.respondendo(agente.id)
  const fim = useRef<HTMLDivElement>(null)
  const agentesPorId = porId(agentes)
  // No Workspace operacional, as sugestões vêm dos dados do Workspace; na Demonstração, as frases da Especialidade.
  const doWorkspace = useDados(
    (fonte) => (fonte.sugestoesDoAgente ? fonte.sugestoesDoAgente(agente.id) : Promise.resolve(null)),
    [agente.id, respondendo],
  )
  const sugestoes = fonteDaConversa.sugestoesDoAgente ? (doWorkspace ?? []) : agente.especialidade.sugestoes

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [itens.length])

  const vazia = itens.length === 0

  return (
    <section aria-labelledby="titulo-conversa" className="flex w-full flex-col gap-6">
      <h2 id="titulo-conversa" className="sr-only">
        Conversa
      </h2>

      <div aria-live="polite" className="flex flex-col gap-6">
        {vazia && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
            <IconeAgente especialidade={agente.especialidade.id} tamanho="lg" />
            <p className="anotacao text-lg">{somenteLeitura ? 'Histórico da conversa' : 'comece por uma sugestão'}</p>
          </div>
        )}
        {itens.map((item) => (
          <Item key={item.id} item={item} agentes={agentesPorId} animar={conversas.animarDigitacao} />
        ))}
        {respondendo && (
          <div role="status" className="flex items-center gap-4 text-al-muted">
            <span className="relative size-5">
              <Pulso className="absolute inset-0" />
            </span>
            <span className="rotulo">{quemEstaRespondendo(itens, agente, agentes).nome} está respondendo</span>
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 bg-al-bg pb-6">
        {vazia && (
          <div className="flex flex-wrap justify-center gap-2">
            {!somenteLeitura && sugestoes.map((sugestao) => (
              <Button
                key={sugestao.id}
                variant="outline"
                disabled={respondendo}
                onClick={() => conversas.enviar(agente.id, { texto: sugestao.texto, sugestaoId: sugestao.id })}
                className="h-auto rounded-full px-4 py-2 font-light whitespace-normal"
              >
                {sugestao.texto}
              </Button>
            ))}
          </div>
        )}

        {!somenteLeitura && (
          <Composer
            nome={`Conversa com ${agente.nome}`}
            rotulo={`Mensagem para ${agente.nome}`}
            placeholder={`Peça algo a ${agente.nome}.`}
            ocupado={respondendo}
            aoEnviar={(mensagem, anexos) =>
              conversas.enviar(agente.id, { texto: mensagem, ...(anexos.length ? { anexos } : {}) })}
            aoParar={conversas.parar ? () => conversas.parar?.(agente.id) : undefined}
          />
        )}
      </div>
    </section>
  )
}

function Item({ item, agentes, animar }: { item: ItemDaConversa; agentes: Record<AgenteId, Agente>; animar: boolean }) {
  const somenteLeitura = useSomenteLeituraDoAgente()
  const nome = (id: AgenteId) => agentes[id]?.nome
  switch (item.tipo) {
    case 'usuario':
      return (
        <div className="flex flex-col items-end gap-2 self-end">
          <p className="max-w-[78%] self-end rounded-[18px] rounded-br-md bg-al-surface px-4 py-2.5">{item.texto}</p>
          <AnexosDaMensagem anexos={item.anexos} />
        </div>
      )
    case 'ferramenta':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-al-muted">
            <Wrench strokeWidth={1.8} className="size-4" aria-hidden />
            {item.descricao}
            <LinkDoPasso link={item.link} />
          </p>
          {!somenteLeitura && <AprovacaoDoPasso link={item.link} />}
        </div>
      )
    case 'texto':
      return (
        <div className="flex gap-4">
          {agentes[item.agenteId] && <IconeAgente especialidade={agentes[item.agenteId].especialidade.id} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="rotulo">{nome(item.agenteId)}</span>
              <BotaoCopiar texto={item.texto} />
            </div>
            <TextoDigitado texto={item.texto} animar={animar} />
          </div>
        </div>
      )
    case 'repasse':
      return (
        <article
          role="note"
          aria-label={`Repasse de ${nome(item.de)} para ${nome(item.para)}`}
          className="cartao flex flex-col gap-3 border border-al-line p-4"
        >
          <div className="flex items-center gap-3">
            <span className="rotulo text-al-ink">{nome(item.de)}</span>
            <ArrowRight strokeWidth={1.8} className="size-4 text-al-accent-2" aria-hidden />
            <span className="rotulo text-al-ink">{nome(item.para)}</span>
          </div>
          <p>{item.resumo}</p>
        </article>
      )
    case 'falha':
      return (
        <p role="alert" className="text-sm text-al-atencao">
          {item.motivo}
        </p>
      )
    case 'aprovacao':
      return (
        <AprovacaoNaConversa
          aprovacaoId={item.aprovacaoId}
          somenteLeitura={somenteLeitura}
          cabecalho={(aprovacao, rotuloDoEstado) => (
            <CabecalhoDaAprovacao aprovacao={aprovacao} rotulo={rotuloDoEstado} />
          )}
          className="cartao gap-4 border border-al-line p-6"
        />
      )
  }
}

function CabecalhoDaAprovacao({ aprovacao, rotulo }: { aprovacao: AprovacaoDeAcao; rotulo: string }) {
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const nome = nomeDaIntegracao(
    aprovacao.integracaoId,
    integracoes?.find((i) => i.id === aprovacao.integracaoId)?.nome,
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LogoDaIntegracao id={aprovacao.integracaoId} nome={nome} />
      <span className="rotulo">{nome}</span>
      <span className="rotulo text-al-accent">{rotulo}</span>
    </div>
  )
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sem acesso à área de transferência: nada a fazer na demo.
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={copiar} aria-label={copiado ? 'Copiado' : 'Copiar resposta'}>
      {copiado ? <Check strokeWidth={1.8} aria-hidden /> : <Copy strokeWidth={1.8} aria-hidden />}
    </Button>
  )
}
