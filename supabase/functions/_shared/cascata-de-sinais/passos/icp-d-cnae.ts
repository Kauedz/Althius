// A tabela interna de CNAEs eletrointensivos do ICP D (energia e mercado livre).
//
// CRITÉRIO INTERNO REVISÁVEL: não existe uma lista oficial de "CNAE eletrointensivo". Esta seleção reúne atividades
// industriais em que a energia elétrica pesa muito no custo (cimento e cal, vidro, cerâmica, siderurgia, metalurgia de
// não ferrosos, fundição, papel e celulose, cloro-álcalis, gases industriais, fertilizantes, mineração de ferro, fiação).
// O que é verificável é o código e a descrição: cada subclasse foi conferida em 13/10/2026 na API de CNAE do IBGE
// (servicodados.ibge.gov.br/api/v2/cnae/subclasses/<código>). Quem muda a seleção muda só esta lista; o motor, o banco
// e os testes não dependem do tamanho dela. Não traz limiar de consumo nem fonte de "intensidade": é uma escolha do
// produto, e o Sinal que a usa diz isso na evidência.

export interface CnaeEletrointensivo {
  /** Subclasse CNAE com 7 dígitos, sem máscara. */
  codigo: string
  /** A descrição oficial da subclasse (IBGE), em minúsculas e sem a caixa alta do cadastro. */
  descricao: string
  /** O setor, para a conversa ("cimento e cal"). */
  setor: string
}

export const CRITERIO_CNAE_ELETROINTENSIVO =
  'Critério interno da Althius (revisável): atividades industriais em que a energia elétrica pesa muito no custo. Não é uma lista oficial.'

export const CNAES_ELETROINTENSIVOS: readonly CnaeEletrointensivo[] = [
  { codigo: '2320600', descricao: 'Fabricação de cimento', setor: 'cimento e cal' },
  { codigo: '2392300', descricao: 'Fabricação de cal e gesso', setor: 'cimento e cal' },
  { codigo: '2311700', descricao: 'Fabricação de vidro plano e de segurança', setor: 'vidro' },
  { codigo: '2312500', descricao: 'Fabricação de embalagens de vidro', setor: 'vidro' },
  { codigo: '2319200', descricao: 'Fabricação de artigos de vidro', setor: 'vidro' },
  { codigo: '2341900', descricao: 'Fabricação de produtos cerâmicos refratários', setor: 'cerâmica' },
  { codigo: '2342701', descricao: 'Fabricação de azulejos e pisos', setor: 'cerâmica' },
  { codigo: '2411300', descricao: 'Produção de ferro-gusa', setor: 'siderurgia' },
  { codigo: '2412100', descricao: 'Produção de ferroligas', setor: 'siderurgia' },
  { codigo: '2421100', descricao: 'Produção de semiacabados de aço', setor: 'siderurgia' },
  { codigo: '2422901', descricao: 'Produção de laminados planos de aço ao carbono, revestidos ou não', setor: 'siderurgia' },
  { codigo: '2423701', descricao: 'Produção de tubos de aço sem costura', setor: 'siderurgia' },
  { codigo: '2431800', descricao: 'Produção de tubos de aço com costura', setor: 'siderurgia' },
  { codigo: '2441501', descricao: 'Produção de alumínio e suas ligas em formas primárias', setor: 'metalurgia de não ferrosos' },
  { codigo: '2443100', descricao: 'Metalurgia do cobre', setor: 'metalurgia de não ferrosos' },
  { codigo: '2449101', descricao: 'Produção de zinco em formas primárias', setor: 'metalurgia de não ferrosos' },
  { codigo: '2451200', descricao: 'Fundição de ferro e aço', setor: 'fundição' },
  { codigo: '2452100', descricao: 'Fundição de metais não ferrosos e suas ligas', setor: 'fundição' },
  { codigo: '1710900', descricao: 'Fabricação de celulose e outras pastas para a fabricação de papel', setor: 'papel e celulose' },
  { codigo: '1721400', descricao: 'Fabricação de papel', setor: 'papel e celulose' },
  { codigo: '2011800', descricao: 'Fabricação de cloro e álcalis', setor: 'química' },
  { codigo: '2013402', descricao: 'Fabricação de adubos e fertilizantes, exceto organominerais', setor: 'química' },
  { codigo: '2014200', descricao: 'Fabricação de gases industriais', setor: 'química' },
  { codigo: '0710301', descricao: 'Extração de minério de ferro', setor: 'mineração' },
  { codigo: '1311100', descricao: 'Preparação e fiação de fibras de algodão', setor: 'têxtil' },
]

/** Só os dígitos de um CNAE ("23.20-6-00", "2320-6/00") quando formam uma subclasse de 7 dígitos; senão, vazio. */
export function cnaeLimpo(valor: unknown): string {
  const digitos = (typeof valor === 'string' || typeof valor === 'number' ? String(valor) : '').replace(/\D/g, '')
  return digitos.length === 7 ? digitos : ''
}

export function cnaeEletrointensivo(valor: unknown): CnaeEletrointensivo | undefined {
  const codigo = cnaeLimpo(valor)
  return codigo ? CNAES_ELETROINTENSIVOS.find((c) => c.codigo === codigo) : undefined
}

const SEMANA_EM_MS = 7 * 24 * 60 * 60 * 1000

/**
 * O rodízio semanal: a Receita só deixa buscar um CNAE por execução, então, quando o pedido não nomeia o setor, cada
 * semana (contada desde 1970-01-05, uma segunda-feira) olha a subclasse seguinte da tabela. Determinístico: o mesmo
 * instante dá sempre o mesmo CNAE.
 */
export function cnaeDoRodizio(agora: number): CnaeEletrointensivo {
  const semana = Math.floor((agora - 4 * 24 * 60 * 60 * 1000) / SEMANA_EM_MS)
  const n = CNAES_ELETROINTENSIVOS.length
  return CNAES_ELETROINTENSIVOS[((semana % n) + n) % n]
}
