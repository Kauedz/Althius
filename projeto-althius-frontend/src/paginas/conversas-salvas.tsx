import { useNavigate } from 'react-router-dom'
import { useConversas } from '@/conversa/contexto'
import { HistoricoDeConversas } from '@/conversa/historico'

/**
 * As Conversas coordenadas salvas de quem está na sessão, para reabrir e continuar de onde pararam: o mesmo histórico
 * da Conversa com um Agente, com busca, grupos por data, renomear e arquivar. Só existe onde as Conversas ficam no banco
 * (o Workspace operacional); na Demonstração, a lista não aparece.
 */
export function ConversasSalvas() {
  const conversas = useConversas()
  const navegar = useNavigate()
  const { respondendo } = conversas.coordenada

  async function abrir(id: string) {
    await conversas.abrir(id)
    navegar('/conversa')
  }

  return <HistoricoDeConversas agenteId={null} aoAbrir={abrir} versao={respondendo} ocultarVazio variante="pagina" />
}
