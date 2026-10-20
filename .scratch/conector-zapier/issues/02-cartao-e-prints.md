# 02: cartao e prints

**What to build:** `conexoes-zapier.test.tsx` com os dois caminhos nos estados de sempre e o aviso de que cada chamada gasta 2 tasks do Zapier. Prints.

**Blocked by:** 01

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- `AVISO_DAS_FERRAMENTAS` ("Cada chamada que dá certo gasta 2 tasks do seu plano no Zapier.") e `AVISO_DA_CHAVE` ("Use o token de conexão criado em mcp.zapier.com com a sua própria conta do Zapier.").
- `src/paginas/conexoes-zapier.test.tsx`, 10 casos. Com os avisos tirados de propósito, 3 falharam.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [diálogo do token](prints/02-dialogo-chave.jpg), [conectado](prints/02-conectado.jpg) e [ferramentas com o aviso](prints/02-ferramentas.jpg).
