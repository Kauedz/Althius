import { createContext, useContext } from 'react'
import { Link } from 'react-router-dom'

/**
 * As páginas dos quatro Agentes antigos são só leitura (Sinais first 10): as sub-abas mostram o que já existia, sem
 * escrever nem continuar a Conversa. Fora de `PaginaAgente`, vale `false`.
 */
export const SomenteLeituraDoAgente = createContext(false)

export function useSomenteLeituraDoAgente() {
  return useContext(SomenteLeituraDoAgente)
}

/** No lugar de Aprovar e Recusar, numa Conversa só leitura: a Aprovação pendente continua decidível na fila. */
export function DecidirEmAprovacoes() {
  return (
    <Link to="/aprovacoes" className="self-start text-sm underline underline-offset-4">
      Decidir em Aprovações
    </Link>
  )
}
