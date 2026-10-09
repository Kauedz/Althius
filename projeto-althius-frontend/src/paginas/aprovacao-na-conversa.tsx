import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { useDados } from '@/fonte/contexto'
import { rotuloDoEstadoDaAprovacao } from '@/fonte/regras'
import type { AprovacaoDeAcao } from '@/fonte/tipos'
import { cn } from '@/lib/utils'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

/**
 * Uma Aprovação dentro de uma Conversa, direta ou coordenada: a ação, o impacto, o Canal que também
 * a recebeu e, enquanto pendente, a decisão. Cada Conversa mostra o estado do seu jeito, no cabeçalho.
 * Sem `podeDecidir` (quem não é Administrador), a pendente mostra quem decide em vez dos botões.
 */
export function AprovacaoNaConversa({
  aprovacaoId,
  cabecalho,
  className,
  podeDecidir = true,
}: {
  aprovacaoId: string
  cabecalho: (aprovacao: AprovacaoDeAcao, rotuloDoEstado: string) => ReactNode
  className?: string
  podeDecidir?: boolean
}) {
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  // Aqui só as ações em Integrações. A revisão da Memória do Workspace (Demonstração) fica na fila, e a do Playbook (CRM-09)
  // tem cartão próprio no passo da Conversa (`CartaoDeRevisaoDoPlaybook`).
  const aprovacao = aprovacoes?.find((a) => a.id === aprovacaoId)
  if (!aprovacao || aprovacao.revisao) return null

  const rotuloDoEstado = aprovacao.estado === 'pendente' ? 'Aprovação pendente' : rotuloDoEstadoDaAprovacao(aprovacao)
  return (
    <article aria-label={`${rotuloDoEstado}: ${aprovacao.acao}`} className={cn('flex flex-col', className)}>
      {cabecalho(aprovacao, rotuloDoEstado)}
      <p className="text-lg leading-snug font-normal">{aprovacao.acao}</p>
      {(aprovacao.contaNome || aprovacao.sequenciaId) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-al-muted">
          {aprovacao.contaNome && (
            <span>
              Conta-alvo:{' '}
              {aprovacao.contaId ? (
                <Link to={`/contas/${aprovacao.contaId}`} className="text-al-ink font-normal underline-offset-4 hover:underline">
                  {aprovacao.contaNome}
                </Link>
              ) : (
                <span className="text-al-ink font-normal">{aprovacao.contaNome}</span>
              )}
            </span>
          )}
          {aprovacao.contaNome && aprovacao.sequenciaId && <span className="text-al-line">·</span>}
          {aprovacao.sequenciaId && (
            <span>
              Sequência:{' '}
              <Link to={`/sequencias/${aprovacao.sequenciaId}`} className="text-al-ink font-normal underline-offset-4 hover:underline">
                Ver sequência
              </Link>
            </span>
          )}
        </div>
      )}
      <p className="text-sm text-al-muted">{aprovacao.impacto}</p>
      {aprovacao.origem !== 'althius' && (
        <p className="anotacao">também enviada ao {ROTULO_DO_CANAL[aprovacao.origem]}</p>
      )}
      {aprovacao.estado === 'pendente' && (
        <div className="pt-1.5">
          <DecisaoDeAprovacao aprovacao={aprovacao} onde="conversa" podeDecidir={podeDecidir} />
        </div>
      )}
    </article>
  )
}
