-- Sinais em cascata, ICP B (Contabilidade e tributário): os quatro Sinais do Mapa de Mercado, todos sobre a base aberta de
-- CNPJ da Receita Federal (mensal, com atraso de até ~30 dias: a evidência de cada Sinal avisa).
--
--   cnpj_novo                    (B1) CONTA. Empresas abertas no mês, casadas com as Contas-alvo do Workspace pelo CNPJ (ou
--                                nome). A empresa nova que não é Conta só é contada. Base mensal de empresas novas, com a base
--                                mensal alternativa e a base geral por UF e CNAE como reserva.
--   mudanca_de_porte_ou_regime   (B2) CONTA. Fotografia mensal do CNPJ de cada Conta (porte, Simples, MEI, regime) e a
--                                diferença contra a do mês anterior. A primeira rodada só grava a base. Reserva: BrasilAPI.
--   entrada_de_socio             (B3) CONTA. Fotografia mensal do quadro societário e a diferença. A fotografia guarda só a
--                                contagem e um código curto por sócio (nunca nome nem CPF); o Sinal diz só "entrou sócio".
--   setor_afetado_cbs_ibs        (B4) MERCADO. Um setor por rodada, da tabela interna de atividades afetadas pela CBS/IBS (um
--                                critério interno revisável, em passos/icp-b-cnae.ts), dimensionado por amostra do cadastro de
--                                CNPJ. Sem Conta: vai para o feed do Workspace.
-- O Mapa não traz outro Sinal do ICP B sem fonte; por isso nenhum fica "sem fonte" aqui. Todos nascem em teste, como todo Sinal
-- novo; passam a "disponível" depois de uma execução real (passo do Nan). Os preços são da API pública da Apify Store (faixa
-- Free, 13/10/2026); só pagamento por evento, nunca aluguel.

select private.seed_signal_cascade($j${
  "signalType": "cnpj_novo", "icp": "B", "name": "CNPJ novo", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720,
  "notes": "Mapa de Mercado, ICP B. Empresas abertas no mês (base mensal da Receita, atraso de até 30 dias) que são Contas do Workspace. Filtros do pedido: UF, CNAE, porte e mês.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "cnpj_novos_da_receita", "actorId": "johnatan029~cnpj-new-companies",
      "fallbacks": [
        { "kind": "actor", "actorId": "brazilayer~brazilian-new-companies", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0, "estPerItemUsd": 0.002 },
        { "kind": "actor", "actorId": "epicscrapers~brazil-cnpj-scraper", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009 }
      ],
      "inputTemplate": {}, "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.004, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.004, "estItems": 100, "maxItems": 100 },
    { "ordem": 2, "kind": "regra", "handler": "casar_fatos_com_contas" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "mudanca_de_porte_ou_regime", "icp": "B", "name": "Mudança de porte ou regime", "scope": "conta",
  "capUsd": 0.25, "cadenceHours": 720, "maxAccounts": 100,
  "notes": "Mapa de Mercado, ICP B. Fotografia mensal do CNPJ de cada Conta com CNPJ cadastrado (até 100) e diferença de porte, Simples, MEI e regime. A primeira rodada só grava a base.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "receita_fotografia", "actorId": "johnatan029~cnpj-empresas-brasil-scraper",
      "fallbacks": [ { "kind": "fonte_publica", "source": "brasilapi_fotografia_cnpj" } ],
      "inputTemplate": {}, "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 100, "maxItems": 100 },
    { "ordem": 2, "kind": "regra", "handler": "diff_porte_regime" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "entrada_de_socio", "icp": "B", "name": "Entrada de sócio", "scope": "conta",
  "capUsd": 0.25, "cadenceHours": 720, "maxAccounts": 100,
  "notes": "Mapa de Mercado, ICP B. Fotografia mensal do quadro societário de cada Conta com CNPJ cadastrado (até 100); guarda só a contagem e um código curto por sócio, nunca nome nem CPF. O Sinal diz só que entrou sócio.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "receita_fotografia", "actorId": "johnatan029~cnpj-empresas-brasil-scraper",
      "fallbacks": [ { "kind": "fonte_publica", "source": "brasilapi_fotografia_cnpj" } ],
      "inputTemplate": { "socios": true }, "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.0015, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0015, "estItems": 100, "maxItems": 100 },
    { "ordem": 2, "kind": "regra", "handler": "diff_socios" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "setor_afetado_cbs_ibs", "icp": "B", "name": "Setor mais afetado pela CBS/IBS", "scope": "mercado",
  "capUsd": 0.15, "cadenceHours": 720,
  "notes": "Sinal de mercado. Um setor por rodada, da tabela interna de atividades afetadas (critério interno, revisável, não é lista oficial; o pedido pode escolher o CNAE e a UF), dimensionado por amostra de até 100 empresas do cadastro de CNPJ.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "receita_por_cnae", "actorId": "epicscrapers~brazil-cnpj-scraper",
      "fallbacks": [
        { "kind": "actor", "actorId": "brasildados~cnpj-lead-scraper-search", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.1, "estPerItemUsd": 0.01 }
      ],
      "inputTemplate": {}, "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "API pública da Apify Store, 13/10/2026, faixa Free", "porResultado": 0.0009, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009, "estItems": 100, "maxItems": 100 },
    { "ordem": 2, "kind": "regra", "handler": "setor_afetado_cbs_ibs" }
  ]
}$j$::jsonb);
