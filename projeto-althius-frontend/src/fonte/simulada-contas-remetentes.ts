// As Contas remetentes na Demonstração: nenhuma identidade real é conectada a um ambiente de exemplo. A lista é
// vazia e a conexão é recusada; a tela explica que as Contas remetentes se conectam no Workspace operacional.

import type { FonteDeContasRemetentes } from './contas-remetentes-tipos'

export const CONTAS_REMETENTES_NA_DEMONSTRACAO =
  'Na Demonstração, nenhuma Conta remetente é conectada. No seu Workspace operacional, você conecta o seu E-mail, WhatsApp e LinkedIn, e só você os vê e usa.'

export function criarFonteDeContasRemetentesDaDemonstracao(): FonteDeContasRemetentes {
  const recusar = () => Promise.reject(new Error(CONTAS_REMETENTES_NA_DEMONSTRACAO))
  return {
    observar: () => () => {},
    minhas: async () => [],
    cotasDeEntrada: async () => [],
    conectar: recusar,
    reconectar: recusar,
    desconectar: recusar,
  }
}
