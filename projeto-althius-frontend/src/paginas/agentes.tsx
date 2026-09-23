import { Bot, CalendarClock, MousePointerClick, Plus, Repeat2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LogoDaIntegracao } from '@/components/logos'
import { Carregando, IconeAgente, SeloDeEstado } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDados } from '@/fonte/contexto'
import type { Agente, Integracao } from '@/fonte/tipos'
import { descreverFrequencia } from '@/paginas/rotulos'

export function PaginaAgentes() {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])

  return (
    <Pagina
      titulo="Agentes"
      icone={Bot}
      acoes={
        <Button className="h-8 gap-2 bg-al-ink px-4 tracking-rotulo text-al-bg uppercase hover:bg-al-ink/90">
          <Plus strokeWidth={1.8} aria-hidden />
          Novo agente
        </Button>
      }
    >
      {!agentes || !integracoes ? (
        <Carregando />
      ) : (
        <ul aria-label="Agentes do Workspace" className="grid grid-cols-3 gap-4">
          {agentes.map((agente) => (
            <li key={agente.id}>
              <CartaoDeAgente agente={agente} integracoes={integracoes} />
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  )
}

function CartaoDeAgente({ agente, integracoes }: { agente: Agente; integracoes: Integracao[] }) {
  const quando = agente.rotinaAtiva ? descreverFrequencia(agente.rotinaAtiva) : 'Sob demanda'
  const IconeDoGatilho = agente.rotinaAtiva ? CalendarClock : MousePointerClick

  return (
    <Link
      to={`/agentes/${agente.id}`}
      aria-label={agente.nome}
      className="cartao flex h-full min-h-42 flex-col gap-2.5 border border-al-line p-5 transition-colors hover:border-al-muted"
    >
      <div className="flex items-center gap-2.5">
        <IconeAgente especialidade={agente.especialidade.id} />
        <span className="min-w-0 flex-1 leading-tight font-normal">{agente.nome}</span>
        <SeloDeEstado estado={agente.estado} />
      </div>
      <p className="line-clamp-2 text-sm leading-relaxed text-al-muted">{agente.descricao}</p>
      <div className="mt-auto flex items-center gap-3 pt-2 text-sm text-al-muted">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <IconeDoGatilho strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{quando}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap tabular-nums">
          <Repeat2 strokeWidth={1.8} className="size-3.5" aria-hidden />
          <strong className="font-normal text-al-ink">{agente.execucoes}</strong> execuções
        </span>
        <span className="flex items-center gap-1.5">
          {agente.integracoes.map((id) => (
            <LogoDaIntegracao key={id} id={id} nome={integracoes.find((i) => i.id === id)?.nome ?? id} />
          ))}
        </span>
      </div>
    </Link>
  )
}
