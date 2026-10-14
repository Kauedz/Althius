# 07: Tela de Descobertas e ligações de Mercado e Sinais encontrados

**What to build:** motivo mais recente com +N, detalhe com todos os Sinais, filtro de Origem, "Voltou por novo Sinal", aceite sem site com CNPJ e disparo do Comitê, "Ver candidata" e "Ver Conta".

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 02, 03, 04, 05.

**Status:** ready-for-human

## Critérios
- [x] Coluna "Motivos / Sinais" com o Sinal mais recente em linguagem de usuário e "+N"; o detalhe lista todos com data e fonte.
- [x] Filtro "Origem" (Sinal, Busca, Sincronização); Sincronização só quando existir dado dessa origem.
- [x] "Voltou por novo Sinal" com o motivo do descarte anterior.
- [x] Aceite sem site quando há CNPJ; depois do aceite, o Comitê dispara quando `committee` é `liberado`; senão a Conta fica com "Enriquecer Comitê".
- [x] Em Mercado e em Sinais encontrados, o Sinal com empresa ganha "Ver candidata" ou "Ver Conta".
- [x] A Demonstração segue simulada e sem nada disso no Workspace operacional.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
