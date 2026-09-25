import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Resultado de uma operação: sucesso e aviso são anunciados com calma; erro, na hora. Sem conteúdo, a região continua
 * montada e invisível, para o leitor de tela anunciar o resultado quando ele chegar.
 */
export function Mensagem({ tipo, children }: { tipo: 'sucesso' | 'erro' | 'info'; children?: ReactNode }) {
  const Icone = tipo === 'sucesso' ? CircleCheck : tipo === 'erro' ? CircleAlert : Info
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={
        children
          ? cn(
              'flex items-start gap-2 border-l-2 py-1 pl-3 text-sm',
              tipo === 'sucesso' && 'border-al-sucesso',
              tipo === 'erro' && 'border-al-erro text-al-ink',
              tipo === 'info' && 'border-al-line text-al-muted',
            )
          : 'sr-only'
      }
    >
      {children && (
        <>
          <Icone
            strokeWidth={1.8}
            className={cn('mt-0.5 size-4 shrink-0', tipo === 'sucesso' && 'text-al-sucesso', tipo === 'erro' && 'text-al-erro')}
            aria-hidden
          />
          <span>{children}</span>
        </>
      )}
    </p>
  )
}
