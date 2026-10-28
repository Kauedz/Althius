import { createContext, useContext } from 'react'

/**
 * As páginas dos quatro Agentes antigos são só leitura (Sinais first 10): as sub-abas mostram o que já existia, sem
 * escrever nem continuar a Conversa. Fora de `PaginaAgente`, vale `false`.
 */
export const SomenteLeituraDoAgente = createContext(false)

export function useSomenteLeituraDoAgente() {
  return useContext(SomenteLeituraDoAgente)
}
