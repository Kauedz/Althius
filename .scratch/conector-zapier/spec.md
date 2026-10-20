# Spec: Conector Zapier

**Status:** ready-for-agent (a validação real decide o caminho)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-comunicacao-e-automacao.md#zapier). Parte do ticket `conexoes-funcionais/28` (separado em Zapier, Make e Webhooks).

## Problem Statement

- O servidor hospedado é `https://mcp.zapier.com/api/v1/connect`, com endpoints de registro, revogação e userinfo.
- A documentação reserva o OAuth aos clientes listados e manda os outros usarem um **token de conexão**. Não se sabe se o Zapier aceita a URL de retorno da Althius.
- Cada chamada bem-sucedida custa **2 tasks** do plano Zapier do próprio usuário.

## Solution

1. Perfil com os dois caminhos:
   - OAuth por registro dinâmico (o mecanismo genérico);
   - token de conexão como "chave" (ADR-0021), mandado como `Authorization: Bearer` ao servidor MCP.
   O teste real decide qual fica em `kinds`.
2. `ferramentasGastam: true`, porque cada chamada gasta tasks. As ferramentas são as ações que o usuário configurou no Zapier.
3. A identificação da conta pelo userinfo anunciado.

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Caminho | Os dois; o real decide | Programa de parceiro (Embed ou White Label) |

## Tickets

01 perfil e catálogo (migration com `kinds`) e testes Deno · 02 cartão e prints · 03 (humano) conta Zapier de teste: tentar o OAuth e o token de conexão.
