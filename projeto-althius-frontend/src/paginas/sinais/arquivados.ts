// Sinais que saíram da tela em 14/10/2026. Nada foi apagado: o tipo continua em `catalogo.ts` ou na cascata.
// Para reativar, siga `docs/sinais-arquivados.md`.

export interface SinalArquivado {
  id: string
  archived: true
  motivo: string
  comoReativar: string
}

const COMO =
  'Tire este id de ARCHIVED_SIGNALS, inclua um card em CATALOGO_VISIVEL e uma migração nova que insere a linha em public.signal_catalog. Não apague o coletor.'

const semColetor = (id: string, nome: string): SinalArquivado => ({
  id,
  archived: true,
  motivo: `${nome} saiu do catálogo: não há coletor. Volta só quando a coleta existir.`,
  comoReativar: COMO,
})

const semFonte = (id: string, nome: string): SinalArquivado => ({
  id,
  archived: true,
  motivo: `${nome} saiu do catálogo: não há fonte aberta útil para os nichos, ou a fonte esbarra em LGPD.`,
  comoReativar: COMO,
})

/** Tipos da tela antiga que não têm card no catálogo único. */
export const ARQUIVADOS_DA_TELA: readonly SinalArquivado[] = [
  {
    id: 'vagas-no-indeed',
    archived: true,
    motivo: 'Vagas no Indeed deixou de ser um card: entrou em Abertura de vagas. O coletor vaga_indeed continua.',
    comoReativar: COMO,
  },
  semColetor('primeira-contratacao', 'Primeira contratação'),
  semColetor('contratacao-gtm-revops', 'GTM e RevOps'),
  semColetor('dores-em-vagas', 'Dores em vagas'),
  semColetor('antigos-compradores', 'Antigos compradores'),
  semColetor('rodadas', 'Rodadas'),
  semColetor('fusoes-aquisicoes', 'Fusões e aquisições'),
  semColetor('investimentos-anunciados', 'Investimentos anunciados genéricos'),
  semColetor('situacao-financeira', 'Situação financeira'),
  semColetor('reestruturacao', 'Reestruturações'),
  semColetor('terrenos-imoveis', 'Terrenos e imóveis'),
  semColetor('alvaras-de-obras', 'Alvarás'),
  semColetor('registros-empresariais', 'Registros empresariais genéricos'),
  semColetor('licitacoes', 'Licitações'),
  semColetor('mudanca-de-ferramenta', 'Mudança de ferramenta'),
  semColetor('tecnologia-identificada', 'Tecnologia identificada'),
  semColetor('migracoes', 'Migrações'),
  semColetor('certificacoes', 'Certificações'),
  semColetor('incidentes', 'Incidentes'),
  semColetor('noticias-relevantes', 'Notícias'),
  semColetor('lancamentos', 'Lançamentos'),
  semColetor('novos-projetos', 'Novos projetos'),
  semColetor('parcerias', 'Parcerias'),
  semColetor('mencao-de-parceiro', 'Menções'),
  semColetor('conferencias', 'Conferências'),
  semColetor('podcasts-entrevistas', 'Podcasts'),
  semColetor('publicacoes', 'Publicações antigas'),
  semColetor('avaliacoes', 'Avaliações no G2'),
  semColetor('mencoes-a-concorrentes', 'Menções a concorrentes'),
  semColetor('relatos-de-problemas', 'Relatos'),
  semColetor('saida-de-fornecedor', 'Saída de fornecedor'),
  semColetor('discussoes', 'Discussões em comunidades'),
  semColetor('repositorios', 'Interesse em repositórios'),
  semColetor('pesquisa-de-temas', 'Pesquisa de temas'),
  semColetor('interesse-em-concorrentes', 'Interesse em concorrentes'),
  semColetor('visitas-ao-site', 'Visitas ao site'),
  semColetor('pagina-de-precos', 'Página de preços'),
  semColetor('paginas-especificas', 'Páginas específicas'),
  semColetor('lead-oculto', 'Lead oculto'),
  semColetor('erros-no-site', 'Erros no site'),
  semColetor('formularios', 'Formulários'),
  semColetor('outras-verificacoes', 'Outras verificações'),
]

/** Cascatas que saíram da tela. O registro no banco permanece. */
export const ARQUIVADOS_DE_CASCATA: readonly SinalArquivado[] = [
  semFonte('habilitacao_radar', 'Habilitação no Radar'),
  semFonte('novo_importador', 'Novo importador'),
  semFonte('processos_jusbrasil_datajud', 'Processos no Jusbrasil e no DataJud'),
  semFonte('vencimento_contrato_energia', 'Vencimento de contrato de energia'),
  semFonte('importacao_de_maquinas', 'Importação de máquinas'),
  semFonte('licenca_instalacao', 'Licença de instalação antiga'),
  semFonte('crescimento_comex_embarcador', 'Crescimento de comex do embarcador'),
  semFonte('caged_por_empresa', 'CAGED por empresa'),
  semFonte('frota_crescendo', 'Frota crescendo'),
  semFonte('renovacao_de_apolice', 'Renovação de apólice'),
  semFonte('area_no_car', 'Área no CAR'),
  semFonte('cpr_registrada', 'CPR registrada'),
]

export const ARCHIVED_SIGNALS: readonly SinalArquivado[] = [...ARQUIVADOS_DA_TELA, ...ARQUIVADOS_DE_CASCATA]

const IDS = new Set(ARCHIVED_SIGNALS.map((sinal) => sinal.id))

export function sinalArquivado(id: string): boolean {
  return IDS.has(id)
}
