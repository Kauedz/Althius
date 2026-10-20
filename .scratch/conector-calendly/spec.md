# Spec: Conector Calendly funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Segue a spec geral de Conexões e o modelo do [Clay](../conector-clay/spec.md). Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-agenda-e-planilhas.md). Substitui o ticket `conexoes-funcionais/21`.

## Problem Statement

O perfil existe (`https://mcp.calendly.com`, registro dinâmico, escopos `mcp:scheduling:read` e `:write`), e os metadados ao vivo confirmam o registro dinâmico, o cliente público e o PKCE S256. Faltam três coisas:

- **Revogação.** O metadado não anuncia revogação, embora `calendly.com/oauth/revoke` exista. Desconectar não revoga.
- **Conta.** O cartão não sabe qual conta conectou. A ferramenta `users-get_current_user` resolve.
- **Escopos e plano.** O `resource` do metadado tem barra final (`https://mcp.calendly.com/`), diferente da URL do perfil. Marcar reunião (`meetings-create_invitee`) pede plano pago, e os formulários de roteamento pedem o plano Teams.

## Solution

1. O perfil OAuth ganha `revogacao?: string`, um endereço explícito usado quando o metadado não anuncia. O Calendly declara `https://calendly.com/oauth/revoke`, e a regra de origem do Clay continua: precisa ser a mesma do `token_endpoint`.
2. A conta vem de `porFerramentaMcp: { ferramenta: 'users-get_current_user', conta: [...] }`.
3. O escopo padrão é só `mcp:scheduling:read`. A escrita entra pela decisão abaixo, e `writes = true` mantém tudo o que escreve sob Aprovação.
4. O `recurso` enviado é o que a descoberta devolve (com a barra), como já acontece. Um teste trava esse comportamento.

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Escopo | Só `mcp:scheduling:read` | Também `:write`, para os Agentes marcarem reunião |

## Tickets

- 01: revogação declarada no perfil (mecanismo genérico).
- 02: a conta por `users-get_current_user` e os escopos.
- 03: os testes do cartão e os prints.
- 04: humano, conta Calendly de teste (paga, se for testar a escrita) e validação.
