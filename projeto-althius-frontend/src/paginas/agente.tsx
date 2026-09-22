import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { Carregando, IconeAgente, ROTULO_DO_ESTADO } from '@/components/marca'
import { useDados } from '@/fonte/contexto'
import type { Agente, AgenteId } from '@/fonte/tipos'
import { cn } from '@/lib/utils'
import { SecaoAtividade } from '@/paginas/secoes/atividade'
import { SecaoCanais } from '@/paginas/secoes/canais'
import { SecaoConfiguracao } from '@/paginas/secoes/configuracao'
import { SecaoConversa } from '@/paginas/secoes/conversa'
import { SecaoHabilidades } from '@/paginas/secoes/habilidades'
import { SecaoMemoria } from '@/paginas/secoes/memoria'
import { SecaoRotinas } from '@/paginas/secoes/rotinas'

const SECOES = {
  conversa: { rotulo: 'Conversa', Componente: SecaoConversa },
  memoria: { rotulo: 'Memória', Componente: SecaoMemoria },
  habilidades: { rotulo: 'Habilidades', Componente: SecaoHabilidades },
  rotinas: { rotulo: 'Rotinas', Componente: SecaoRotinas },
  canais: { rotulo: 'Canais', Componente: SecaoCanais },
  configuracao: { rotulo: 'Configuração', Componente: SecaoConfiguracao },
  atividade: { rotulo: 'Atividade', Componente: SecaoAtividade },
} satisfies Record<string, { rotulo: string; Componente: (props: { agente: Agente }) => React.ReactNode }>

type SecaoId = keyof typeof SECOES

const IDS_DE_AGENTE: AgenteId[] = ['scopus', 'ethos', 'rhetor', 'oraculum']

export function PaginaAgente() {
  const { agenteId, secao } = useParams()
  const idValido = IDS_DE_AGENTE.includes(agenteId as AgenteId)
  const agente = useDados((fonte) => (idValido ? fonte.agente(agenteId as AgenteId) : Promise.resolve(null)), [agenteId])

  if (!idValido) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="titulo-display text-5xl">Agente não encontrado</h1>
        <Link to="/" className="text-al-accent underline">
          Voltar para os agentes
        </Link>
      </div>
    )
  }
  if (!(secao && secao in SECOES)) return <Navigate to={`/agentes/${agenteId}/conversa`} replace />
  if (!agente) return <Carregando />

  const { Componente } = SECOES[secao as SecaoId]

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-start gap-6">
        <IconeAgente id={agente.id} estado={agente.estado} tamanho="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-4">
            <h1 className="titulo-display text-6xl">{agente.nome}</h1>
            <span className="rotulo">{ROTULO_DO_ESTADO[agente.estado]}</span>
          </div>
          <span className="rotulo">{agente.especialidade}</span>
          <p className="max-w-2xl text-al-muted">{agente.descricao}</p>
        </div>
      </div>

      <nav aria-label="Seções do agente" className="border-b border-al-line">
        <ul className="flex gap-6">
          {Object.entries(SECOES).map(([id, { rotulo }]) => (
            <li key={id}>
              <NavLink
                to={`/agentes/${agente.id}/${id}`}
                className={({ isActive }) =>
                  cn(
                    '-mb-px block border-b-2 py-4 text-sm font-normal tracking-[0.18em] uppercase',
                    isActive ? 'border-al-accent text-al-ink' : 'border-transparent text-al-muted hover:text-al-ink',
                  )
                }
              >
                {rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Componente key={agente.id} agente={agente} />
    </div>
  )
}
