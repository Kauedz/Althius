# Spec: Conector Make

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-comunicacao-e-automacao.md#make). Parte do ticket `conexoes-funcionais/28`.

## Problem Statement

O Make tem servidor hospedado em `https://mcp.make.com`, com registro dinâmico que funciona e endpoint de revogação. Atenção: o `/mcp` aponta para outro servidor de autorização, que parece ser só do ChatGPT. Cada cenário sob demanda vira uma ferramenta, e as ferramentas de gestão pedem plano pago. Os nomes dos escopos e o custo por chamada não estão confirmados.

## Solution

O perfil usa o mecanismo genérico com `url: 'https://mcp.make.com'`, registro dinâmico e `ferramentasGastam: true` (rodar um cenário consome operações do Make do Cliente). O catálogo ganha o Make (Automação). Desconectar revoga.

## Tickets

01 perfil, catálogo (migration com pgTAP) e testes Deno · 02 cartão e prints · 03 (humano) conta Make de teste.
