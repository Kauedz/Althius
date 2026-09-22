import type { Decisao, Permissao } from './tipos'

/** ADR 0002: Ler por padrão; Propor em qualquer Integração que escreve ou gasta. */
export function permissaoPadrao(integracao: { escreve: boolean }): Permissao {
  return integracao.escreve ? 'propor' : 'ler'
}

export const ROTULO_DA_DECISAO: Record<Decisao, string> = {
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
}
