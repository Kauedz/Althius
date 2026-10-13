// As tabelas internas do ICP C (jurídico empresarial): o setor (divisões do CNAE) que cada agência ou assunto regulatório
// atinge (C2) e o impacto da reforma tributária por setor (C4). São leituras do produto, não fonte oficial: a de impacto
// parte da EC 132/2023 e da LC 214/2025 e deve ser validada por especialista antes de ir ao cliente. Nada aqui fala com a rede.
import { contemAlgum } from '../../../signal-runner/adaptadores/comum.ts'

export interface SetorRegulado {
  setor: string
  /** Divisões do CNAE (2 dígitos) que o assunto atinge. */
  divisoes: string[]
  /** Termos já sem acento e em minúsculas; comparam por palavra inteira. */
  termos: string[]
}

export const SETORES_REGULADOS: SetorRegulado[] = [
  { setor: 'Energia elétrica', divisoes: ['35'], termos: ['aneel', 'agencia nacional de energia eletrica', 'energia eletrica', 'mercado livre de energia'] },
  { setor: 'Petróleo, gás e combustíveis', divisoes: ['06', '19', '35', '47'], termos: ['anp', 'agencia nacional do petroleo', 'combustiveis', 'petroleo', 'gas natural', 'biocombustiveis'] },
  { setor: 'Telecomunicações e radiodifusão', divisoes: ['60', '61'], termos: ['anatel', 'agencia nacional de telecomunicacoes', 'telecomunicacoes', 'radiodifusao'] },
  { setor: 'Saúde suplementar', divisoes: ['65', '86'], termos: ['ans', 'agencia nacional de saude suplementar', 'planos de saude', 'operadoras de planos'] },
  { setor: 'Vigilância sanitária (medicamentos, alimentos e cosméticos)', divisoes: ['10', '20', '21', '32', '47'], termos: ['anvisa', 'vigilancia sanitaria', 'medicamentos', 'dispositivos medicos', 'cosmeticos'] },
  { setor: 'Transporte terrestre', divisoes: ['49'], termos: ['antt', 'agencia nacional de transportes terrestres', 'transporte rodoviario', 'transporte ferroviario'] },
  { setor: 'Transporte aquaviário e portos', divisoes: ['50', '52'], termos: ['antaq', 'agencia nacional de transportes aquaviarios', 'portuario', 'navegacao'] },
  { setor: 'Aviação civil', divisoes: ['51', '52'], termos: ['anac', 'agencia nacional de aviacao civil', 'aviacao civil', 'transporte aereo'] },
  { setor: 'Água e saneamento', divisoes: ['36', '37'], termos: ['agencia nacional de aguas', 'saneamento', 'recursos hidricos'] },
  { setor: 'Mineração', divisoes: ['05', '07', '08', '09'], termos: ['anm', 'agencia nacional de mineracao', 'mineracao'] },
  { setor: 'Mercado financeiro, seguros e previdência', divisoes: ['64', '65', '66'], termos: ['banco central', 'conselho monetario nacional', 'cvm', 'comissao de valores mobiliarios', 'susep', 'previc', 'instituicoes financeiras', 'mercado de capitais', 'seguros', 'previdencia complementar'] },
  { setor: 'Audiovisual', divisoes: ['59'], termos: ['ancine', 'agencia nacional do cinema'] },
]

/** Os assuntos da reforma tributária do consumo: atingem todos os setores. */
export const TERMOS_REFORMA = [
  'ibs', 'cbs', 'reforma tributaria', 'imposto sobre bens e servicos', 'contribuicao sobre bens e servicos', 'comite gestor',
  'imposto seletivo', 'lei complementar 214',
]

export const SETOR_DA_REFORMA = 'Todos os setores (tributação do consumo)'

/** O texto de um ato (título, órgão, ementa) contra as tabelas: a regra que vale sem o modelo de linguagem. */
export function classificarPorPalavras(texto: string): { reforma: boolean; setores: { setor: string; divisoes: string[] }[] } {
  return {
    reforma: contemAlgum(texto, TERMOS_REFORMA),
    setores: SETORES_REGULADOS.filter((s) => contemAlgum(texto, s.termos)).map(({ setor, divisoes }) => ({ setor, divisoes })),
  }
}

export interface ImpactoDoSetor {
  /** Divisão do CNAE (2 dígitos). */
  divisao: string
  setor: string
  impacto: 'alto' | 'medio' | 'baixo'
  tipo: 'regime_especifico' | 'imposto_seletivo' | 'aliquota_reduzida' | 'regime_geral' | 'aliquota_zero'
  motivo: string
  /** Um CNAE de 7 dígitos do setor, para listar empresas ativas dele. */
  cnaeRepresentativo: string
}

// Ordem = prioridade de rodada dentro de cada impacto. Impacto: alto = regime específico ou imposto seletivo (a regra geral
// não vale e o contencioso e o planejamento são maiores); médio = alíquota reduzida ou regime geral com fim da cumulatividade;
// baixo = alíquota zero.
export const IMPACTO_DA_REFORMA: ImpactoDoSetor[] = [
  { divisao: '64', setor: 'Serviços financeiros', impacto: 'alto', tipo: 'regime_especifico', motivo: 'tem regime específico na LC 214/2025, com base de cálculo e créditos próprios', cnaeRepresentativo: '6422100' },
  { divisao: '68', setor: 'Atividades imobiliárias', impacto: 'alto', tipo: 'regime_especifico', motivo: 'operações com bens imóveis têm regime específico na LC 214/2025', cnaeRepresentativo: '6821801' },
  { divisao: '41', setor: 'Construção de edifícios', impacto: 'alto', tipo: 'regime_especifico', motivo: 'incorporação e construção seguem o regime de bens imóveis da LC 214/2025', cnaeRepresentativo: '4120400' },
  { divisao: '65', setor: 'Seguros e planos de saúde', impacto: 'alto', tipo: 'regime_especifico', motivo: 'seguros e planos de saúde têm regime específico na LC 214/2025', cnaeRepresentativo: '6512000' },
  { divisao: '19', setor: 'Combustíveis e derivados de petróleo', impacto: 'alto', tipo: 'regime_especifico', motivo: 'combustíveis têm regime específico (cobrança concentrada) na LC 214/2025', cnaeRepresentativo: '1921700' },
  { divisao: '29', setor: 'Veículos automotores', impacto: 'alto', tipo: 'imposto_seletivo', motivo: 'veículos entram no Imposto Seletivo, além do IBS e da CBS', cnaeRepresentativo: '2910701' },
  { divisao: '49', setor: 'Transporte terrestre', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'transporte coletivo tem alíquota reduzida; o de carga entra no regime geral com crédito amplo', cnaeRepresentativo: '4930201' },
  { divisao: '47', setor: 'Comércio varejista', impacto: 'medio', tipo: 'regime_geral', motivo: 'regime geral: fim da cumulatividade, crédito amplo e cobrança no destino', cnaeRepresentativo: '4711302' },
  { divisao: '46', setor: 'Comércio atacadista', impacto: 'medio', tipo: 'regime_geral', motivo: 'regime geral: crédito amplo e fim da guerra fiscal do ICMS', cnaeRepresentativo: '4639701' },
  { divisao: '62', setor: 'Tecnologia da informação', impacto: 'medio', tipo: 'regime_geral', motivo: 'serviço no regime geral: troca de ISS e PIS/Cofins por IBS e CBS', cnaeRepresentativo: '6201501' },
  { divisao: '86', setor: 'Saúde', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'serviços de saúde têm alíquota reduzida na LC 214/2025', cnaeRepresentativo: '8610101' },
  { divisao: '85', setor: 'Educação', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'serviços de educação têm alíquota reduzida na LC 214/2025', cnaeRepresentativo: '8513900' },
  { divisao: '55', setor: 'Hospedagem', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'hotelaria tem tratamento diferenciado na LC 214/2025', cnaeRepresentativo: '5510801' },
  { divisao: '56', setor: 'Alimentação fora do lar', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'bares e restaurantes têm tratamento diferenciado na LC 214/2025', cnaeRepresentativo: '5611201' },
  { divisao: '35', setor: 'Energia elétrica', impacto: 'medio', tipo: 'regime_geral', motivo: 'troca de ICMS, PIS e Cofins por IBS e CBS sobre toda a cadeia', cnaeRepresentativo: '3514000' },
  { divisao: '61', setor: 'Telecomunicações', impacto: 'medio', tipo: 'regime_geral', motivo: 'troca de ICMS, ISS e PIS/Cofins por IBS e CBS', cnaeRepresentativo: '6110801' },
  { divisao: '69', setor: 'Serviços jurídicos e contábeis', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'profissões regulamentadas têm redução de alíquota na LC 214/2025', cnaeRepresentativo: '6911701' },
  { divisao: '36', setor: 'Água e saneamento', impacto: 'medio', tipo: 'aliquota_reduzida', motivo: 'saneamento tem alíquota reduzida na LC 214/2025', cnaeRepresentativo: '3600601' },
  { divisao: '10', setor: 'Alimentos', impacto: 'baixo', tipo: 'aliquota_zero', motivo: 'itens da cesta básica nacional têm alíquota zero', cnaeRepresentativo: '1011201' },
  { divisao: '01', setor: 'Agropecuária', impacto: 'baixo', tipo: 'aliquota_reduzida', motivo: 'produtos agropecuários têm tratamento reduzido na LC 214/2025', cnaeRepresentativo: '0115600' },
]

/** A divisão (2 dígitos) de um CNAE em qualquer forma ("4930201", "49.30-2-01"); vazio se não houver dígitos. */
export function divisaoDoCnae(cnae: string): string {
  return cnae.replace(/\D/g, '').slice(0, 2)
}

export function impactoDaDivisao(divisao: string): ImpactoDoSetor | undefined {
  return IMPACTO_DA_REFORMA.find((i) => i.divisao === divisao)
}
