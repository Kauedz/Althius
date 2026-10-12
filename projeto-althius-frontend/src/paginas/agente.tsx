import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { Carregando, IconeAgente, SeloDeEstado } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import type { Agente } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'
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
  const podeAdministrar = usePodeAdministrarAgentes()
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
      acoes={agente.tipo === 'criado' && podeAdministrar && <ExcluirAgente agente={agente} />}
      className="gap-8"
    >
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

      <AbasSublinhadas
        rotuloAcessivel="Seções do agente"
        abas={Object.entries(SECOES).map(([id, { rotulo }]) => ({
          rotulo,
          para: `/agentes/${agente.id}/${id}`,
        }))}
      />

      <Componente key={agente.id} agente={agente} />
    </Pagina>
  )
}

/**
 * Só o Agente criado pode ser excluído (ADR 0005), sempre com confirmação. Tudo dele sai junto,
 * inclusive as Aprovações; as pendentes são canceladas.
 */
function ExcluirAgente({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const navegar = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const aprovacoes = useDados((f) => f.aprovacoes(), [])
  const pendentes = aprovacoes?.filter((a) => a.agenteId === agente.id && a.estado === 'pendente').length ?? 0
  const { erro, escrever } = useEscritaDeAgente()

  async function excluir() {
    if (await escrever(() => fonte.excluirAgente(agente.id))) navegar('/')
  }

  return (
    <>
      <Button variant="outline" onClick={() => setConfirmando(true)} className="h-8 gap-2 px-4 tracking-[0.04em]">
        <Trash2 strokeWidth={1.8} aria-hidden />
        Excluir agente
      </Button>
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="gap-6 p-6">
          <DialogTitle className="titulo-secao text-2xl">Excluir {agente.nome}?</DialogTitle>
          <DialogDescription className="text-al-muted">
            Tudo de {agente.nome} será excluído: Memória, Habilidades, Rotinas, Atividade e Aprovações. O agente
            padrão de {agente.especialidade.nome} continua.
          </DialogDescription>
          {pendentes > 0 && (
            <p>
              {pendentes === 1
                ? '1 Aprovação pendente será cancelada.'
                : `${pendentes} Aprovações pendentes serão canceladas.`}
            </p>
          )}
          <Mensagem tipo="erro">{erro}</Mensagem>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluir} className="px-6 tracking-[0.04em]">
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
