# 03: Tela do kanban em Contas

**What to build:** uma vista "Kanban" em Contas mostra as colunas fixas; cada cartão traz a empresa, o foguinho, a Aderência, as pessoas por Persona e o último Sinal; arrastar move à mão (quem pode).

**Blocked by:** 01: Estágio de prospecção no banco.

**Status:** ready-for-agent

## Pode mexer

- A Fonte de Contas (acrescentando o estágio) e a vista nova em `paginas/`.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Arrastar respeita a permissão; recusa aparece em português.
- [ ] A tabela de Contas continua como está.
- [ ] A Demonstração ganha um kanban de exemplo.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Conferência visual no navegador (a IA faz e anexa os prints).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
