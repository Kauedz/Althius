import { Link, Navigate, useParams } from 'react-router-dom'
import { SomenteLeituraDoAgente } from '@/paginas/secoes/somente-leitura'
import { AbasSublinhadas } from '@/components/abas'
import { Carregando, IconeAgente, SeloDeEstado } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { Agente } from '@/fonte/tipos'
import { SecaoAtividade } from '@/paginas/secoes/atividade'
import { SecaoConversa } from '@/paginas/secoes/conversa'
import { SecaoHabilidades } from '@/paginas/secoes/habilidades'
import { SecaoMemoria } from '@/paginas/secoes/memoria'
import { SecaoRotinas } from '@/paginas/secoes/rotinas'

const SECOES = {
  conversa: { rotulo: 'Conversa', Componente: SecaoConversa },
  memoria: { rotulo: 'Memória', Componente: SecaoMemoria },
  habilidades: { rotulo: 'Habilidades', Componente: SecaoHabilidades },
  rotinas: { rotulo: 'Rotinas', Componente: SecaoRotinas },
  atividade: { rotulo: 'Atividade', Componente: SecaoAtividade },
} satisfies Record<string, { rotulo: string; Componente: (props: { agente: Agente }) => React.ReactNode }>

type SecaoId = keyof typeof SECOES

export function PaginaAgente() {
  const { agenteId, secao } = useParams()
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const { disponivel } = useAmbiente()
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
    <Pagina
      titulo={agente.nome}
      voltar={{ para: '/', rotulo: 'Agentes' }}
      className="gap-8"
    >
      <p className="text-sm text-al-muted">Este Agente foi retirado do produto. Você vê o que já existia, só para leitura.</p>
      <div className="flex items-start gap-4">
        <IconeAgente especialidade={agente.especialidade.id} tamanho="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="rotulo">
              {agente.especialidade.rotulo} · entrega: {agente.especialidade.entrega}
            </span>
            <SeloDeEstado estado={agente.estado} conversasDisponiveis={disponivel('conversas')} />
          </div>
          <p className="max-w-2xl text-al-muted">{agente.descricao}</p>
        </div>
      </div>

      <AbasSublinhadas
        rotuloAcessivel="Seções do agente"
        abas={Object.entries(SECOES).map(([id, { rotulo }]) => ({
          rotulo,
          para: `/agentes/${agente.id}/${id}`,
        }))}
      />

      <SomenteLeituraDoAgente.Provider value>
        <Componente key={agente.id} agente={agente} />
      </SomenteLeituraDoAgente.Provider>
    </Pagina>
  )
}
