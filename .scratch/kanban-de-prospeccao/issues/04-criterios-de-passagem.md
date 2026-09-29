# 04: Critérios de passagem do Playbook no cartão

**What to build:** os critérios da seção SLA e metas do Playbook (ex.: 3 perfis mapeados e telefone válido para entrar em cadência) aparecem no cartão como pendências; mover sem cumprir avisa, não bloqueia, e o Agente oferece completar.

**Blocked by:** 03: Tela do kanban; `playbook-do-workspace` 01.

**Status:** ready-for-agent

## Pode mexer

- A leitura dos critérios e o aviso no cartão.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Mover sem critério mostra o aviso e deixa seguir.
- [ ] A oferta de completar chama o Ethos (quando existir).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
