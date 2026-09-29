# 18: Conectar o Acesso ao Bitrix24

**What to build:** o Bitrix24 entra no catálogo real (categoria: CRM) e cada participante conecta o próprio Acesso pelo servidor MCP oficial do app (ADR-0017), quando houver um confirmado; sem servidor oficial, fica "Em breve" com o motivo.

**Blocked by:** 03: Conectar e desconectar o próprio Acesso ao HubSpot (o mecanismo); 01: pesquisa dos servidores MCP, estendida para este app.

**Status:** needs-triage

## Pode mexer

- A entrada no catálogo (`private.integration_catalog`, migration aditiva) e o Acesso no mecanismo do ticket 03.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Confirmar na documentação oficial se o app tem servidor MCP; registrar a fonte.
- [ ] Permissões Ler, Propor e Executar valem para o Agente; o que escreve ou gasta tem teto (`creditos-e-planos` 03).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Criar a conta de teste no app e autorizar o Acesso no navegador.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
