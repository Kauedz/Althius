import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Um bloco dentro de uma seção de Configurações: título pequeno, descrição, ações e conteúdo. */
export function Bloco({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string
  descricao?: ReactNode
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-5 border-t border-al-line pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="titulo-secao text-lg">{titulo}</h3>
          {descricao && <p className="text-sm text-al-muted">{descricao}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

/** Resultado de uma operação: sucesso e aviso são anunciados com calma; erro, na hora. */
export function Mensagem({ tipo, children }: { tipo: 'sucesso' | 'erro' | 'info'; children: ReactNode }) {
  const Icone = tipo === 'sucesso' ? CircleCheck : tipo === 'erro' ? CircleAlert : Info
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 border-l-2 py-1 pl-3 text-sm',
        tipo === 'sucesso' && 'border-al-sucesso',
        tipo === 'erro' && 'border-al-erro text-al-ink',
        tipo === 'info' && 'border-al-line text-al-muted',
      )}
    >
      <Icone
        strokeWidth={1.8}
        className={cn('mt-0.5 size-4 shrink-0', tipo === 'sucesso' && 'text-al-sucesso', tipo === 'erro' && 'text-al-erro')}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  )
}
