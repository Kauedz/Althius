import type { ReactNode } from 'react'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { useDados } from '@/fonte/contexto'
import { ROTULO_DA_DECISAO } from '@/fonte/regras'
import type { Aprovacao } from '@/fonte/tipos'
import { cn } from '@/lib/utils'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

/**
 * Uma Aprovação dentro de uma Conversa, direta ou coordenada: a ação, o impacto, o Canal que também
 * a recebeu e, enquanto pendente, a decisão. Cada Conversa mostra o estado do seu jeito, no cabeçalho.
 */
export function AprovacaoNaConversa({
  aprovacaoId,
  cabecalho,
  className,
}: {
  aprovacaoId: string
  cabecalho: (aprovacao: Aprovacao, rotuloDoEstado: string) => ReactNode
  className?: string
}) {
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const aprovacao = aprovacoes?.find((a) => a.id === aprovacaoId)
  if (!aprovacao) return null

  const rotuloDoEstado = aprovacao.estado === 'pendente' ? 'Aprovação pendente' : ROTULO_DA_DECISAO[aprovacao.estado]
  return (
    <article aria-label={`${rotuloDoEstado}: ${aprovacao.acao}`} className={cn('flex flex-col', className)}>
      {cabecalho(aprovacao, rotuloDoEstado)}
      <p className="text-lg leading-snug font-normal">{aprovacao.acao}</p>
      <p className="text-sm text-al-muted">{aprovacao.impacto}</p>
      {aprovacao.origem !== 'althius' && (
        <p className="anotacao">também enviada ao {ROTULO_DO_CANAL[aprovacao.origem]}</p>
      )}
      {aprovacao.estado === 'pendente' && (
        <div className="pt-1.5">
          <DecisaoDeAprovacao aprovacao={aprovacao} onde="conversa" />
        </div>
      )}
    </article>
  )
}
