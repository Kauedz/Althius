# Spec: Conector Microsoft Teams (Microsoft 365)

**Status:** needs-info (decisão de produto: nome e escopo do conector)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-comunicacao-e-automacao.md#microsoft-teams). Substitui o ticket `conexoes-funcionais/23`.

## Problem Statement

- O servidor por tenant (`mcp_TeamsServer`) da pesquisa anterior está marcado pela Microsoft como **legado, não para produção**.
- **O caminho novo é o Work IQ MCP** (GA), com uma URL só para todos os tenants: `https://workiq.svc.cloud.microsoft/mcp`. A entrada é pelo Entra `organizations`, com **um app multitenant da Althius**.
- Escopo delegado `WorkIQAgent.Ask`, que exige **consentimento do admin**. Sem registro dinâmico e sem endpoint de revogação.
- **Custo no tenant do Cliente** (Copilot Credits). Cada tenant precisa de Global Admin, plano de cobrança do Azure e de um setup único da service principal.
- As ferramentas são genéricas (`fetch`, `do_action`…) e cobrem **o Microsoft 365 inteiro**: a regra por ferramenta (ADR-0022) não separa Teams de e-mail.

## Escolha desta spec

O cartão vira **"Microsoft 365 (Work IQ)"**, e não "Teams", para não prometer algo restrito ao Teams. Toda ferramenta pede Aprovação (`ferramentasGastam`, porque gasta Copilot Credits). Até a decisão, continua "Em breve".

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Nome do cartão | "Microsoft 365 (Work IQ)" | Manter "Microsoft Teams" em "Em breve" |
| Gasto | Toda ferramenta pede Aprovação | — |

## Tickets (depois da decisão)

01 perfil Work IQ (pré-registrado, `organizations`, `WorkIQAgent.Ask`, sem revogação) com testes Deno · 02 cartão e prints, com o aviso do consentimento do admin e do custo em Copilot Credits · 03 (humano) app multitenant no Entra e tenant de teste.
