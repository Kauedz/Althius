import type { Aprovacao, CategoriaDeAprovacao, Decisao, Especialidade, Papel, Permissao } from './tipos'

/** ADR 0002: Ler por padrão; Propor em qualquer Integração que escreve ou gasta. */
export function permissaoPadrao(integracao: { escreve: boolean }): Permissao {
  return integracao.escreve ? 'propor' : 'ler'
}

/** ADR 0005: o nome de um Agente criado é sempre "Especialidade · complemento". */
export function nomeDeAgenteCriado(especialidade: Pick<Especialidade, 'nome'>, complemento: string): string {
  return `${especialidade.nome} · ${complemento.trim()}`
}

/** Como se diz a decisão de qualquer Aprovação: aprovada ou recusada. */
export const ROTULO_DA_DECISAO: Record<Decisao, string> = {
  aprovada: 'Aprovada',
  rejeitada: 'Recusada',
}

export const categoriaDa = (aprovacao: Aprovacao): CategoriaDeAprovacao =>
  aprovacao.revisao ? 'revisao-da-memoria' : 'acao'

/**
 * Quem decide cada categoria de Aprovação (ADR 0010): a Revisão da Memória do Workspace, só um Administrador; as
 * demais seguem como antes, com qualquer participante ativo.
 */
export function podeDecidir(categoria: CategoriaDeAprovacao, papel: Papel): boolean {
  return categoria !== 'revisao-da-memoria' || papel === 'administrador'
}

export const ERRO_SEM_PARTICIPACAO = 'Você não participa deste Workspace.'

/** Validação simples de formato, sem verificação real de e-mail (fluxo demonstrativo). */
export const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const ERRO_DE_EMAIL = 'Informe um e-mail em formato válido, como nome@empresa.com.'

export function ehEmailValido(email: string): boolean {
  return FORMATO_DE_EMAIL.test(email.trim())
}

/** Os dois únicos papéis de uma Participação no Workspace, na ordem em que aparecem nas escolhas. */
export const PAPEIS: readonly Papel[] = ['administrador', 'membro']

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  administrador: 'Administrador',
  membro: 'Membro',
}
