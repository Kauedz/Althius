// O Playbook do Workspace nas telas: as seções fixas do playbook do setup, cada uma versionada. A fronteira entre a
// tela e o banco (playbook-do-workspace, tickets 01 e 02); a Demonstração usa a implementação simulada.

import type { FonteObservavel } from './tipos'

/** As seções, na ordem do modelo do setup. */
export const SECOES_DO_PLAYBOOK = [
  { id: 'empresa', nome: 'Empresa' },
  { id: 'icp', nome: 'ICP' },
  { id: 'mercado', nome: 'Mercado' },
  { id: 'personas', nome: 'Personas' },
  { id: 'processo_de_compra', nome: 'Processo de compra' },
  { id: 'dor_e_percepcao', nome: 'Dor e percepção' },
  { id: 'pipeline', nome: 'Pipeline' },
  { id: 'sla_e_metas', nome: 'SLA e metas' },
  { id: 'rotina', nome: 'Rotina' },
  { id: 'cadencia', nome: 'Cadência' },
  { id: 'scripts', nome: 'Scripts' },
  { id: 'templates', nome: 'Templates' },
  { id: 'objecoes', nome: 'Objeções' },
  { id: 'frameworks', nome: 'Frameworks' },
  { id: 'apresentacao', nome: 'Apresentação' },
  { id: 'negociacao_e_follow_up', nome: 'Negociação e follow-up' },
] as const

export type IdDaSecaoDoPlaybook = (typeof SECOES_DO_PLAYBOOK)[number]['id']

export function ehSecaoDoPlaybook(id: string | undefined): id is IdDaSecaoDoPlaybook {
  return SECOES_DO_PLAYBOOK.some((secao) => secao.id === id)
}

/** Uma linha de tabela do modelo: campo → texto. */
export type LinhaDoPlaybook = Record<string, string>

/** O conteúdo de uma seção: texto livre e, nas seções com tabela, as linhas dela. */
export interface ConteudoDoPlaybook {
  texto: string
  linhas: LinhaDoPlaybook[]
}

export interface VersaoDoPlaybook {
  versao: number
  /** O nome de quem gravou, ou nulo quando a pessoa já não está no Workspace. */
  autor: string | null
  /** ISO 8601. */
  em: string
}

/** A seção com a versão vigente (nula enquanto ninguém escreveu) e o histórico, da mais nova à mais antiga. */
export interface SecaoDoPlaybook {
  id: IdDaSecaoDoPlaybook
  nome: string
  vigente: (VersaoDoPlaybook & { conteudo: ConteudoDoPlaybook }) | null
  historico: VersaoDoPlaybook[]
}

export interface FonteDoPlaybook extends FonteObservavel {
  /** A seção com a versão vigente e o histórico. Todo participante ativo consulta. */
  secao(id: IdDaSecaoDoPlaybook): Promise<SecaoDoPlaybook>
  /** Grava o conteúdo como a próxima versão da seção. Só Administrador. Devolve o número da versão criada. */
  salvar(id: IdDaSecaoDoPlaybook, conteudo: ConteudoDoPlaybook): Promise<number>
  /** Grava uma versão nova com o conteúdo de uma versão antiga. Só Administrador. Devolve o número da versão criada. */
  restaurar(id: IdDaSecaoDoPlaybook, versao: number): Promise<number>
}
