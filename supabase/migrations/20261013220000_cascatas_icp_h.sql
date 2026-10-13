-- Sinais em cascata, ICP H (agro B2B): cinco Sinais do Mapa de Mercado ("CPR registrada, área no CAR, calendário de safra,
-- liberação do Plano Safra, nova cooperativa").
--
--   nova_cooperativa      (CONTA)   Cooperativa (natureza jurídica 214-3) aberta há pouco, na base aberta de CNPJ da Receita.
--                                   Passo 1: busca por natureza jurídica (a data de abertura e o recorte agro são conferidos no
--                                   passo); alternativa: empresas novas do mês por CNAE do agro. Passo 2: cruza com as Contas
--                                   do Workspace; as que não são Conta só são contadas. A base é mensal: a abertura pode
--                                   aparecer com até 30 dias de atraso.
--   liberacao_plano_safra (MERCADO) Notícia de anúncio ou de liberação do Plano Safra (busca de notícias + regra por palavra-chave
--                                   do título). Só de maio a setembro, a temporada do anúncio. Sem Conta.
--   calendario_de_safra   (MERCADO) Tabela interna datada, no modelo do passo (revisável sem publicar código): a divulgação dos
--                                   levantamentos de grãos da CONAB (calendário público, conferido em 13/10/2026) e a janela de
--                                   compra de insumos de fev a mai (critério do Mapa de Mercado, não conferido em fonte pública).
--                                   Vale até 31/05/2027; as datas de divulgação de 2027 saem em janeiro e entram numa nova migração.
--   cpr_registrada        (SEM FONTE) A CPR é registrada em registradoras (B3, CERC) que não publicam dado aberto por emissor.
--   area_no_car           (SEM FONTE) O SICAR publica o perímetro dos imóveis por município, sem identificar o dono (LGPD).
-- Todos nascem em teste, como todo Sinal novo; passam a "disponível" depois de uma execução real (passo do Nan).

select private.seed_signal_cascade($j${
  "signalType": "nova_cooperativa", "icp": "H", "name": "Nova cooperativa", "scope": "conta",
  "capUsd": 0.50, "cadenceHours": 720,
  "notes": "Cooperativa agro (natureza jurídica 214-3) aberta nos últimos 60 dias na base de CNPJ da Receita, que é mensal (atraso de até 30 dias). Recorte agro por CNAE é critério revisável do produto.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "cooperativas_abertas", "actorId": "epicscrapers~brazil-cnpj-scraper", "priceModel": "PAY_PER_EVENT",
      "fallbacks": [
        { "kind": "actor", "actorId": "johnatan029~cnpj-new-companies", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.00005, "estPerItemUsd": 0.004 }
      ],
      "inputTemplate": { "naturezaJuridica": "2143", "janelaDias": 60, "somenteAgro": true, "maxItensDoFallback": 100 },
      "knownPrice": { "fonte": "relatório de preços de 12/10/2026 (faixa Free), reconferido em 13/10/2026 na página pública do autor", "porItem": 0.0009, "porInicio": 0.00005,
        "alternativa": { "porItem": 0.004, "porInicio": 0.00005 }, "observacao": "O plano Free limita o autor a 10.000 registros por mês; o autor não filtra por data de abertura." },
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009, "estItems": 300, "maxItems": 300 },
    { "ordem": 2, "kind": "regra", "handler": "casar_fatos_com_contas" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "liberacao_plano_safra", "icp": "H", "name": "Liberação do Plano Safra", "scope": "mercado",
  "capUsd": 0.25, "cadenceHours": 168,
  "notes": "Sinal de mercado: notícia de anúncio ou de liberação do Plano Safra, identificada pelas palavras-chave do título (sem ler a notícia). Só roda de maio a setembro.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "noticias_plano_safra", "actorId": "data_xplorer~google-news-scraper-fast", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "termos": ["\"Plano Safra\" lançamento OR anúncio", "\"Plano Safra\" liberação OR crédito"], "janelaDias": 7, "mesesDeBusca": [5, 6, 7, 8, 9] },
      "knownPrice": { "fonte": "relatório de preços de 12/10/2026 (faixa Free), reconferido em 13/10/2026 na página pública do autor", "porItem": 0.004 },
      "estFixedUsd": 0, "estPerItemUsd": 0.004, "estItems": 40, "maxItems": 40 },
    { "ordem": 2, "kind": "regra", "handler": "plano_safra_da_noticia", "inputTemplate": { "janelaDias": 7 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "calendario_de_safra", "icp": "H", "name": "Calendário de safra", "scope": "mercado",
  "capUsd": 0.05, "cadenceHours": 168,
  "notes": "Sinal de mercado sem custo de fonte: tabela interna datada no modelo do passo (valida até 31/05/2027). Revisar quando a CONAB publicar o calendário de 2027.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "calendario_de_safra", "priceModel": "FREE",
      "inputTemplate": { "recenteDias": 10, "eventos": [
        { "id": "conab-graos-2025-26-04", "tipo": "divulgacao", "titulo": "4º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-01-15", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-05", "tipo": "divulgacao", "titulo": "5º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-02-12", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-06", "tipo": "divulgacao", "titulo": "6º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-03-13", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-07", "tipo": "divulgacao", "titulo": "7º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-04-14", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-08", "tipo": "divulgacao", "titulo": "8º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-05-14", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-09", "tipo": "divulgacao", "titulo": "9º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-06-11", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-10", "tipo": "divulgacao", "titulo": "10º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-07-14", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-11", "tipo": "divulgacao", "titulo": "11º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-08-13", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2025-26-12", "tipo": "divulgacao", "titulo": "12º levantamento da safra de grãos 2025/26", "safra": "2025/26", "de": "2026-09-15", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2026-27-01", "tipo": "divulgacao", "titulo": "1º levantamento da safra de grãos 2026/27", "safra": "2026/27", "de": "2026-10-15", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2026-27-02", "tipo": "divulgacao", "titulo": "2º levantamento da safra de grãos 2026/27", "safra": "2026/27", "de": "2026-11-13", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2026-27-03", "tipo": "divulgacao", "titulo": "3º levantamento da safra de grãos 2026/27", "safra": "2026/27", "de": "2026-12-15", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "conab-graos-2026-27-04", "tipo": "divulgacao", "titulo": "4º levantamento da safra de grãos 2026/27", "safra": "2026/27", "de": "2027-01-14", "fonte": "CONAB, calendário de divulgação", "conferidoEm": "2026-10-13" },
        { "id": "janela-insumos-2026", "tipo": "janela", "titulo": "Janela de compra de insumos da próxima safra", "safra": "2026/27", "de": "2026-02-01", "ate": "2026-05-31", "fonte": "Mapa de Mercado (out/2026), ICP H", "conferidoEm": null },
        { "id": "janela-insumos-2027", "tipo": "janela", "titulo": "Janela de compra de insumos da próxima safra", "safra": "2027/28", "de": "2027-02-01", "ate": "2027-05-31", "fonte": "Mapa de Mercado (out/2026), ICP H", "conferidoEm": null }
      ] },
      "knownPrice": { "fonte": "sem custo de fonte: tabela interna" } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "cpr_registrada", "icp": "H", "name": "CPR registrada", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "A CPR é registrada em registradoras (B3, CERC) que não publicam dado aberto por emissor; só o volume total do mercado é público, e o emissor pode ser pessoa física (LGPD).",
  "notes": "Mapa de Mercado, ICP H."
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "area_no_car", "icp": "H", "name": "Área no CAR", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O SICAR publica o perímetro dos imóveis rurais por município, sem identificar o dono (CPF ou CNPJ), por proteção de dados pessoais (LGPD); não dá para ligar a área a uma empresa.",
  "notes": "Mapa de Mercado, ICP H."
}$j$::jsonb);
