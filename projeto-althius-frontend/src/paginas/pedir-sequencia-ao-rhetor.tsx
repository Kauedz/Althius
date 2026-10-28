import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useConversas } from '@/conversa/contexto'
import { useAmbiente } from '@/fonte/contexto'
import type { ContaAlvo } from '@/fonte/contas-tipos'

/** O pedido coordenado, com o nome e o id da Conta-alvo para a etapa interna de Sequência. */
function pedidoDeSequencia(conta: Pick<ContaAlvo, 'id' | 'nome'>): string {
  return `Monte uma Sequência de e-mail para a Conta-alvo ${conta.nome} (id ${conta.id}), a partir do Sinal que a deixou Quente e da Cadência do Playbook.`
}

/**
 * "Pedir Sequência" (cadencia-pela-ia 02; Sinais first 11): na Conta Quente sem Sequência em andamento, o Vendedor
 * responsável começa uma Conversa coordenada nova já com o pedido, como o composer da tela inicial, e vai para
 * `/conversa`. A tela não procura mais um Agente pela Especialidade nem abre `/agentes/:agenteId/conversa`, que é só
 * leitura desde o ticket 10: a Coordenação escolhe o Agente que tem as ferramentas de Sequência, e o banco só aceita a proposta de quem tem a Permissão de Propor em Sequência. A Sequência só
 * nasce na Aprovação, e os envios só no "Ativar envios". Decisão isolada nesta função: trocar o destino do pedido (por
 * exemplo, uma etapa interna chamada direto) não muda o resto da tela. Só no Workspace operacional: a Demonstração
 * continua com o nascimento simulado.
 */
export function PedirSequenciaAoRhetor({ conta }: { conta: ContaAlvo }) {
  const { modo } = useAmbiente()
  const conversas = useConversas()
  const navegar = useNavigate()
  if (modo !== 'real' || !conta.quente) return null

  function pedir() {
    conversas.coordenar({ texto: pedidoDeSequencia(conta) })
    navegar('/conversa')
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={pedir}
      className="rounded-md inline-flex items-center gap-1.5 h-9 border-al-line px-4 text-sm font-medium tracking-[0.04em] hover:bg-al-surface shrink-0"
    >
      <Sparkles className="size-3.5" />
      Pedir Sequência
    </Button>
  )
}
