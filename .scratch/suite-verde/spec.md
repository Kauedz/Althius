# Suíte verde e cobertura do caminho do Cliente

Status: ready-for-agent

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical H. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).

## Problem Statement

A `main` está vermelha no Vitest: 1 falha em 1392 testes (`conversas-reais.test.tsx`, a Conversa coordenada não volta
depois de recarregar). Isso deixa o CI de todo PR vermelho e esconde regressão real. Os Sinais têm só ~2 arquivos de
teste no frontend, e o caminho do Cliente (abrir o app → entrar → Workspace operacional → Conversa) não tem um teste que
o percorra inteiro.

## Solution

- Achar se a falha é do teste ou da Fonte de Conversas e corrigir a causa, deixando a `main` verde.
- Testes de frontend dos Sinais no Workspace operacional.
- Um teste de integração do caminho do Cliente, na raiz do app, com Supabase falso.

## User Stories

1. Como agente de código, quero a `main` verde, para que um vermelho no meu PR seja culpa minha.
2. Como participante, quero que recarregar a Conversa coordenada mostre o que já foi respondido, sem reenviar o pedido (CONTEXT: Conversa "roda uma vez só").
3. Como Renan, quero que a regra do módulo Sinais esteja coberta por teste, para a A3 não quebrar a tela.
4. Como Renan, quero um teste que prove que o Cliente abre o app, entra e não cai na Demonstração nem no onboarding duas vezes.

## Implementation Decisions

- Testar só comportamento externo (o que a tela mostra e o que é enviado), pelo seam mais alto: a raiz do app e as páginas, com o cliente Supabase falso já usado em `conversas-reais.test.tsx`.
- Sem Playwright no CI nesta fatia; prints ficam no ticket.

## Testing Decisions

- Prior art: `conversas-reais.test.tsx`, `agentes-reais.test.tsx`, `conexoes-reais.test.tsx`, `raiz.test.tsx`.

## Out of Scope

- pgTAP e Deno (já verdes no CI: Deno 1635/0; pgTAP no job "Banco").
- Cobertura de produção dos Sinais externos (depende da A3).
