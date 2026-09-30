import type { Disponibilidade, TipoDeSinal } from '@/fonte/sinais-tipos'
import { cn } from '@/lib/utils'

/**
 * Se o tipo já roda de verdade (sinais-reais, ticket 07). Só o Workspace operacional informa: a Demonstração não diz
 * nada e mostra o catálogo inteiro, todo simulado.
 */
export const ROTULO_DA_DISPONIBILIDADE: Record<Disponibilidade, string> = {
  disponivel: 'Disponível',
  'em-teste': 'Em teste',
  'em-breve': 'Em breve',
}

export const MOTIVO_DA_INDISPONIBILIDADE: Record<Exclude<Disponibilidade, 'disponivel'>, string> = {
  'em-teste': 'Este Sinal ainda não roda de verdade: o teste com dados reais não terminou.',
  'em-breve': 'Este Sinal chega em breve. Você poderá monitorá-lo assim que passar no teste.',
}

/** Um tipo sem estado informado (a Demonstração) ou disponível deixa criar Monitoramento. */
export function podeMonitorar(tipo: Pick<TipoDeSinal, 'disponibilidade'>): boolean {
  return !tipo.disponibilidade || tipo.disponibilidade === 'disponivel'
}

export function motivoDaIndisponibilidade(tipo: Pick<TipoDeSinal, 'disponibilidade'>): string | null {
  return tipo.disponibilidade && tipo.disponibilidade !== 'disponivel' ? MOTIVO_DA_INDISPONIBILIDADE[tipo.disponibilidade] : null
}

export function SeloDaDisponibilidade({ disponibilidade }: { disponibilidade: Disponibilidade }) {
  return (
    <span className={cn('selo', disponibilidade === 'disponivel' && 'border-al-sucesso/60 text-al-ink')}>
      {ROTULO_DA_DISPONIBILIDADE[disponibilidade]}
    </span>
  )
}

/** O aviso no topo do catálogo: os Sinais que faltam entram quando passam no teste com dados reais. */
export function AvisoDeNovosSinais() {
  return (
    <aside role="note" aria-label="Novos Sinais" className="border-l-2 border-al-accent bg-al-surface px-4 py-3 text-sm">
      <p>
        <strong className="font-medium">Novos Sinais entram aqui assim que passam no teste.</strong> Em breve: Gupy, Google
        Ads, notícias, tecnologia do site, rodadas de investimento, Reclame Aqui e os Sinais próprios da Althius.
      </p>
    </aside>
  )
}
