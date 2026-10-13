-- Sinais em cascata, ICP D (Energia e mercado livre): os cinco Sinais do Mapa de Mercado.
--
--   cnae_eletrointensivo        (D1) CONTA. Receita Federal por CNAE (uma subclasse por execução; a tabela de CNAEs
--                               eletrointensivos é critério interno revisável, no código) → página da empresa no LinkedIn só
--                               para quem ainda não casou → casar com as Contas.
--   grupo_a_cativo              (D2) CONTA, INFERÊNCIA. Receita Federal por CNAE e porte → exclui os CNPJs (pela raiz) que estão na
--                               lista de agentes da CCEE (dados abertos, sem custo; a URL fica no modelo do passo) = "provável
--                               cativo". A evidência diz "inferido, não confirmado".
--   nova_planta_filial          (D3) CONTA. Mapa de filiais por raiz de CNPJ, comparado com a fotografia da rodada anterior (a
--                               primeira rodada só grava) + notícias do último mês como reforço (não filtra).
--   meta_esg_publicada          (D4) CONTA. Busca "<empresa> relatório de sustentabilidade" e "<empresa> net zero" → só páginas do
--                               próprio site → leitura da página → confirmação por palavra-chave.
--   vencimento_contrato_energia (D5) SEM FONTE. Os contratos de energia são acordos privados e não são publicados por empresa.
--
-- Nascem em teste, como todo Sinal novo; passam a "disponível" depois de uma execução real (passo do Nan). Os preços são os da
-- API pública da Store conferidos em 13/10/2026 (faixa Free); a execução real é que valida.

select private.seed_signal_cascade($j${
  "signalType": "cnae_eletrointensivo", "icp": "D", "name": "CNAE eletrointensivo", "scope": "conta",
  "capUsd": 0.30, "cadenceHours": 168,
  "notes": "Empresas das Contas cuja atividade principal está na tabela interna de CNAEs eletrointensivos (critério revisável, não é lista oficial). A Receita só deixa buscar uma subclasse por execução: sem o setor no pedido, cada semana olha a seguinte.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "cnpj_por_cnae", "actorId": "epicscrapers~brazil-cnpj-scraper", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "uf": "" }, "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009, "estItems": 100, "maxItems": 100,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porResultado": 0.0009, "porExecucao": 0.00005 } },
    { "ordem": 2, "kind": "actor", "handler": "linkedin_empresa_por_cnae", "actorId": "harvestapi~linkedin-company", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.004, "estItems": 30, "maxItems": 30,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porResultado": 0.004, "porExecucao": 0.00005 } },
    { "ordem": 3, "kind": "regra", "handler": "fatos_cnae_eletrointensivo" },
    { "ordem": 4, "kind": "regra", "handler": "casar_fatos_com_contas" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "grupo_a_cativo", "icp": "D", "name": "Empresa do Grupo A ainda cativa", "scope": "conta",
  "capUsd": 0.15, "cadenceHours": 168,
  "notes": "Inferência, não confirmação: atividade e porte da Receita, fora da lista de consumidores livres e especiais da CCEE (pela raiz do CNPJ). A lista da CCEE é aberta e a URL fica no modelo do passo 2; se a fonte não responde ou a lista não cabe no limite de leitura, nada é afirmado.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "cnpj_por_cnae", "actorId": "epicscrapers~brazil-cnpj-scraper", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "uf": "" }, "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009, "estItems": 100, "maxItems": 100,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porResultado": 0.0009, "porExecucao": 0.00005 } },
    { "ordem": 2, "kind": "fonte_publica", "handler": "ccee_agentes", "priceModel": "FREE",
      "inputTemplate": { "url": "https://dadosabertos.ccee.org.br/api/3/action/datastore_search?resource_id=2ab64875-9c28-4ccf-931b-0111116bf4e6",
        "classes": ["Consumidor Livre", "Consumidor Especial"], "tamanhoDaPagina": 5000, "maxPaginas": 8 },
      "knownPrice": { "fonte": "Dados abertos da CCEE (CKAN), sem custo", "recurso": "LISTA_AGENTE_ASSOCIADO 2026 (o recurso muda por ano)", "licenca": "CC-BY-4.0, atribuir à CCEE" } },
    { "ordem": 3, "kind": "regra", "handler": "provavel_cativo", "inputTemplate": { "portes": ["DEMAIS"] } },
    { "ordem": 4, "kind": "regra", "handler": "casar_fatos_com_contas" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "nova_planta_filial", "icp": "D", "name": "Nova planta ou filial", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720, "maxAccounts": 40,
  "notes": "Filial ativa que surge na rede de filiais de uma Conta (por raiz de CNPJ) entre duas fotografias mensais; a primeira rodada só grava a fotografia. Notícias do último mês entram como reforço na evidência, sem filtrar. Só Contas com CNPJ.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "mapa_de_filiais", "actorId": "johnatan029~branch-network", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.01, "estItems": 20, "maxItems": 40,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porMapa": 0.01, "porExecucao": 0.00005 } },
    { "ordem": 2, "kind": "regra", "handler": "filiais_novas" },
    { "ordem": 3, "kind": "actor", "handler": "noticias_de_expansao", "actorId": "data_xplorer~google-news-scraper-fast", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "timeframe": "1m", "regiao": "BR:pt-419" }, "estFixedUsd": 0, "estPerItemUsd": 0.004, "estItems": 10, "maxItems": 10,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porResultado": 0.004 } },
    { "ordem": 4, "kind": "regra", "handler": "casar_fatos_com_contas" },
    { "ordem": 5, "kind": "regra", "handler": "gravar_fotografia_filiais" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "meta_esg_publicada", "icp": "D", "name": "Meta ESG publicada", "scope": "conta",
  "capUsd": 0.25, "cadenceHours": 720, "maxAccounts": 50,
  "notes": "Duas buscas por Conta (relatório de sustentabilidade e net zero); só páginas do próprio site são lidas (não PDF) e a meta é confirmada por palavra-chave no texto da página, sem modelo de linguagem.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "busca_esg", "actorId": "scraperlink~google-search-results-serp-scraper", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "consultas": ["relatório de sustentabilidade", "net zero"] }, "estFixedUsd": 0, "estPerItemUsd": 0.0005, "estItems": 100, "maxItems": 100,
      "knownPrice": { "fonte": "API pública da Store, 13/10/2026, faixa Free", "porPaginaDeResultados": 0.0005 } },
    { "ordem": 2, "kind": "regra", "handler": "paginas_esg", "inputTemplate": { "maxPaginas": 20 } },
    { "ordem": 3, "kind": "actor", "handler": "confirmar_esg_no_site", "actorId": "apify~website-content-crawler", "priceModel": "FREE",
      "estFixedUsd": 0, "estPerItemUsd": 0.002, "estItems": 20, "maxItems": 20,
      "knownPrice": { "fonte": "só computação; ~US$ 0,002 por página é estimativa do relatório de 12/10/2026", "porPagina": 0.002, "naoConferido": "preço da unidade de computação no plano Free" } },
    { "ordem": 4, "kind": "regra", "handler": "confirmar_esg" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "vencimento_contrato_energia", "icp": "D", "name": "Vencimento de contrato de energia", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "Os prazos dos contratos de energia são acordos privados entre as partes e não são publicados por empresa; as listas abertas da CCEE trazem os agentes, não o vencimento dos contratos.",
  "notes": "Mapa de Mercado, ICP D. Alternativas: grupo_a_cativo e cnae_eletrointensivo."
}$j$::jsonb);
