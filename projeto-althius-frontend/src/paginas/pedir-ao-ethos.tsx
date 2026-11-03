import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useConversas } from '@/conversa/contexto'
import type { ContaAlvo } from '@/fonte/contas-tipos'
import type { Agente } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/**
 * O pedido ao Ethos com a Conta, o Estágio e o critério do Playbook. O Ethos ainda não grava Contatos na Althius: ele
 * confere o que já está cumprido e busca o que falta pelas Integrações conectadas, para o Vendedor registrar.
 */
function pedidoDoCriterio(conta: Pick<ContaAlvo, 'id' | 'nome'>, estagio: string, criterio: string): string {
  return (
    `O Playbook pede, para a Conta-alvo ${conta.nome} (id ${conta.id}) entrar em ${estagio}: ${criterio}. ` +
    'Leia a Conta e os Contatos, diga o que já está cumprido e o que falta, e busque o que faltar pelas Integrações ' +
    'conectadas. Você ainda não grava Contatos na Althius: liste o que achou para eu registrar.'
  )
}

/**
 * "Pedir ao Ethos" (kanban 04): a oferta de completar o critério de passagem do Playbook. Abre uma Conversa nova com o
 * Ethos já com o pedido, como o "Gerar Sequência" faz com o Rhetor, e vai para ela. Quem usa carrega o Ethos uma vez e o
 * passa, para cada cartão não buscar os Agentes de novo; sem Ethos no Workspace, nada aparece.
 */
export function PedirAoEthos({
  ethos,
  conta,
  estagio,
  criterio,
  rotulo,
  className,
}: {
  ethos: Agente | undefined
  conta: Pick<ContaAlvo, 'id' | 'nome'>
  /** O rótulo do Estágio que o critério libera. */
  estagio: string
  criterio: string
  /** O nome acessível do botão, quando o texto visível não basta para dizer de qual Conta é. */
  rotulo?: string
  className?: string
}) {
  const conversas = useConversas()
  const navegar = useNavigate()
  if (!ethos) return null
  const { id } = ethos

  function pedir() {
    conversas.novaDoAgente(id)
    conversas.enviar(id, { texto: pedidoDoCriterio(conta, estagio, criterio) })
    navegar(`/agentes/${id}/conversa`)
  }

  return (
    <button
      type="button"
      onClick={pedir}
      aria-label={rotulo}
      className={cn(
        'rounded-md inline-flex h-7 items-center justify-center gap-1.5 border border-al-line bg-al-bg px-2 text-xs tracking-[0.04em] text-al-ink hover:bg-al-surface',
        className,
      )}
    >
      <Sparkles strokeWidth={1.8} className="size-3.5" aria-hidden />
      Pedir ao Ethos para completar
    </button>
  )
}
