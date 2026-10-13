-- Sinais em cascata, ICP F (Logística e transporte): quatro Sinais do Mapa de Mercado.
--
--   novo_cd_ou_filial            (F1) CONTA. Diff mensal da rede de filiais ativas por CNPJ: o mapa de filiais por raiz de CNPJ
--                                (dados abertos da Receita) guarda a lista de filiais pelos 14 dígitos; a primeira rodada só
--                                grava a base, a seguinte emite o Sinal das filiais ativas novas. Reforço por notícia
--                                ("novo centro de distribuição", últimos 30 dias) só para a Conta que teve filial nova.
--                                A consulta de CNPJ devolve UM estabelecimento, não a lista de filiais: por isso não serve a
--                                este Sinal (ela serve à troca de sede). Não há fonte aberta que liste filiais para servir de
--                                alternativa. Cada rodada fotografa até 35 Contas (as sem fotografia e depois as mais
--                                antigas), o que mantém o pior caso dentro do teto.
--   troca_de_sede                (F2) CONTA. Diff mensal do endereço da matriz por CNPJ (consulta de CNPJ, com a BrasilAPI aberta
--                                como alternativa). A fotografia guarda município, UF e marcas do endereço, nunca o texto.
--   vaga_logistica               (F3) CONTA. A mesma cascata do A1 (vaga_comex) com os termos de logística: os mesmos cinco
--                                passos e handlers; muda só o modelo de entrada (termos de busca e de confirmação).
--   crescimento_comex_embarcador (F4) SEM FONTE. A lista anual de empresas por CNPJ com a faixa de valor, que o MDIC publicava,
--                                não está mais aberta (sigilo fiscal; decisão da CMRI 467/2024); o Comex Stat é agregado,
--                                sem empresa.
-- Os Sinais novos nascem em teste; passam a "disponível" depois de uma execução real (passo do Nan).
-- Preços: API pública da Apify Store em 13/10/2026, faixa Free (nenhum aluguel).

select private.seed_signal_cascade($j${
  "signalType": "novo_cd_ou_filial", "icp": "F", "name": "Novo CD ou filial do embarcador", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720, "maxAccounts": 200,
  "notes": "Mapa de Mercado, ICP F. Mensal. Primeira rodada só grava a base de filiais; depois compara. Até 35 Contas por rodada, em rodízio pela fotografia mais antiga. Reforço por notícia só para quem teve filial nova.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "logistica_escolher_raizes", "inputTemplate": { "porRodada": 35 } },
    { "ordem": 2, "kind": "actor", "handler": "logistica_filiais_da_raiz", "actorId": "johnatan029~branch-network",
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.01, "estItems": 30, "maxItems": 40,
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.01, "porExecucao": 0.00005 } },
    { "ordem": 3, "kind": "regra", "handler": "logistica_novas_filiais", "inputTemplate": { "idadeMaximaDias": 180 } },
    { "ordem": 4, "kind": "actor", "handler": "logistica_noticias_de_cd", "actorId": "data_xplorer~google-news-scraper-fast",
      "inputTemplate": { "termo": "novo centro de distribuição", "porConta": 3, "janelaDias": 30, "regiao": "BR:pt-419",
        "termosConfirmacao": ["centro de distribuicao", "novo cd", "centro logistico", "hub logistico", "nova filial", "armazem"] },
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0, "estPerItemUsd": 0.004, "estItems": 6, "maxItems": 24,
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.004 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "troca_de_sede", "icp": "F", "name": "Troca de sede", "scope": "conta",
  "capUsd": 0.35, "cadenceHours": 720, "maxAccounts": 200,
  "notes": "Mapa de Mercado, ICP F. Mensal. Compara o município, a UF e a marca do endereço da matriz entre duas rodadas; a primeira só grava a base. Até 150 Contas por rodada, em rodízio.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "logistica_escolher_raizes", "inputTemplate": { "porRodada": 150 } },
    { "ordem": 2, "kind": "actor", "handler": "logistica_endereco_da_matriz", "actorId": "johnatan029~cnpj-empresas-brasil-scraper",
      "fallbacks": [ { "kind": "fonte_publica", "source": "logistica_brasilapi_matriz" } ],
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 40, "maxItems": 200,
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 } },
    { "ordem": 3, "kind": "regra", "handler": "logistica_mudanca_de_sede" }
  ]
}$j$::jsonb);

-- F3: os mesmos cinco passos de vaga_comex (20261013130000_cascatas_de_sinais.sql); o handler `confirmar_vaga_comex` lê os termos
-- de `termosConfirmacao` do modelo de entrada, então a confirmação é a de logística.
select private.seed_signal_cascade($j${
  "signalType": "vaga_logistica", "icp": "F", "name": "Vaga de logística", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 24, "maxAccounts": 200,
  "notes": "Mapa de Mercado, ICP F. Empresas que abriram, há até 7 dias, vaga de logística, supply chain ou transportes, casadas com as Contas-alvo do Workspace. Mesma cascata do A1 com outros termos.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "linkedin_vagas", "actorId": "curious_coder~linkedin-jobs-scraper",
      "fallbacks": [
        { "kind": "actor", "actorId": "valig~linkedin-jobs-scraper", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.001, "estPerItemUsd": 0.0004 },
        { "kind": "actor", "actorId": "zen-studio~gupy-jobs-scraper", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.00299 }
      ],
      "inputTemplate": { "termos": ["analista de logística", "supply chain", "coordenador de transportes"], "pais": "Brazil", "janelaDias": 7, "porTermo": 25 },
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.002, "estItems": 100, "maxItems": 100,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.002, "porExecucao": 0.00005 } },
    { "ordem": 2, "kind": "regra", "handler": "confirmar_vaga_comex",
      "inputTemplate": { "termosConfirmacao": ["logistica", "logistico", "supply chain", "cadeia de suprimentos", "transporte", "transportes"], "janelaDias": 7 } },
    { "ordem": 3, "kind": "actor", "handler": "linkedin_empresa", "actorId": "harvestapi~linkedin-company",
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.004, "estItems": 30, "maxItems": 50,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.004, "porExecucao": 0.00005 } },
    { "ordem": 4, "kind": "regra", "handler": "casar_com_contas" },
    { "ordem": 5, "kind": "actor", "handler": "cnpj_da_conta", "actorId": "johnatan029~cnpj-empresas-brasil-scraper",
      "fallbacks": [ { "kind": "fonte_publica", "source": "brasilapi_cnpj" } ],
      "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 10, "maxItems": 20,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "crescimento_comex_embarcador", "icp": "F", "name": "Crescimento de comex do embarcador", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O MDIC não publica mais a lista anual de empresas por CNPJ com a faixa de valor (sigilo fiscal; decisão da CMRI 467/2024); a estatística aberta do Comex Stat é por produto, estado e país, sem empresa.",
  "cadenceHours": 8760,
  "notes": "Mapa de Mercado, ICP F. Se uma fonte lícita por empresa aparecer, troca-se o estado e entram os passos."
}$j$::jsonb);
