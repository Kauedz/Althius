# 02: testes e prints do cartao

**What to build:** `conexoes-google-sheets.test.tsx` nos estados de sempre, mais o texto "os Agentes precisam da URL da planilha". Prints em `prints/`.

**Blocked by:** 01

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- `AVISO_DAS_FERRAMENTAS` em `conexoes.tsx`: o diálogo das ferramentas do Sheets diz "O servidor do Google Sheets não lista planilhas: peça aos Agentes com a URL da planilha." ([print](prints/02-ferramentas.jpg)).
- `src/paginas/conexoes-google-sheets.test.tsx`, 12 casos. O do aviso falhou antes.
- **Teste intermitente:** o caso da volta "ok" falhou uma vez (checava a URL limpa antes do efeito). Nos testes novos desta frente (Clay, Calendly, TikTok, Meta e Google) a checagem passou a usar `waitFor`. Os testes antigos (Notion, Acessos) têm o mesmo padrão e não foram mexidos.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [conectado](prints/02-conectado.jpg), [ferramentas com o aviso](prints/02-ferramentas.jpg) e [precisa reconectar](prints/02-precisa-reconectar.jpg).
