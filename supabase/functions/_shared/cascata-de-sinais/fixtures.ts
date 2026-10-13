// A cascata A1 (vaga de analista de comex) como o banco a registra (a semente de 20261013130000_cascatas_de_sinais.sql),
// para os testes de ponta a ponta. O pgTAP confere a semente; aqui os passos de código a executam.
import type { CascataDef } from './tipos.ts'

export function cascataVagaComex(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'cascata-a1',
    signalType: 'vaga_comex',
    icp: 'A',
    name: 'Vaga de analista de comex',
    version: 1,
    state: 'available',
    semFonteMotivo: null,
    scope: 'conta',
    multiplier: 3,
    capUsd: 0.5,
    capCredits: null,
    cadenceHours: 24,
    maxAccounts: 200,
    steps: [
      {
        ordem: 1, kind: 'actor', handler: 'linkedin_vagas', actorId: 'curious_coder~linkedin-jobs-scraper',
        fallbacks: [
          { kind: 'actor', actorId: 'valig~linkedin-jobs-scraper', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.001, estPerItemUsd: 0.0004 },
          { kind: 'actor', actorId: 'zen-studio~gupy-jobs-scraper', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.00299 },
        ],
        inputTemplate: { termos: ['analista de comércio exterior', 'analista de comex', 'analista de importação', 'despachante aduaneiro'], pais: 'Brazil', janelaDias: 7, porTermo: 25 },
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.002, estItems: 100, maxItems: 100,
      },
      {
        ordem: 2, kind: 'regra', handler: 'confirmar_vaga_comex', actorId: null, fallbacks: [],
        inputTemplate: {
          termosConfirmacao: ['comercio exterior', 'comex', 'importacao', 'exportacao', 'despachante', 'aduaneiro', 'aduaneira', 'desembaraco aduaneiro', 'logistica internacional', 'foreign trade', 'import export'],
          janelaDias: 7,
        },
        priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
      },
      {
        ordem: 3, kind: 'actor', handler: 'linkedin_empresa', actorId: 'harvestapi~linkedin-company', fallbacks: [], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.004, estItems: 30, maxItems: 50,
      },
      {
        ordem: 4, kind: 'regra', handler: 'casar_com_contas', actorId: null, fallbacks: [], inputTemplate: {},
        priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
      },
      {
        ordem: 5, kind: 'actor', handler: 'cnpj_da_conta', actorId: 'johnatan029~cnpj-empresas-brasil-scraper',
        fallbacks: [{ kind: 'fonte_publica', source: 'brasilapi_cnpj' }], inputTemplate: {},
        priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.0015, estItems: 10, maxItems: 20,
      },
    ],
    ...extra,
  }
}
