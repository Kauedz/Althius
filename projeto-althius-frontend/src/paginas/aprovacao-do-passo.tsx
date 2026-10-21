// A Aprovação que um Agente pediu num passo de ferramenta, mostrada ali mesmo na Conversa (ADR-0022): a ação, o impacto e,
// enquanto pendente, Aprovar e Recusar. Só o Administrador decide; os demais veem o estado. A mesma Aprovação também
// está na fila /aprovacoes, onde o Administrador decide as que foram pedidas nas Conversas dos outros. A nova versão de
// uma seção do Playbook que o Scopus ou o Ethos propôs (CRM-09) aparece aqui também, com a vigente ao lado da proposta, e
// a Sequência que o Rhetor propôs (cadencia-pela-ia 02), que só o Vendedor responsável decide.
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { CartaoDeRevisaoDoPlaybook } from '@/paginas/cartao-de-revisao-do-playbook'
import { useAmbiente, useDados } from '@/fonte/contexto'
import { lerFilaDeAprovacoes } from '@/fonte/fila-de-aprovacoes'
import { ehRevisaoDoPlaybook, ehSequenciaProposta, podeDecidir } from '@/fonte/regras'
import { PropostaDeSequencia } from '@/paginas/proposta-de-sequencia'
import type { LinkDoPasso } from '@/fonte/tipos'

export function AprovacaoDoPasso({ link }: { link?: LinkDoPasso }) {
  if (link?.tipo !== 'aprovacao') return null
  return <CartaoDaAprovacao aprovacaoId={link.id} />
}

function CartaoDaAprovacao({ aprovacaoId }: { aprovacaoId: string }) {
  const { modo } = useAmbiente()
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const aprovacoes = useDados(lerFilaDeAprovacoes, [])
  const aprovacao = aprovacoes?.find((a) => a.id === aprovacaoId)
  if (aprovacao && ehSequenciaProposta(aprovacao)) {
    return <PropostaDeSequencia aprovacao={aprovacao} onde="conversa" compacto />
  }
  if (aprovacao && ehRevisaoDoPlaybook(aprovacao)) {
    return <CartaoDeRevisaoDoPlaybook aprovacao={aprovacao} onde="conversa" compacto />
  }
  return (
    <AprovacaoNaConversa
      aprovacaoId={aprovacaoId}
      podeDecidir={podeDecidir('acao', workspace?.papel, modo)}
      cabecalho={(_aprovacao, rotuloDoEstado) => <span className="rotulo text-al-accent">{rotuloDoEstado}</span>}
      className="cartao w-full gap-2 border border-al-line p-4 text-al-ink"
    />
  )
}
