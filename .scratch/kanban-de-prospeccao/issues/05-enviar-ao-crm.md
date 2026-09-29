# 05: Enviar ao CRM

**What to build:** "Enviar ao CRM" leva a empresa, os Contatos e uma nota com os Sinais e a abordagem para o CRM conectado (HubSpot primeiro), sob a Permissão do Agente ou do usuário (Propor pede Aprovação); o cartão vai para No CRM.

**Blocked by:** 01: Estágio de prospecção; `conexoes-funcionais` 03 (Acesso ao HubSpot); CRM-15 (Aprovações).

**Status:** needs-info (depende do HubSpot e das Aprovações)

## Pode mexer

- A escrita no CRM pela Integração (primeira escrita no HubSpot: rever o ADR-0016, que hoje só lê).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Com Propor, nada sai sem Aprovação.
- [ ] Depois do envio, a Althius não escreve de novo sem pedido.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Autorizar o escopo de escrita do HubSpot na conta de teste.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
