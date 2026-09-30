// Os adaptadores por tipo de Sinal (sinais-reais 03 a 06): cada um monta a entrada do actor e lê o resultado dele. Um
// adaptador só entra aqui depois de uma execução real do actor, com o formato do resultado visto de verdade; até lá, o
// Monitoramento daquele tipo espera ("Ainda não há adaptador"), e o registro mantém o actor "em teste".
import type { AdaptadorDeSinal } from './handler.ts'

export const ADAPTADORES: Record<string, AdaptadorDeSinal> = {}
