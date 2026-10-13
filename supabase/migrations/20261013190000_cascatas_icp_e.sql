-- Sinais em cascata, ICP E (indústria: fornecedores B2B): os Sinais do Mapa de Mercado ("Financiamento BNDES ou Finep,
-- licença ambiental de instalação, expansão de planta, vaga de engenharia ou manutenção, importação de máquinas NCM 84/85").
--
--   financiamento_bndes_finep   CONTA. Fontes públicas abertas, sem custo de fonte: o portal de dados abertos do BNDES
--                               (operações não automáticas, com o CNPJ do cliente) e a planilha de contratações da Finep.
--                               Um fato por contrato (até 3 por empresa), casado com as Contas pelo CNPJ. Os dois ficam num
--                               passo só para uma fonte fora do ar não derrubar a outra e para o Sinal gastar 1 crédito, não 2.
--                               Alternativa registrada para o BNDES (cobra por registro, por isso o teto baixo): fica
--                               registrada e ainda não roda, porque o motor só executa alternativas em passo de actor.
--   expansao_de_planta          CONTA. Notícias → a empresa da manchete (modelo de linguagem, ou regra de palavra-chave sem
--                               ele) → casamento com as Contas → Receita Federal da Conta que tem CNPJ.
--   vaga_engenharia_manutencao  CONTA. A MESMA cascata do A1 (vaga de comex), com os termos da indústria: nenhum passo novo
--                               de código, só o modelo de entrada (`termos`) e a chave `termosConfirmacao`.
--   licenca_instalacao_dou      MERCADO. Diário Oficial da União: licenças de instalação federais (IBAMA e afins).
--   licenca_instalacao          SEM FONTE. Os órgãos estaduais (CETESB, FEAM, INEA...) têm portais distintos, sem dado aberto
--                               único por CNPJ; o que sai no Diário Oficial entra no Sinal de mercado acima.
--   importacao_de_maquinas      SEM FONTE por empresa. O Comex Stat é agregado (não abre por CNPJ); a importação de máquinas
--                               dos capítulos 84 e 85 já é Sinal de mercado no ICP A (ncm_nova_na_pauta, volume_por_porto,
--                               cujo padrão é 84 e 85). Registrado aqui, com o motivo, em vez de repetir o Sinal do A.
-- Todos nascem em teste (passam a "disponível" depois de uma execução real: passo do Nan). Preços da API pública da Apify
-- Store em 12/10/2026 (faixa Free) e, no actor do Diário Oficial, o custo de início por GB de memória lido em 13/10/2026.

select private.seed_signal_cascade($j${
  "signalType": "financiamento_bndes_finep", "icp": "E", "name": "Financiamento do BNDES ou da Finep", "scope": "conta",
  "capUsd": 0.30, "cadenceHours": 168,
  "notes": "Contratos de financiamento do BNDES (operações não automáticas) e da Finep (crédito e subvenção) dos últimos 90 dias, casados com as Contas pelo CNPJ. Fontes abertas, sem custo de coleta; o dado do BNDES é mensal.",
  "steps": [
    { "ordem": 1, "kind": "fonte_publica", "handler": "financiamentos_publicos", "priceModel": "FREE", "maxItems": 5,
      "fallbacks": [{ "kind": "actor", "actorId": "nexgenwatch~brazil-bndes-financing-operations", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.02, "estPerItemUsd": 0.05 }],
      "inputTemplate": { "janelaDias": 90 },
      "knownPrice": { "fonte": "Portal de dados abertos do BNDES e planilha de contratações da Finep, sem custo",
        "alternativa": "API pública da Apify Store, 12/10/2026, faixa Free: US$ 0,05 por registro e US$ 0,02 por execução (caro, só 2 usuários); o maxItems do passo (5) limita a alternativa a US$ 0,27" } },
    { "ordem": 2, "kind": "regra", "handler": "casar_fatos_com_contas" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "expansao_de_planta", "icp": "E", "name": "Expansão de planta industrial", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 168,
  "notes": "Notícias dos últimos 7 dias sobre ampliação de fábrica ou nova planta; a empresa da manchete é casada com as Contas pelo nome (e a Receita Federal entra na evidência da Conta que tem CNPJ).",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "noticias_expansao_planta", "actorId": "data_xplorer~google-news-scraper-fast", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0, "estPerItemUsd": 0.004, "estItems": 100, "maxItems": 100,
      "inputTemplate": { "termos": ["expansão de fábrica", "nova planta industrial", "ampliação da fábrica", "inaugura nova fábrica"], "janelaDias": 7, "regiao": "BR:pt-419" },
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.004 } },
    { "ordem": 2, "kind": "regra", "handler": "empresa_da_noticia_expansao", "estFixedUsd": 0.002, "inputTemplate": { "janelaDias": 7 },
      "knownPrice": { "fonte": "Modelo de linguagem da Althius (Claude Haiku 5.5): cerca de US$ 0,001 por 100 manchetes; sem o modelo, regra de palavra-chave" } },
    { "ordem": 3, "kind": "regra", "handler": "casar_fatos_com_contas" },
    { "ordem": 4, "kind": "actor", "handler": "cnpj_da_conta", "actorId": "johnatan029~cnpj-empresas-brasil-scraper", "priceModel": "PAY_PER_EVENT",
      "fallbacks": [{ "kind": "fonte_publica", "source": "brasilapi_cnpj" }],
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 10, "maxItems": 20,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "vaga_engenharia_manutencao", "icp": "E", "name": "Vaga de engenharia ou manutenção", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 24,
  "notes": "Empresas que abriram, há até 7 dias, vaga de engenharia de manutenção, PCM ou engenharia de processos, casadas com as Contas-alvo do Workspace. Mesma cascata do Sinal de vaga de comex, com outros termos.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "linkedin_vagas", "actorId": "curious_coder~linkedin-jobs-scraper", "priceModel": "PAY_PER_EVENT",
      "fallbacks": [
        { "kind": "actor", "actorId": "valig~linkedin-jobs-scraper", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.001, "estPerItemUsd": 0.0004 },
        { "kind": "actor", "actorId": "zen-studio~gupy-jobs-scraper", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.00299 }],
      "inputTemplate": { "termos": ["engenheiro de manutenção", "PCM", "engenheiro de processos", "supervisor de manutenção"], "pais": "Brazil", "janelaDias": 7, "porTermo": 25 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.002, "estItems": 100, "maxItems": 100,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.002, "porExecucao": 0.00005 } },
    { "ordem": 2, "kind": "regra", "handler": "confirmar_vaga_comex",
      "inputTemplate": { "termosConfirmacao": ["engenheiro de manutencao", "engenheira de manutencao", "engenheiro a de manutencao", "engenharia de manutencao", "pcm",
        "planejador de manutencao", "planejadora de manutencao", "supervisor de manutencao", "coordenador de manutencao", "gerente de manutencao",
        "engenheiro de processos", "engenheira de processos", "engenheiro a de processos", "engenharia de processos"], "janelaDias": 7 } },
    { "ordem": 3, "kind": "actor", "handler": "linkedin_empresa", "actorId": "harvestapi~linkedin-company", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.004, "estItems": 30, "maxItems": 50,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.004, "porExecucao": 0.00005 } },
    { "ordem": 4, "kind": "regra", "handler": "casar_com_contas" },
    { "ordem": 5, "kind": "actor", "handler": "cnpj_da_conta", "actorId": "johnatan029~cnpj-empresas-brasil-scraper", "priceModel": "PAY_PER_EVENT",
      "fallbacks": [{ "kind": "fonte_publica", "source": "brasilapi_cnpj" }],
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 10, "maxItems": 20,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "licenca_instalacao_dou", "icp": "E", "name": "Licença de instalação no Diário Oficial da União", "scope": "mercado",
  "capUsd": 0.30, "cadenceHours": 168,
  "notes": "Sinal de mercado: publicações dos últimos 14 dias com \"licença de instalação\" no Diário Oficial da União (licenças federais). Licença de pessoa física (CPF) é descartada; o CNPJ vai no payload quando a ementa o traz. Parcial: as licenças estaduais não entram.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "licencas_dou", "actorId": "jenko_systems~diario-oficial-uniao-dou", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0.2, "estPerItemUsd": 0.0001, "estItems": 50, "maxItems": 50,
      "inputTemplate": { "termo": "\"licença de instalação\"", "secao": "todos", "janelaDias": 14 },
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026, faixa Free", "porResultado": 0.0001,
        "porExecucao": "0,05 por GB de memória; a memória padrão do actor é 4 GB, então US$ 0,20 por execução (leitura da API pública em 13/10/2026)" } },
    { "ordem": 2, "kind": "regra", "handler": "licencas_de_instalacao_dou", "inputTemplate": { "janelaDias": 14 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "licenca_instalacao", "icp": "E", "name": "Licença ambiental de instalação por empresa", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "As licenças de instalação dos órgãos ambientais estaduais saem em portais diferentes, sem dado aberto por CNPJ; só o que o Diário Oficial da União publica entra, como Sinal de mercado.",
  "notes": "Mapa de Mercado, ICP E. Alternativa de mercado: licenca_instalacao_dou."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "importacao_de_maquinas", "icp": "E", "name": "Importação de máquinas (NCM 84 e 85) por empresa", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O Comex Stat não abre a importação por CNPJ; a importação de máquinas (capítulos 84 e 85) aparece como Sinal de mercado em NCM nova na pauta e aumento de volume por porto.",
  "notes": "Mapa de Mercado, ICP E. Alternativas de mercado: ncm_nova_na_pauta e volume_por_porto (ICP A)."
}$j$::jsonb);
