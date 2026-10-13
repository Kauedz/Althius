// A tabela interna de atividades (CNAE) do Sinal "setor mais afetado pela CBS/IBS" do ICP B.
//
// CRITÉRIO INTERNO, REVISÁVEL. Não é lista oficial nem foi validada por tributarista: cada linha é uma hipótese de trabalho
// do produto sobre quais atividades mudam mais de regime com a transição da CBS/IBS. A equipe revisa a tabela antes de o
// Sinal sair de "em teste" (passo humano); mudar uma linha não pede migração, só este arquivo e o teste.
// Cada linha é uma subclasse de 7 dígitos porque a busca por CNAE da fonte de CNPJ casa o código exato. As descrições são
// resumos do produto, não a denominação oficial do IBGE.

export const CRITERIO_DA_TABELA = 'interno-revisavel'

export interface SetorAfetado {
  /** Subclasse CNAE, 7 dígitos, sem máscara. */
  cnae: string
  descricao: string
  grupo: string
  impacto: 'alto' | 'medio'
  /** Sempre começa por "Hipótese de trabalho": não é regra oficial. */
  motivo: string
}

const h = (texto: string) => `Hipótese de trabalho: ${texto}`

export const SETORES_AFETADOS: readonly SetorAfetado[] = [
  { cnae: '6201501', descricao: 'Desenvolvimento de programas de computador sob encomenda', grupo: 'Serviços', impacto: 'alto', motivo: h('serviço hoje sujeito a ISS, que passa para o IBS junto com a CBS; a carga e o crédito mudam.') },
  { cnae: '6209100', descricao: 'Suporte técnico e manutenção em tecnologia da informação', grupo: 'Serviços', impacto: 'alto', motivo: h('serviço hoje sujeito a ISS, que passa para o IBS junto com a CBS; a carga e o crédito mudam.') },
  { cnae: '6920601', descricao: 'Atividades de contabilidade', grupo: 'Serviços profissionais', impacto: 'alto', motivo: h('serviço profissional hoje sujeito a ISS; a transição muda a carga e a apuração do cliente.') },
  { cnae: '6911701', descricao: 'Serviços advocatícios', grupo: 'Serviços profissionais', impacto: 'alto', motivo: h('serviço profissional hoje sujeito a ISS; a transição muda a carga e a apuração do cliente.') },
  { cnae: '7020400', descricao: 'Consultoria em gestão empresarial', grupo: 'Serviços profissionais', impacto: 'alto', motivo: h('serviço hoje sujeito a ISS, que passa para o IBS junto com a CBS; a carga e o crédito mudam.') },
  { cnae: '7112000', descricao: 'Serviços de engenharia', grupo: 'Serviços profissionais', impacto: 'alto', motivo: h('serviço hoje sujeito a ISS, que passa para o IBS junto com a CBS; a carga e o crédito mudam.') },
  { cnae: '7311400', descricao: 'Agências de publicidade', grupo: 'Serviços', impacto: 'medio', motivo: h('serviço hoje sujeito a ISS, que passa para o IBS junto com a CBS; a carga e o crédito mudam.') },
  { cnae: '4120400', descricao: 'Construção de edifícios', grupo: 'Construção e imóveis', impacto: 'alto', motivo: h('cadeia longa de insumos e serviços; a regra de crédito e o tratamento de imóveis mudam.') },
  { cnae: '4110700', descricao: 'Incorporação de empreendimentos imobiliários', grupo: 'Construção e imóveis', impacto: 'alto', motivo: h('operações com imóveis têm tratamento próprio na reforma; a apuração muda.') },
  { cnae: '6821801', descricao: 'Corretagem e avaliação de imóveis', grupo: 'Construção e imóveis', impacto: 'medio', motivo: h('serviço ligado a operações com imóveis, que têm tratamento próprio na reforma.') },
  { cnae: '6422100', descricao: 'Bancos múltiplos com carteira comercial', grupo: 'Financeiro', impacto: 'alto', motivo: h('serviços financeiros têm tratamento próprio na reforma; a apuração muda.') },
  { cnae: '4930202', descricao: 'Transporte rodoviário de carga intermunicipal, interestadual e internacional', grupo: 'Transporte e comércio', impacto: 'alto', motivo: h('transporte interestadual hoje sujeito a ICMS, que passa para o IBS; a cobrança no destino muda a apuração.') },
  { cnae: '4711302', descricao: 'Supermercados', grupo: 'Transporte e comércio', impacto: 'medio', motivo: h('comércio hoje sujeito a ICMS, que passa para o IBS; muitos itens têm alíquota diferenciada.') },
  { cnae: '4781400', descricao: 'Comércio varejista de vestuário e acessórios', grupo: 'Transporte e comércio', impacto: 'medio', motivo: h('comércio hoje sujeito a ICMS, que passa para o IBS; a apuração muda.') },
  { cnae: '8630503', descricao: 'Atividade médica ambulatorial restrita a consultas', grupo: 'Saúde, educação e alimentação', impacto: 'medio', motivo: h('atividade com tratamento diferenciado previsto na reforma; a apuração muda.') },
  { cnae: '5611201', descricao: 'Restaurantes e similares', grupo: 'Saúde, educação e alimentação', impacto: 'medio', motivo: h('atividade com tratamento diferenciado previsto na reforma; a apuração muda.') },
]

/** Só os dígitos do código (aceita a máscara do IBGE: 6920-6/01). */
function digitos(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/\D/g, '') : ''
}

/** 6920601 → 6920-6/01; código que não é subclasse de 7 dígitos volta como veio (só os dígitos). */
export function mascaraCnae(cnae: string): string {
  const d = digitos(cnae)
  return d.length === 7 ? `${d.slice(0, 4)}-${d[4]}/${d.slice(5)}` : d
}

export function setorDoCnae(cnae: unknown): SetorAfetado | undefined {
  const d = digitos(cnae)
  return d ? SETORES_AFETADOS.find((s) => s.cnae === d) : undefined
}

/** O setor do mês: um por mês, andando pela tabela; o mesmo mês dá sempre o mesmo setor. */
export function setorDoMes(ano: number, mes: number): SetorAfetado {
  const n = SETORES_AFETADOS.length
  const indice = (((ano * 12 + (mes - 1)) % n) + n) % n
  return SETORES_AFETADOS[indice]
}
