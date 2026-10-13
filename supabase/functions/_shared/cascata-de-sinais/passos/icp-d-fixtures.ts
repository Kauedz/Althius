// As cascatas do ICP D como o banco as registra (a semente de 20261013180000_cascatas_icp_d.sql), para os testes de ponta a
// ponta. O pgTAP confere a semente; aqui os passos de código a executam. Se a migração mudar, mude aqui junto.
import type { CascataDef, PassoDef } from '../tipos.ts'

const regra = (ordem: number, handler: string, inputTemplate: Record<string, unknown> = {}): PassoDef => ({
  ordem, kind: 'regra', handler, actorId: null, fallbacks: [], inputTemplate, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
})

const actor = (
  ordem: number, handler: string, actorId: string, priceModel: string, estFixedUsd: number, estPerItemUsd: number, estItems: number,
  maxItems: number, inputTemplate: Record<string, unknown> = {},
): PassoDef => ({ ordem, kind: 'actor', handler, actorId, fallbacks: [], inputTemplate, priceModel, estFixedUsd, estPerItemUsd, estItems, maxItems })

const base = (signalType: string, name: string, capUsd: number, cadenceHours: number, maxAccounts: number, steps: PassoDef[]): CascataDef => ({
  id: `cascata-${signalType}`, signalType, icp: 'D', name, version: 1, state: 'testing', semFonteMotivo: null, scope: 'conta',
  multiplier: 3, capUsd, capCredits: null, cadenceHours, maxAccounts, steps,
})

export const URL_CCEE_AGENTES = 'https://dadosabertos.ccee.org.br/api/3/action/datastore_search?resource_id=2ab64875-9c28-4ccf-931b-0111116bf4e6'

export const cascataCnaeEletrointensivo = (extra: Partial<CascataDef> = {}): CascataDef => ({
  ...base('cnae_eletrointensivo', 'CNAE eletrointensivo', 0.3, 168, 200, [
    actor(1, 'cnpj_por_cnae', 'epicscrapers~brazil-cnpj-scraper', 'PAY_PER_EVENT', 0.00005, 0.0009, 100, 100, { uf: '' }),
    actor(2, 'linkedin_empresa_por_cnae', 'harvestapi~linkedin-company', 'PAY_PER_EVENT', 0.00005, 0.004, 30, 30),
    regra(3, 'fatos_cnae_eletrointensivo'),
    regra(4, 'casar_fatos_com_contas'),
  ]),
  ...extra,
})

export const cascataGrupoACativo = (extra: Partial<CascataDef> = {}): CascataDef => ({
  ...base('grupo_a_cativo', 'Empresa do Grupo A ainda cativa', 0.15, 168, 200, [
    actor(1, 'cnpj_por_cnae', 'epicscrapers~brazil-cnpj-scraper', 'PAY_PER_EVENT', 0.00005, 0.0009, 100, 100, { uf: '' }),
    {
      ordem: 2, kind: 'fonte_publica', handler: 'ccee_agentes', actorId: null, fallbacks: [], priceModel: 'FREE', estFixedUsd: 0, estPerItemUsd: 0,
      estItems: 0, maxItems: null,
      inputTemplate: { url: URL_CCEE_AGENTES, classes: ['Consumidor Livre', 'Consumidor Especial'], tamanhoDaPagina: 5000, maxPaginas: 8 },
    },
    regra(3, 'provavel_cativo', { portes: ['DEMAIS'] }),
    regra(4, 'casar_fatos_com_contas'),
  ]),
  ...extra,
})

export const cascataNovaPlantaFilial = (extra: Partial<CascataDef> = {}): CascataDef => ({
  ...base('nova_planta_filial', 'Nova planta ou filial', 0.5, 720, 40, [
    actor(1, 'mapa_de_filiais', 'johnatan029~branch-network', 'PAY_PER_EVENT', 0.00005, 0.01, 20, 40),
    regra(2, 'filiais_novas'),
    actor(3, 'noticias_de_expansao', 'data_xplorer~google-news-scraper-fast', 'PAY_PER_EVENT', 0, 0.004, 10, 10, { timeframe: '1m', regiao: 'BR:pt-419' }),
    regra(4, 'casar_fatos_com_contas'),
    regra(5, 'gravar_fotografia_filiais'),
  ]),
  ...extra,
})

export const cascataMetaEsg = (extra: Partial<CascataDef> = {}): CascataDef => ({
  ...base('meta_esg_publicada', 'Meta ESG publicada', 0.25, 720, 50, [
    actor(1, 'busca_esg', 'scraperlink~google-search-results-serp-scraper', 'PAY_PER_EVENT', 0, 0.0005, 100, 100, {
      consultas: ['relatório de sustentabilidade', 'net zero'],
    }),
    regra(2, 'paginas_esg', { maxPaginas: 20 }),
    actor(3, 'confirmar_esg_no_site', 'apify~website-content-crawler', 'FREE', 0, 0.002, 20, 20),
    regra(4, 'confirmar_esg'),
  ]),
  ...extra,
})

export const cascataVencimentoContratoEnergia = (): CascataDef => ({
  ...base('vencimento_contrato_energia', 'Vencimento de contrato de energia', 0.5, 24, 200, []),
  state: 'sem_fonte',
  semFonteMotivo:
    'Os prazos dos contratos de energia são acordos privados entre as partes e não são publicados por empresa; as listas abertas da CCEE trazem os agentes, não o vencimento dos contratos.',
})
