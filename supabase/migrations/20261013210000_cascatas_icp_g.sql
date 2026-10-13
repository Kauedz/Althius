-- Sinais em cascata, ICP G (corretoras de benefícios): os Sinais do Mapa de Mercado ("empresa cruzando faixa de headcount,
-- renovação anual de apólice, nova filial, frota crescendo", mais o CAGED por empresa que o Mapa cita nos de headcount).
--
--   cruzando_faixa_de_headcount  CONTA, 3 passos. Todo mês, a página da empresa no LinkedIn (harvestapi~linkedin-company,
--                                US$ 0,004 por empresa) das Contas que têm a página; a contagem de funcionários é fotografada
--                                (`ctx.snapshots`) e o Sinal sai quando a empresa cruza 50, 100 ou 200 (os limiares ficam no
--                                modelo de entrada do passo 3 e o pedido pode trocá-los). A 1ª rodada só grava a base. O
--                                reforço por volume de vagas que a spec cita (A1) fica de fora: é outro Sinal, de outro custo, e
--                                a vaga já é o Sinal `vaga_comex`; juntar os dois num só dobraria o preço sem trocar a decisão.
--   nova_filial_icp_g            CONTA, 3 passos. Todo mês, o mapa de filiais pela raiz do CNPJ da Conta (johnatan029~branch-network,
--                                US$ 0,01 por mapa; índice mensal dos dados abertos da Receita) e o diff contra a fotografia
--                                anterior: a filial ativa, aberta há pouco, que não estava na base vira Sinal. Sem alternativa:
--                                o lookup de CNPJ (johnatan029~cnpj-empresas-brasil-scraper) e a BrasilAPI devolvem UM
--                                estabelecimento por CNPJ, não a lista de filiais da raiz, então não servem de reserva. O nome
--                                do tipo leva o sufixo do ICP porque os ICPs D e F também têm um Sinal de filial.
--   renovacao_de_apolice         SEM FONTE. O vencimento da apólice de uma empresa fica no contrato com a seguradora.
--   frota_crescendo              SEM FONTE. RENAVAM é fechado; o RNTRC da ANTT só cobre transportadores de carga.
--   caged_por_empresa            SEM FONTE. Os microdados do CAGED não trazem o CNPJ do estabelecimento.
--
-- LGPD: o Sinal é da empresa. A fotografia guarda só a contagem de funcionários (e a faixa) e a lista de ordens de filial
-- (parte do CNPJ da empresa); nada de dado de saúde, de pessoa, de sócio ou da descrição da página. Os handlers têm o prefixo
-- `g_` porque o ICP F tem uma cascata de filial parecida em outro arquivo e as duas não compartilham código.
-- Todos nascem em teste, como todo Sinal novo; passam a "disponível" depois de uma execução real (passo do Nan).

select private.seed_signal_cascade($j${
  "signalType": "cruzando_faixa_de_headcount", "icp": "G", "name": "Empresa cruzando faixa de headcount", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720,
  "notes": "Contas com a página da empresa no LinkedIn, uma vez por mês: o Sinal sai quando a contagem de funcionários cruza 50, 100 ou 200. A primeira rodada só grava a base. Só a contagem e a faixa são guardadas.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "g_contas_para_headcount", "maxItems": 100,
      "inputTemplate": { "intervaloMinimoDias": 20 } },
    { "ordem": 2, "kind": "actor", "handler": "g_headcount_linkedin", "actorId": "harvestapi~linkedin-company", "fallbacks": [],
      "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "Relatório de preços de 12/10/2026, plano gratuito; conferido na ficha pública do actor em 13/10/2026", "porResultado": 0.004, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.004, "estItems": 100, "maxItems": 100,
      "inputTemplate": {} },
    { "ordem": 3, "kind": "regra", "handler": "g_cruzou_faixa_de_funcionarios",
      "inputTemplate": { "faixas": [50, 100, 200] } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "nova_filial_icp_g", "icp": "G", "name": "Nova filial da empresa", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720,
  "notes": "Contas com CNPJ, uma vez por mês: o mapa de filiais da raiz do CNPJ contra a fotografia do mês anterior. A filial ativa, aberta há pouco, que não estava na base vira Sinal. A primeira rodada só grava a base.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "g_contas_para_filiais", "maxItems": 40,
      "inputTemplate": { "intervaloMinimoDias": 25 } },
    { "ordem": 2, "kind": "actor", "handler": "g_mapa_de_filiais", "actorId": "johnatan029~branch-network", "fallbacks": [],
      "priceModel": "PAY_PER_EVENT",
      "knownPrice": { "fonte": "Relatório de preços de 12/10/2026, plano gratuito; conferido na ficha pública do actor em 13/10/2026", "porResultado": 0.01, "porExecucao": 0.00005 },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.01, "estItems": 40, "maxItems": 40,
      "inputTemplate": {} },
    { "ordem": 3, "kind": "regra", "handler": "g_nova_filial",
      "inputTemplate": { "janelaDias": 180, "maxPorConta": 10 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "renovacao_de_apolice", "icp": "G", "name": "Renovação anual de apólice", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O vencimento da apólice de benefícios de uma empresa fica no contrato dela com a seguradora; nenhuma base pública traz esse vencimento por empresa.",
  "notes": "Mapa de Mercado, ICP G."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "frota_crescendo", "icp": "G", "name": "Frota crescendo", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O registro de veículos por empresa (RENAVAM) é fechado, e o cadastro aberto da ANTT (RNTRC) cobre só transportadores de carga, não as empresas em geral; não há fonte pública para a frota de uma empresa.",
  "notes": "Mapa de Mercado, ICP G."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "caged_por_empresa", "icp": "G", "name": "Contratações por empresa (CAGED)", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "Os microdados do CAGED não trazem o CNPJ da empresa, só o município e o setor; não dá para saber as contratações de uma empresa específica.",
  "notes": "Mapa de Mercado, ICP G. Alternativa: cruzando_faixa_de_headcount."
}$j$::jsonb);
