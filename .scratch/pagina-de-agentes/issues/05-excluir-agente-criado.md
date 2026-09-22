# 05: Excluir Agente criado

**What to build:** o usuário pode excluir um Agente criado que não usa mais, e ele sai da grade (e das sugestões do autocompletar de @). O Agente padrão de cada Especialidade não oferece exclusão (ADR 0005). Nenhum Agente pode ser renomeado, e não existe opção de criar Especialidade. A exclusão vale até recarregar a página.

**Blocked by:** 03 (Grade de Agentes e nova casca)

**Status:** ready-for-agent

- [ ] Um Agente criado oferece a exclusão, com confirmação, e some da grade depois de excluído
- [ ] Depois de excluir, o usuário volta para a página de Agentes se estava na página do Agente excluído
- [ ] O Agente padrão não oferece exclusão
- [ ] Não existe opção de renomear nenhum Agente, nem de criar Especialidade
