# 02: conta e escopos

**What to build:** A conta pelo `users-get_current_user` (`porFerramentaMcp`) e o escopo padrão `mcp:scheduling:read`. Teste Deno no `integration-callback` e teste do `recurso` com barra final.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- **Conta:** vem de `users-get_current_user` (`porFerramentaMcp`), pelo e-mail ou, sem ele, pelo nome.
- **Escopo:** só `mcp:scheduling:read`. A escrita espera a decisão 6 do índice.
- **Testes:** `integration-callback/handler-calendly.test.ts` (2 casos). A troca é como cliente público, com o `resource` da descoberta (`https://mcp.calendly.com/`, com a barra), e a conta vem do e-mail ou do nome.
- **Teste antigo alterado:** `conectores.test.ts` passou a esperar só o escopo de leitura do Calendly.
- `deno test supabase/functions`: 1641 passaram; `deno check` limpo.
- **Não confirmado:** o formato real do resultado da ferramenta pelo MCP. O perfil tenta `resource.email`, `email`, `user.email`, `resource.name` e `name`.
