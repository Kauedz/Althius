// As colunas das tabelas do modelo do playbook do setup, por seção. Só as seções que o modelo traz em tabela têm
// colunas; as outras são texto livre. O banco guarda as linhas como estão (playbook_do_workspace, ticket 01).

import type { IdDaSecaoDoPlaybook } from './playbook-tipos'

export interface ColunaDoPlaybook {
  campo: string
  rotulo: string
}

const colunas = (...pares: [string, string][]): ColunaDoPlaybook[] => pares.map(([campo, rotulo]) => ({ campo, rotulo }))

export const COLUNAS_DO_PLAYBOOK: Partial<Record<IdDaSecaoDoPlaybook, ColunaDoPlaybook[]>> = {
  mercado: colunas(['segmento', 'Segmento'], ['tam', 'TAM'], ['sam', 'SAM'], ['som', 'SOM'], ['complexidade', 'Complexidade']),
  personas: colunas(
    ['papel', 'Papel no comitê'],
    ['cargo', 'Cargo'],
    ['dores', 'Dores'],
    ['objecoes', 'Objeções'],
    ['gatilhos', 'Gatilhos'],
  ),
  processo_de_compra: colunas(['etapa', 'Etapa'], ['quem_decide', 'Quem decide'], ['criterio', 'Critério'], ['prazo', 'Prazo']),
  dor_e_percepcao: colunas(
    ['dor', 'Dor'],
    ['urgencia', 'Urgência'],
    ['consciencia', 'Consciência'],
    ['gravidade', 'Gravidade'],
    ['frequencia', 'Frequência'],
    ['pergunta', 'Pergunta'],
  ),
  pipeline: colunas(['etapa', 'Etapa'], ['definicao', 'Definição'], ['criterio_de_passagem', 'Critério de passagem']),
  sla_e_metas: colunas(['definicao', 'Definição'], ['criterio', 'Critério'], ['prazo', 'Prazo'], ['meta', 'Meta']),
  cadencia: colunas(['toque', 'Toque'], ['canal', 'Canal'], ['dia', 'Dia'], ['objetivo', 'Objetivo']),
  templates: colunas(['nome', 'Nome'], ['canal', 'Canal'], ['assunto', 'Assunto'], ['corpo', 'Corpo']),
  objecoes: colunas(['objecao', 'Objeção'], ['resposta', 'Resposta'], ['prova', 'Prova']),
}

/** Uma linha nova da seção, com todas as colunas vazias. */
export function linhaVazia(colunasDaSecao: ColunaDoPlaybook[]): Record<string, string> {
  return Object.fromEntries(colunasDaSecao.map(({ campo }) => [campo, '']))
}
