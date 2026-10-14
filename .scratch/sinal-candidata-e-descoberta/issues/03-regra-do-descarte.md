# 03: Descarte por 90 dias e reabertura por Sinal novo

**What to build:** a descartada fica escondida; um Sinal novo mais de 90 dias depois reabre a candidata com `reopened_by_signal_at`; dentro dos 90 dias só registra.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 02.

**Status:** ready-for-agent

## Critérios
- [ ] A busca por ICP nunca traz de volta uma descartada.
- [ ] Sinal novo e válido, depois do descarte e mais de 90 dias depois de `decided_at`: a candidata volta a `nova`, com `reopened_by_signal_at` e o motivo anterior guardado.
- [ ] Dentro dos 90 dias o Sinal é registrado e a candidata segue descartada.
- [ ] `restore_discovered_account` continua restaurando a qualquer momento; o motivo do descarte fica guardado.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
