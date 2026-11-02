// A Aderência que o Scopus propôs para uma Conta-alvo (kanban-de-prospeccao 08), na fila /aprovacoes e no passo da
// Conversa em que ele a propôs: a Conta-alvo, Fit ou Não fit, o motivo e, enquanto pendente, Aprovar e Recusar só para o
// Vendedor responsável pela Conta (ADR-0009). Aprovada, a Aderência está gravada e o cartão se moveu (Fit a Fit, Não fit
// a Descartada). O estado vem da fila, então recarregar a Conversa mostra o mesmo.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import { podeDecidir } from '@/fonte/regras'
import type { AprovacaoDeAderencia, Decisao } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { ROTULO_DA_ADERENCIA } from './ordem-da-aderencia'

const ROTULO = ROTULO_DA_ADERENCIA

/** O fim da proposta em uma linha. */
function rotuloDoFim(aprovacao: AprovacaoDeAderencia): string {
  const { aderencia } = aprovacao
  switch (aprovacao.estado) {
    case 'pendente':
      return 'Aprovação pendente'
    case 'aprovada':
      return `${ROTULO[aderencia.aderencia]} gravado na Conta-alvo`
    case 'rejeitada':
      return aderencia.motivoDaRecusa
        ? `Recusada pelo sistema · ${aderencia.motivoDaRecusa}. Nada foi gravado.`
        : 'Recusada · nada foi gravado'
    case 'expirada':
      return 'Expirada · ninguém decidiu em 7 dias, e nada foi gravado'
    case 'cancelada':
      return 'Cancelada · nada foi gravado'
  }
}

export function PropostaDeAderencia({
  aprovacao,
  onde,
  compacto = false,
}: {
  aprovacao: AprovacaoDeAderencia
  onde: 'fila' | 'conversa'
  /** No passo da Conversa: menor, com o estado no topo. */
  compacto?: boolean
}) {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const agente = agentes?.find((a) => a.id === aprovacao.agenteId)
  const { aderencia } = aprovacao

  return (
    <article
      aria-label={aprovacao.acao}
      className={cn('flex flex-col', compacto ? 'cartao w-full gap-3 border border-al-line p-4 text-al-ink' : 'cartao gap-4 p-6')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {compacto && aprovacao.estado === 'pendente' && <span className="rotulo text-al-accent">Aprovação pendente</span>}
        {!compacto && agente && <IconeAgente especialidade={agente.especialidade.id} />}
        {!compacto && agente && (
          <Link to={`/agentes/${agente.id}`} className="font-normal underline-offset-4 hover:underline">
            {agente.nome}
          </Link>
        )}
        <span className="rotulo">Aderência</span>
        {!compacto && <span className="rotulo ml-auto">Pedido na Althius</span>}
      </div>
      <p className={compacto ? 'text-lg leading-snug font-normal' : 'text-xl font-normal'}>{aprovacao.acao}</p>
      <dl className={cn('grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2', compacto && 'text-sm')}>
        <dt className="rotulo">Conta-alvo</dt>
        <dd>
          <Link to={`/contas/${aderencia.contaId}`} className="font-normal underline-offset-4 hover:underline">
            {aderencia.contaNome || 'Ver a Conta-alvo'}
          </Link>
        </dd>
        <dt className="rotulo">Aderência</dt>
        <dd>{ROTULO[aderencia.aderencia]}</dd>
        {aderencia.motivo && (
          <>
            <dt className="rotulo">Motivo</dt>
            <dd className="text-al-muted">{aderencia.motivo}</dd>
          </>
        )}
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
      </dl>
      <DecisaoDaProposta aprovacao={aprovacao} onde={onde} />
    </article>
  )
}

function DecisaoDaProposta({ aprovacao, onde }: { aprovacao: AprovacaoDeAderencia; onde: 'fila' | 'conversa' }) {
  const fonte = useFonte()
  const { modo } = useAmbiente()
  const workspace = useDados((f) => f.workspace(), [])
  const [erro, setErro] = useState('')
  const [decidindo, setDecidindo] = useState(false)

  if (aprovacao.estado !== 'pendente') {
    return (
      <span className={cn('rotulo', aprovacao.estado === 'aprovada' ? 'text-al-sucesso' : 'text-al-erro')}>
        {rotuloDoFim(aprovacao)}
      </span>
    )
  }
  // Indefinido enquanto o Workspace carrega: nem os botões nem o aviso aparecem antes de saber quem é.
  if (workspace === undefined) return null
  if (!podeDecidir('aderencia', workspace?.papel, modo, aprovacao.aderencia.responsavel)) {
    return <p className="text-xs text-al-muted">Só o Vendedor responsável pela Conta-alvo decide esta Aderência.</p>
  }

  async function decidir(decisao: Decisao) {
    setErro('')
    setDecidindo(true)
    try {
      await fonte.decidirAprovacao(aprovacao.id, decisao, onde)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setDecidindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button disabled={decidindo} onClick={() => decidir('aprovada')} className="px-6 tracking-[0.04em]">
          Aprovar
        </Button>
        <Button variant="outline" disabled={decidindo} onClick={() => decidir('rejeitada')} className="px-6 tracking-[0.04em]">
          Recusar
        </Button>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}
