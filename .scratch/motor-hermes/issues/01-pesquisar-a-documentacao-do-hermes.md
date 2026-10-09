# 01: Pesquisar a documentação oficial do Hermes Agent

**What to build:** confirmar ou corrigir, na documentação e no código oficiais do Hermes Agent (Nous Research), cada
item da seção "Recomendações a conferir" da spec, com link para a fonte, num arquivo `pesquisa-hermes.md` nesta pasta.

**Blocked by:** None (can start immediately).

**Status:** closed (pesquisa entregue em pesquisa-hermes.md; ACs verificados em 2026-10-09)

- [x] API HTTP: endpoints, autenticação por perfil, `runs` com status, eventos, cancelamento e idempotência. — Seção 1 de `pesquisa-hermes.md`: confirmados endpoints, Bearer por perfil, `runs` com status e SSE, stop, `Idempotency-Key` (24 h, 409 em conflito); divergência de 5 min na seção de CORS anotada.
- [x] Perfis e gateway multiplexado: o que é separado por perfil (memória, `state.db`, skills, credenciais) e o que não é. — Seção 2: perfil separa config, `.env`, memória, sessões, skills e `state.db`, mas não é sandbox; OAuth, código, HOME e dashboard são compartilhados; `/p/<perfil>/` com chave por perfil confirmado.
- [x] Memória e skills: limites, como o Hermes as cria, e se dá para desligar a memória nativa. — Seção 3: limites 2.200/1.375 (configuráveis), `skill_manage` e revisão em segundo plano, desligar com `memory_enabled` e `user_profile_enabled` falsos; `write_approval` é novo.
- [x] Ferramentas: como limitar por perfil, e como plugar ferramentas que são APIs externas (MCP ou HTTP). — Seção 4: o conjunto padrão da API inclui terminal; limitar por `agent.disabled_toolsets`; MCP por HTTP com `headers`, `tools.include/exclude` e `identity_header`. A chave `platform_toolsets.api_server` é inferência (marcada).
- [x] Limites de concorrência, estado global no multiplexador e a discussão aberta sobre isolamento multi-tenant. — Seção 5: padrão 10 runs e 429 confirmados; escopo do limite, estado global do multiplexador e garantia multi-tenant **não confirmados** (marcados, teste no ticket 02).
- [x] Provedores de modelo aceitos (Groq, Anthropic, outros) e como configurar por perfil. — Seção 6: Anthropic nativa (chave de API, não OAuth); Groq só como endpoint compatível com OpenAI; configuração por perfil e por requisição.
- [x] Requisitos para rodar numa VPS (memória, CPU, Docker) e o custo estimado, marcado como estimativa. — Seção 7: mínimo de 1 GB, 1 núcleo e 500 MB; recomendado 2 a 4 GB; custo marcado como estimativa; consumo do Supabase auto-hospedado não pesquisado.
