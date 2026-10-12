# Handoff: fix do aceite de convite LinkedIn (canais-07)

Branch: `kaue/fix-aceite-convite-linkedin`. Ticket: `.scratch/canais-cadencia-backend/issues/07-ciclo-real-linkedin.md` (critério 4, o aceite do convite). Só a área de canais.

## Diagnóstico

Em `ingest_unipile_chat_event` (migration `20261001150000`), `relation.new`/`new_relation` só gravava `outcome = 'relation'` e voltava, sem procurar o Envio do convite. Caso real: o evento `ab1f1f41` tem `provider_message_id` igual ao `provider_user_id` do Envio `86a34e62` (mesma Conta remetente). Na v1, o `new_relation` leva o `provider_id` do perfil, e `private.chat_message_fields` o lê como `message_id`; é por isso que o evento guardou o id do perfil nessa coluna.

## O que entrou

Uma migration nova: `supabase/migrations/20261012150845_aceite_de_convite_linkedin.sql`.

- **Junção** (`private.link_linkedin_acceptance`): mesma Conta remetente + `provider_user_id` do Envio = identificador do perfil do evento + `linkedin_action = 'convite'` + `status = 'sent'`. Achando, o evento ganha o `send_id` e nasce a Interação `convite-aceito` (fonte `sequencia`, Contato do Envio, `last_interaction_at` atualizado).
- **Sem pausar a Sequência.** O ramo da relação não toca em `public.sequences`, não grava conteúdo e continua devolvendo `outcome = 'relation'` (a v2 e os chamadores não mudam).
- **Idempotente.** Evento repetido já ligado volta `duplicate_event`. Um convite aceito conta uma Interação só: outro evento do mesmo convite (id diferente) recebe o `send_id` sem criar outra Interação (trava por Envio).
- **Reavaliação.** O evento `relation` com `send_id` nulo pode ser avaliado de novo (cláusula do `on conflict`), como já valia para `unrelated` e `before_send`: o aceite pode chegar antes de o resultado do convite estar gravado.
- **Tipo novo** `convite-aceito` em `account_interactions_kind_check`.
- **Backfill** (`private.relink_linkedin_relations()`, chamada uma vez no fim da migration): liga todo evento `relation` sem `send_id` que case, do mais antigo ao mais novo, com a Interação datada no primeiro aviso. Inclui o `ab1f1f41`. Devolve quantos eventos ligou; uma segunda chamada devolve 0. Um evento que falhe vira `warning` e não derruba a migration.
- `ingest_unipile_chat_event` foi redefinida (`create or replace`) a partir da definição mais recente da `main`: nenhuma migration posterior à `20261001150000` a tocava.

Deno: `unipile-account-status/handler.ts` passou a pôr o `send_id` no log quando o aceite foi ligado a um convite (para conferir em produção sem abrir o banco). Nada mais mudou em TS.

## Loop

Vermelho primeiro, depois verde:

- pgTAP `canais_whatsapp_linkedin.sql`: 18 asserções novas (plano 164 → 182), nenhuma existente alterada. Vermelho: `send_id` nulo, nenhuma Interação, `relink_linkedin_relations()` inexistente. Cobrem: aceite antes do resultado do convite, reavaliação depois dele, `duplicate_event`, perfil que não convidamos, Interação `convite-aceito` (Contato, fonte), uma só por convite, Sequência `ativa` e próximo passo agendado, backfill (2 eventos antigos ligados sem repetir a Interação; segunda passada 0). Os testes v2 (`relation.new`/`new_relation` com `user_id`) passam sem mudar asserção.
- deno `handler-v1.test.ts`: 1 teste novo (log com `send_id` só quando ligado). Vermelho primeiro (`send_id` ausente do log).

Resultados (local, Postgres 16 + pgTAP via `scripts/pgtap-local.sh`):

- pgTAP, todos os arquivos de `supabase/tests`: tudo `ok` (`canais_whatsapp_linkedin.sql: 182/182`).
- `deno test supabase/functions`: 1013 passed, 0 failed, 2 ignored; os 2 ignorados (`sem-base-fixa`) rodados à parte: 2 passed.
- `deno check supabase/functions/*/index.ts`: limpo. `deno lint` em `handler.ts`: limpo.
- Frontend (não tocado): `tsc -b` 0; `npm run lint` só avisos antigos.

## Pendente de deploy

- **Migration não aplicada no remoto** (`ycbdilsmydvzezhlymty`). Nada foi aplicado nem validado lá.
- **Function `unipile-account-status`** não foi publicada. Só o log novo depende dela; a ligação do aceite é toda do banco e funciona sem o deploy.

## Passos do Nan

1. Com o CI verde, antes do merge, validar e aplicar a migration como manda `docs/agents/migrations.md` (validar em transação com `rollback`, depois aplicar com `execute_sql` no bloco atômico). A migration já roda o backfill.
2. Conferir o backfill depois de aplicar:
   ```sql
   select e.event_id, e.send_id, e.interaction_id, i.kind
   from private.unipile_chat_events e
   left join public.account_interactions i on i.id = e.interaction_id
   where e.event_type in ('relation.new', 'new_relation') order by e.received_at desc limit 20;
   ```
   O `ab1f1f41` deve estar com `send_id` do envio `86a34e62` e a Interação `convite-aceito`.
3. Publicar `unipile-account-status` (`--no-verify-jwt`), se quiser o `send_id` no log.

## Avisos e decisões a confirmar

- **v2 não liga ainda.** O payload de `relation.new` da v2 é "não confirmado" (os testes usam `user_id`); a junção lê o que `chat_message_fields` já lê (`id`, `message_id`, `provider_id`), que é o que a v1 manda. Quando houver um aceite real da v2, basta incluir o campo certo no ramo da relação (e o evento antigo é religado pelo `relink_linkedin_relations()`, se o id estiver no `provider_message_id`).
- **Backfill só liga o que guardou o id.** O evento só tem o id do perfil na coluna `provider_message_id`; evento sem ele (ou de Envio já anonimizado) fica como está.
- **Fora da área de canais, não mexi:** (1) a tela (`detalhe-conta.tsx`, `TipoDeInteracao`) não conhece `convite-aceito` (nem `mensagem-recebida`, que já era assim) e mostra o rótulo vazio; (2) em `internal_signal_candidates`, `convite-aceito` não conta como conversa, então não encerra o silêncio do Monitoramento "sem resposta" (o certo para um aceite, que não é resposta). Se quiser um rótulo "Convite aceito" na tela, é um ticket de front.
