# 03: Testes do app e prints do cartão do Google Calendar

**What to build:** `conexoes-google-calendar.test.tsx` nos estados de sempre: "Precisa configurar" sem o cliente OAuth, conectado com o e-mail, ferramentas, reconectar, voltas e desconectar. Prints em `prints/`.

**Blocked by:** 02.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).** `src/paginas/conexoes-google-calendar.test.tsx`, 11 casos: Admin e Membro, só OAuth, a conta, ferramentas (só `create_event` como escrita), reconectar, voltas e desconectar com e sem aviso. Prints: [não conectado](prints/03-nao-conectado.jpg), [conectado](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg) e [precisa reconectar](prints/03-precisa-reconectar.jpg). No dublê, todas as ferramentas aparecem como escrita.
