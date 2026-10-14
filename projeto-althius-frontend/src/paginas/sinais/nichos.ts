// Os oito nichos para quem a Althius vende. A letra existe só para redirecionar a URL antiga e para achar a cascata
// no banco (`icp` A–H). A tela e a URL mostram o nome e o slug.

export interface Nicho {
  /** Letra interna do Mapa. Não aparece na UI nem na URL. */
  letra: string
  slug: string
  nome: string
}

export const NICHOS: readonly Nicho[] = [
  { letra: 'A', slug: 'comex-e-importacao', nome: 'Comex e importação' },
  { letra: 'B', slug: 'contabilidade-e-tributario', nome: 'Contabilidade e tributário' },
  { letra: 'C', slug: 'juridico-empresarial', nome: 'Jurídico empresarial' },
  { letra: 'D', slug: 'energia-e-mercado-livre', nome: 'Energia e mercado livre' },
  { letra: 'E', slug: 'industria-fornecedores-b2b', nome: 'Indústria, fornecedores B2B' },
  { letra: 'F', slug: 'logistica-e-transporte', nome: 'Logística e transporte' },
  { letra: 'G', slug: 'corretoras-de-beneficios', nome: 'Corretoras de benefícios' },
  { letra: 'H', slug: 'agro-b2b', nome: 'Agro B2B' },
]

export const SLUGS_DE_NICHO = NICHOS.map((nicho) => nicho.slug)

export function nichoPorSlug(slug: string): Nicho | undefined {
  return NICHOS.find((nicho) => nicho.slug === slug)
}

export function nichoPorLetra(letra: string): Nicho | undefined {
  return NICHOS.find((nicho) => nicho.letra === letra)
}

/** Cargos sugeridos de Abertura de vagas, um conjunto por nicho. "Qualquer" mantém a lista geral do formulário. */
export const CARGOS_POR_NICHO: Readonly<Record<string, readonly string[]>> = {
  'comex-e-importacao': ['Analista de comércio exterior', 'Coordenador de importação', 'Especialista em drawback', 'Despachante aduaneiro'],
  'contabilidade-e-tributario': ['Analista fiscal', 'Coordenador tributário', 'Contador', 'Analista de obrigações acessórias'],
  'juridico-empresarial': ['Advogado empresarial', 'Analista jurídico', 'Coordenador de contratos', 'Compliance'],
  'energia-e-mercado-livre': ['Analista de energia', 'Gestor de mercado livre', 'Engenheiro eletricista', 'Comprador de energia'],
  'industria-fornecedores-b2b': ['Engenheiro de manutenção', 'Comprador industrial', 'Coordenador de produção', 'Engenheiro de processos'],
  'logistica-e-transporte': ['Analista de logística', 'Coordenador de transporte', 'Gerente de centro de distribuição', 'Planejador de rotas'],
  'corretoras-de-beneficios': ['Consultor de benefícios', 'Analista de recursos humanos', 'Coordenador de gente e gestão', 'Gerente de benefícios'],
  'agro-b2b': ['Agrônomo', 'Gerente comercial agro', 'Analista de crédito rural', 'Coordenador de compras agrícolas'],
}

/** Painéis de contexto em Mercado: movimento sem uma empresa. Não são cards do catálogo. */
export const PAINEIS_DE_MERCADO: readonly {
  id: string
  nome: string
  frase: string
  nichos: readonly string[]
  /** O `signal_type` da cascata, para ler o feed que já existe. */
  tipo: string
}[] = [
  {
    id: 'volume-por-porto',
    nome: 'Volume por porto',
    frase: 'Volume importado por porto, para ler o movimento do mercado sem apontar uma empresa.',
    nichos: ['comex-e-importacao', 'logistica-e-transporte'],
    tipo: 'volume_por_porto',
  },
  {
    id: 'setor-afetado-cbs-ibs',
    nome: 'Setor afetado pela CBS/IBS',
    frase: 'Quais atividades a transição da CBS e do IBS pressiona, como contexto do nicho.',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial'],
    tipo: 'setor_afetado_cbs_ibs',
  },
  {
    id: 'impacto-reforma-cnae',
    nome: 'Impacto da reforma por CNAE',
    frase: 'O efeito da reforma tributária por CNAE, para orientar a conversa sem ser um Sinal de uma Conta.',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial'],
    tipo: 'impacto_reforma_cnae',
  },
]
