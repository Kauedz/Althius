import { Flame } from 'lucide-react'
import { badgeVariants } from '@/components/ui/badge'
import type { ReactNode } from 'react'
import { Pulso } from '@/components/marca'
import { cn } from '@/lib/utils'
import { ROTULO_DA_ADERENCIA, ROTULO_DO_ESTADO, VALIDADE_EM_DIAS, type AderenciaMock, type EstadoDoMonitoramento } from './dados-mock'

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
      className={cn(badgeVariants({ tom: 'quente', forma: 'pilula' }), 'tabular-nums', className)}
    >
      <Flame strokeWidth={1.8} className="size-3.5" aria-hidden />
      <span className="tabular-nums">{texto}</span>
    </span>
  )
}

/** A Aderência do Scopus, sempre ao lado do foguinho e nunca substituída por ele. */
export function SeloDeAderencia({ aderencia }: { aderencia?: AderenciaMock }) {
  if (!aderencia) return <span className={badgeVariants({ tom: 'neutro' })}>Aderência não avaliada</span>
  return <span className={cn(badgeVariants({ tom: 'neutro' }), aderencia === 'fit' && 'border-al-ink/40 text-al-ink')}>{ROTULO_DA_ADERENCIA[aderencia]}</span>
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
