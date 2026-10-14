# 04: Aceite que migra Sinais, funciona sem site e libera o Comitê

**What to build:** `accept_discovered_account` atômico: site opcional com CNPJ, Conta `recomendacao`, Sinais migrados, Conta Quente, resposta `committee`.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 01, 02.

**Status:** ready-for-human

## Critérios
- [x] Aceite por CNPJ sem site cria a Conta sem site (ou liga a que já existe pelo CNPJ).
- [x] A Conta nasce ou é ligada com `origin = 'recomendacao'`; quem aceita vira o Vendedor responsável, como já era.
- [x] Os Sinais da candidata migram para a Conta e a Conta fica Quente; um Sinal que a Conta já tinha não duplica.
- [x] A resposta traz `committee` (`liberado`, `sem_saldo`, `limite_do_mes`, `sem_contrato`) pelas mesmas regras do `reserve_credits`, sem reservar; a Equipe Althius é sempre `liberado`.
- [x] Aceitar não cobra crédito; sem site e sem CNPJ continua recusando.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
