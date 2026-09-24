import { Flame } from 'lucide-react'
import type { ReactNode } from 'react'
import { Pulso } from '@/components/marca'
import { cn } from '@/lib/utils'
import { ROTULO_DA_ADERENCIA, ROTULO_DO_ESTADO, VALIDADE_EM_DIAS, type AderenciaMock, type EstadoDoMonitoramento } from './dados-mock'

// Os botões seguem os das Sequências: raio 0, rótulo em maiúsculas e entreletra do manual.
export const BOTAO_PRIMARIO =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-accent bg-al-accent px-4 text-xs font-normal tracking-rotulo text-al-on-accent uppercase transition-colors hover:border-al-accent-2 hover:bg-al-accent-2 disabled:pointer-events-none disabled:opacity-50'
export const BOTAO_SECUNDARIO =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-line bg-al-bg px-4 text-xs font-normal tracking-rotulo text-al-ink uppercase transition-colors hover:border-al-muted hover:bg-al-surface disabled:pointer-events-none disabled:opacity-50'
export const BOTAO_DISCRETO =
  'inline-flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs font-normal tracking-rotulo text-al-muted uppercase transition-colors hover:text-al-ink'

const COR_DO_ESTADO: Record<EstadoDoMonitoramento, string> = {
  ativo: 'border-al-sucesso/60 text-al-ink',
  pausado: 'border-al-atencao/60 text-al-atencao',
  rascunho: 'border-al-line text-al-muted',
  'em-preparacao': 'border-al-accent/60 text-al-ink',
}

export function SeloDoEstado({ estado }: { estado: EstadoDoMonitoramento }) {
  return (
    <span className={cn('selo', COR_DO_ESTADO[estado])}>
      {estado === 'ativo' && <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />}
      {estado === 'em-preparacao' && (
        <span className="relative inline-flex size-2">
          <Pulso className="absolute inset-0" />
        </span>
      )}
      {ROTULO_DO_ESTADO[estado]}
    </span>
  )
}

/** O foguinho: a Conta-alvo está Quente e a quantidade de Sinais válidos. Não tem níveis. */
export function Foguinho({ quantidade, className }: { quantidade: number; className?: string }) {
  if (quantidade === 0) return null
  const texto = `${quantidade} ${quantidade === 1 ? 'sinal' : 'sinais'}`
  return (
    <span
      role="img"
      aria-label={`Quente, ${quantidade} ${quantidade === 1 ? 'sinal válido' : 'sinais válidos'}`}
      title={`Quente: há Sinais disparados nos últimos ${VALIDADE_EM_DIAS} dias`}
      className={cn('inline-flex items-center gap-1 text-sm whitespace-nowrap text-al-accent-2', className)}
    >
      <Flame strokeWidth={1.8} className="size-4 fill-al-accent-2/25" aria-hidden />
      <span className="tabular-nums">{texto}</span>
    </span>
  )
}

/** A Aderência do Scopus, sempre ao lado do foguinho e nunca substituída por ele. */
export function SeloDeAderencia({ aderencia }: { aderencia?: AderenciaMock }) {
  if (!aderencia) return <span className="selo">Aderência não avaliada</span>
  return <span className={cn('selo', aderencia === 'fit' && 'border-al-ink/40 text-al-ink')}>{ROTULO_DA_ADERENCIA[aderencia]}</span>
}

/** Seção numerada de um formulário do mockup. */
export function SecaoDoFormulario({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: string
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-5 border-t border-al-line pt-6">
      <header className="flex items-baseline gap-4">
        <span className="rotulo text-al-accent" aria-hidden>
          {numero}
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-lg">{titulo}</h2>
          {descricao && <p className="text-sm text-al-muted">{descricao}</p>}
        </div>
      </header>
      <div className="flex flex-col gap-5 pl-10">{children}</div>
    </section>
  )
}

/** Uma escolha em pílula quadrada, marcável: usada em opções múltiplas e em escolhas únicas. */
export function Opcao({
  marcada,
  aoClicar,
  children,
  papel = 'checkbox',
}: {
  marcada: boolean
  aoClicar: () => void
  children: ReactNode
  papel?: 'checkbox' | 'radio'
}) {
  return (
    <button
      type="button"
      role={papel}
      aria-checked={marcada}
      onClick={aoClicar}
      className={cn(
        'h-8 border px-3 text-sm font-normal transition-colors',
        marcada ? 'border-al-accent bg-al-accent/10 text-al-ink' : 'border-al-line text-al-muted hover:border-al-muted hover:text-al-ink',
      )}
    >
      {children}
    </button>
  )
}
