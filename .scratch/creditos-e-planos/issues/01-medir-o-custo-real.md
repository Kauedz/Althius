# 01: Medir o custo real de cada ação

**What to build:** cada Execução de Agente grava os tokens e o modelo usados; cada execução de actor do Apify grava o custo que o Apify devolve; um relatório por Workspace e por mês mostra o custo real por tipo de ação. É o dado para fechar a tabela de créditos e as cotas dos planos.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent (o relatório e a tabela estão prontos; falta gravar o custo das propostas de resposta e testar quem grava; o custo da Receita, do comitê e do revelar fica com B1, B2 e B3 da `prospeccao-funcional`)

## Pode mexer

- Migration aditiva com uma tabela privada de custos por ação e a função de relatório (só Administrador).
- A ponte, o worker do Hermes e as Edge Functions que chamam o Apify, só para registrar o custo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Custo gravado por ação, com fornecedor, modelo ou actor, unidades e valor em dólar.
- [x] Relatório mensal por tipo de ação e por Workspace.
- [x] Sem dado pessoal na tabela de custos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar as funções alteradas (`agent-conversation` e as do Apify) e reiniciar o worker do Hermes.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/96

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Cumpridos: o relatório mensal por tipo e por Workspace (`get_cost_report`, `20260930120000_custos_por_acao.sql:117-156`, só Administrador; pgTAP `custos_por_acao.sql` ok no CI 37707955273, asserções "o relatório tem uma linha por tipo, fornecedor e modelo ou actor" e "o Membro não lê o relatório de custos"); sem dado pessoal (`:6-22`; asserção "as tabelas de custo têm RLS ligado e nenhum papel do app as lê direto").
  - Parcial (custo por ação): gravam a Execução de Agente (`record_agent_run_cost`, chamado em `agent-conversation/index.ts:125` e `_hermes-worker/main.ts:45`), a foto do Contato (`contact-photo-lookup/handler.ts:203-206`), os Sinais (`signal-scan/handler.ts:132`, `signal-runner/handler.ts:218`) e a descoberta por ICP (`account-discovery/handler.ts:232-246`). Não gravam: a Receita (`account-enrichment/handler.ts:377`), o comitê (`:441`, `:474`, sem `costUsd`) e o revelar (`:538`); `_shared/provedor-de-contatos.ts:120,183` nem guarda o `runId`. As propostas de resposta chamam o modelo sem gravar tokens nem modelo (`reply-proposal-runner/handler.ts:193-206`), e o `check` de `action_type` só aceita `agent_run` e `apify_actor`.
  - Testes rodados: `deno test --allow-all supabase/functions/agent-conversation/ supabase/functions/_hermes-worker/` → 69 passed; `deno test --allow-all supabase/functions/contact-photo-lookup/ supabase/functions/signal-scan/ supabase/functions/account-discovery/ supabase/functions/signal-runner/ supabase/functions/account-enrichment/` → 198 passed, 0 failed (entre eles "a ponte: registra o custo da Execução depois de fechá-la…" e "o custo que o Apify informa é gravado junto da busca…").
  - Duplicado: o custo da Receita, do comitê e do revelar está nos tickets B1, B2 e B3 de `.scratch/prospeccao-funcional/`. Atenção para o B2: passar o custo a `finish_committee_discovery` só grava `discovery_runs.actual_cost_usd`; para chegar ao relatório, o handler chama também `record_discovery_cost` (`20261001171000:275`), como o `account-discovery`. Os três actors já estão em `private.discovery_actors`.
  - Falta (agente): (1) gravar tokens e modelo das propostas de resposta, com migration que aceite o tipo novo no `check` de `action_type` e pgTAP; (2) testes Deno que confiram o `recordCost` do `signal-runner` e o `gravarCusto` do `account-discovery` (hoje são só dublês, `signal-runner/handler.test.ts:83`).
  - Depois, Passos do Nan: aplicar a migration conforme `docs/agents/migrations.md` e `npx supabase functions deploy reply-proposal-runner --project-ref ycbdilsmydvzezhlymty`.
