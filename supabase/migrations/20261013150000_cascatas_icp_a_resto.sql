-- Sinais em cascata, ICP A (Comex e importação), fora o A1 (que veio com o motor): quatro Sinais do Mapa de Mercado.
--
--   novo_importador   (A2)  SEM FONTE. O Mapa pede "novo importador no Comex Stat", mas o Comex Stat é agregado por produto,
--                           estado e país, sem empresa; a lista de empresas importadoras por CNPJ que o MDIC já publicou não
--                           está mais aberta (a CGU e a CMRI mantiveram o sigilo fiscal dela, decisão CMRI 467/2024). Sem
--                           fonte aberta e sem actor adequado, o Sinal fica registrado, com o motivo, em vez de forçar uma
--                           fonte ruim. Se uma fonte lícita aparecer, troca-se o estado e entram os passos.
--   ncm_nova_na_pauta (A3)  MERCADO. API aberta do Comex Stat (sem custo de fonte): a NCM dos capítulos acompanhados que
--                           importou nos últimos 3 meses e não importou nos 12 anteriores.
--   volume_por_porto  (A4)  MERCADO. Comex Stat: o porto ou aeroporto cujo volume importado do mês subiu sobre a média dos
--                           3 meses anteriores.
--   habilitacao_radar (A5)  SEM FONTE. A consulta da Receita é individual, por CNPJ, e exige verificação humana; não há fonte
--                           pública em massa.
-- Os Sinais de mercado não são de uma Conta: vão para o feed do Workspace (`list_market_signals`). Nascem em teste, como todo
-- Sinal novo; passam a "disponível" depois de uma execução real (passo do Nan).

select private.seed_signal_cascade($j${
  "signalType": "novo_importador", "icp": "A", "name": "Novo importador no Comex Stat", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O MDIC não publica a lista de empresas importadoras por CNPJ (sigilo fiscal); a estatística aberta do Comex Stat é por produto, estado e país, sem empresa.",
  "notes": "Mapa de Mercado, ICP A. Alternativa de mercado: ncm_nova_na_pauta."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "habilitacao_radar", "icp": "A", "name": "Habilitação no Radar", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "A consulta de habilitação é individual, por CNPJ, e exige verificação humana; não existe fonte pública em massa.",
  "notes": "Mapa de Mercado, ICP A."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "ncm_nova_na_pauta", "icp": "A", "name": "NCM nova na pauta de importação", "scope": "mercado",
  "capUsd": 0.05, "cadenceHours": 720,
  "notes": "Sinal de mercado: capítulos acompanhados (padrão 84 e 85). API aberta do Comex Stat, uma consulta por 10 segundos.",
  "steps": [
    { "ordem": 1, "kind": "fonte_publica", "handler": "comexstat_ncm_janelas", "priceModel": "FREE",
      "inputTemplate": { "capitulos": [84, 85], "meses": 3 },
      "knownPrice": { "fonte": "API aberta do Comex Stat (MDIC), sem custo", "limite": "1 requisição a cada 10 segundos" } },
    { "ordem": 2, "kind": "regra", "handler": "ncms_novas_na_pauta", "inputTemplate": { "limiarFobUsd": 100000 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "volume_por_porto", "icp": "A", "name": "Aumento de volume importado por porto", "scope": "mercado",
  "capUsd": 0.05, "cadenceHours": 720,
  "notes": "Sinal de mercado: o mês mais novo do Comex Stat contra a média dos 3 meses anteriores, por porto e aeroporto (URF).",
  "steps": [
    { "ordem": 1, "kind": "fonte_publica", "handler": "comexstat_urf_mensal", "priceModel": "FREE",
      "inputTemplate": { "capitulos": [84, 85] },
      "knownPrice": { "fonte": "API aberta do Comex Stat (MDIC), sem custo", "limite": "1 requisição a cada 10 segundos" } },
    { "ordem": 2, "kind": "regra", "handler": "volume_por_porto", "inputTemplate": { "variacaoMinima": 0.25, "fobMinimoUsd": 50000000 } }
  ]
}$j$::jsonb);
