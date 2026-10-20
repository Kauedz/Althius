# Spec: Webhooks da Althius

**Status:** needs-info (é um recurso da Althius, não um conector; precisa de ADR)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-comunicacao-e-automacao.md#webhooks). Parte do ticket `conexoes-funcionais/28`.

## Problem Statement

Nenhum fornecedor oferece "Webhooks" como servidor MCP. O que o catálogo promete é um recurso da própria Althius:
- **eventos de saída assinados** (ex.: Conta quente, Resposta recebida, Reunião marcada), enviados a uma URL do Cliente;
- talvez uma **URL de entrada** para receber dados.

Não confundir com o "Webhook Endpoint" protegido da Unipile.

## Escolha desta spec

O cartão continua **"Em breve"**. Um ADR define primeiro:
- quais eventos saem e o formato;
- a assinatura (HMAC por Workspace, segredo no Vault);
- as novas tentativas e o registro de entregas;
- quem cadastra (só Administrador);
- a LGPD: o que de dado pessoal pode sair, e com que consentimento.

Só depois vem a spec de construção.

## Tickets

01 (agente, decisão): ADR dos webhooks de saída. Não implementar antes da aprovação.
