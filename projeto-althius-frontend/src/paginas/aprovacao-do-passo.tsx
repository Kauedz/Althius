// A Aprovação que um Agente pediu num passo de ferramenta, mostrada ali mesmo na Conversa (ADR-0022): a ação, o impacto e,
// enquanto pendente, Aprovar e Recusar. Só o Administrador decide; os demais veem o estado. A fila /aprovacoes continua
// desligada no Workspace operacional, então é aqui que a decisão acontece.
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { LinkDoPasso } from '@/fonte/tipos'

export function AprovacaoDoPasso({ link }: { link?: LinkDoPasso }) {
  if (link?.tipo !== 'aprovacao') return null
  return <CartaoDaAprovacao aprovacaoId={link.id} />
}

function CartaoDaAprovacao({ aprovacaoId }: { aprovacaoId: string }) {
  const { modo } = useAmbiente()
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const podeDecidir = modo === 'demonstracao' || workspace?.papel === 'administrador'
  return (
    <AprovacaoNaConversa
      aprovacaoId={aprovacaoId}
      podeDecidir={podeDecidir}
      cabecalho={(_aprovacao, rotuloDoEstado) => <span className="rotulo text-al-accent">{rotuloDoEstado}</span>}
      className="cartao w-full gap-2 border border-al-line p-4 text-al-ink"
    />
  )
}
