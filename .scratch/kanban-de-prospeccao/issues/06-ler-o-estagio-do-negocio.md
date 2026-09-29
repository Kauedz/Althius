# 06: Ler o estágio do negócio no CRM

**What to build:** para as Contas em No CRM, a Althius lê de volta o estágio do negócio no CRM e mostra no cartão, sem escrever.

**Blocked by:** 05: Enviar ao CRM.

**Status:** needs-info (depende do HubSpot)

## Pode mexer

- A sincronização de leitura do HubSpot (`conexoes-funcionais` 04-06).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Só leitura; nada é escrito no CRM.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a função de sincronização do HubSpot alterada (`npx supabase functions deploy <nome> --project-ref ycbdilsmydvzezhlymty`).
3. Conferir com um negócio de teste no HubSpot que o estágio aparece no cartão.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
