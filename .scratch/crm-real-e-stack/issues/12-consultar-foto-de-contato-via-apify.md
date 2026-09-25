# 12: Consultar foto pública do Contato via Apify

**What to build:** um Contato com URL de perfil LinkedIn pode consultar sua imagem pública via Actor Apify selecionado e exibi-la na experiência atual; indisponibilidade mantém o fallback visual existente.

**Blocked by:** 05: Manter Contatos e Vínculos do Contato.

**Status:** ready-for-agent

- [ ] A consulta parte da URL LinkedIn armazenada no Contato e ocorre pelo backend, sem token Apify no browser.
- [ ] Actor é escolhido com entrada/saída compatível; dados de perfil e foto são tratados como opcionais.
- [ ] Consulta é acionada sob demanda ou por job limitado, não a cada render da tabela.
- [ ] Origem, Actor, estado e data de observação são registrados; custo, concorrência e retry têm limites.
- [ ] Ausência, erro ou URL expirada exibe as iniciais/avatar padrão atuais sem quebrar o Contato.
- [ ] Nenhum conteúdo de perfil substitui correção manual sem confirmação; retenção/cache respeita condições do Actor habilitado.

