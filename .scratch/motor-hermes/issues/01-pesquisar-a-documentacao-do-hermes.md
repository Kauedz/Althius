# 01: Pesquisar a documentação oficial do Hermes Agent

**What to build:** confirmar ou corrigir, na documentação e no código oficiais do Hermes Agent (Nous Research), cada
item da seção "Recomendações a conferir" da spec, com link para a fonte, num arquivo `pesquisa-hermes.md` nesta pasta.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] API HTTP: endpoints, autenticação por perfil, `runs` com status, eventos, cancelamento e idempotência.
- [ ] Perfis e gateway multiplexado: o que é separado por perfil (memória, `state.db`, skills, credenciais) e o que não é.
- [ ] Memória e skills: limites, como o Hermes as cria, e se dá para desligar a memória nativa.
- [ ] Ferramentas: como limitar por perfil, e como plugar ferramentas que são APIs externas (MCP ou HTTP).
- [ ] Limites de concorrência, estado global no multiplexador e a discussão aberta sobre isolamento multi-tenant.
- [ ] Provedores de modelo aceitos (Groq, Anthropic, outros) e como configurar por perfil.
- [ ] Requisitos para rodar numa VPS (memória, CPU, Docker) e o custo estimado, marcado como estimativa.
