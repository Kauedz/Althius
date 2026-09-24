// Dados do mockup de Configurações (ticket 01): tudo local e descartável, sem tocar nas fontes do aplicativo.

export type Papel = 'administrador' | 'membro'

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  administrador: 'Administrador',
  membro: 'Membro',
}

/** Uma Participação no Workspace, com os dados da Conta de usuário de quem participa. */
export interface Participante {
  id: string
  nome: string
  email: string
  foto?: string
  papel: Papel
  cargo: string
  /** Outras Participações da mesma Conta de usuário, que a remoção deste Workspace preserva. */
  outrosWorkspaces: { nome: string; papel: Papel }[]
}

export interface Convite {
  id: string
  email: string
  papel: Papel
  enviadoEm: string
}

export const HOJE = '24/09/2026'

export const WORKSPACE = {
  nome: 'Databricks',
  descricao: 'Workspace de demonstração',
  criadoEm: '02/06/2026',
}

export const PARTICIPANTES_INICIAIS: Participante[] = [
  {
    id: 'marina',
    nome: 'Marina Alves',
    email: 'marina.alves@databricks.com',
    foto: '/avatars/avatar-3.jpg',
    papel: 'administrador',
    cargo: 'Head de Growth, LATAM',
    outrosWorkspaces: [],
  },
  {
    id: 'rafael',
    nome: 'Rafael Couto',
    email: 'rafael.couto@databricks.com',
    foto: '/avatars/avatar-8.jpg',
    papel: 'administrador',
    cargo: 'Diretor de Vendas, Brasil',
    outrosWorkspaces: [],
  },
  {
    id: 'lucas',
    nome: 'Lucas Moreira',
    email: 'lucas.moreira@databricks.com',
    papel: 'membro',
    cargo: 'SDR Enterprise',
    outrosWorkspaces: [],
  },
  {
    id: 'beatriz',
    nome: 'Beatriz Santos',
    email: 'beatriz.santos@databricks.com',
    foto: '/avatars/avatar-5.jpg',
    papel: 'membro',
    cargo: 'Marketing de Produto',
    outrosWorkspaces: [],
  },
  {
    id: 'thiago',
    nome: 'Thiago Ramos',
    email: 'thiago.ramos@databricks.com',
    papel: 'membro',
    cargo: 'Consultor de parcerias',
    outrosWorkspaces: [{ nome: 'Evolut Trading', papel: 'membro' }],
  },
]

export const CONVITES_INICIAIS: Convite[] = [
  { id: 'convite-carla', email: 'carla.nunes@databricks.com', papel: 'membro', enviadoEm: '22/09/2026' },
]

export const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const ERRO_DE_EMAIL = 'Informe um e-mail válido, como nome@empresa.com.'

export function iniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

// ── Memória do Workspace ───────────────────────────────────────────────

export type DocumentoId = 'icp' | 'personas'

export interface Secao {
  titulo: string
  texto: string
}

/** Um documento da Memória do Workspace: só a versão vigente, sem histórico. */
export interface Documento {
  id: DocumentoId
  secoes: Secao[]
  aprovadoEm: string
  aprovadoPor: string
  /** A proposta cuja aprovação produziu esta versão, se veio do mockup. */
  propostaId?: string
}

export const DOCUMENTOS: Record<
  DocumentoId,
  { nome: string; comArtigo: string; agente: 'Scopus' | 'Ethos'; especialidade: 'scopus' | 'ethos'; exemploDePedido: string }
> = {
  icp: {
    nome: 'ICP',
    comArtigo: 'do ICP',
    agente: 'Scopus',
    especialidade: 'scopus',
    exemploDePedido: 'Ex.: estamos fechando com empresas menores na Colômbia e no Chile.',
  },
  personas: {
    nome: 'Personas',
    comArtigo: 'das Personas',
    agente: 'Ethos',
    especialidade: 'ethos',
    exemploDePedido: 'Ex.: governança de dados aparece em quase todas as objeções.',
  },
}

export const MEMORIA_INICIAL: Record<DocumentoId, Documento> = {
  icp: {
    id: 'icp',
    aprovadoEm: '12/09/2026',
    aprovadoPor: 'Marina Alves',
    secoes: [
      { titulo: 'Segmentos', texto: 'Serviços financeiros, varejo e telecomunicações.' },
      { titulo: 'Porte', texto: 'Empresas com 2.000 funcionários ou mais.' },
      { titulo: 'Regiões', texto: 'Brasil e México.' },
      { titulo: 'Tecnologia', texto: 'Nuvem pública (AWS, Azure ou Google Cloud) e data warehouse legado em migração.' },
      { titulo: 'Maturidade de dados', texto: 'Time de dados próprio, com engenharia e ciência de dados.' },
      { titulo: 'Fora do ICP', texto: 'Empresas sem time de dados próprio ou com operação só em servidores locais.' },
    ],
  },
  personas: {
    id: 'personas',
    aprovadoEm: '05/09/2026',
    aprovadoPor: 'Rafael Couto',
    secoes: [
      {
        titulo: 'Decisor técnico',
        texto: 'CTO, VP de Engenharia ou Head de Dados. Avalia arquitetura, custo de nuvem e governança antes de recomendar a compra.',
      },
      {
        titulo: 'Patrocinador executivo',
        texto: 'CFO, COO ou CDO. Aprova o orçamento e cobra retorno do investimento em dados e IA.',
      },
      {
        titulo: 'Líder técnico',
        texto: 'Gerente de engenharia de dados ou tech lead. Conduz a prova de conceito e a migração.',
      },
      {
        titulo: 'Comitê executivo',
        texto: 'CEO e diretoria. Decide investimentos estratégicos acima do orçamento da área.',
      },
    ],
  },
}

/**
 * Roteiros das propostas simuladas: cada pedido aplica o próximo roteiro ao documento vigente.
 * Uma seção com texto novo substitui a de mesmo título; um título novo entra no fim.
 */
export const ROTEIROS: Record<DocumentoId, { resposta: string; mudancas: Secao[] }[]> = {
  icp: [
    {
      resposta: 'Cruzei os fechamentos de 2026 com as oportunidades abertas: empresas menores e a região andina estão convertendo.',
      mudancas: [
        { titulo: 'Porte', texto: 'Empresas com 1.000 funcionários ou mais.' },
        { titulo: 'Regiões', texto: 'Brasil, México, Colômbia e Chile.' },
      ],
    },
    {
      resposta: 'As últimas Contas-alvo com Fit vieram de saúde, e o varejo parou de avançar depois da prova de conceito.',
      mudancas: [
        { titulo: 'Segmentos', texto: 'Serviços financeiros, saúde e telecomunicações.' },
        { titulo: 'Fora do ICP', texto: 'Varejo sem time de dados próprio e empresas com operação só em servidores locais.' },
      ],
    },
  ],
  personas: [
    {
      resposta: 'Nas calls gravadas do mês, governança apareceu em quase todas as objeções. Proponho uma Persona própria.',
      mudancas: [
        {
          titulo: 'Líder de governança de dados',
          texto: 'Head de Governança ou DPO. Valida privacidade, linhagem e acesso aos dados antes da aprovação técnica.',
        },
      ],
    },
    {
      resposta: 'O Decisor técnico está chegando mais tarde nas negociações; ajustei a descrição para refletir isso.',
      mudancas: [
        {
          titulo: 'Decisor técnico',
          texto: 'CTO, VP de Engenharia ou Head de Dados. Entra depois da prova de conceito e decide pela arquitetura e pelo custo de nuvem.',
        },
      ],
    },
  ],
}

export function aplicarMudancas(secoes: Secao[], mudancas: Secao[]): Secao[] {
  const resultado = secoes.map((secao) => mudancas.find((m) => m.titulo === secao.titulo) ?? secao)
  const novas = mudancas.filter((m) => !secoes.some((s) => s.titulo === m.titulo))
  return [...resultado, ...novas]
}

export function textoDaSecao(documento: Documento, titulo: string): string {
  return documento.secoes.find((s) => s.titulo === titulo)?.texto ?? ''
}

/** Uma configuração de outro módulo que lê o documento vigente: nunca guarda uma cópia. */
export interface Dependente {
  modulo: string
  nome: string
  resumo: string
}

function semPonto(texto: string): string {
  return texto.replace(/\.$/, '')
}

export function dependentesDe(documento: Documento): Dependente[] {
  if (documento.id === 'icp') {
    return [
      {
        modulo: 'Sinais',
        nome: 'Público recomendado dos Monitoramentos',
        resumo: `${semPonto(textoDaSecao(documento, 'Porte'))} · ${semPonto(textoDaSecao(documento, 'Regiões'))}`,
      },
      {
        modulo: 'Scopus',
        nome: 'Habilidade “Pontuar aderência ao ICP”',
        resumo: `Critérios: ${documento.secoes
          .filter((s) => s.titulo !== 'Fora do ICP')
          .map((s) => s.titulo.toLowerCase())
          .join(', ')}`,
      },
      {
        modulo: 'Scopus · Enterprise LATAM',
        nome: 'Contexto do Agente',
        resumo: `Segmentos: ${semPonto(textoDaSecao(documento, 'Segmentos'))}`,
      },
    ]
  }
  const nomes = documento.secoes.map((s) => s.titulo).join(', ')
  return [
    { modulo: 'Ethos', nome: 'Classificação de Contatos por Persona', resumo: `${documento.secoes.length} Personas: ${nomes}` },
    { modulo: 'Rhetor · Sequências outbound', nome: 'Habilidade “Sequência por persona”', resumo: `Uma variação para cada uma das ${documento.secoes.length} Personas` },
    { modulo: 'Rhetor · Anúncios Meta', nome: 'Variações de anúncio', resumo: `Públicos: ${nomes}` },
  ]
}

// ── Plano ──────────────────────────────────────────────────────────────

/** Execuções de Agentes no período, demonstrativas. Não há preço, franquia nem limite. */
export const EXECUCOES_NO_PERIODO = {
  periodo: '01/09/2026 a 24/09/2026',
  porEspecialidade: [
    { especialidade: 'scopus' as const, nome: 'Scopus', total: 512 },
    { especialidade: 'ethos' as const, nome: 'Ethos', total: 198 },
    { especialidade: 'rhetor' as const, nome: 'Rhetor', total: 421 },
    { especialidade: 'oraculum' as const, nome: 'Oraculum', total: 153 },
  ],
}
