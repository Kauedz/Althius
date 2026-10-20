import { useNavigate } from 'react-router-dom'
import { useConversas } from '@/conversa/contexto'
import { HistoricoDeConversas } from '@/conversa/historico'
import type { ResumoDeConversa } from '@/fonte/tipos'

/**
 * As Conversas coordenadas salvas de quem está na sessão, para reabrir e continuar de onde pararam, e as que nasceram no
 * Slack, para ler. O mesmo histórico da Conversa com um Agente, com busca, grupos por data, renomear e arquivar. Só
 * existe onde as Conversas ficam no banco (o Workspace operacional); na Demonstração, a lista não aparece.
 */
export function ConversasSalvas() {
  const conversas = useConversas()
  const navegar = useNavigate()
  const { respondendo } = conversas.coordenada

  async function abrir(conversa: ResumoDeConversa) {
    // A do Slack abre só para leitura, na Conversa do Agente dela; a coordenada continua na página da Conversa.
    if (conversa.doSlack) {
      navegar(`/agentes/${encodeURIComponent(conversa.doSlack.agenteId)}/conversa?slack=${encodeURIComponent(conversa.id)}`)
      return
    }
    await conversas.abrir(conversa.id)
    navegar('/conversa')
  }

  return <HistoricoDeConversas agenteId={null} aoAbrir={abrir} versao={respondendo} ocultarVazio />
}
