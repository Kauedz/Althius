import type { Decisao, Especialidade, Permissao } from './tipos'

/** ADR 0002: Ler por padrão; Propor em qualquer Integração que escreve ou gasta. */
export function permissaoPadrao(integracao: { escreve: boolean }): Permissao {
  return integracao.escreve ? 'propor' : 'ler'
}

/** ADR 0005: o nome de um Agente criado é sempre "Especialidade · complemento". */
export function nomeDeAgenteCriado(especialidade: Pick<Especialidade, 'nome'>, complemento: string): string {
  return `${especialidade.nome} · ${complemento.trim()}`
}

export const ROTULO_DA_DECISAO: Record<Decisao, string> = {
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
}
