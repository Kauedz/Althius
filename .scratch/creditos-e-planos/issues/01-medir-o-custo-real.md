# 01: Medir o custo real de cada ação

**What to build:** cada Execução de Agente grava os tokens e o modelo usados; cada execução de actor do Apify grava o custo que o Apify devolve; um relatório por Workspace e por mês mostra o custo real por tipo de ação. É o dado para fechar a tabela de créditos e as cotas dos planos.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human (código fechado em 2026-10-08 na `ralph/frente-creditos`: as propostas de resposta gravam o custo e os testes de quem grava estão escritos; faltam aplicar a migration `20261008233000` e publicar as funções, nos Passos do Nan; o custo da Receita, do comitê e do revelar fica com B1, B2 e B3 da `prospeccao-funcional`)

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
3. (2026-10-08) Com o CI verde, logo antes do merge, aplicar `supabase/migrations/20261008233000_custo_das_propostas_de_resposta.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em [`docs/agents/migrations.md`](../../../docs/agents/migrations.md). Não aplicar antes do CI. A migration tira e põe de volta o `check` de `action_type` em `private.action_costs` só para aceitar `reply_proposal` (nenhuma linha sai), cria `record_reply_proposal_cost` e redefine `get_cost_report` com a mesma assinatura. Depois, conferir o `md5` da linha em `supabase_migrations.schema_migrations` e os avisos de segurança.
4. Depois da migration, publicar as três funções, na raiz do repositório, no PowerShell (o `verify_jwt` de cada uma vem do `supabase/config.toml`):

   ```powershell
   npx supabase functions deploy reply-proposal-runner signal-runner signal-scan --project-ref ycbdilsmydvzezhlymty
   ```

   `agent-conversation` só passou a exportar `usoDe`; não precisa de nova publicação. Para conferir, no SQL Editor, depois da primeira proposta gerada: `select action_type, provider, model_or_actor, input_units, output_units from private.action_costs where action_type = 'reply_proposal' order by occurred_at desc limit 5;`

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

- 2026-10-08 (frente créditos, `ralph/frente-creditos`, sem push):
  - Feito (1): as Propostas de resposta gravam o modelo e os tokens de cada chamada ao modelo, logo que ela responde (recusa e corte por tamanho também gastaram e entram). Migration `20261008233000_custo_das_propostas_de_resposta.sql`: o `check` de `action_type` aceita `reply_proposal`; `record_reply_proposal_cost(job, token da reserva, modelo, entrada, saída)`, só `service_role`, só com a reserva do trabalho; a chave do registro é a mesma da rodada de crédito (trabalho, tentativa e geração), então repetir não duplica e "gerar de novo" é outro custo; `get_cost_report` estima pelo preço do modelo também essa linha. `reply-proposal-runner` chama a RPC por `RunnerDb.custo` (opcional, como `RunDb.custo`), e uma falha ao gravar só vai ao log (`cost_failed`).
  - Feito (2): testes Deno novos do custo no `signal-runner` (`handler-custo.test.ts`) e no `account-discovery` (`custo.test.ts`): Workspace, actor, execução, itens e valor; valor em branco; id próprio quando o Apify não devolve o dele; falha ao gravar só no log. Conferidos por mutação (`items: 0` no handler faz o teste falhar).
  - Achado na revisão e corrigido: quando a leitura do custo no Apify lançava erro, `gravarCustoDaExecucao` (`_shared/apify-ambiente.ts`) pulava o registro e a execução sumia do relatório (`signal-runner` e `signal-scan`); agora grava com o valor em branco, como o `account-discovery`. Os tokens vêm do `usoDe` da ponte (`agent-conversation/runner.ts`, agora exportado), sem uma segunda regra.
  - Vermelho: `deno test --allow-all supabase/functions/reply-proposal-runner/custo.test.ts` → "a geração grava o modelo e os tokens que ele informou" falhou (lista de custos vazia); pgTAP `custo_das_propostas_de_resposta.sql` 2/10 (`function public.record_reply_proposal_cost(...) does not exist`; o relatório sem a linha); `signal-runner/handler-custo.test.ts` "quando a leitura do custo no Apify falha…" falhou (nada gravado). Verde: os mesmos testes passam.
  - Suíte completa: `deno test --allow-all supabase/functions` 724/724; pgTAP do zero (todas as migrations, `scripts/pgtap-local.sh` num Postgres 16 local) 58 arquivos, 2546/2546 asserções (o novo `custo_das_propostas_de_resposta.sql` 10/10); `deno check` das funções tocadas limpo; vitest do frontend (sem mudança no frontend) `npx vitest run --maxWorkers=2` 107 arquivos, 1074/1074; `tsc -b` do frontend limpo.
  - Segunda migration no mesmo ticket: a `20260930120000` já foi aplicada, então a mudança entra em arquivo novo (`docs/agents/migrations.md`). `get_cost_report` só foi redefinida depois de `git log --all -S get_cost_report` (nenhuma branch `ralph/frente-*` mexeu nela).
  - Sem tela nova: este ticket não mexe no frontend, então não há conferência visual nem prints.
  - Fica anotado, sem mudança aqui (decisão do Nan ou de outro ticket):
    - A chamada cuja reserva venceu (5 minutos) ou foi refeita no meio do caminho ("gerar de novo" com a proposta desatualizada) não grava o custo, só o log `cost_failed`, porque a RPC exige a reserva viva, como a rodada de crédito.
    - Com a chave de IA do cliente, o custo é gravado igual ao do modelo da Althius (fornecedor `anthropic`), sem dizer quem pagou; a Execução de Agente já era assim. Separar isso cabe no ticket 08 ou numa coluna nova, se o Nan quiser o custo só da Althius.
    - Os tokens de cache (`cache_read_input_tokens`, `cache_creation_input_tokens`) não entram; hoje a geração não usa cache.
