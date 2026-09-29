# 05: LGPD do dado coletado

**What to build:** cada dado coletado guarda a origem e a data; o Contato pode ser apagado com todos os canais (CRM-18); o aviso de privacidade explica a coleta de dados profissionais públicos.

**Blocked by:** 03: Revelar e-mail e telefone.

**Status:** needs-info (texto a validar por profissional de privacidade)

## Pode mexer

- O texto do aviso e o registro de origem.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Apagar o Contato remove os valores coletados.
- [ ] Texto revisado por profissional de privacidade antes de produção.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Levar o texto do aviso a um profissional de privacidade e aprovar.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
