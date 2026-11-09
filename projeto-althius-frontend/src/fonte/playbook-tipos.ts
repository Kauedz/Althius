// As seções do Playbook do Workspace, só para ler o histórico. O Playbook foi substituído pelo Contexto da empresa
// (contexto-da-empresa 07): nenhuma tela o edita, importa ou consulta. Ficam os nomes das seções, para as revisões
// antigas que continuam em Aprovações dizerem de que seção eram.

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
