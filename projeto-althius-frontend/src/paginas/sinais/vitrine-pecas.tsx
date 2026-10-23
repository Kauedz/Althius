// As peças da vitrine de Sinais: capa, card, prateleira, Sinal da semana, Meus Sinais e o pedido à equipe. O fundo segue
// o tema (claro ou escuro); as capas são escuras nos dois, com o degradê da marca. A página e a casca são as mesmas.

import { createElement, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Hammer,
  RadioTower,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { LogoDaConta } from '@/components/logos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import type { ContaAlvo } from '@/fonte/contas-tipos'
import type { PedidoDeSinal, SinalEncontrado } from '@/fonte/sinais-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { parseDataDisparo } from '@/fonte/regras-sinais'
import { cn } from '@/lib/utils'
import type { EstadoDoCard } from './catalogo-funcional'
import { nomesDosNichos, valeParaTodosOsNichos, type CardDoCatalogo } from './catalogo-visivel'
import { SeloDaDisponibilidade } from './disponibilidade'
import { capaDoCard, iconeDaFamilia, type SituacaoDoExclusivo } from './vitrine'

/** A capa de um Sinal: uma imagem da marca, com o véu escuro que deixa o texto legível. */
export function CapaDoSinal({ id, className, children }: { id: string; className?: string; children?: ReactNode }) {
  const capa = capaDoCard(id)
  return (
    <div className={cn('vitrine-capa', className)} style={{ backgroundImage: `url(${capa.imagem})`, backgroundPosition: capa.posicao }}>
      {children}
    </div>
  )
}

/** O selo que fica na capa: Exclusivo, Novo, Lançamento. */
function SeloDaCapa({ children }: { children: ReactNode }) {
  return <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink backdrop-blur-sm">{children}</span>
}

function NichosDoCard({ card }: { card: CardDoCatalogo }) {
  const nomes = valeParaTodosOsNichos(card) ? ['Todos os nichos'] : nomesDosNichos(card.nichos)
  const mostrados = nomes.slice(0, 2)
  return (
    <ul aria-label={`Nichos de ${card.nome}`} className="flex flex-wrap justify-center gap-1.5">
      {mostrados.map((nome) => (
        <li key={nome} className="selo">{nome}</li>
      ))}
      {nomes.length > mostrados.length && (
        <li className="selo" title={nomes.slice(mostrados.length).join(', ')}>
          +{nomes.length - mostrados.length}
        </li>
      )}
    </ul>
  )
}

/**
 * Os selos de um card que ainda não roda de verdade, no Workspace operacional: "Em teste" ou "Em breve" e, para a equipe
 * Althius, "Interno", porque o cliente não vê o card.
 */
export function SelosDoEstado({ estado, className }: { estado: EstadoDoCard; className?: string }) {
  return (
    <span className={cn('flex flex-wrap justify-center gap-1.5', className)}>
      <SeloDaDisponibilidade disponibilidade={estado.disponibilidade} />
      {estado.interno && <span className="selo" title="O cliente não vê este Sinal">Interno</span>}
    </span>
  )
}

/** O card da vitrine: capa, nome, frase, nichos e quantos Monitoramentos estão ativos. Abre a página do Sinal. */
export function CartaoDaVitrine({
  card,
  ativos,
  selo,
  estado,
  className,
}: {
  card: CardDoCatalogo
  ativos: number
  selo?: string
  estado?: EstadoDoCard
  className?: string
}) {
  return (
    <li className={cn('min-w-0', className)}>
      <Link
        to={`/sinais/tipos/${card.id}`}
        // O clip-path arredondado segura os cantos enquanto a capa cresce no hover: só com overflow-hidden, o navegador
        // anima a capa numa camada própria e os cantos ficam quadrados até a animação acabar.
        className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-al-line bg-al-surface [clip-path:inset(0_round_var(--radius-card))] transition-colors hover:border-al-accent"
      >
        <div className="overflow-hidden">
          <CapaDoSinal
            id={card.id}
            className="flex aspect-[2/1] items-start justify-between p-3 transition-transform duration-300 group-hover:scale-[1.03]"
          >
            <span>{selo && <SeloDaCapa>{selo}</SeloDaCapa>}</span>
            <span className="grid size-8 place-items-center rounded-full bg-al-bg/60 text-al-ink backdrop-blur-sm" aria-hidden>
              {createElement(iconeDaFamilia(card.familiaId), { strokeWidth: 1.8, className: 'size-4' })}
            </span>
          </CapaDoSinal>
        </div>
        <div className="flex flex-1 flex-col items-center gap-2 p-4 text-center">
          <h3 className="text-base leading-snug font-normal">{card.nome}</h3>
          <p className="line-clamp-2 text-sm text-al-muted">{card.frase}</p>
          <NichosDoCard card={card} />
          {estado && <SelosDoEstado estado={estado} />}
          <div className="mt-auto flex w-full items-end justify-between gap-3 pt-2">
            <span className="rotulo inline-flex items-center gap-2 text-al-ink">
              {ativos > 0 && <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />}
              {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
            </span>
            <span
              className="grid size-8 place-items-center rounded-full border border-al-accent/60 text-al-accent transition-colors group-hover:border-al-accent group-hover:bg-al-accent/10"
              aria-hidden
            >
              <ArrowRight strokeWidth={1.8} className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}

/** Um card da prateleira que não abre Monitoramento: lançamento, pedido em produção ou convite. */
function CartaoSimples({
  id,
  icone: Icone,
  selo,
  titulo,
  children,
}: {
  id: string
  icone: LucideIcon
  selo?: string
  titulo: ReactNode
  children: ReactNode
}) {
  return (
    <li className="w-60 shrink-0 sm:w-64">
      <article className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-al-line bg-al-surface">
        <CapaDoSinal id={id} className="flex aspect-[2/1] items-start justify-between p-3">
          <span>{selo && <SeloDaCapa>{selo}</SeloDaCapa>}</span>
          <span className="grid size-8 place-items-center rounded-full bg-al-bg/60 text-al-ink backdrop-blur-sm" aria-hidden>
            <Icone strokeWidth={1.8} className="size-4" />
          </span>
        </CapaDoSinal>
        <div className="flex flex-1 flex-col items-center gap-2 p-4 text-center">
          <h3 className="line-clamp-2 text-base leading-snug font-normal">{titulo}</h3>
          {children}
        </div>
      </article>
    </li>
  )
}

/** Onde o Cover Flow começa: perto do meio, sem passar do terceiro card, para os dois lados terem vizinhos. */
function centroInicial(total: number): number {
  return Math.max(0, Math.min(2, Math.floor((total - 1) / 2)))
}

/** Quanto o dedo precisa arrastar (px) para trocar o card do centro. */
const ARRASTO_MINIMO = 40

/**
 * A pose de um card no Cover Flow pela distância ao centro (inspirado no "3D Cover Flow" do amicro, MIT): o do centro fica
 * de frente e à frente; os vizinhos giram para dentro, recuam e somem aos poucos.
 */
function poseDoCard(distancia: number, largura: number): { transform: string; opacity: number; zIndex: number } {
  const longe = Math.abs(distancia)
  if (distancia === 0) return { transform: 'translateX(0) translateZ(40px) scale(1.04)', opacity: 1, zIndex: 100 }
  const passo = (largura || 240) * 0.62
  const giro = distancia < 0 ? 38 : -38
  return {
    transform: `translateX(${distancia * passo}px) translateZ(${-longe * 90}px) rotateY(${giro}deg) scale(${1 - longe * 0.06})`,
    // Opacos até o segundo vizinho, para o texto de um card não aparecer através do outro; depois somem.
    opacity: longe > 3 ? 0 : longe === 3 ? 0.5 : 1,
    zIndex: 100 - longe,
  }
}

/**
 * Uma prateleira em Cover Flow 3D: um card no centro, os vizinhos girados em perspectiva. As setas, as teclas de seta,
 * o arrasto e o toque num card do lado trocam o centro; o card do centro abre normalmente.
 */
export function Prateleira({
  id,
  titulo,
  subtitulo,
  children,
}: {
  id: string
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  const lista = useRef<HTMLUListElement>(null)
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const inicioDoArrasto = useRef<number | null>(null)
  const arrastou = useRef(false)
  const centro = Math.min(escolhido ?? centroInicial(total), Math.max(total - 1, 0))

  // A pose de cada card vem do DOM: os filhos são <li> de vários tipos (card, lançamento, pedido, vazio).
  useLayoutEffect(() => {
    const itens = Array.from(lista.current?.children ?? []) as HTMLElement[]
    if (itens.length !== total) setTotal(itens.length)
    const atual = Math.min(escolhido ?? centroInicial(itens.length), Math.max(itens.length - 1, 0))
    itens.forEach((item, indice) => {
      const pose = poseDoCard(indice - atual, item.offsetWidth)
      item.style.transform = pose.transform
      item.style.opacity = String(pose.opacity)
      item.style.zIndex = String(pose.zIndex)
      item.style.pointerEvents = pose.opacity === 0 ? 'none' : ''
      if (indice === atual) item.setAttribute('aria-current', 'true')
      else item.removeAttribute('aria-current')
    })
  }, [children, escolhido, total])

  const mover = (passos: number) => setEscolhido(Math.min(Math.max(centro + passos, 0), Math.max(total - 1, 0)))
  const indiceDe = (alvo: EventTarget) => {
    const item = (alvo as HTMLElement).closest?.('.vitrine-prateleira > li')
    return item ? Array.prototype.indexOf.call(lista.current?.children ?? [], item) : -1
  }

  // O toque num card do lado o traz para o centro em vez de abrir; depois de um arrasto, o clique não vale.
  const aoClicar = (evento: MouseEvent<HTMLUListElement>) => {
    const indice = indiceDe(evento.target)
    if (arrastou.current || (indice >= 0 && indice !== centro)) {
      evento.preventDefault()
      evento.stopPropagation()
      if (!arrastou.current && indice >= 0) setEscolhido(indice)
    }
    arrastou.current = false
  }
  const aoTeclar = (evento: KeyboardEvent<HTMLUListElement>) => {
    if (evento.key === 'ArrowLeft') mover(-1)
    if (evento.key === 'ArrowRight') mover(1)
  }
  // Com o teclado (Tab), o card que recebe o foco vem para o centro.
  const aoFocar = (evento: { target: EventTarget }) => {
    let peloTeclado = false
    try {
      peloTeclado = (evento.target as HTMLElement).matches(':focus-visible')
    } catch {
      peloTeclado = false
    }
    const indice = indiceDe(evento.target)
    if (peloTeclado && indice >= 0 && indice !== centro) setEscolhido(indice)
  }
  const aoApertar = (evento: PointerEvent<HTMLUListElement>) => {
    inicioDoArrasto.current = evento.clientX
    arrastou.current = false
  }
  const aoSoltar = (evento: PointerEvent<HTMLUListElement>) => {
    if (inicioDoArrasto.current === null) return
    const deslocamento = evento.clientX - inicioDoArrasto.current
    inicioDoArrasto.current = null
    if (Math.abs(deslocamento) < ARRASTO_MINIMO) return
    arrastou.current = true
    mover(deslocamento < 0 ? 1 : -1)
  }

  const botaoDaSeta =
    'grid size-8 place-items-center rounded-full border border-al-line text-al-muted transition-colors hover:border-al-ink hover:text-al-ink disabled:pointer-events-none disabled:opacity-40'
  return (
    <section aria-labelledby={`prateleira-${id}`} className="flex min-w-0 flex-col gap-3">
      <div className="relative flex items-center justify-center">
        <div className="flex min-w-0 flex-col items-center text-center gap-0.5 px-10 sm:px-14">
          <h2 id={`prateleira-${id}`} className="titulo-secao text-lg">
            {titulo}
          </h2>
          {subtitulo && <p className="text-sm text-al-muted max-w-xl">{subtitulo}</p>}
        </div>
        <div className="absolute right-0 flex shrink-0 gap-1">
          <button type="button" onClick={() => mover(-1)} disabled={centro <= 0} aria-label={`Voltar em ${titulo}`} className={botaoDaSeta}>
            <ChevronLeft strokeWidth={1.8} className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => mover(1)}
            disabled={centro >= total - 1}
            aria-label={`Avançar em ${titulo}`}
            className={botaoDaSeta}
          >
            <ChevronRight strokeWidth={1.8} className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <ul
        ref={lista}
        aria-label={titulo}
        className="vitrine-prateleira"
        onClickCapture={aoClicar}
        onKeyDown={aoTeclar}
        onFocus={aoFocar}
        onPointerDown={aoApertar}
        onPointerUp={aoSoltar}
        onPointerCancel={() => (inicioDoArrasto.current = null)}
      >
        {children}
      </ul>
      {total > 1 && (
        <div className="flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, indice) => (
            <span
              key={indice}
              className={cn('h-1 rounded-full transition-all duration-300', indice === centro ? 'w-4 bg-al-accent' : 'w-1 bg-al-line-forte')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Os cards de uma prateleira, com a largura fixa da faixa. */
export function CartoesDaPrateleira({
  cards,
  ativosDe,
  seloDe,
  estadoDe,
}: {
  cards: readonly CardDoCatalogo[]
  ativosDe: (card: CardDoCatalogo) => number
  seloDe?: (card: CardDoCatalogo) => string | undefined
  estadoDe?: (card: CardDoCatalogo) => EstadoDoCard | undefined
}) {
  return cards.map((card) => (
    <CartaoDaVitrine
      key={card.id}
      card={card}
      ativos={ativosDe(card)}
      selo={seloDe?.(card)}
      estado={estadoDe?.(card)}
      className="w-60 shrink-0 sm:w-64"
    />
  ))
}

/** A prateleira vazia diz o porquê, no lugar dos cards. */
export function PrateleiraVazia({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <li className="flex min-h-40 w-72 shrink-0 flex-col items-center justify-center text-center gap-1.5 rounded-[var(--radius-card)] border border-dashed border-al-line p-5 sm:w-80">
      <p className="text-sm text-al-ink">{titulo}</p>
      <div className="text-sm text-al-muted">{children}</div>
    </li>
  )
}

/** O botão Avise-me de um lançamento. Depois do pedido, fica marcado. */
export function BotaoAviseMe({
  card,
  avisado,
  aoAvisar,
  className,
}: {
  card: CardDoCatalogo
  avisado: boolean
  aoAvisar: (card: CardDoCatalogo) => Promise<void>
  className?: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (avisado) {
    return (
      <span role="status" className={cn('inline-flex items-center gap-1.5 text-sm text-al-sucesso', className)}>
        <Check strokeWidth={1.8} className="size-4" aria-hidden />
        Você será avisado
      </span>
    )
  }
  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <button
        type="button"
        disabled={enviando}
        aria-label={`Avise-me quando ${card.nome} lançar`}
        onClick={async () => {
          setErro(null)
          setEnviando(true)
          try {
            await aoAvisar(card)
          } catch (falha) {
            setErro(falha instanceof Error ? falha.message : 'Não foi possível pedir o aviso.')
          } finally {
            setEnviando(false)
          }
        }}
        className={BOTAO_SECUNDARIO}
      >
        <BellRing strokeWidth={1.8} className="size-4" aria-hidden />
        Avise-me
      </button>
      {erro && (
        <p role="alert" className="text-xs text-al-erro">
          {erro}
        </p>
      )}
    </div>
  )
}

export function CartaoDeLancamento({
  card,
  avisado,
  aoAvisar,
  estado,
}: {
  card: CardDoCatalogo
  avisado: boolean
  aoAvisar: (card: CardDoCatalogo) => Promise<void>
  estado?: EstadoDoCard
}) {
  return (
    <CartaoSimples
      id={card.id}
      icone={iconeDaFamilia(card.familiaId)}
      selo="Lançamento"
      titulo={
        <Link to={`/sinais/tipos/${card.id}`} className="hover:text-al-accent hover:underline">
          {card.nome}
        </Link>
      }
    >
      <p className="line-clamp-2 text-sm text-al-muted">{card.frase}</p>
      {estado && <SelosDoEstado estado={estado} />}
      <BotaoAviseMe card={card} avisado={avisado} aoAvisar={aoAvisar} className="mt-auto pt-2" />
    </CartaoSimples>
  )
}

export function CartaoEmProducao({ pedido, situacao }: { pedido: PedidoDeSinal; situacao: SituacaoDoExclusivo }) {
  return (
    <CartaoSimples id={pedido.id} icone={Hammer} selo="Exclusivo" titulo={pedido.evento}>
      <p className="line-clamp-2 text-sm text-al-muted">{pedido.empresasOuNicho}</p>
      <p className="mt-auto inline-flex items-center gap-2 pt-2 text-sm text-al-ink">
        <span
          className={cn('size-1.5 rounded-full', situacao === 'Pedido recebido' ? 'bg-al-atencao' : 'bg-al-accent animate-pulse')}
          aria-hidden
        />
        {situacao}
      </p>
    </CartaoSimples>
  )
}

/** O destaque do topo: a capa animada do Sinal da semana e as últimas empresas que ele detectou no Workspace. */
export function SinalDaSemana({
  card,
  ativos,
  detectadas,
  contas,
  hoje,
  operacional,
}: {
  card: CardDoCatalogo
  ativos: number
  detectadas: readonly SinalEncontrado[]
  contas: readonly ContaDaPrevia[]
  hoje: Date
  operacional: boolean
}) {
  return (
    <section aria-label={`Sinal da semana: ${card.nome}`} className="overflow-hidden rounded-[var(--radius-card)]">
      <CapaDoSinal id={card.id} className="min-h-80">
        <div className="vitrine-brilho" aria-hidden />
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:p-10">
          <div className="flex min-w-0 flex-col justify-end gap-4">
            <span className="rotulo inline-flex items-center gap-2 text-al-ink">
              <Sparkles strokeWidth={1.8} className="size-3.5 text-al-accent-2" aria-hidden />
              Sinal da semana
            </span>
            <h2 className="titulo-display text-4xl md:text-5xl">
              {card.nome}
            </h2>
            <p className="max-w-md text-base text-al-ink">{card.frase}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/sinais/tipos/${card.id}`} className={BOTAO_PRIMARIO}>
                Conhecer o Sinal
              </Link>
              <span className="rotulo text-al-ink">
                {ativos} {ativos === 1 ? 'Monitoramento ativo' : 'Monitoramentos ativos'}
              </span>
            </div>
          </div>
          <PreviaDasDetectadas detectadas={detectadas} contas={contas} hoje={hoje} operacional={operacional} />
        </div>
      </CapaDoSinal>
    </section>
  )
}

type ContaDaPrevia = Pick<ContaAlvo, 'id' | 'nome' | 'logo' | 'logoDeUmaCor'>

/** As últimas empresas detectadas por um Sinal, ou o estado vazio. Atualiza com a Fonte. */
export function PreviaDasDetectadas({
  detectadas,
  contas,
  hoje,
  operacional,
  titulo = 'Últimas empresas detectadas',
}: {
  detectadas: readonly SinalEncontrado[]
  contas: readonly ContaDaPrevia[]
  hoje: Date
  operacional: boolean
  titulo?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-al-line bg-al-bg/75 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="rotulo">{titulo}</span>
        <span className="rotulo inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-al-ink" title="Atualiza sozinha quando chega um disparo">
          <span className="size-1.5 animate-pulse rounded-full bg-al-accent" aria-hidden />
          Ao vivo
        </span>
      </div>
      {detectadas.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-4">
          <span className="grid size-10 place-items-center rounded-full border border-al-line text-al-accent" aria-hidden>
            <RadioTower strokeWidth={1.8} className="size-4" />
          </span>
          <p className="text-sm text-al-ink">Nenhuma empresa detectada ainda neste Workspace.</p>
          <p className="text-sm text-al-muted">
            Quando um Monitoramento deste Sinal disparar, as empresas aparecem aqui, da mais recente para a mais antiga.
          </p>
        </div>
      ) : (
        <ul aria-label={titulo} className="flex flex-col">
          {detectadas.map((sinal) => {
            const conta = contas.find((c) => c.id === sinal.contaId)
            const nome = conta?.nome ?? (operacional ? 'Conta-alvo' : sinal.contaId)
            const data = parseDataDisparo(sinal.data)
            return (
              <li key={sinal.id} className="flex items-center gap-3 border-b border-al-line py-2.5 last:border-b-0">
                <LogoDaConta nome={nome} logo={conta?.logo} deUmaCor={conta?.logoDeUmaCor} />
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <Link to={`/sinais/contas/${sinal.contaId}`} className="truncate text-sm hover:text-al-accent hover:underline">
                    {nome}
                  </Link>
                  <span className="truncate text-xs text-al-muted" title={sinal.frase}>
                    {sinal.frase}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-al-muted" title={formatarDataCompleta(data)}>
                  {formatarDataDoModulo(data, hoje)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Uma peça da faixa Meus Sinais. */
function PecaDeMeusSinais({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  para,
  children,
}: {
  icone: LucideIcon
  rotulo: string
  valor: number | undefined
  detalhe: string
  para?: string
  children?: ReactNode
}) {
  const conteudo = (
    <>
      <span className="rotulo inline-flex items-center gap-2">
        <Icone strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
        {rotulo}
      </span>
      <span className="titulo-display text-4xl tabular-nums">{valor ?? '–'}</span>
      <span className="text-sm text-al-muted">{detalhe}</span>
    </>
  )
  const classe =
    'flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-al-line bg-al-surface p-5 transition-colors'
  return (
    <li className="min-w-0">
      {para ? (
        <Link to={para} className={cn(classe, 'h-full hover:border-al-accent')}>
          {conteudo}
        </Link>
      ) : (
        <div className={cn(classe, 'h-full')}>
          {conteudo}
          {children}
        </div>
      )}
    </li>
  )
}

/** A faixa Meus Sinais: Monitoramentos ativos com os disparos, Contas Quentes e Sequências. */
export function MeusSinais({
  monitoramentosAtivos,
  disparos,
  contasQuentes,
  sequenciasAtivas,
  acaoDosEncontrados,
  acaoDeDescrever,
}: {
  monitoramentosAtivos: { id: string; tipoId: string; nome: string; disparos: number }[]
  disparos: number | undefined
  contasQuentes: number | undefined
  sequenciasAtivas: number | undefined
  acaoDosEncontrados: ReactNode
  /** O botão "Descrever um Sinal"; ausente onde a pessoa não pode criar Monitoramento. */
  acaoDeDescrever?: ReactNode
}) {
  return (
    <section aria-labelledby="titulo-meus-sinais" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="titulo-meus-sinais" className="titulo-secao text-lg">
          Meus Sinais
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {acaoDeDescrever}
          {acaoDosEncontrados}
        </div>
      </div>
      <ul className="grid min-w-0 gap-3 md:grid-cols-3">
        <PecaDeMeusSinais
          icone={RadioTower}
          rotulo="Monitoramentos ativos"
          valor={monitoramentosAtivos.length}
          detalhe={
            disparos === undefined
              ? 'Carregando os disparos'
              : `${disparos} ${disparos === 1 ? 'disparo' : 'disparos'} no total`
          }
        >
          {monitoramentosAtivos.length > 0 && (
            <ul aria-label="Monitoramentos ativos" className="flex flex-col gap-1 pt-1">
              {monitoramentosAtivos.slice(0, 3).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link to={`/sinais/tipos/${m.tipoId}/${m.id}`} className="truncate hover:text-al-accent hover:underline">
                    {m.nome}
                  </Link>
                  <span className="shrink-0 text-xs text-al-muted tabular-nums">
                    {m.disparos} {m.disparos === 1 ? 'disparo' : 'disparos'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PecaDeMeusSinais>
        <PecaDeMeusSinais
          icone={Flame}
          rotulo="Contas Quentes"
          valor={contasQuentes}
          detalhe="Com ao menos um Sinal nos últimos 30 dias"
          para="/contas"
        />
        <PecaDeMeusSinais
          icone={Workflow}
          rotulo="Sequências"
          valor={sequenciasAtivas}
          detalhe="Em andamento agora"
          para="/sequencias"
        />
      </ul>
    </section>
  )
}

/** O pedido à equipe Althius. Sempre visível, no fim da vitrine. */
export function CartaoDePedido() {
  return (
    <section aria-label="Pedir um Sinal" className="overflow-hidden rounded-[var(--radius-card)] border border-al-line">
      <CapaDoSinal id="pedido-a-equipe" className="flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2 className="titulo-secao text-xl">Precisa de outro Sinal?</h2>
          <p className="text-sm text-al-ink">
            Conte o evento que você quer acompanhar e a equipe Althius monta para você.
          </p>
        </div>
        <Link to="/sinais/pedidos" className={BOTAO_PRIMARIO}>
          Falar com a equipe Althius
        </Link>
      </CapaDoSinal>
    </section>
  )
}
