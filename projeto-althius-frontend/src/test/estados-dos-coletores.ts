// O estado dos coletores como a leitura de produção de 20/10/2026 devolveu (`list_signal_actors` e `list_signal_catalog`),
// para os testes do catálogo que o cliente vê (catalogo-so-funcionais).

/** As linhas de `list_signal_actors`: os Sinais externos. */
export const ACTORS_DE_20_10: readonly { signal_type: string; state: string }[] = [
  { signal_type: 'vaga_linkedin', state: 'available' },
  { signal_type: 'vaga_indeed', state: 'testing' },
  { signal_type: 'nova_lideranca', state: 'available' },
  { signal_type: 'entradas_e_saidas', state: 'available' },
  { signal_type: 'mudanca_de_emprego', state: 'available' },
  { signal_type: 'anuncio_de_movimentacao', state: 'available' },
  { signal_type: 'anuncio_meta', state: 'available' },
  { signal_type: 'anuncio_linkedin', state: 'available' },
  { signal_type: 'avaliacoes_google_maps', state: 'available' },
]

/** As linhas de `list_signal_catalog`: os internos e os tipos que as cascatas atendem. */
export const CATALOGO_DE_20_10: readonly { signal_type: string; state: string }[] = [
  { signal_type: 'cnpj_novo', state: 'available' },
  { signal_type: 'nova_cooperativa', state: 'available' },
  { signal_type: 'financiamento_bndes_finep', state: 'available' },
  { signal_type: 'ncm_nova_na_pauta', state: 'available' },
  { signal_type: 'sem_resposta', state: 'available' },
  { signal_type: 'negociacao_parada', state: 'available' },
  { signal_type: 'proposta_recusada', state: 'available' },
  { signal_type: 'crescimento_de_equipes', state: 'testing' },
  { signal_type: 'entrada_de_socio', state: 'testing' },
  { signal_type: 'mudanca_de_porte_ou_regime', state: 'testing' },
  { signal_type: 'troca_de_sede', state: 'testing' },
  { signal_type: 'mudanca_regulatoria', state: 'out' },
  { signal_type: 'processos_publicos', state: 'testing' },
  { signal_type: 'meta_esg_publicada', state: 'out' },
  { signal_type: 'grupo_a_cativo', state: 'testing' },
  { signal_type: 'calendario_de_safra', state: 'out' },
]

export const ESTADOS_DE_20_10: ReadonlyMap<string, string> = new Map(
  [...ACTORS_DE_20_10, ...CATALOGO_DE_20_10].map((linha) => [linha.signal_type, linha.state]),
)

/** Os 15 cards que o cliente vê com esses estados, na ordem do catálogo. */
export const FUNCIONAIS_EM_20_10: readonly string[] = [
  'abertura-de-vagas',
  'nova-lideranca',
  'novas-contratacoes',
  'promocoes',
  'anuncio-de-movimentacao',
  'anuncios-meta',
  'anuncios-linkedin',
  'avaliacoes-google-maps',
  'nova-empresa-aberta',
  'nova-cooperativa',
  'financiamento-bndes-finep',
  'nova-mercadoria-importada',
  'sem-resposta',
  'negociacao-parada',
  'proposta-recusada',
]
