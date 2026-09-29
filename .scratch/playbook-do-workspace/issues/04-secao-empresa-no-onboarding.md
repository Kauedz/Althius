# 04: Seção Empresa preenchida no onboarding

**What to build:** os passos "Produto" e "Personas" do onboarding do Workspace operacional gravam as seções Empresa e Personas do Playbook, em vez de ficar só no estado do onboarding.

**Blocked by:** 01: Seções do Playbook no banco; CRM-24 (onboarding no Workspace operacional), que está em triagem.

**Status:** needs-info (depende do CRM-24)

## Pode mexer

- A Fonte de onboarding real, quando o CRM-24 existir, chamando `save_playbook_section`.

## Não mexa

- Na Fonte de onboarding simulada da Demonstração.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] O que o Administrador escreve no onboarding aparece na seção Empresa do Playbook.
- [ ] Membro não grava a seção Empresa pelo onboarding.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
