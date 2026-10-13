-- Sinais em cascata, ICP C (Jurídico empresarial, jurimetria): cinco Sinais do Mapa de Mercado.
--
--   processos_publicos           (C1) CONTA. Processos trabalhistas e tributários por CNPJ: das Contas com CNPJ, no máximo 10 por
--                                rodada (as sem fotografia primeiro, depois as mais antigas), o resumo agregado de processos
--                                dos últimos 3 anos e o salto de 3 ou mais processos trabalhistas e tributários contra a
--                                fotografia anterior (até 90 dias). A 1ª rodada de cada CNPJ só grava a base. Só contagens por
--                                CNPJ: o resumo não traz parte, advogado nem CPF, e o código só lê CNPJ, total e contagens.
--                                Custo: US$ 0,10 por CNPJ; 10 CNPJs = US$ 1,00 = o teto (cap_usd). Créditos: custo x 3 / 0,30
--                                = 1 crédito por CNPJ. NÃO entram: (a) o fallback de processos individuais (US$ 0,20 por
--                                processo, traz partes, inclusive pessoa física: fica desligado até haver filtro de pessoa
--                                física testado e orçamento); (b) o passo opcional de distribuição por tipo (US$ 1,00 por
--                                CNPJ: caro demais para o crédito).
--   mudanca_regulatoria          (C2) MERCADO. Atos da Seção 1 do Diário Oficial da União por palavra-chave (IBS, CBS, reforma
--                                tributária, agência reguladora) classificados por CNAE afetado (modelo de linguagem; sem
--                                ele, tabela interna de palavras-chave). Sem pessoa física: ato de pessoal é descartado
--                                antes de qualquer classificação.
--   recuperacao_judicial         (C3) CONTA. Notícias dos últimos 7 dias de recuperação judicial ou pedido de falência, o nome
--                                da empresa (modelo de linguagem; sem ele, regra), cruzado com as Contas do Workspace e
--                                confirmado no resumo de processos do CNPJ da Conta. Limitação: a relação cliente ou
--                                fornecedor do prospect NÃO é pública; o Sinal é "a empresa X, que é Conta do Workspace,
--                                entrou em recuperação judicial". Empresa que não é Conta só é contada.
--   impacto_reforma_cnae         (C4) MERCADO. Tabela interna CNAE -> impacto da reforma tributária (EC 132/2023 e LC 214/2025;
--                                leitura do produto, a validar por especialista) e uma amostra de empresas ativas do CNAE na
--                                base da Receita. Um setor por rodada (o de maior impacto ainda não sinalizado no ano).
--   processos_jusbrasil_datajud  (C) SEM FONTE. Nem o DataJud nem os tribunais buscam processo pelo CNPJ da empresa (a consulta
--                                é pelo número do processo), e o Jusbrasil proíbe a coleta automatizada nos termos de uso.
-- Todo Sinal novo nasce em teste; passa a "disponível" depois de uma execução real (passo do Nan). Preços e esquemas de entrada
-- e saída: API pública da Apify Store, 12/10/2026 e conferidos de novo em 13/10/2026 (faixa Free, sem aluguel).

select private.seed_signal_cascade($j${
  "signalType": "processos_publicos", "icp": "C", "name": "Processos públicos por CNPJ", "scope": "conta",
  "capUsd": 1.00, "cadenceHours": 720, "maxAccounts": 100,
  "notes": "Mapa de Mercado, ICP C. Salto de 3 ou mais processos trabalhistas e tributários em até 90 dias contra a fotografia anterior; a primeira rodada de cada CNPJ só grava a base (e cobra a consulta). No máximo 10 CNPJs por rodada (US$ 0,10 cada, teto US$ 1,00); maxAccounts é só a janela de Contas lidas para escolher quem tem CNPJ. Só contagens por CNPJ, sem partes nem advogados.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "jur_cnpjs_para_processos", "inputTemplate": { "maxCnpjs": 10 } },
    { "ordem": 2, "kind": "actor", "handler": "jur_processos_por_cnpj", "actorId": "brasildados~cnpj-lawsuits-check", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0, "estPerItemUsd": 0.10, "estItems": 10, "maxItems": 10,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026 (conferido em 13/10/2026), faixa Free", "porResultado": 0.10, "evento": "por CNPJ analisado", "entrada": "cnpjs (até 50 pelo esquema; 100 pelo texto)", "janela": "últimos 3 anos, como réu" } },
    { "ordem": 3, "kind": "regra", "handler": "jur_saltos_de_processos", "inputTemplate": { "limiarNovos": 3, "janelaDias": 90 } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "mudanca_regulatoria", "icp": "C", "name": "Mudança regulatória por setor", "scope": "mercado",
  "capUsd": 0.50, "cadenceHours": 168,
  "notes": "Sinal de mercado: atos da Seção 1 do Diário Oficial da União (últimos 7 dias) com IBS, CBS, reforma tributária ou agência reguladora, com os setores (CNAE) afetados. Ato de pessoal é descartado. A alternativa só olha os últimos 3 dias.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "jur_dou_publicacoes", "actorId": "jenko_systems~diario-oficial-uniao-dou", "priceModel": "PAY_PER_EVENT",
      "fallbacks": [ { "kind": "actor", "actorId": "brasildados~dou-monitor", "priceModel": "PAY_PER_EVENT", "estFixedUsd": 0.10, "estPerItemUsd": 0.01 } ],
      "inputTemplate": { "termos": ["IBS", "CBS", "reforma tributária", "agência reguladora"], "secao": "do1", "janelaDias": 7 },
      "estFixedUsd": 0.05, "estPerItemUsd": 0.0001, "estItems": 30, "maxItems": 50,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026 (conferido em 13/10/2026), faixa Free", "porExecucao": 0.05, "porResultado": 0.0001, "alternativa": { "porExecucao": 0.10, "porResultado": 0.01 } } },
    { "ordem": 2, "kind": "regra", "handler": "jur_classificar_mudanca" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "recuperacao_judicial", "icp": "C", "name": "Recuperação judicial de empresa da carteira", "scope": "conta",
  "capUsd": 0.70, "cadenceHours": 24, "maxAccounts": 100,
  "notes": "Mapa de Mercado, ICP C (cliente ou fornecedor do prospect). A relação cliente ou fornecedor não é pública: o Sinal vale para a empresa que é Conta do Workspace e entrou em recuperação judicial ou teve falência noticiada nos últimos 7 dias. Empresa que não é Conta só é contada. A confirmação nos processos do CNPJ (US$ 0,10 por Conta com CNPJ, no máximo 5) acrescenta à evidência.",
  "steps": [
    { "ordem": 1, "kind": "actor", "handler": "jur_noticias_recuperacao", "actorId": "data_xplorer~google-news-scraper-fast", "priceModel": "PAY_PER_EVENT",
      "inputTemplate": { "consulta": "\"recuperação judicial\" OR \"pedido de falência\"", "janelaDias": 7 },
      "estFixedUsd": 0, "estPerItemUsd": 0.004, "estItems": 30, "maxItems": 40,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026 (conferido em 13/10/2026), faixa Free", "porResultado": 0.004 } },
    { "ordem": 2, "kind": "regra", "handler": "jur_empresas_em_recuperacao", "inputTemplate": { "janelaDias": 7 } },
    { "ordem": 3, "kind": "regra", "handler": "casar_fatos_com_contas" },
    { "ordem": 4, "kind": "actor", "handler": "jur_confirmar_recuperacao", "actorId": "brasildados~cnpj-lawsuits-check", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0, "estPerItemUsd": 0.10, "estItems": 2, "maxItems": 5,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026 (conferido em 13/10/2026), faixa Free", "porResultado": 0.10, "evento": "por CNPJ analisado" } }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "impacto_reforma_cnae", "icp": "C", "name": "Impacto da reforma tributária no CNAE", "scope": "mercado",
  "capUsd": 0.05, "cadenceHours": 168,
  "notes": "Sinal de mercado: um setor por rodada (maior impacto ainda não sinalizado no ano; ou o CNAE pedido), com a amostra de até 5 empresas ativas do CNAE. A tabela de impacto é uma leitura interna da EC 132/2023 e da LC 214/2025 e deve ser validada por especialista.",
  "steps": [
    { "ordem": 1, "kind": "regra", "handler": "jur_setor_da_reforma" },
    { "ordem": 2, "kind": "actor", "handler": "jur_empresas_por_cnae", "actorId": "epicscrapers~brazil-cnpj-scraper", "priceModel": "PAY_PER_EVENT",
      "estFixedUsd": 0.00005, "estPerItemUsd": 0.0009, "estItems": 20, "maxItems": 20,
      "knownPrice": { "fonte": "API pública da Apify Store, 12/10/2026 (conferido em 13/10/2026), faixa Free", "porExecucao": 0.00005, "porResultado": 0.0009 } },
    { "ordem": 3, "kind": "regra", "handler": "jur_sinal_impacto_reforma" }
  ]
}$j$::jsonb);

select private.seed_signal_cascade($j${
  "signalType": "processos_jusbrasil_datajud", "icp": "C", "name": "Processos por CNPJ no Jusbrasil e no DataJud", "state": "sem_fonte", "scope": "conta",
  "semFonteMotivo": "O DataJud e os tribunais só consultam processo pelo número, não pelo CNPJ da empresa, e o Jusbrasil proíbe a coleta automatizada nos termos de uso. Para processos por CNPJ use o Sinal Processos públicos por CNPJ.",
  "notes": "Mapa de Mercado, ICP C. Alternativa: processos_publicos."
}$j$::jsonb);
