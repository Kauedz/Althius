import { ArrowRight, ArrowUpRight, PanelLeftClose, PanelLeftOpen, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { IconeAgente } from '@/components/marca'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Button } from '@/components/ui/button'
import { AnexosDaMensagem } from '@/conversa/anexos-da-mensagem'
import { BolhaDoUsuario, BotaoCopiar, COLUNA_DO_CHAT, FalaDeAgente, IndicadorDeResposta, RodapeDoChat } from '@/conversa/chat'
import { Composer } from '@/conversa/composer'
import { useConversas, type ItemDaConversa } from '@/conversa/contexto'
import { HistoricoDeConversas } from '@/conversa/historico'
import { LinkDoPasso } from '@/conversa/link-do-passo'
import { TextoDigitado } from '@/conversa/texto'
import { quemEstaRespondendo } from '@/conversa/vez'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import type { Agente, AgenteId, AprovacaoDeAcao } from '@/fonte/tipos'
import { cn, mensagemDeErro, porId } from '@/lib/utils'
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
  // Em tela estreita o histórico começa recolhido, para a Conversa não ficar embaixo de uma lista longa.
  const [aberto, setAberto] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1024px)').matches)
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
      <div
        className={cn(
          'flex shrink-0 flex-col gap-3',
          // A coluna do histórico acompanha a rolagem e rola por dentro, para a Conversa ficar no centro da página.
          aberto ? 'w-full lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:w-72 lg:self-start lg:overflow-y-auto lg:pr-1' : 'lg:self-start',
        )}
      >
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
          <p role="alert" className={cn(COLUNA_DO_CHAT, 'text-sm text-al-atencao')}>
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
  const botoesDeSugestao = (cartoes: boolean) =>
    sugestoes.map((sugestao) => (
      <button
        key={sugestao.id}
        type="button"
        disabled={respondendo}
        onClick={() => conversas.enviar(agente.id, { texto: sugestao.texto, sugestaoId: sugestao.id })}
        className={
          cartoes
            ? 'rounded-2xl group/sugestao flex items-start justify-between gap-3 border border-al-line bg-al-surface px-4 py-3 text-left text-sm leading-snug shadow-(--al-sombra-cartao) transition-colors hover:border-al-ink-muted disabled:pointer-events-none disabled:opacity-50'
            : 'rounded-full border border-al-line bg-al-surface px-3.5 py-1.5 text-left text-sm font-light transition-colors hover:border-al-ink-muted disabled:pointer-events-none disabled:opacity-50'
        }
      >
        {sugestao.texto}
        {cartoes && (
          <ArrowUpRight
            strokeWidth={1.8}
            className="mt-0.5 size-4 shrink-0 text-al-muted transition-colors group-hover/sugestao:text-al-accent"
            aria-hidden
          />
        )}
      </button>
    ))

  return (
    <section
      aria-labelledby="titulo-conversa"
      className={cn(COLUNA_DO_CHAT, 'flex flex-1 flex-col gap-6 lg:min-h-[calc(100vh-27rem)]')}
    >
      <h2 id="titulo-conversa" className="sr-only">
        Conversa
      </h2>

      <div aria-live="polite" className={cn('flex flex-1 flex-col gap-8', vazia && 'items-center justify-center py-6')}>
        {vazia && (
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <IconeAgente especialidade={agente.especialidade.id} tamanho="lg" />
            <div className="flex flex-col items-center gap-1.5">
              <p className="titulo-secao text-2xl">Converse com {agente.nome}</p>
              <p className="anotacao text-lg">comece por uma sugestão, ou mencione outro agente com @</p>
            </div>
            {sugestoes.length > 0 && <div className="grid w-full gap-2.5 sm:grid-cols-2">{botoesDeSugestao(true)}</div>}
          </div>
        )}
        {itens.map((item) => (
          <Item key={item.id} item={item} agentes={agentesPorId} animar={conversas.animarDigitacao} />
        ))}
        {respondendo && (
          <IndicadorDeResposta>{quemEstaRespondendo(itens, agente, agentes).nome} está respondendo</IndicadorDeResposta>
        )}
        <div ref={fim} />
      </div>

      <RodapeDoChat className="flex flex-col gap-3">
        {!vazia && sugestoes.length > 0 && <div className="flex flex-wrap gap-2">{botoesDeSugestao(false)}</div>}
        <Composer
          nome={`Conversa com ${agente.nome}`}
          rotulo={`Mensagem para ${agente.nome}`}
          placeholder={`Peça algo a ${agente.nome}. Use @ para chamar outro agente.`}
          ocupado={respondendo}
          aoEnviar={(mensagem, anexos) =>
            conversas.enviar(agente.id, { texto: mensagem, ...(anexos.length ? { anexos } : {}) })}
          aoParar={conversas.parar ? () => conversas.parar?.(agente.id) : undefined}
        />
      </RodapeDoChat>
    </section>
  )
}

function Item({ item, agentes, animar }: { item: ItemDaConversa; agentes: Record<AgenteId, Agente>; animar: boolean }) {
  const nome = (id: AgenteId) => agentes[id]?.nome
  switch (item.tipo) {
    case 'usuario':
      return (
        <BolhaDoUsuario texto={item.texto}>
          <AnexosDaMensagem anexos={item.anexos} />
        </BolhaDoUsuario>
      )
    case 'ferramenta':
      return (
        <div className="flex flex-col gap-2 pl-[2.625rem]">
          <p className="rounded-full inline-flex w-fit max-w-full flex-wrap items-center gap-2 border border-al-line bg-al-surface px-3 py-1 text-sm text-al-muted">
            <Wrench strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
            {item.descricao}
            <LinkDoPasso link={item.link} />
          </p>
          <AprovacaoDoPasso link={item.link} />
        </div>
      )
    case 'texto':
      return (
        <FalaDeAgente
          especialidade={agentes[item.agenteId]?.especialidade.id}
          nome={nome(item.agenteId)}
          acoes={<BotaoCopiar texto={item.texto} />}
        >
          <TextoDigitado texto={item.texto} animar={animar} />
        </FalaDeAgente>
      )
    case 'repasse':
      return (
        <article
          role="note"
          aria-label={`Repasse de ${nome(item.de)} para ${nome(item.para)}`}
          className="cartao ml-[2.625rem] flex flex-col gap-3 border border-al-line p-4"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {agentes[item.de] && <IconeAgente especialidade={agentes[item.de].especialidade.id} tamanho="sm" />}
            <span className="rotulo text-al-ink">{nome(item.de)}</span>
            <ArrowRight strokeWidth={1.8} className="size-4 text-al-accent-2" aria-hidden />
            {agentes[item.para] && <IconeAgente especialidade={agentes[item.para].especialidade.id} tamanho="sm" />}
            <span className="rotulo text-al-ink">{nome(item.para)}</span>
          </div>
          <p className="leading-relaxed">{item.resumo}</p>
        </article>
      )
    case 'falha':
      return (
        <p role="alert" className="pl-[2.625rem] text-sm text-al-atencao">
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
          className="cartao ml-[2.625rem] gap-4 border border-al-line p-6"
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
