import { ArrowRight, ArrowUp, Check, Copy, PanelLeftClose, PanelLeftOpen, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { IconeAgente, Pulso } from '@/components/marca'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Button } from '@/components/ui/button'
import { useConversas, type ItemDaConversa } from '@/conversa/contexto'
import { HistoricoDeConversas } from '@/conversa/historico'
import { LinkDoPasso } from '@/conversa/link-do-passo'
import { ListaDeMencoes, useMencao } from '@/conversa/mencao'
import { TextoDigitado } from '@/conversa/texto'
import { quemEstaRespondendo } from '@/conversa/vez'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import type { Agente, AgenteId, AprovacaoDeAcao } from '@/fonte/tipos'
import { mensagemDeErro, porId } from '@/lib/utils'
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { AprovacaoDoPasso } from '@/paginas/aprovacao-do-passo'

export function SecaoConversa({ agente }: { agente: Agente }) {
  const { disponivel } = useAmbiente()
  // Perguntar algo a um Agente é executá-lo: sem provedor de modelo, a tela diz que não dá, sem sugestão nem composer.
  if (!disponivel('conversas')) {
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

/**
 * A Conversa com o Agente e, no Workspace operacional, o histórico dele ao lado, que dá para recolher. A Conversa
 * aberta fica no endereço (?conversa=<id>), para voltar a ela pelo link.
 */
function ConversaComHistorico({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const conversas = useConversas()
  const [parametros, setParametros] = useSearchParams()
  const [aberto, setAberto] = useState(true)
  const [erro, setErro] = useState('')
  const pedida = parametros.get('conversa')
  const respondendo = conversas.respondendo(agente.id)
  const atual = fonte.conversaDoAgenteAtual?.(agente.id) ?? null
  const abrirDoAgente = conversas.abrirDoAgente

  useEffect(() => {
    if (!pedida || !fonte.abrirConversaDoAgente || fonte.conversaDoAgenteAtual?.(agente.id) === pedida) return
    abrirDoAgente(agente.id, pedida).catch((falha) => setErro(mensagemDeErro(falha)))
  }, [pedida, agente.id, fonte, abrirDoAgente])

  // Depois do primeiro pedido de uma Conversa nova, o endereço passa a apontar para ela.
  useEffect(() => {
    if (!respondendo && atual && atual !== pedida) {
      setParametros((anteriores) => {
        const proximos = new URLSearchParams(anteriores)
        proximos.set('conversa', atual)
        return proximos
      }, { replace: true })
    }
  }, [respondendo, atual, pedida, setParametros])

  if (!fonte.historicoDeConversas) return <ConversaComOAgente agente={agente} />

  function escolher(id: string) {
    setErro('')
    setParametros((anteriores) => {
      const proximos = new URLSearchParams(anteriores)
      proximos.set('conversa', id)
      return proximos
    })
  }

  function nova() {
    setErro('')
    conversas.novaDoAgente(agente.id)
    setParametros((anteriores) => {
      const proximos = new URLSearchParams(anteriores)
      proximos.delete('conversa')
      return proximos
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className={aberto ? 'flex w-full shrink-0 flex-col gap-3 lg:w-72' : 'flex shrink-0 flex-col'}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAberto((valor) => !valor)}
          aria-expanded={aberto}
          aria-label={aberto ? 'Recolher o histórico' : 'Mostrar o histórico'}
          className="self-start"
        >
          {aberto ? <PanelLeftClose strokeWidth={1.8} aria-hidden /> : <PanelLeftOpen strokeWidth={1.8} aria-hidden />}
        </Button>
        {aberto && (
          <HistoricoDeConversas
            agenteId={agente.id}
            atual={atual}
            aoAbrir={escolher}
            aoNova={nova}
            versao={`${respondendo}-${atual}`}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {erro && (
          <p role="alert" className="text-sm text-al-atencao">
            {erro}
          </p>
        )}
        <ConversaComOAgente agente={agente} />
      </div>
    </div>
  )
}

function ConversaComOAgente({ agente }: { agente: Agente }) {
  const fonteDaConversa = useFonte()
  const conversas = useConversas()
  const agentes = useDados((fonte) => fonte.agentes(), []) ?? []
  const itens = conversas.itens(agente.id)
  const respondendo = conversas.respondendo(agente.id)
  const [texto, setTexto] = useState('')
  const mencao = useMencao(texto, setTexto, agentes)
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

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const mensagem = texto.trim()
    if (!mensagem || respondendo) return
    conversas.enviar(agente.id, { texto: mensagem })
    setTexto('')
  }

  return (
    <section aria-labelledby="titulo-conversa" className="flex max-w-3xl flex-col gap-6">
      <h2 id="titulo-conversa" className="sr-only">
        Conversa
      </h2>

      <div aria-live="polite" className="flex flex-col gap-6">
        {itens.length === 0 && (
          <p className="anotacao text-lg">comece por uma sugestão, ou mencione outro agente com @</p>
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

      <div className="flex flex-wrap gap-2">
        {sugestoes.map((sugestao) => (
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

      <form
        onSubmit={enviar}
        className="composer relative flex-row items-center gap-2 p-1.5 pl-2 shadow-(--al-sombra-cartao) focus-within:border-al-line-forte has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-al-accent"
      >
        {mencao.aberta && (
          <ListaDeMencoes
            id="conversa-mencoes"
            opcoes={mencao.opcoes}
            indice={mencao.indice}
            aoSelecionar={mencao.selecionar}
            className="absolute bottom-full left-0 mb-2 w-96"
          />
        )}
        <input
          aria-label={`Mensagem para ${agente.nome}`}
          aria-controls={mencao.aberta ? 'conversa-mencoes' : undefined}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => mencao.aoTeclar(evento)}
          placeholder={`Peça algo a ${agente.nome}. Use @ para chamar outro agente.`}
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-[0.9375rem] placeholder:text-al-ink-3 focus-visible:outline-none"
        />
        <Button
          type="submit"
          disabled={respondendo || !texto.trim()}
          className="h-10 gap-1.5 rounded-full pr-3 pl-4 tracking-[0.04em]"
        >
          Enviar
          <ArrowUp strokeWidth={1.8} className="size-4" aria-hidden />
        </Button>
      </form>
    </section>
  )
}

function Item({ item, agentes, animar }: { item: ItemDaConversa; agentes: Record<AgenteId, Agente>; animar: boolean }) {
  const nome = (id: AgenteId) => agentes[id]?.nome
  switch (item.tipo) {
    case 'usuario':
      return <p className="self-end bg-al-surface px-4 py-2">{item.texto}</p>
    case 'ferramenta':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-al-muted">
            <Wrench strokeWidth={1.8} className="size-4" aria-hidden />
            {item.descricao}
            <LinkDoPasso link={item.link} />
          </p>
          <AprovacaoDoPasso link={item.link} />
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
