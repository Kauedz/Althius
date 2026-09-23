# 02: FonteDeSequencias e item Sequências na casca

**What to build:** a costura `FonteDeSequencias` (simulada, no estilo de `FonteDeContas` / `FonteDeAgentes`) entra no App, e o Workspace ganha o item **Sequências** na sidebar. Com a fonte vazia, o usuário abre o módulo sem quebrar a casca existente. Operações mínimas da fonte: listar, obter por Conta-alvo (zero ou uma), obter por id, criar, atualizar documento, confirmar participantes, ler status/cobertura/métricas de demo e observar mudanças.

**Blocked by:** 01 (Mock do layout de Sequências)

**Status:** ready-for-agent

- [ ] O App recebe `FonteDeSequencias` como dependência e a injeta no contexto
- [ ] A sidebar Workspace mostra o item Sequências, ativo nas rotas do módulo
- [ ] Abrir Sequências com lista vazia não quebra Contas, Contatos nem Agentes
- [ ] A fonte expõe listar / obter / criar / atualizar / observar de forma testável na sessão
- [ ] Testes cobrem item na sidebar e fonte vazia sem regressão nas outras áreas
