// As quatro cascatas do ICP F (logística e transporte) como a migração 20261013200000_cascatas_icp_f.sql as registra, para
// os testes de ponta a ponta. O pgTAP confere a semente; aqui os passos de código a executam.
import type { CascataDef, PassoDef } from '../tipos.ts'

const regra = (ordem: number, handler: string, inputTemplate: Record<string, unknown> = {}): PassoDef => ({
  ordem, kind: 'regra', handler, actorId: null, fallbacks: [], inputTemplate, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
})

const base = (extra: Partial<CascataDef>): CascataDef => ({
  id: 'cascata-f', signalType: 'x', icp: 'F', name: 'x', version: 1, state: 'available', semFonteMotivo: null, scope: 'conta',
  multiplier: 3, capUsd: 0.5, capCredits: null, cadenceHours: 720, maxAccounts: 200, steps: [], ...extra,
})

export function cascataNovoCdOuFilial(extra: Partial<CascataDef> = {}): CascataDef {
  return base({
    id: 'cascata-f1', signalType: 'novo_cd_ou_filial', name: 'Novo CD ou filial do embarcador',
    steps: [
      regra(1, 'logistica_escolher_raizes', { porRodada: 35 }),
      {
        ordem: 2, kind: 'actor', handler: 'logistica_filiais_da_raiz', actorId: 'johnatan029~branch-network', fallbacks: [], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.01, estItems: 30, maxItems: 40,
      },
      regra(3, 'logistica_novas_filiais', { idadeMaximaDias: 180 }),
      {
        ordem: 4, kind: 'actor', handler: 'logistica_noticias_de_cd', actorId: 'data_xplorer~google-news-scraper-fast', fallbacks: [],
        inputTemplate: {
          termo: 'novo centro de distribuição', porConta: 3, janelaDias: 30, regiao: 'BR:pt-419',
          termosConfirmacao: ['centro de distribuicao', 'novo cd', 'centro logistico', 'hub logistico', 'nova filial', 'armazem'],
        },
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0, estPerItemUsd: 0.004, estItems: 6, maxItems: 24,
      },
    ],
    ...extra,
  })
}

export function cascataTrocaDeSede(extra: Partial<CascataDef> = {}): CascataDef {
  return base({
    id: 'cascata-f2', signalType: 'troca_de_sede', name: 'Troca de sede', capUsd: 0.35,
    steps: [
      regra(1, 'logistica_escolher_raizes', { porRodada: 150 }),
      {
        ordem: 2, kind: 'actor', handler: 'logistica_endereco_da_matriz', actorId: 'johnatan029~cnpj-empresas-brasil-scraper',
        fallbacks: [{ kind: 'fonte_publica', source: 'logistica_brasilapi_matriz' }], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.0015, estItems: 40, maxItems: 200,
      },
      regra(3, 'logistica_mudanca_de_sede'),
    ],
    ...extra,
  })
}

export function cascataVagaLogistica(extra: Partial<CascataDef> = {}): CascataDef {
  return base({
    id: 'cascata-f3', signalType: 'vaga_logistica', name: 'Vaga de logística', cadenceHours: 24,
    steps: [
      {
        ordem: 1, kind: 'actor', handler: 'linkedin_vagas', actorId: 'curious_coder~linkedin-jobs-scraper',
        fallbacks: [
          { kind: 'actor', actorId: 'valig~linkedin-jobs-scraper', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.001, estPerItemUsd: 0.0004 },
          { kind: 'actor', actorId: 'zen-studio~gupy-jobs-scraper', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.00299 },
        ],
        inputTemplate: { termos: ['analista de logística', 'supply chain', 'coordenador de transportes'], pais: 'Brazil', janelaDias: 7, porTermo: 25 },
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.002, estItems: 100, maxItems: 100,
      },
      regra(2, 'confirmar_vaga_comex', {
        termosConfirmacao: ['logistica', 'logistico', 'supply chain', 'cadeia de suprimentos', 'transporte', 'transportes'], janelaDias: 7,
      }),
      {
        ordem: 3, kind: 'actor', handler: 'linkedin_empresa', actorId: 'harvestapi~linkedin-company', fallbacks: [], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.004, estItems: 30, maxItems: 50,
      },
      regra(4, 'casar_com_contas'),
      {
        ordem: 5, kind: 'actor', handler: 'cnpj_da_conta', actorId: 'johnatan029~cnpj-empresas-brasil-scraper',
        fallbacks: [{ kind: 'fonte_publica', source: 'brasilapi_cnpj' }], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.0015, estItems: 10, maxItems: 20,
      },
    ],
    ...extra,
  })
}

export const MOTIVO_SEM_FONTE_COMEX_DO_EMBARCADOR =
  'O MDIC não publica mais a lista anual de empresas por CNPJ com a faixa de valor (sigilo fiscal; decisão da CMRI 467/2024); a estatística aberta do Comex Stat é por produto, estado e país, sem empresa.'

export function cascataCrescimentoComexEmbarcador(extra: Partial<CascataDef> = {}): CascataDef {
  return base({
    id: 'cascata-f4', signalType: 'crescimento_comex_embarcador', name: 'Crescimento de comex do embarcador', state: 'sem_fonte',
    semFonteMotivo: MOTIVO_SEM_FONTE_COMEX_DO_EMBARCADOR, cadenceHours: 8760, ...extra,
  })
}

/** O pior caso de custo de uma cascata: cada passo de actor no teto de itens dele. */
export function piorCasoUsd(def: CascataDef): number {
  return Math.round(def.steps.reduce((s, p) => s + (p.kind === 'actor' ? p.estFixedUsd + p.estPerItemUsd * (p.maxItems ?? p.estItems) : 0), 0) * 1e6) / 1e6
}
