# 29: Search Console, Analytics e Semrush (fase 2)

**What to build:** as Integrações de SEO e GEO entram no catálogo como "Em breve", para a fase 2 (`fase-2-revenue`).

**Blocked by:** None.

**Status:** needs-triage

## Pode mexer

- A entrada no catálogo como "Em breve".

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Aparecem como Em breve, sem Acesso.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
