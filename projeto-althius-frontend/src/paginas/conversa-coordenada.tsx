import { ChevronRight, Wrench } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { LogoDaIntegracao } from '@/components/logos'
import { IconeAgente, IndicadorDeEstado, Pulso } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { useConversas, type ItemDaCoordenacao } from '@/conversa/contexto'
import { TextoDigitado } from '@/conversa/texto'
import { useDados } from '@/fonte/contexto'
import { ROTULO_DA_DECISAO } from '@/fonte/regras'
import type { AcaoProposta, Agente, AgenteId, Integracao } from '@/fonte/tipos'

/** Cada Agente chamado é uma etapa: ativa enquanto não diz o que fez. */
interface Etapa {
  agenteId: AgenteId
  consultas: string[]
  resumo?: string
}

type Desfecho = Extract<ItemDaCoordenacao, { tipo: 'aprovacao' | 'acao' }>

/** Um pedido do fio e o que a Coordenação fez com ele. */
interface Turno {
  pedido: Extract<ItemDaCoordenacao, { tipo: 'pedido' }>
  etapas: Etapa[]
  resposta?: string
  desfechos: Desfecho[]
}

function emTurnos(itens: ItemDaCoordenacao[]): Turno[] {
  const turnos: Turno[] = []
  for (const item of itens) {
    if (item.tipo === 'pedido') {
      turnos.push({ pedido: item, etapas: [], desfechos: [] })
      continue
    }
    const turno = turnos.at(-1)
    if (!turno) continue
    const etapa = 'agenteId' in item ? turno.etapas.findLast((e) => e.agenteId === item.agenteId) : undefined
    switch (item.tipo) {
      case 'chamada':
        turno.etapas.push({ agenteId: item.agenteId, consultas: [] })
        break
      case 'ferramenta':
        etapa?.consultas.push(item.descricao)
        break
      case 'feito':
        if (etapa) etapa.resumo = item.resumo
        break
      case 'resposta':
        turno.resposta = item.texto
        break
      default:
        turno.desfechos.push(item)
    }
  }
  return turnos
}

/** A página da Conversa coordenada: o fio do composer, que vale até recarregar a página. */
export function PaginaConversaCoordenada() {
  const conversas = useConversas()
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const { itens, respondendo } = conversas.coordenada
  const fio = useRef<HTMLDivElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  useSeguirOFim(fio, fim)

  if (itens.length === 0) return <Navigate to="/" replace />

  const turnos = emTurnos(itens)
  const referencias: Referencias = {
    agentes: Object.fromEntries((agentes ?? []).map((a) => [a.id, a])),
    integracoes: integracoes ?? [],
  }

  return (
    <Pagina
      titulo="Conversa"
      voltar={{ para: '/', rotulo: 'Agentes' }}
      acoes={
        <Link
          to="/"
          className="inline-flex h-8 items-center border border-al-line px-4 text-xs font-normal tracking-rotulo uppercase hover:border-al-ink"
        >
          Voltar para a grade
        </Link>
      }
      className="flex-1"
    >
      <div className="mx-auto flex w-full max-w-180 flex-1 flex-col">
        <div ref={fio} aria-live="polite" className="flex flex-1 flex-col gap-10 pb-10">
          {turnos.map((turno, i) => {
            const emAndamento = respondendo && i === turnos.length - 1
            return (
              <TurnoDaConversa
                key={turno.pedido.id}
                turno={turno}
                emAndamento={emAndamento}
                animar={conversas.animarDigitacao && emAndamento}
                referencias={referencias}
              />
            )
          })}
        </div>
        <div ref={fim} />
      </div>
    </Pagina>
  )
}

/**
 * Enquanto o usuário está no fim da página, acompanha o fio que cresce (etapas, digitação, a
 * Aprovação que carrega depois); se ele rolar para cima, deixa a página onde está.
 */
function useSeguirOFim(conteudo: RefObject<HTMLElement | null>, fim: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const elemento = conteudo.current
    if (!elemento) return
    let noFim = true
    const aoRolar = () => {
      noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80
    }
    const observador = new ResizeObserver(() => {
      if (noFim) fim.current?.scrollIntoView({ block: 'end' })
    })
    observador.observe(elemento)
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      observador.disconnect()
      window.removeEventListener('scroll', aoRolar)
    }
  }, [conteudo, fim])
}

interface Referencias {
  agentes: Record<AgenteId, Agente>
  integracoes: Integracao[]
}

function TurnoDaConversa({
  turno,
  emAndamento,
  animar,
  referencias,
}: {
  turno: Turno
  emAndamento: boolean
  animar: boolean
  referencias: Referencias
}) {
  const { etapas, resposta, desfechos } = turno
  const etapaAtiva = etapas.some((etapa) => etapa.resumo === undefined)
  const chamados = `${etapas.length} ${etapas.length === 1 ? 'agente chamado' : 'agentes chamados'}`

  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-4/5 self-end border border-al-line bg-al-surface px-4 py-2">{turno.pedido.texto}</p>

      {etapas.length > 0 && (
        <section aria-label="Coordenação" className="flex flex-col gap-3.5">
          <span className="rotulo">Coordenação · {chamados}</span>
          <ol aria-label="Agentes chamados" className="flex flex-col">
            {etapas.map((etapa, i) => (
              <EtapaDoAgente
                key={`${etapa.agenteId}-${i}`}
                etapa={etapa}
                agente={referencias.agentes[etapa.agenteId]}
                ultima={i === etapas.length - 1}
              />
            ))}
          </ol>
        </section>
      )}

      {emAndamento && !etapaAtiva && resposta === undefined && (
        <div role="status" className="flex items-center gap-4 text-al-muted">
          <span className="relative size-5">
            <Pulso className="absolute inset-0" />
          </span>
          <span className="rotulo">Trabalhando</span>
        </div>
      )}

      {resposta !== undefined && (
        <section aria-label={etapas.length > 0 ? 'Resposta consolidada' : 'Resposta direta'} className="flex flex-col gap-2.5">
          <span className="rotulo">
            {etapas.length > 0 ? 'Resposta consolidada' : 'Resposta direta · nenhum agente chamado'}
          </span>
          <TextoDigitado texto={resposta} animar={animar} />
        </section>
      )}

      {desfechos.map((desfecho) =>
        desfecho.tipo === 'aprovacao' ? (
          <AprovacaoNaConversa key={desfecho.id} aprovacaoId={desfecho.aprovacaoId} referencias={referencias} />
        ) : (
          <AcaoSemAprovacao key={desfecho.id} {...desfecho} referencias={referencias} />
        ),
      )}
    </div>
  )
}

function EtapaDoAgente({ etapa, agente, ultima }: { etapa: Etapa; agente?: Agente; ultima: boolean }) {
  const ativa = etapa.resumo === undefined
  const nome = agente?.nome ?? etapa.agenteId
  const consultas = (
    <ul className="flex flex-col gap-0.5 text-sm text-al-muted">
      {etapa.consultas.map((consulta, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <Wrench strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
          {consulta}
        </li>
      ))}
    </ul>
  )

  return (
    <li aria-label={nome} className="relative grid grid-cols-[1.75rem_1fr] gap-x-3.5 pb-4.5 last:pb-0">
      {!ultima && <span className="absolute top-8.5 bottom-1.5 left-3.5 border-l border-al-line" aria-hidden />}
      {agente ? <IconeAgente especialidade={agente.especialidade.id} /> : <span />}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-h-7 items-center gap-2">
          <span className="font-normal">{nome}</span>
          <span className="rotulo">{agente?.especialidade.rotulo}</span>
          {ativa && (
            <span className="ml-1 inline-flex items-center gap-2">
              <IndicadorDeEstado estado="trabalhando" />
              <span className="rotulo">Trabalhando</span>
            </span>
          )}
        </div>
        {ativa ? (
          consultas
        ) : (
          <>
            <p>{etapa.resumo}</p>
            {etapa.consultas.length > 0 && (
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-al-muted hover:text-al-ink [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    strokeWidth={1.8}
                    className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  <span>
                    {etapa.consultas.length} {etapa.consultas.length === 1 ? 'consulta' : 'consultas'}
                  </span>
                </summary>
                <div className="mt-1 pl-4.5">{consultas}</div>
              </details>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/** A linha discreta de quem age e onde: o Agente, o logo e o nome da Integração e o estado. */
function QuemAgeOnde({
  agenteId,
  integracaoId,
  estado,
  referencias,
}: {
  agenteId: AgenteId
  integracaoId: AcaoProposta['integracaoId']
  estado: string
  referencias: Referencias
}) {
  const agente = referencias.agentes[agenteId]
  const integracao = referencias.integracoes.find((i) => i.id === integracaoId)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-al-muted">
      {agente && <IconeAgente especialidade={agente.especialidade.id} tamanho="sm" />}
      <span>{agente?.nome}</span>
      <span className="text-al-line" aria-hidden>
        ·
      </span>
      <LogoDaIntegracao id={integracaoId} nome={integracao?.nome ?? integracaoId} />
      <span>{integracao?.nome}</span>
      <span className="text-al-line" aria-hidden>
        ·
      </span>
      <span className="rotulo">{estado}</span>
    </div>
  )
}

/** A Aprovação como o próximo item da conversa, sem cartão nem linha de alerta. */
function AprovacaoNaConversa({ aprovacaoId, referencias }: { aprovacaoId: string; referencias: Referencias }) {
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const aprovacao = aprovacoes?.find((a) => a.id === aprovacaoId)
  if (!aprovacao) return null

  const estado = aprovacao.estado === 'pendente' ? 'Aprovação pendente' : ROTULO_DA_DECISAO[aprovacao.estado]
  return (
    <article aria-label={`${estado}: ${aprovacao.acao}`} className="flex flex-col gap-1.5">
      <QuemAgeOnde agenteId={aprovacao.agenteId} integracaoId={aprovacao.integracaoId} estado={estado} referencias={referencias} />
      <p className="text-lg leading-snug font-normal">{aprovacao.acao}</p>
      <p className="text-sm text-al-muted">{aprovacao.impacto}</p>
      {aprovacao.estado === 'pendente' && (
        <div className="pt-1.5">
          <DecisaoDeAprovacao aprovacao={aprovacao} onde="althius" />
        </div>
      )}
    </article>
  )
}

/** Sem Aprovação: com Executar, o Agente agiu sozinho; com Ler, ele não pôde agir. */
function AcaoSemAprovacao({
  agenteId,
  acao,
  executada,
  referencias,
}: {
  agenteId: AgenteId
  acao: AcaoProposta
  executada: boolean
  referencias: Referencias
}) {
  const estado = executada ? 'Executada' : 'Sem Permissão para agir'
  return (
    <div role="note" aria-label={`${estado}: ${acao.acao}`} className="flex flex-col gap-1.5">
      <QuemAgeOnde agenteId={agenteId} integracaoId={acao.integracaoId} estado={estado} referencias={referencias} />
      <p className="text-lg leading-snug font-normal">{acao.acao}</p>
      <p className="text-sm text-al-muted">
        {executada
          ? 'Feito sem Aprovação: a Permissão nesta Integração é Executar.'
          : 'Sem Permissão para escrever nesta Integração: nada foi alterado.'}
      </p>
    </div>
  )
}
