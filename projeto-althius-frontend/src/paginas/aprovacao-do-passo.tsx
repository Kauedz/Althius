// A Aprovação que um Agente pediu num passo de ferramenta, mostrada ali mesmo na Conversa (ADR-0022): a ação, o impacto e,
// enquanto pendente, Aprovar e Recusar. Só o Administrador decide; os demais veem o estado. A mesma Aprovação também
// está na fila /aprovacoes, onde o Administrador decide as que foram pedidas nas Conversas dos outros.
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { useAmbiente, useDados } from '@/fonte/contexto'
import { podeDecidir } from '@/fonte/regras'
import type { LinkDoPasso } from '@/fonte/tipos'

export function AprovacaoDoPasso({ link }: { link?: LinkDoPasso }) {
  if (link?.tipo !== 'aprovacao') return null
  return <CartaoDaAprovacao aprovacaoId={link.id} />
}

function CartaoDaAprovacao({ aprovacaoId }: { aprovacaoId: string }) {
  const { modo } = useAmbiente()
  const workspace = useDados((fonte) => fonte.workspace(), [])
  return (
    <AprovacaoNaConversa
      aprovacaoId={aprovacaoId}
      podeDecidir={podeDecidir('acao', workspace?.papel, modo)}
      cabecalho={(_aprovacao, rotuloDoEstado) => <span className="rotulo text-al-accent">{rotuloDoEstado}</span>}
      className="cartao w-full gap-2 border border-al-line p-4 text-al-ink"
    />
  )
}
