// O vocabulário de setores da Aderência. O ICP é escrito em português ("Logística", "Corretora de seguros"); o LinkedIn
// declara a indústria em inglês ("Truck Transportation", "Insurance Agencies and Brokerages") e a Receita, a atividade
// pelo CNAE em português ("Transporte rodoviário de carga"). Cada raiz liga um setor do ICP aos nomes que as fontes usam.
// O termo do próprio ICP sempre vale também. O espelho no banco é `private.icp_sector_matches` (migração
// 20261218000000): mudar uma lista aqui pede a mesma mudança lá.
import { contemAlgum, normalizar } from '../signal-runner/adaptadores/comum.ts'

const LOGISTICA = [
  'Transportation, Logistics, Supply Chain and Storage', 'Truck Transportation', 'Freight and Package Transportation',
  'Warehousing and Storage', 'Logistics', 'Supply Chain', 'Freight', 'Warehousing', 'Transportation',
  'transporte', 'transportes', 'logistica', 'armazenamento', 'armazens gerais', 'carga', 'cargas',
]

/** Raiz (sem acento, minúscula) contida no setor do ICP -> nomes de indústria e de CNAE que contam como o mesmo setor. */
export const VOCABULARIO_DE_SETORES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['logistic', LOGISTICA],
  ['transport', LOGISTICA],
  ['segur', ['Insurance', 'Insurance Agencies and Brokerages', 'Insurance Carriers', 'seguros', 'seguro', 'corretores e agentes de seguros']],
  ['software', ['Software Development', 'IT Services and IT Consulting', 'desenvolvimento de programas de computador']],
  ['tecnolog', ['Software Development', 'IT Services and IT Consulting', 'Information Technology', 'tecnologia da informacao', 'desenvolvimento de programas de computador']],
  ['industri', ['Manufacturing', 'Machinery Manufacturing', 'Industrial Machinery Manufacturing', 'Industrial Automation', 'fabricacao']],
  ['manufatur', ['Manufacturing', 'Machinery Manufacturing', 'Industrial Machinery Manufacturing', 'fabricacao']],
  ['varej', ['Retail', 'comercio varejista']],
  ['atacad', ['Wholesale', 'comercio atacadista']],
  ['saude', ['Hospitals and Health Care', 'Medical Practices', 'atividades de atencao a saude humana', 'atendimento hospitalar']],
  ['educac', ['Education', 'Education Administration Programs', 'E-Learning Providers', 'Higher Education', 'educacao', 'ensino']],
  ['agro', ['Farming', 'Agriculture', 'cultivo', 'criacao de', 'agricultura']],
  ['constru', ['Construction', 'Civil Engineering', 'construcao', 'obras']],
  ['energ', ['Utilities', 'Renewable Energy', 'Renewables & Environment', 'Oil and Gas', 'energia eletrica', 'geracao de energia']],
  ['aliment', ['Food and Beverage Manufacturing', 'Food and Beverage Services', 'Food & Beverages', 'alimenticios', 'alimentos']],
  ['financ', ['Financial Services', 'Banking', 'Investment Management', 'servicos financeiros']],
]

/** Os nomes que contam como o setor `termo` do ICP: o próprio termo e os do vocabulário cuja raiz ele contém. */
export function termosDeSetor(termo: string): string[] {
  const n = normalizar(termo)
  const extras = VOCABULARIO_DE_SETORES.filter(([raiz]) => n.includes(raiz)).flatMap(([, nomes]) => nomes)
  return [termo, ...new Set(extras)]
}

/** O primeiro setor do ICP que bate com a atividade declarada (indústria do LinkedIn ou CNAE da Receita). */
export function setorBate(atividade: string, termos: string[]): string | undefined {
  return termos.find((termo) => contemAlgum(atividade, termosDeSetor(termo)))
}
