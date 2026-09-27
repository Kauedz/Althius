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

export const ERRO_SO_ADMINISTRADOR = 'Só Administradores do Workspace podem fazer isso.'

export const ERRO_ULTIMO_ADMINISTRADOR =
  'O Workspace precisa de pelo menos um Administrador. Torne outra pessoa Administrador antes.'

export const ERRO_TITULAR = 'O Titular do Workspace pessoal não pode ser removido nem rebaixado.'

export const ERRO_DE_PAPEL = 'Escolha Administrador ou Membro.'

export const ERRO_CONVITE_DE_OUTRO_EMAIL =
  'Este convite é para outro e-mail. Saia e entre com o e-mail que recebeu o convite, ou continue sem ele.'

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
