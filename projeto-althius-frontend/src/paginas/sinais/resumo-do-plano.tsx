import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BOTAO_DISCRETO } from '@/components/botoes'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { cn } from '@/lib/utils'

const MAX_DO_RESUMO = 160

function resumir(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > MAX_DO_RESUMO ? `${limpo.slice(0, MAX_DO_RESUMO - 1).trimEnd()}…` : limpo
}

/** No topo do Monitoramento que nasceu de um Plano: o resumo do Briefing, a versão do Plano e o caminho para editá-lo. */
export function ResumoDoPlano({ monitoramento }: { monitoramento: Monitoramento }) {
  if (!monitoramento.plano) return null
  return (
    <aside aria-label="Briefing e Plano" className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rotulo inline-flex items-center gap-2 text-al-accent">
          <Sparkles strokeWidth={1.8} className="size-3.5" aria-hidden />
          Plano v{monitoramento.versaoDoPlano ?? 1}
        </span>
        <Link to={`/sinais/novo?monitor=${monitoramento.id}`} className={cn(BOTAO_DISCRETO, 'underline-offset-4 hover:underline')}>
          Editar plano
        </Link>
      </div>
      {monitoramento.briefing && (
        <p className="text-sm">
          <span className="rotulo mr-2">Briefing</span>
          <span className="text-al-muted">{resumir(monitoramento.briefing)}</span>
        </p>
      )}
    </aside>
  )
}
