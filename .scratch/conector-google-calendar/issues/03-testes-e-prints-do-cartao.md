# 03: Testes do app e prints do cartão do Google Calendar

**What to build:** `conexoes-google-calendar.test.tsx` nos estados de sempre: "Precisa configurar" sem o cliente OAuth, conectado com o e-mail, ferramentas, reconectar, voltas e desconectar. Prints em `prints/`.

**Blocked by:** 02.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).** `src/paginas/conexoes-google-calendar.test.tsx`, 11 casos: Admin e Membro, só OAuth, a conta, ferramentas (no teste, só `create_event` vem marcada como escrita), reconectar, voltas e desconectar com e sem aviso. Prints: [não conectado](prints/03-nao-conectado.jpg), [conectado](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg) e [precisa reconectar](prints/03-precisa-reconectar.jpg). No dublê dos prints, todas as ferramentas aparecem como escrita, porque ele não distingue.

**Limitação conhecida (revisão de 19/10):** sem o escopo `calendar.events`, o `create_event` continua listado pelo servidor, mas falha com 403 se for aprovado. O mesmo vale para as ferramentas de escrita do Calendly sob `mcp:scheduling:read`. O cartão ainda não avisa isso; resolve-se com a decisão 6 do índice (pedir a escrita) ou com um aviso nas ferramentas.
