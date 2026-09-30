# 03: Contexto do Playbook nos Agentes

**What to build:** cada Agente recebe, na chamada, a seção Empresa e as seções do Playbook da Especialidade dele, via `playbook_for_specialty`; sem Playbook, o Agente diz o que falta e pergunta.

**Blocked by:** 02: Cada Agente com a própria vez; `playbook-do-workspace` 01.

**Status:** ready-for-agent

## Pode mexer

- `_shared/orquestracao.ts` e as fontes de dados do worker e da ponte (`claim` + leitura do Playbook).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] O Scopus responde sobre o ICP com o que está no Playbook, citando a seção.
- [x] Sem seção Empresa, o Agente pergunta o que a empresa vende antes de propor ICP.
- [x] O contexto não inclui dado pessoal de Contatos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker, como no ticket 01.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
