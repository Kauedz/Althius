// O catálogo que a tela mostra (PR-A). Um card por Sinal, com os nichos em que ele vale e os coletores por trás.
// O registro técnico (`private.signal_catalog`) e as cascatas continuam: este arquivo não apaga tipo nenhum.
// A cópia no banco é a migração `20261015150000_catalogo_visivel_de_sinais.sql`; o teste de paridade confere os dois.

import type { Criterios, Formulario } from '@/fonte/sinais-tipos'
import { CARGOS_POR_NICHO, NICHOS, SLUGS_DE_NICHO } from './nichos'

/** Teto padrão de varredura de Sinais, em dólar por mês, por Workspace. A Automação que o liga fica para outro PR. */
export const TETO_PADRAO_USD = 20

export interface CardDoCatalogo {
  id: string
  nome: string
  /** Uma frase: o que o Sinal detecta. */
  frase: string
  familiaId: string
  formulario: Formulario
  /** Slugs de nicho. Vazio não ocorre: "todos" é a lista inteira. */
  nichos: readonly string[]
  /** Fonte em linguagem de usuário. Sem nome de fornecedor. */
  fonte: string
  custoRotulo: string
  /** Estimativa por Monitoramento de cerca de 200 empresas por mês. Nulo quando não há fonte paga. */
  custoUsd: number | null
  /** `signal_type` dos coletores que continuam no banco. */
  coletores: readonly string[]
  /**
   * Ids de tipo da tela cujos Monitoramentos contam neste card (o id do card e os que ele uniu).
   * O coletor em si não é um id de tela.
   */
  contados: readonly string[]
  padroes?: Criterios
}

const TODOS = SLUGS_DE_NICHO

const dentroDoTeto = `Dentro do teto de US$ ${TETO_PADRAO_USD} por mês do Workspace`
const porDuzentas = (usd: string) => `Cerca de US$ ${usd} a cada 200 empresas por mês`

export const CATALOGO_VISIVEL: readonly CardDoCatalogo[] = [
  {
    id: 'abertura-de-vagas',
    nome: 'Abertura de vagas',
    frase: 'Acompanha vagas publicadas para os cargos do nicho, num card só.',
    familiaId: 'vagas-e-equipes',
    formulario: 'vagas',
    nichos: TODOS,
    fonte: 'Vagas públicas em sites de emprego',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['vaga_linkedin', 'vaga_indeed', 'vaga_comex', 'vaga_logistica', 'vaga_engenharia_manutencao'],
    contados: ['abertura-de-vagas', 'vagas-no-indeed'],
  },
  {
    id: 'nova-lideranca',
    nome: 'Nova liderança',
    frase: 'Detecta a chegada de uma nova liderança nas áreas que decidem a compra.',
    familiaId: 'movimentacao-profissional',
    formulario: 'pessoas',
    nichos: TODOS,
    fonte: 'Movimentação pública de cargos de liderança',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['nova_lideranca'],
    contados: ['nova-lideranca'],
    padroes: { cargos: ['CDO', 'CTO'], movimento: ['Chegada'] },
  },
  {
    id: 'novas-contratacoes',
    nome: 'Novas contratações e saídas',
    frase: 'Registra quem entrou ou saiu nos cargos do comitê de compra.',
    familiaId: 'movimentacao-profissional',
    formulario: 'pessoas',
    nichos: TODOS,
    fonte: 'Movimentação pública de pessoas nas empresas',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['entradas_e_saidas'],
    contados: ['novas-contratacoes'],
    padroes: { cargos: ['Head de Dados', 'VP de Engenharia'], movimento: ['Chegada'] },
  },
  {
    id: 'promocoes',
    nome: 'Promoções e mudança de emprego',
    frase: 'Avisa quando alguém é promovido ou muda de empresa e passa a decidir a compra.',
    familiaId: 'movimentacao-profissional',
    formulario: 'pessoas',
    nichos: TODOS,
    fonte: 'Movimentação pública de carreira',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['mudanca_de_emprego'],
    contados: ['promocoes'],
    padroes: { movimento: ['Promoção'], pessoas: 'Contatos das Contas-alvo' },
  },
  {
    id: 'anuncio-de-movimentacao',
    nome: 'Anúncio público de movimentação',
    frase: 'Lê publicações em que alguém da empresa anuncia um cargo novo, uma promoção ou uma chegada.',
    familiaId: 'movimentacao-profissional',
    formulario: 'pessoas',
    nichos: TODOS,
    fonte: 'Publicações públicas de profissionais',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['anuncio_de_movimentacao'],
    contados: ['anuncio-de-movimentacao'],
    padroes: { movimento: ['Chegada', 'Promoção'] },
  },
  {
    id: 'crescimento-de-equipes',
    nome: 'Crescimento ou redução de equipes',
    frase: 'Aponta quando o quadro da empresa cresce ou encolhe além do ritmo do nicho.',
    familiaId: 'vagas-e-equipes',
    formulario: 'vagas',
    nichos: ['corretoras-de-beneficios', 'contabilidade-e-tributario', 'logistica-e-transporte', 'industria-fornecedores-b2b'],
    fonte: 'Quadro público de pessoas da empresa, comparado mês a mês',
    custoRotulo: porDuzentas('0,80'),
    custoUsd: 0.8,
    coletores: ['crescimento_de_equipes', 'cruzando_faixa_de_headcount'],
    contados: ['crescimento-de-equipes'],
    padroes: { funcoes: ['Engenharia de dados', 'IA e machine learning'], senioridade: 'Qualquer' },
  },
  {
    id: 'anuncios-meta',
    nome: 'Anunciando na Meta',
    frase: 'Avisa quando a empresa passa a anunciar no Facebook e no Instagram.',
    familiaId: 'anuncios',
    formulario: 'anuncios',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial', 'corretoras-de-beneficios', 'agro-b2b', 'industria-fornecedores-b2b'],
    fonte: 'Biblioteca pública de anúncios',
    custoRotulo: porDuzentas('0,50'),
    custoUsd: 0.5,
    coletores: ['anuncio_meta'],
    contados: ['anuncios-meta'],
  },
  {
    id: 'anuncios-google',
    nome: 'Anunciando no Google',
    frase: 'Avisa quando aparece o primeiro anúncio da empresa na busca ou no vídeo.',
    familiaId: 'anuncios',
    formulario: 'anuncios',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial', 'corretoras-de-beneficios', 'agro-b2b', 'industria-fornecedores-b2b'],
    fonte: 'Transparência pública de anúncios',
    custoRotulo: porDuzentas('0,40'),
    custoUsd: 0.4,
    coletores: [],
    contados: ['anuncios-google'],
  },
  {
    id: 'anuncios-linkedin',
    nome: 'Anunciando no LinkedIn',
    frase: 'Avisa quando a empresa começa uma campanha na rede profissional.',
    familiaId: 'anuncios',
    formulario: 'anuncios',
    nichos: ['industria-fornecedores-b2b', 'energia-e-mercado-livre', 'logistica-e-transporte'],
    fonte: 'Biblioteca pública de anúncios profissionais',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['anuncio_linkedin'],
    contados: ['anuncios-linkedin'],
  },
  {
    id: 'publicacoes-da-empresa',
    nome: 'Publicações da empresa',
    frase: 'Encontra posts da empresa sobre expansão, unidade nova, contratação, investimento ou certificação.',
    familiaId: 'presenca-publica',
    formulario: 'noticias',
    nichos: TODOS,
    fonte: 'Publicações públicas da empresa',
    custoRotulo: porDuzentas('3'),
    custoUsd: 3,
    coletores: [],
    contados: ['publicacoes-da-empresa'],
  },
  {
    id: 'avaliacoes-google-maps',
    nome: 'Avaliações no Google Maps',
    frase: 'Aponta queda de nota e reclamações repetidas, sem guardar quem avaliou.',
    familiaId: 'reputacao-e-concorrencia',
    formulario: 'avaliacoes',
    nichos: ['logistica-e-transporte', 'industria-fornecedores-b2b', 'agro-b2b', 'energia-e-mercado-livre'],
    fonte: 'Avaliações públicas de estabelecimentos',
    custoRotulo: porDuzentas('0,60'),
    custoUsd: 0.6,
    coletores: ['avaliacoes_google_maps'],
    contados: ['avaliacoes-google-maps'],
    padroes: { nota: 'Até 2 estrelas' },
  },
  {
    id: 'nova-empresa-aberta',
    nome: 'Nova empresa aberta',
    frase: 'Avisa quando abre uma empresa nova no perfil que você acompanha.',
    familiaId: 'expansao-e-registros',
    formulario: 'expansao',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial', 'corretoras-de-beneficios'],
    fonte: 'Base pública de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['cnpj_novo'],
    contados: ['nova-empresa-aberta'],
  },
  {
    id: 'nova-cooperativa',
    nome: 'Nova cooperativa',
    frase: 'Avisa quando uma cooperativa nova é registrada.',
    familiaId: 'agro',
    formulario: 'expansao',
    nichos: ['agro-b2b'],
    fonte: 'Base pública de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['nova_cooperativa'],
    contados: ['nova-cooperativa'],
  },
  {
    id: 'entrada-de-socio',
    nome: 'Entrada de sócio',
    frase: 'Detecta a entrada de um sócio, sem publicar o nome da pessoa.',
    familiaId: 'expansao-e-registros',
    formulario: 'expansao',
    nichos: ['contabilidade-e-tributario', 'juridico-empresarial'],
    fonte: 'Base pública de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['entrada_de_socio'],
    contados: ['entrada-de-socio'],
  },
  {
    id: 'mudanca-de-porte-ou-regime',
    nome: 'Mudança de porte ou regime',
    frase: 'Avisa quando a empresa muda de porte ou de regime tributário.',
    familiaId: 'expansao-e-registros',
    formulario: 'expansao',
    nichos: ['contabilidade-e-tributario'],
    fonte: 'Base pública de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['mudanca_de_porte_ou_regime'],
    contados: ['mudanca-de-porte-ou-regime'],
  },
  {
    id: 'nova-filial-ou-sede',
    nome: 'Nova filial ou mudança de sede',
    frase: 'Identifica filial nova, planta, centro de distribuição ou troca de sede.',
    familiaId: 'expansao-e-registros',
    formulario: 'expansao',
    nichos: ['logistica-e-transporte', 'industria-fornecedores-b2b', 'energia-e-mercado-livre', 'corretoras-de-beneficios'],
    fonte: 'Base pública de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['nova_planta_filial', 'novo_cd_ou_filial', 'nova_filial_icp_g', 'troca_de_sede', 'expansao_de_planta'],
    contados: ['nova-filial-ou-sede', 'novo-escritorio', 'expansao-geografica'],
  },
  {
    id: 'financiamento-bndes-finep',
    nome: 'Financiamento BNDES/Finep',
    frase: 'Encontra financiamentos públicos anunciados para indústria e energia.',
    familiaId: 'capital-e-financas',
    formulario: 'capital',
    nichos: ['industria-fornecedores-b2b', 'energia-e-mercado-livre'],
    fonte: 'Divulgações públicas de financiamento',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['financiamento_bndes_finep'],
    contados: ['financiamento-bndes-finep'],
    padroes: { eventos: ['Investimento anunciado'] },
  },
  {
    id: 'nova-mercadoria-importada',
    nome: 'Nova mercadoria importada',
    frase: 'Detecta uma mercadoria nova na pauta de importação do mercado.',
    familiaId: 'comercio-exterior',
    formulario: 'expansao',
    nichos: ['comex-e-importacao'],
    fonte: 'Estatísticas públicas de comércio exterior',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['ncm_nova_na_pauta'],
    contados: ['nova-mercadoria-importada'],
  },
  {
    id: 'mudanca-regulatoria-e-licenca',
    nome: 'Mudança regulatória e licença de instalação',
    frase: 'Acompanha mudança de regra e licença de instalação publicadas no diário oficial.',
    familiaId: 'regulacao',
    formulario: 'expansao',
    nichos: ['juridico-empresarial', 'industria-fornecedores-b2b'],
    fonte: 'Publicações oficiais',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['mudanca_regulatoria', 'licenca_instalacao_dou'],
    contados: ['mudanca-regulatoria-e-licenca'],
  },
  {
    id: 'processos-e-recuperacao',
    nome: 'Processos públicos e recuperação judicial',
    frase: 'Detecta processo público relevante ou recuperação judicial da empresa.',
    familiaId: 'regulacao',
    formulario: 'expansao',
    nichos: ['juridico-empresarial'],
    fonte: 'Publicações oficiais de processos',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['processos_publicos', 'recuperacao_judicial'],
    contados: ['processos-e-recuperacao'],
  },
  {
    id: 'meta-esg-publicada',
    nome: 'Meta ESG publicada',
    frase: 'Encontra meta ambiental ou social que a empresa tornou pública.',
    familiaId: 'energia',
    formulario: 'noticias',
    nichos: ['energia-e-mercado-livre'],
    fonte: 'Relatos públicos da empresa',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['meta_esg_publicada'],
    contados: ['meta-esg-publicada'],
  },
  {
    id: 'grupo-a-e-cnae-eletrointensivo',
    nome: 'Consumidor Grupo A e CNAE eletrointensivo',
    frase: 'Aponta consumidor do Grupo A ainda cativo e atividade eletrointensiva.',
    familiaId: 'energia',
    formulario: 'expansao',
    nichos: ['energia-e-mercado-livre'],
    fonte: 'Dados públicos do mercado de energia e base de CNPJ',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['grupo_a_cativo', 'cnae_eletrointensivo'],
    contados: ['grupo-a-e-cnae-eletrointensivo'],
  },
  {
    id: 'calendario-e-plano-safra',
    nome: 'Calendário de safra e Plano Safra',
    frase: 'Marca a janela da safra e a liberação do Plano Safra.',
    familiaId: 'agro',
    formulario: 'noticias',
    nichos: ['agro-b2b'],
    fonte: 'Calendários públicos da safra',
    custoRotulo: dentroDoTeto,
    custoUsd: null,
    coletores: ['calendario_de_safra', 'liberacao_plano_safra'],
    contados: ['calendario-e-plano-safra'],
  },
  {
    id: 'sem-resposta',
    nome: 'Ausência de resposta',
    frase: 'Retoma Contas sem resposta há o prazo que você definir.',
    familiaId: 'historico-comercial',
    formulario: 'historico',
    nichos: TODOS,
    fonte: 'Interações do próprio Workspace',
    custoRotulo: 'Sem custo de fonte externa',
    custoUsd: null,
    coletores: ['sem_resposta'],
    contados: ['sem-resposta'],
    padroes: { condicao: 'Sem resposta', prazo: '45', etapas: ['Descoberta', 'Proposta'] },
  },
  {
    id: 'negociacao-parada',
    nome: 'Negociação parada',
    frase: 'Aponta negociação sem atividade há o prazo que você definir.',
    familiaId: 'historico-comercial',
    formulario: 'historico',
    nichos: TODOS,
    fonte: 'Interações do próprio Workspace',
    custoRotulo: 'Sem custo de fonte externa',
    custoUsd: null,
    coletores: ['negociacao_parada'],
    contados: ['negociacao-parada'],
    padroes: { condicao: 'Negociação parada', prazo: '30', etapas: ['Negociação'] },
  },
  {
    id: 'proposta-recusada',
    nome: 'Proposta recusada',
    frase: 'Traz de volta a Conta cuja proposta foi recusada há o tempo que você escolher.',
    familiaId: 'historico-comercial',
    formulario: 'historico',
    nichos: TODOS,
    fonte: 'Interações do próprio Workspace',
    custoRotulo: 'Sem custo de fonte externa',
    custoUsd: null,
    coletores: ['proposta_recusada'],
    contados: ['proposta-recusada'],
    padroes: { condicao: 'Proposta recusada', prazo: '90', etapas: ['Proposta'] },
  },
]

const POR_ID = new Map(CATALOGO_VISIVEL.map((card) => [card.id, card]))

export function cardPorId(id: string): CardDoCatalogo | undefined {
  return POR_ID.get(id)
}

/** O card que exibe os Monitoramentos deste id (o próprio ou um id unido nele). */
export function cardQueConta(tipoId: string): CardDoCatalogo | undefined {
  return CATALOGO_VISIVEL.find((card) => card.contados.includes(tipoId))
}

export function cargosDoNicho(slug: string): readonly string[] {
  return CARGOS_POR_NICHO[slug] ?? []
}

export function nomesDosNichos(slugs: readonly string[]): string[] {
  return slugs.map((slug) => NICHOS.find((nicho) => nicho.slug === slug)?.nome ?? slug)
}

/** O card cobre os oito nichos. */
export function valeParaTodosOsNichos(card: CardDoCatalogo): boolean {
  return NICHOS.every((nicho) => card.nichos.includes(nicho.slug))
}
