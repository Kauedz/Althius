import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useConversas } from '@/conversa/contexto'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { ContaAlvo } from '@/fonte/contas-tipos'

/** O pedido que vai ao Rhetor, com o nome e o id da Conta-alvo para ele ler o Sinal e os Contatos dela. */
function pedidoDeSequencia(conta: Pick<ContaAlvo, 'id' | 'nome'>): string {
  return `Monte uma Sequência de e-mail para a Conta-alvo ${conta.nome} (id ${conta.id}), a partir do Sinal que a deixou Quente e da Cadência do Playbook.`
}

/**
 * "Pedir Sequência ao Rhetor" (cadencia-pela-ia 02): na Conta Quente sem Sequência em andamento, o Vendedor responsável
 * abre uma Conversa com o Rhetor já com o pedido. O Rhetor propõe; a Sequência só nasce na Aprovação dele, e os envios só
 * no "Ativar envios". Só no Workspace operacional: a Demonstração continua com o nascimento simulado.
 */
export function PedirSequenciaAoRhetor({ conta }: { conta: ContaAlvo }) {
  const { modo } = useAmbiente()
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const conversas = useConversas()
  const navegar = useNavigate()
  const rhetor = agentes?.find((a) => a.especialidade.id === 'rhetor' && a.tipo === 'padrao')
  if (modo !== 'real' || !conta.quente || !rhetor) return null

  function pedir() {
    if (!rhetor) return
    conversas.novaDoAgente(rhetor.id)
    conversas.enviar(rhetor.id, { texto: pedidoDeSequencia(conta) })
    navegar(`/agentes/${rhetor.id}/conversa`)
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={pedir}
      className="rounded-md inline-flex items-center gap-1.5 h-9 border-al-line px-4 text-sm font-medium tracking-[0.04em] hover:bg-al-surface shrink-0"
    >
      <Sparkles className="size-3.5" />
      Pedir Sequência ao Rhetor
    </Button>
  )
}
