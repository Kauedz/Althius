import { Popover } from '@base-ui/react/popover'
import { ListFilter, Search, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { AbasSublinhadas } from '@/components/abas'
import { Button } from '@/components/ui/button'
import type { PreviaContato } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn, iniciais } from '@/lib/utils'

/**
 * As peças que as abas Contas e Contatos compartilham: as abas, a contagem, a busca, o menu e os chips dos filtros,
 * o sistema da tabela e as células comuns.
 */

const ABAS_MODULO = [
  { rotulo: 'Contas', para: '/contas' },
  { rotulo: 'Contatos', para: '/contatos' },
]

export function AbasDoModulo() {
  return <AbasSublinhadas rotuloAcessivel="Abas de contas e contatos" abas={ABAS_MODULO} />
}

/** Quantos itens a lista mostra: "N contas" ou, com busca ou filtro, "N de M contas", no singular só quando M é 1. */
export function Contagem({
  exibidos,
  total,
  recortada,
  singular,
  plural,
}: {
  exibidos: number
  total: number
  recortada: boolean
  singular: string
  plural: string
}) {
  return (
    <span className="text-[0.8125rem] whitespace-nowrap text-al-muted">
      {/* O número em destaque. */}
      <strong className="font-normal text-al-ink">{recortada ? exibidos : total}</strong>
      {recortada && ` de ${total}`} {total === 1 ? singular : plural}
    </span>
  )
}

/** O campo de busca da barra acima da tabela. */
export function CampoDeBusca({
  rotulo,
  placeholder,
  valor,
  buscar,
}: {
  rotulo: string
  placeholder: string
  valor: string
  buscar: (valor: string) => void
}) {
  return (
    <label className="flex h-9 w-full max-w-105 items-center gap-2 border border-al-line bg-al-surface px-3 text-al-muted focus-within:border-al-muted">
      <Search className="size-4 shrink-0" aria-hidden />
      <input
        type="search"
        aria-label={rotulo}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => buscar(e.target.value)}
        className="w-full bg-transparent text-sm text-al-ink outline-none placeholder:text-al-muted"
      />
    </label>
  )
}

export const OPCAO = 'flex min-h-7 cursor-pointer items-center gap-2 text-sm text-al-ink'
export const CAIXA = 'size-3.5 shrink-0 cursor-pointer accent-al-accent'

/**
 * O botão "Filtros" e o menu que ele abre, com os grupos lado a lado numa grade que a aba define. O menu não fecha
 * a cada escolha: a lista atrás dele muda na hora.
 */
export function MenuDeFiltros({
  titulo,
  ativos,
  limparTudo,
  largura,
  grade,
  children,
}: {
  titulo: string
  ativos: number
  limparTudo: () => void
  largura: string
  /** As colunas da grade dos grupos. */
  grade: string
  children: ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={ativos ? `Filtros, ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}` : 'Filtros'}
        className={cn(
          'flex h-9 cursor-pointer items-center gap-2 border bg-al-surface px-3 text-sm whitespace-nowrap text-al-ink hover:border-al-muted',
          ativos ? 'border-al-accent' : 'border-al-line',
        )}
      >
        <ListFilter className="size-4" aria-hidden />
        Filtros
        {ativos > 0 && (
          <span className="grid h-4.5 min-w-4.5 place-items-center bg-al-accent text-[0.625rem] font-semibold text-[var(--al-on-accent)]">
            {ativos}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup
            className={cn(
              'max-w-[calc(100vw-2rem)] border border-al-line bg-al-surface text-al-ink shadow-md outline-none',
              largura,
            )}
          >
            <div className="flex items-center justify-between border-b border-al-line px-4 py-3.5">
              <Popover.Title className="text-[0.9375rem] font-normal uppercase">{titulo}</Popover.Title>
              <button
                type="button"
                onClick={limparTudo}
                className="cursor-pointer text-xs text-al-muted underline underline-offset-3 hover:text-al-ink"
              >
                Limpar tudo
              </button>
            </div>
            <div className={cn('grid', grade)}>{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function GrupoDeFiltros({
  titulo,
  className,
  children,
}: {
  titulo: string
  className?: string
  children: ReactNode
}) {
  return (
    <fieldset className={cn('min-w-0 border-al-line px-4 pt-3.5 pb-4 not-last:border-r', className)}>
      <legend className="contents">
        {/* O título do grupo, como os cabeçalhos da tabela. */}
        <span className="rotulo mb-2.5 block text-[0.625rem]">{titulo}</span>
      </legend>
      {children}
    </fieldset>
  )
}

/** Um filtro ativo, como chip: o rótulo e como desfazê-lo. */
export interface FiltroAtivo {
  rotulo: string
  remover: () => void
}

/** Os filtros ativos, abaixo da barra, cada um removível, e "Limpar filtros". */
export function ChipsDosFiltros({ filtros, limparFiltros }: { filtros: FiltroAtivo[]; limparFiltros: () => void }) {
  return (
    <div className="flex min-h-11.5 shrink-0 items-center gap-1.75 overflow-x-auto border-b border-al-line">
      {filtros.map(({ rotulo, remover }) => (
        <span
          key={rotulo}
          className="inline-flex h-6.75 shrink-0 items-center gap-1.75 border border-al-line bg-al-surface px-2 text-xs whitespace-nowrap text-al-ink"
        >
          {rotulo}
          <button
            type="button"
            aria-label={`Remover filtro ${rotulo}`}
            onClick={remover}
            className="cursor-pointer text-al-muted hover:text-al-ink"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={limparFiltros}
        className="ml-1 shrink-0 cursor-pointer text-xs whitespace-nowrap text-al-muted underline underline-offset-3 hover:text-al-ink"
      >
        Limpar filtros
      </button>
    </div>
  )
}

/** A busca ou os filtros não encontraram nada: a mensagem e "Limpar busca e filtros". */
export function SemResultado({ mensagem, limparBuscaEFiltros }: { mensagem: string; limparBuscaEFiltros: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <p className="text-sm text-al-muted">{mensagem}</p>
      <Button
        type="button"
        variant="outline"
        onClick={limparBuscaEFiltros}
        className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
      >
        Limpar busca e filtros
      </Button>
    </div>
  )
}

// Cabeçalho fixo no topo do quadro que rola.
export const CABECALHO =
  'rotulo sticky top-0 z-2 h-9.5 border-b border-al-line bg-al-bg pr-4 text-[0.625rem] whitespace-nowrap'
// Linhas compactas, separadas só pela linha do token.
export const CELULA = 'border-b border-al-line pr-4'

/** A mensagem curta de erro da lista, com "Tentar de novo". */
export function FalhaAoCarregar({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6">
      <p className="text-sm text-al-muted">{mensagem}</p>
      <Button
        type="button"
        variant="outline"
        onClick={tentarDeNovo}
        className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
      >
        Tentar de novo
      </Button>
    </div>
  )
}

/**
 * A foto do Contato num círculo, ou as iniciais do nome quando não há foto. Uma foto que não carrega (a URL do
 * provedor expirou) também cai nas iniciais, sem imagem quebrada.
 */
export function AvatarDoContato({ contato, className }: { contato: PreviaContato; className?: string }) {
  const [quebrada, setQuebrada] = useState<string>()
  const circulo = cn('size-6.5 shrink-0 rounded-full border border-al-line ring-[1.5px] ring-al-bg', className)
  if (contato.foto && contato.foto !== quebrada) {
    return (
      <img
        src={contato.foto}
        alt={contato.nome}
        title={contato.nome}
        referrerPolicy="no-referrer"
        onError={() => setQuebrada(contato.foto)}
        className={cn(circulo, 'object-cover')}
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={contato.nome}
      title={contato.nome}
      className={cn(circulo, 'grid place-items-center bg-al-surface text-[0.625rem] font-normal text-al-ink')}
    >
      {iniciais(contato.nome)}
    </span>
  )
}

export function CelulaUltimoContato({ data, hoje }: { data?: string; hoje: Date }) {
  if (!data) {
    return <span className="text-al-muted">Nunca</span>
  }

  const dataRelativaOuExplicita = formatarDataDoModulo(data, hoje, { maiuscula: true })
  const dataCompleta = formatarDataCompleta(data)

  return (
    <span title={dataCompleta} aria-label={dataCompleta} className="whitespace-nowrap">
      {dataRelativaOuExplicita}
    </span>
  )
}
