import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { Carregando, IconeAgente, SeloDeEstado } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { useDados } from '@/fonte/contexto'
import type { Agente } from '@/fonte/tipos'
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

export function PaginaAgente() {
  const { agenteId, secao } = useParams()
  const agentes = useDados((fonte) => fonte.agentes(), [])
  if (!agentes) return <Carregando />

  const agente = agentes.find((a) => a.id === agenteId)
  if (!agente) {
    return (
      <Pagina titulo="Agente não encontrado" voltar={{ para: '/', rotulo: 'Agentes' }}>
        <Link to="/" className="self-start underline underline-offset-4">
          Voltar para os agentes
        </Link>
      </Pagina>
    )
  }
  if (!(secao && secao in SECOES)) return <Navigate to={`/agentes/${agente.id}/conversa`} replace />

  const { Componente } = SECOES[secao as SecaoId]

  return (
    <Pagina titulo={agente.nome} voltar={{ para: '/', rotulo: 'Agentes' }} className="gap-8">
      <div className="flex items-start gap-4">
        <IconeAgente especialidade={agente.especialidade.id} tamanho="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="rotulo">
              {agente.especialidade.rotulo} · entrega: {agente.especialidade.entrega}
            </span>
            <SeloDeEstado estado={agente.estado} />
          </div>
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
                    '-mb-px block border-b-2 py-4 text-sm font-normal tracking-rotulo uppercase',
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
    </Pagina>
  )
}
