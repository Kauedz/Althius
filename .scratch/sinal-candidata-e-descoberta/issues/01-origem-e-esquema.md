# 01: Origem, motivos e esquema do Sinal da empresa

**What to build:** coluna `origin`, `reopened_by_signal_at`, tabela `private.discovery_reasons`, `signals.target_account_id` opcional com `discovered_account_id` (exatamente um dos dois), Conta sem site.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Critérios
- [x] `private.discovered_accounts.origin` (`busca`, `sinal`, `sincronizacao`, padrão `busca`), `reopened_by_signal_at`, `reopened_discard_reason`, `reopened_decided_at`.
- [x] `private.signals`: `target_account_id` opcional, `discovered_account_id` com FK, `market_signal_id`, check de exatamente um dos dois e unicidade do Sinal da candidata.
- [x] `private.discovery_reasons(discovered_account_id, signal_id, weight)` com RLS ligado e sem acesso direto.
- [x] `target_accounts.canonical_url` aceita nulo, com índice único por CNPJ para a Conta sem site.
- [x] Os leitores de `private.signals` que assumiam Conta (`list_signals`, `list_account_signals`, `expire_signals` e os demais) seguem certos com linhas de candidata.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
