# Ajustes de Mercado e Equipe (PR-4)

1. Os 3 cards de Mercado (`nova-mercadoria-importada`, `mudanca-regulatoria-e-licenca`, `calendario-e-plano-safra`) cobram 3 créditos por execução; `credits_per_account` passa a 3, coerente com o rótulo. O editor deixa de escrever fixo "1 crédito" e usa o preço do próprio tipo.
2. O Workspace ilimitado (Equipe Althius) não tem limite de usuários: `get_contract_summary` devolve `max_users` nulo; a tela Plano mostra só os usuários ativos. O convite já não bloqueava.

GATE: pgTAP `ajustes_mercado_e_equipe.sql` e Vitest `catalogo-visivel-custo.test.ts` verdes; CI Banco, Edge e Frontend verdes.
