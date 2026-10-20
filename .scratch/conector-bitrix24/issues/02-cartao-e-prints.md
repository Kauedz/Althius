# 02: cartao e prints

**What to build:** `conexoes-bitrix24.test.tsx` nos estados de sempre, mais o "portal diferente". Prints.

**Blocked by:** 01

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**20/10/2026 (agente).**
- `src/paginas/conexoes-bitrix24.test.tsx`, 13 casos: os de sempre (Admin e Membro, só OAuth, ferramentas com a escrita marcada, reconectar, voltas, desconectar) mais as voltas `portal_diferente` e `portal_nao_identificado`, com a mensagem e o cartão sem fingir conexão.
- Passaram de primeira, porque o cartão genérico já atende. Com a mensagem de `portal_nao_identificado` tirada de propósito, o caso dela falhou.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [conectado](prints/02-conectado.jpg), [ferramentas](prints/02-ferramentas.jpg), [outro portal](prints/02-volta-portal-diferente.jpg) e [portal não identificado](prints/02-volta-portal-nao-identificado.jpg).
