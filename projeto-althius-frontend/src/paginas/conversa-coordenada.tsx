import { ChevronRight, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { LogoDaIntegracao } from '@/components/logos'
import { IconeAgente, IndicadorDeEstado, Pulso } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { AnexosDaMensagem } from '@/conversa/anexos-da-mensagem'
import { Composer } from '@/conversa/composer'
import { LinkDoPasso } from '@/conversa/link-do-passo'
import { useConversas, type ItemDaCoordenacao } from '@/conversa/contexto'
import { TextoDigitado } from '@/conversa/texto'
import { useDados, useFonte } from '@/fonte/contexto'
import type { AcaoProposta, Agente, AgenteId, Integracao, LinkDoPasso as DestinoDoPasso } from '@/fonte/tipos'
import { porId } from '@/lib/utils'
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { AprovacaoDoPasso } from '@/paginas/aprovacao-do-passo'
import { NomeDaConversa } from '@/paginas/nome-da-conversa'
import { NascimentoSequenciaNaConversa } from '@/paginas/nascimento-sequencia-na-conversa'
import { MarcaDoWhatsApp } from '@/conversa/linha-de-conversa'

/** Cada Agente chamado é uma etapa: ativa enquanto não diz o que fez. */
interface Etapa {
  agenteId: AgenteId
  consultas: { descricao: string; link?: DestinoDoPasso }[]
  resumo?: string
  /** O pedido falhou antes de a etapa terminar. */
  interrompida?: boolean
}

type Desfecho = Extract<ItemDaCoordenacao, { tipo: 'aprovacao' | 'acao' | 'nascimento-sequencia' }>

/** Um pedido da Conversa e o que a Coordenação fez com ele. */
interface Turno {
  pedido: Extract<ItemDaCoordenacao, { tipo: 'pedido' }>
  etapas: Etapa[]
  resposta?: string
  /** O motivo, quando o pedido não terminou. */
  falha?: string
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
        etapa?.consultas.push({ descricao: item.descricao, ...(item.link ? { link: item.link } : {}) })
        break
      case 'feito':
        if (etapa) etapa.resumo = item.resumo
        break
      case 'resposta':
        turno.resposta = item.texto
        break
      case 'falha':
        turno.falha = item.motivo
        for (const aberta of turno.etapas) if (aberta.resumo === undefined) aberta.interrompida = true
        break
      default:
        turno.desfechos.push(item)
    }
  }
  return turnos
}

/**
 * A página da Conversa coordenada, que vale até recarregar a página. O composer fixo no rodapé
 * continua a Conversa: cada pedido seguinte aparece abaixo da resposta anterior.
 */
export function PaginaConversaCoordenada() {
  const [parametros] = useSearchParams()
  const whatsapp = parametros.get('whatsapp')
  if (whatsapp) return <LeituraDoWhatsApp key={whatsapp} id={whatsapp} />
  return <ConversaCoordenadaAtiva />
}

function ConversaCoordenadaAtiva() {
  const conversas = useConversas()
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const { itens, respondendo } = conversas.coordenada
  const conteudo = useRef<HTMLDivElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  useSeguirOFim(conteudo, fim)

  // Sem Conversa coordenada, volta ao pedido aos Agentes (a tela inicial antiga, em /agentes até a fatia 3d). Depois
  // de recarregar, a Conversa salva ainda está chegando do banco.
  if (itens.length === 0) return conversas.retomando ? null : <Navigate to="/agentes" replace />

  const turnos = emTurnos(itens)
  const referencias: Referencias = {
    agentes: porId(agentes),
    integracoes: integracoes ?? [],
  }

  return (
    <Pagina
      titulo="Conversa"
      voltar={{ para: '/agentes', rotulo: 'Agentes' }}
      acoes={
        <Link
          to="/agentes"
          className="rounded-md inline-flex h-8 items-center border border-al-line px-4 text-sm font-normal tracking-[0.04em] hover:border-al-ink"
        >
          Voltar para Agentes
        </Link>
      }
      className="flex-1 pb-0"
    >
      <div className="mx-auto flex w-full max-w-180 flex-1 flex-col">
        <NomeDaConversa respondendo={respondendo} />
        <div ref={conteudo} aria-live="polite" className="flex flex-1 flex-col gap-10 pb-10">
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
        <div className="rodape-da-conversa">
          <Composer
            nome="Continuar a Conversa"
            rotulo="Continue a Conversa"
            placeholder="Ex.: agora faz um e-mail pro CFO"
            ocupado={respondendo}
            aoEnviar={(texto, anexos) => conversas.continuar({ texto, ...(anexos.length ? { anexos } : {}) })}
            aoParar={conversas.parar ? () => conversas.parar?.(null) : undefined}
          />
        </div>
        <div ref={fim} />
      </div>
    </Pagina>
  )
}

function LeituraDoWhatsApp({ id }: { id: string }) {
  const fonte = useFonte()
  const agentes = useDados((dados) => dados.agentes(), []) ?? []
  const integracoes = useDados((dados) => dados.integracoes(), []) ?? []
  const [itens, setItens] = useState<ItemDaCoordenacao[]>([])
  const [erro, setErro] = useState('')
  const [respondendo, setRespondendo] = useState(false)

  useEffect(() => {
    let ativo = true
    let proximo = 1
    const abrir = fonte.abrirConversaDoWhatsApp
      ? fonte.abrirConversaDoWhatsApp(id)
      : Promise.reject(new Error('Esta Conversa não está disponível aqui.'))
    abrir.then(async (conversa) => {
      if (!ativo) return
      setItens(conversa.turnos.flatMap((turno): ItemDaCoordenacao[] => [
        { id: proximo++, tipo: 'pedido', texto: turno.pedido },
        ...turno.passos.map((passo) => ({ id: proximo++, ...passo })),
      ]))
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
    }, (falha) => { if (ativo) setErro(falha instanceof Error ? falha.message : 'Não foi possível abrir esta Conversa.') })
    return () => { ativo = false }
  }, [fonte, id])

  const referencias: Referencias = { agentes: porId(agentes), integracoes }
  const turnos = emTurnos(itens)
  return (
    <Pagina titulo="Conversa do WhatsApp" voltar={{ para: '/agentes', rotulo: 'Agentes' }} className="flex-1 pb-0">
      <div className="mx-auto flex w-full max-w-180 flex-1 flex-col gap-6">
        <div className="flex items-center justify-between">
          <MarcaDoWhatsApp />
          <Link to="/agentes" className="text-sm underline underline-offset-4">Voltar para Agentes</Link>
        </div>
        {erro && <p role="alert" className="text-sm text-al-atencao">{erro}</p>}
        <div aria-live="polite" className="flex flex-col gap-10 pb-10">
          {turnos.map((turno, i) => <TurnoDaConversa key={turno.pedido.id} turno={turno} emAndamento={respondendo && i === turnos.length - 1} animar={false} referencias={referencias} />)}
        </div>
        {respondendo && <p role="status" className="rotulo">A Althius está trabalhando no WhatsApp</p>}
        <p className="text-sm text-al-muted">Esta Conversa é somente leitura. Continue pelo WhatsApp.</p>
      </div>
    </Pagina>
  )
}

/**
 * Enquanto o usuário está no fim da página, acompanha a Conversa que cresce (etapas, digitação, a
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
  const { etapas, resposta, falha, desfechos } = turno
  const etapaAtiva = etapas.some((etapa) => etapa.resumo === undefined && !etapa.interrompida)
  const chamados = `${etapas.length} ${etapas.length === 1 ? 'agente chamado' : 'agentes chamados'}`

  return (
    <div className="flex flex-col gap-10">
      <p className="rounded-xl max-w-4/5 self-end border border-al-line bg-al-surface px-4 py-2">{turno.pedido.texto}</p>
      <AnexosDaMensagem anexos={turno.pedido.anexos} className="self-end" />

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

      {emAndamento && !etapaAtiva && resposta === undefined && falha === undefined && (
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

      {falha !== undefined && (
        <p role="alert" className="text-sm text-al-atencao">
          {falha}
        </p>
      )}

      {desfechos.map((desfecho) => {
        if (desfecho.tipo === 'aprovacao') {
          return (
            <AprovacaoNaConversa
              key={desfecho.id}
              aprovacaoId={desfecho.aprovacaoId}
              cabecalho={(aprovacao, rotuloDoEstado) => (
                <QuemAgeOnde
                  agenteId={aprovacao.agenteId}
                  integracaoId={aprovacao.integracaoId}
                  estado={rotuloDoEstado}
                  referencias={referencias}
                />
              )}
              className="gap-1.5"
            />
          )
        }
        if (desfecho.tipo === 'nascimento-sequencia') {
          return (
            <NascimentoSequenciaNaConversa
              key={desfecho.id}
              contaId={desfecho.contaId}
              agenteId={desfecho.agenteId}
              sinal={desfecho.sinal}
              sequenciaId={desfecho.sequenciaId}
              referencias={referencias}
            />
          )
        }
        return <AcaoSemAprovacao key={desfecho.id} {...desfecho} referencias={referencias} />
      })}
    </div>
  )
}

function EtapaDoAgente({ etapa, agente, ultima }: { etapa: Etapa; agente?: Agente; ultima: boolean }) {
  const ativa = etapa.resumo === undefined && !etapa.interrompida
  const nome = agente?.nome ?? etapa.agenteId
  const consultas = (
    <ul className="flex flex-col gap-0.5 text-sm text-al-muted">
      {etapa.consultas.map((consulta, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5">
          <Wrench strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
          {consulta.descricao}
          <LinkDoPasso link={consulta.link} />
          <AprovacaoDoPasso link={consulta.link} />
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
            <p className={etapa.interrompida ? 'text-al-muted' : undefined}>{etapa.resumo ?? 'Interrompido.'}</p>
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
