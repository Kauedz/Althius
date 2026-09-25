// Dados simulados do mockup de Sinais (ticket 01). Fontes e evidências são ilustrativas e identificadas como
// simuladas: nenhum acontecimento aqui foi coletado ou verificado.
import { criteriosIniciais, tipoPorId, TIPO_PERSONALIZADO } from './catalogo'

export type {
  EstadoDoMonitoramento,
  ModoDePublico,
  Publico,
  Monitoramento,
} from '@/fonte/sinais-tipos'

import type {
  EstadoDoMonitoramento,
  Publico,
  Monitoramento,
} from '@/fonte/sinais-tipos'

export const ROTULO_DO_ESTADO: Record<EstadoDoMonitoramento, string> = {
  rascunho: 'Rascunho',
  'em-preparacao': 'Em preparação',
  ativo: 'Ativo',
  pausado: 'Pausado',
}

export const LISTAS = [
  { id: 'enterprise-latam', nome: 'Enterprise LATAM', contas: 18 },
  { id: 'fintechs-brasil', nome: 'Fintechs Brasil', contas: 9 },
  { id: 'oportunidades-hubspot', nome: 'Oportunidades do HubSpot', contas: 30 },
]

/** O público de um Monitoramento novo: listas quando a família só acompanha o CRM, listas e descoberta nas demais. */
export function publicoInicial(aceitaDescoberta: boolean): Publico {
  return aceitaDescoberta
    ? { modo: 'ambos', listas: ['enterprise-latam'], usaRecomendado: true }
    : { modo: 'listas', listas: ['oportunidades-hubspot'], usaRecomendado: true }
}

function monitoramento(parcial: Pick<Monitoramento, 'id' | 'tipoId' | 'nome' | 'estado'> & Partial<Monitoramento>): Monitoramento {
  const tipo = tipoPorId(parcial.tipoId)
  return {
    publico: publicoInicial(true),
    criterios: tipo ? criteriosIniciais(tipo) : {},
    ...parcial,
  }
}

export const MONITORAMENTOS_INICIAIS: Monitoramento[] = [
  monitoramento({
    id: 'vagas-engenharia-de-dados',
    tipoId: 'abertura-de-vagas',
    nome: 'Vagas de engenharia de dados',
    estado: 'ativo',
    criterios: {
      funcoes: ['Engenharia de dados', 'Plataforma e infraestrutura'],
      senioridade: 'Qualquer',
      localizacao: ['Brasil', 'México'],
      periodo: 'Últimos 30 dias',
      palavras: 'lakehouse, data warehouse',
    },
  }),
  monitoramento({
    id: 'vagas-ia-mexico',
    tipoId: 'abertura-de-vagas',
    nome: 'Vagas de IA no México',
    estado: 'pausado',
    publico: {
      modo: 'descoberta',
      listas: [],
      usaRecomendado: false,
      perfil: {
        pais: 'México',
        estados: ['Ciudad de México', 'Nuevo León'],
        funcionarios: { min: 1_001, max: 5_000 },
        cnaes: ['K'],
        ondeTemOCnae: 'principal',
      },
    },
    criterios: { funcoes: ['IA e machine learning'], senioridade: 'Liderança', localizacao: ['México'], periodo: 'Últimos 14 dias', palavras: '' },
  }),
  monitoramento({
    id: 'vagas-financas',
    tipoId: 'abertura-de-vagas',
    nome: 'Vagas de finanças em fintechs',
    estado: 'rascunho',
    publico: {
      modo: 'ambos',
      listas: ['fintechs-brasil'],
      usaRecomendado: false,
      perfil: {
        pais: 'Brasil',
        ufs: ['SP', 'RJ'],
        cidades: ['Campinas (SP)'],
        funcionarios: { min: 51, max: 200 },
        faturamento: { min: 4_800_000, max: 30_000_000 },
        tempoDeEmpresa: { min: 2, max: 10 },
        cnaes: ['64', '6201-5/01'],
        ondeTemOCnae: 'principal-ou-secundario',
      },
    },
    criterios: { funcoes: ['Finanças'], senioridade: 'Liderança', localizacao: ['Brasil'], periodo: 'Últimos 30 dias', palavras: '' },
  }),
  monitoramento({ id: 'primeiro-revops', tipoId: 'contratacao-gtm-revops', nome: 'Primeira liderança de RevOps', estado: 'ativo' }),
  monitoramento({
    id: 'rodadas-serie-b',
    tipoId: 'rodadas',
    nome: 'Rodadas a partir de US$ 50 mi',
    estado: 'ativo',
    criterios: { eventos: ['Rodada'], valor: 'US$ 50 mi ou mais', localizacao: ['Brasil', 'México', 'Colômbia'], periodo: 'Últimos 30 dias' },
  }),
  monitoramento({
    id: 'investimentos-em-dados',
    tipoId: 'investimentos-anunciados',
    nome: 'Investimentos em dados e IA',
    estado: 'ativo',
    criterios: { eventos: ['Investimento anunciado'], valor: 'Qualquer valor', localizacao: ['México'], periodo: 'Últimos 30 dias' },
  }),
  monitoramento({
    id: 'unidades-mexico',
    tipoId: 'novo-escritorio',
    nome: 'Novas unidades no México',
    estado: 'ativo',
    criterios: { eventos: ['Nova unidade'], regioes: ['Cidade do México', 'Monterrey'], periodo: 'Últimos 90 dias' },
  }),
  monitoramento({
    id: 'saida-hadoop',
    tipoId: 'mudanca-de-ferramenta',
    nome: 'Saída de Hadoop e Teradata',
    estado: 'ativo',
    criterios: { ferramentas: ['Hadoop', 'Teradata'], mudanca: ['Troca', 'Retirada'], fontes: ['Vagas', 'Notícias'], periodo: 'Últimos 90 dias' },
  }),
  monitoramento({
    id: 'lideranca-dados',
    tipoId: 'nova-lideranca',
    nome: 'Nova liderança de dados e tecnologia',
    estado: 'ativo',
    criterios: {
      cargos: ['CDO', 'CTO'],
      movimento: ['Chegada'],
      pessoas: 'Qualquer pessoa no cargo',
      localizacao: ['Brasil', 'México'],
      periodo: 'Últimos 30 dias',
    },
  }),
  monitoramento({
    id: 'parcerias-estrategicas',
    tipoId: 'parcerias',
    nome: 'Parcerias estratégicas de dados e nuvem',
    estado: 'ativo',
    criterios: {
      temas: ['Modernização de dados', 'IA generativa'],
      fontes: ['Comunicados oficiais', 'Imprensa'],
      periodo: 'Últimos 30 dias',
    },
  }),
  monitoramento({
    id: 'avaliacoes-insatisfacao',
    tipoId: 'avaliacoes',
    nome: 'Avaliações de concorrentes no G2',
    estado: 'ativo',
    criterios: {
      marcas: ['Snowflake', 'Google BigQuery'],
      plataformas: ['G2', 'Gartner Peer Insights'],
      nota: 'Até 3 estrelas',
      periodo: 'Últimos 30 dias',
    },
  }),
  monitoramento({
    id: 'intencao-pesquisa-lakehouse',
    tipoId: 'pesquisa-de-temas',
    nome: 'Pesquisa de temas em dados e IA',
    estado: 'ativo',
    criterios: {
      canais: ['Fornecedor de dados de intenção'],
      temas: ['Modernização de dados', 'IA generativa'],
      periodo: 'Últimos 30 dias',
    },
  }),
  monitoramento({
    id: 'palestrantes-dados',
    tipoId: 'conferencias',
    nome: 'Palestrantes de dados e IA',
    estado: 'ativo',
    criterios: { eventos: 'Data + AI Summit, Web Summit Rio', papeis: ['Palestrante'], temas: ['IA generativa'], periodo: 'Últimos 30 dias' },
  }),
  monitoramento({
    id: 'visitas-gerais-site',
    tipoId: 'visitas-ao-site',
    nome: 'Visitas frequentes ao site',
    estado: 'ativo',
    criterios: { paginas: ['Qualquer página'], caminhos: '', pessoas: '2', periodo: 'Últimos 14 dias' },
  }),
  monitoramento({
    id: 'cases-e-integracoes',
    tipoId: 'paginas-especificas',
    nome: 'Visitas a cases e integrações',
    estado: 'ativo',
    criterios: { paginas: ['Cases', 'Integrações'], caminhos: '/cases, /integracoes', pessoas: '2', periodo: 'Últimos 30 dias' },
  }),
  monitoramento({
    id: 'precos-e-produto',
    tipoId: 'pagina-de-precos',
    nome: 'Preços e produto',
    estado: 'ativo',
    criterios: { paginas: ['Preços', 'Produto'], pessoas: '3', periodo: 'Últimos 7 dias' },
  }),
  monitoramento({
    id: 'sem-resposta-45',
    tipoId: 'sem-resposta',
    nome: 'Sem resposta há 45 dias',
    estado: 'ativo',
    publico: { modo: 'listas', listas: ['oportunidades-hubspot'], usaRecomendado: true },
    criterios: { condicao: 'Sem resposta', prazo: '45', etapas: ['Descoberta', 'Proposta'] },
  }),
  monitoramento({
    id: 'recusadas-90',
    tipoId: 'proposta-recusada',
    nome: 'Recusadas há 90 dias',
    estado: 'ativo',
    publico: { modo: 'listas', listas: ['oportunidades-hubspot'], usaRecomendado: true },
    criterios: { condicao: 'Proposta recusada', prazo: '90', etapas: ['Proposta', 'Negociação'] },
  }),
  monitoramento({
    id: 'parada-30',
    tipoId: 'negociacao-parada',
    nome: 'Negociações paradas há 30 dias',
    estado: 'pausado',
    publico: { modo: 'listas', listas: ['oportunidades-hubspot'], usaRecomendado: true },
    criterios: { condicao: 'Negociação parada', prazo: '30', etapas: ['Negociação'] },
  }),
  monitoramento({
    id: 'atendimento-demonstracao',
    tipoId: 'lead-oculto',
    nome: 'Tempo de resposta a pedidos de demonstração',
    estado: 'ativo',
    criterios: {
      canais: ['WhatsApp', 'Formulário do site'],
      criterio: 'não houver resposta em 24 horas úteis',
      prazo: '24 horas úteis',
      frequencia: 'Uma vez',
    },
  }),
  monitoramento({
    id: 'erros-site-verificacao',
    tipoId: 'erros-no-site',
    nome: 'Erros e indisponibilidade no site',
    estado: 'ativo',
    criterios: {
      canais: ['Páginas do site'],
      criterio: 'uma página ficar fora do ar ou exibir erro',
      prazo: 'Imediato',
      frequencia: 'Toda semana',
    },
  }),
  monitoramento({
    id: 'fluxos-publicos-agendamento',
    tipoId: 'formularios',
    nome: 'Formulários e fluxos públicos',
    estado: 'ativo',
    criterios: {
      canais: ['Formulário do site'],
      criterio: 'o envio falhar ou não houver confirmação',
      prazo: 'Imediato',
      frequencia: 'Toda semana',
    },
  }),
  {
    id: 'custo-de-nuvem',
    tipoId: TIPO_PERSONALIZADO.id,
    nome: 'Queixas públicas sobre custo de nuvem',
    estado: 'ativo',
    origem: 'externo',
    descricao: 'Empresas cujos líderes de dados reclamam em público do custo imprevisível do data warehouse.',
    fonte: 'Posts e entrevistas públicas',
    criteriosLivres: [
      'Pessoa com cargo de liderança em dados ou finanças da empresa',
      'Menciona custo alto ou imprevisível de data warehouse ou nuvem',
      'Publicação pública nos últimos 30 dias, com trecho como evidência',
    ],
    publico: { modo: 'ambos', listas: ['enterprise-latam'], usaRecomendado: true },
    criterios: {},
  },
  {
    id: 'agendamento-online',
    tipoId: TIPO_PERSONALIZADO.id,
    nome: 'Varejistas sem agendamento de entrega',
    estado: 'em-preparacao',
    origem: 'originado',
    descricao: 'Varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site.',
    criteriosLivres: [],
    publico: { modo: 'descoberta', listas: [], usaRecomendado: true },
    criterios: {},
  },
]

// Contas-alvo e Sinais simulados. A Aderência fica separada do foguinho (ADR 0007).

export type AderenciaMock = 'fit' | 'nao-fit'

export const ROTULO_DA_ADERENCIA: Record<AderenciaMock, string> = { fit: 'Fit', 'nao-fit': 'Não fit' }

export interface ContaMock {
  id: string
  nome: string
  dominio: string
  logo?: string
  logoDeUmaCor?: boolean
  segmento: string
  aderencia?: AderenciaMock
  origem: 'importada' | 'recomendada'
}

export interface SinalMock {
  id: string
  contaId: string
  tipoId: string
  monitoramentoId: string
  frase: string
  /** Data do disparo, que conta os 30 dias de validade. */
  data: string
  fonte: string
  evidencia: string
  /** O mesmo acontecimento reencontrado por outra coleta: fica registrado, mas não conta de novo. */
  reencontrado?: { data: string; monitoramentoId: string }
}

// As mesmas Contas-alvo do módulo Contas, com a Aderência e a origem de lá (as contas Quentes de antes eram Fit).
export const CONTAS_MOCK: ContaMock[] = [
  { id: 'stripe', nome: 'Stripe', dominio: 'stripe.com', logo: '/logos/stripe.svg', segmento: 'Pagamentos', aderencia: 'fit', origem: 'recomendada' },
  { id: 'rappi', nome: 'Rappi', dominio: 'rappi.com', logo: '/logos/rappi.png', segmento: 'Delivery e varejo', aderencia: 'nao-fit', origem: 'importada' },
  { id: 'nubank', nome: 'Nubank', dominio: 'nubank.com.br', logo: '/logos/nubank.svg', segmento: 'Serviços financeiros', aderencia: 'fit', origem: 'recomendada' },
  { id: 'twilio', nome: 'Twilio', dominio: 'twilio.com', logo: '/logos/twilio.svg', segmento: 'Comunicação em nuvem', aderencia: 'fit', origem: 'recomendada' },
  { id: 'mercadolivre', nome: 'Mercado Livre', dominio: 'mercadolivre.com.br', logo: '/logos/mercadolivre.svg', segmento: 'Comércio eletrônico', aderencia: 'nao-fit', origem: 'importada' },
  { id: 'bbva-mexico', nome: 'BBVA México', dominio: 'bbva.mx', segmento: 'Serviços financeiros', origem: 'importada' },
  { id: 'openai', nome: 'OpenAI', dominio: 'openai.com', logo: '/logos/openai.svg', segmento: 'Inteligência artificial', aderencia: 'fit', origem: 'recomendada' },
  { id: 'zendesk', nome: 'Zendesk', dominio: 'zendesk.com', logo: '/logos/zendesk.svg', logoDeUmaCor: true, segmento: 'Atendimento ao cliente', aderencia: 'fit', origem: 'recomendada' },
  { id: 'anthropic', nome: 'Anthropic', dominio: 'anthropic.com', logo: '/logos/anthropic.svg', segmento: 'Inteligência artificial', aderencia: 'fit', origem: 'recomendada' },
  { id: 'figma', nome: 'Figma', dominio: 'figma.com', logo: '/logos/figma.svg', segmento: 'Design de software', aderencia: 'fit', origem: 'recomendada' },
  { id: 'notion', nome: 'Notion', dominio: 'notion.so', logo: '/logos/notion.svg', segmento: 'Produtividade', aderencia: 'fit', origem: 'recomendada' },
  { id: 'cloudflare', nome: 'Cloudflare', dominio: 'cloudflare.com', logo: '/logos/cloudflare.svg', segmento: 'Infraestrutura e segurança', aderencia: 'fit', origem: 'recomendada' },
  { id: 'totvs', nome: 'TOTVS', dominio: 'totvs.com', segmento: 'Software de gestão', aderencia: 'fit', origem: 'recomendada' },
  { id: 'locaweb', nome: 'Locaweb', dominio: 'locaweb.com.br', segmento: 'Hospedagem e nuvem', aderencia: 'nao-fit', origem: 'importada' },
  { id: 'creditas', nome: 'Creditas', dominio: 'creditas.com', segmento: 'Serviços financeiros', aderencia: 'fit', origem: 'recomendada' },
]

export const SINAIS_MOCK: SinalMock[] = [
  {
    id: 's-anthropic-lideranca',
    contaId: 'anthropic',
    tipoId: 'nova-lideranca',
    monitoramentoId: 'lideranca-dados',
    frase: 'Nova liderança de Engenharia e IA assumiu a operação regional',
    data: '2026-09-23',
    fonte: 'LinkedIn e anúncio institucional (simulados)',
    evidencia: '“Anunciamos a contratação de novo Diretor de Engenharia de Dados para expandir nossa infraestrutura de IA.”',
  },
  {
    id: 's-openai-palestra',
    contaId: 'openai',
    tipoId: 'conferencias',
    monitoramentoId: 'palestrantes-dados',
    frase: 'Head de Dados confirmado como palestrante no Data + AI Summit',
    data: '2026-09-22',
    fonte: 'Programação do evento (simulada)',
    evidencia: '“Painel: como escalar pipelines de dados para modelos em produção.”',
  },
  {
    id: 's-nubank-precos',
    contaId: 'nubank',
    tipoId: 'pagina-de-precos',
    monitoramentoId: 'precos-e-produto',
    frase: '4 pessoas visitaram as páginas de preço e produto',
    data: '2026-09-21',
    fonte: 'Visitas ao site da Databricks (simuladas)',
    evidencia: '4 pessoas do escritório de São Paulo, 11 páginas em 3 dias, incluindo Preços.',
  },
  {
    id: 's-mercadolivre-recusada',
    contaId: 'mercadolivre',
    tipoId: 'proposta-recusada',
    monitoramentoId: 'recusadas-90',
    frase: 'Proposta recusada há 90 dias',
    data: '2026-09-19',
    fonte: 'HubSpot (simulado)',
    evidencia: 'Negócio “Plataforma de dados 2026” marcado como perdido em 21/06/2026: “orçamento adiado para o 2º semestre”.',
  },
  {
    id: 's-figma-parceria',
    contaId: 'figma',
    tipoId: 'parcerias',
    monitoramentoId: 'parcerias-estrategicas',
    frase: 'Anunciou parceria estratégica para expansão de recursos corporativos de IA',
    data: '2026-09-17',
    fonte: 'Comunicado oficial à imprensa (simulado)',
    evidencia: '“Nova aliança estratégica com provedores de nuvem para acelerar fluxos corporativos colaborativos.”',
  },
  {
    id: 's-stripe-vagas',
    contaId: 'stripe',
    tipoId: 'abertura-de-vagas',
    monitoramentoId: 'vagas-engenharia-de-dados',
    frase: 'Abriu 3 vagas de engenharia de dados em São Paulo',
    data: '2026-09-18',
    fonte: 'Página de carreiras (simulada)',
    evidencia: '“Buscamos Data Engineer para migrar nosso data warehouse para uma arquitetura lakehouse.”',
    reencontrado: { data: '2026-09-20', monitoramentoId: 'vagas-ia-mexico' },
  },
  {
    id: 's-twilio-hadoop',
    contaId: 'twilio',
    tipoId: 'mudanca-de-ferramenta',
    monitoramentoId: 'saida-hadoop',
    frase: 'Anunciou a retirada do cluster Hadoop até 2027',
    data: '2026-09-15',
    fonte: 'Blog de engenharia (simulado)',
    evidencia: '“Vamos desligar o Hadoop on-premises e consolidar os dados numa plataforma em nuvem.”',
  },
  {
    id: 's-bbva-investimento',
    contaId: 'bbva-mexico',
    tipoId: 'investimentos-anunciados',
    monitoramentoId: 'investimentos-em-dados',
    frase: 'Anunciou plano de investimento em dados e IA no México',
    data: '2026-09-16',
    fonte: 'Comunicado à imprensa (simulado)',
    evidencia: '“O plano prioriza a modernização da plataforma de dados e casos de uso de IA.”',
  },
  {
    id: 's-notion-avaliacao',
    contaId: 'notion',
    tipoId: 'avaliacoes',
    monitoramentoId: 'avaliacoes-insatisfacao',
    frase: 'Avaliação no G2 apontando custos e latência em solução concorrente',
    data: '2026-09-14',
    fonte: 'G2 Crowd (simulado)',
    evidencia: '“Arquiteto avaliou negativamente a complexidade e custo imprevisível de consultas na ferramenta atual.”',
  },
  {
    id: 's-cloudflare-intencao',
    contaId: 'cloudflare',
    tipoId: 'pesquisa-de-temas',
    monitoramentoId: 'intencao-pesquisa-lakehouse',
    frase: 'Pico de intenção de pesquisa corporativa no tema Modernização de dados',
    data: '2026-09-13',
    fonte: 'Fornecedor de dados de intenção (simulado)',
    evidencia: 'Detecção de surto de busca por termos como “lakehouse vs warehouse” e “modernização de dados” originada da rede corporativa.',
  },
  {
    id: 's-rappi-unidade',
    contaId: 'rappi',
    tipoId: 'novo-escritorio',
    monitoramentoId: 'unidades-mexico',
    frase: 'Abriu nova unidade em Monterrey',
    data: '2026-09-12',
    fonte: 'Vagas e registro empresarial (simulados)',
    evidencia: '7 vagas com endereço em Monterrey e nova filial registrada.',
  },
  {
    id: 's-stripe-revops',
    contaId: 'stripe',
    tipoId: 'contratacao-gtm-revops',
    monitoramentoId: 'primeiro-revops',
    frase: 'Abriu a primeira vaga de liderança de RevOps na América Latina',
    data: '2026-09-10',
    fonte: 'Página de carreiras (simulada)',
    evidencia: '“Head of Revenue Operations, LATAM: primeira pessoa da função na região.”',
  },
  {
    id: 's-rappi-rodada',
    contaId: 'rappi',
    tipoId: 'rodadas',
    monitoramentoId: 'rodadas-serie-b',
    frase: 'Anunciou rodada de investimento com plano de contratar em dados',
    data: '2026-09-02',
    fonte: 'Imprensa (simulada)',
    evidencia: '“Os recursos vão para tecnologia e para dobrar o time de dados.”',
  },
  {
    id: 's-mercadolivre-sem-resposta',
    contaId: 'mercadolivre',
    tipoId: 'sem-resposta',
    monitoramentoId: 'sem-resposta-45',
    frase: 'Sem resposta há 45 dias',
    data: '2026-07-20',
    fonte: 'HubSpot (simulado)',
    evidencia: 'Último e-mail enviado em 05/06/2026, sem resposta. A Interação continua no histórico comercial.',
  },
  {
    id: 's-twilio-visitas',
    contaId: 'twilio',
    tipoId: 'visitas-ao-site',
    monitoramentoId: 'visitas-gerais-site',
    frase: '3 visitantes da empresa acessaram o site',
    data: '2026-09-22',
    fonte: 'Acessos ao site institucional (simulados)',
    evidencia: '3 pessoas identificadas por domínio corporativo visitaram 8 páginas nos últimos 7 dias.',
  },
  {
    id: 's-figma-cases',
    contaId: 'figma',
    tipoId: 'paginas-especificas',
    monitoramentoId: 'cases-e-integracoes',
    frase: '2 visitantes acessaram a página de cases e integrações',
    data: '2026-09-20',
    fonte: 'Acessos ao site institucional (simulados)',
    evidencia: 'Navegação pelas páginas de cases e documentação de integrações.',
  },
  {
    id: 's-zendesk-parada',
    contaId: 'zendesk',
    tipoId: 'negociacao-parada',
    monitoramentoId: 'parada-30',
    frase: 'Negociação parada há 30 dias',
    data: '2026-08-01',
    fonte: 'HubSpot (simulado)',
    evidencia: 'Negócio na etapa Negociação sem atividade desde 02/07/2026.',
  },
  {
    id: 's-totvs-lead-oculto',
    contaId: 'totvs',
    tipoId: 'lead-oculto',
    monitoramentoId: 'atendimento-demonstracao',
    frase: 'Sem resposta no formulário de contato após 24 horas úteis',
    data: '2026-09-22',
    fonte: 'Verificação deliberada de lead oculto (simulada)',
    evidencia: 'Disparo de mensagem de teste via formulário comercial em 21/09/2026 às 09:30; nenhuma resposta ou retorno recebido após 24 horas úteis (simulada).',
  },
  {
    id: 's-locaweb-erros-site',
    contaId: 'locaweb',
    tipoId: 'erros-no-site',
    monitoramentoId: 'erros-site-verificacao',
    frase: 'Página de checkout e preços exibiu erro 500 intermitente',
    data: '2026-09-21',
    fonte: 'Verificação deliberada de integridade do site (simulada)',
    evidencia: 'Verificação automatizada detectou falha HTTP 500 na rota de checkout durante 15 minutos em 21/09/2026 (simulada).',
  },
  {
    id: 's-creditas-formularios',
    contaId: 'creditas',
    tipoId: 'formularios',
    monitoramentoId: 'fluxos-publicos-agendamento',
    frase: 'Formulário de solicitação corporativa falhou no envio',
    data: '2026-09-20',
    fonte: 'Teste de formulários públicos (simulado)',
    evidencia: 'Tentativa de submissão no formulário público corporativo gerou erro de script sem confirmação de recebimento (simulada).',
  },
]

export {
  DIA_EM_MS,
  VALIDADE_EM_DIAS,
  dataDoDisparo,
  expiraEm,
  estaValido,
  foiDisparado,
  ordenarSinaisPorData,
  parseDataDisparo,
} from '@/fonte/regras-sinais'

export function sinaisDaConta(contaId: string): SinalMock[] {
  return SINAIS_MOCK.filter((sinal) => sinal.contaId === contaId).sort((a, b) => b.data.localeCompare(a.data))
}

/** Quantos Sinais o Monitoramento disparou; um reencontro do mesmo acontecimento não conta. */
export function sinaisDisparadosPor(monitoramentoId: string): number {
  return SINAIS_MOCK.filter((sinal) => sinal.monitoramentoId === monitoramentoId).length
}
