# 05: Excluir Agente criado

**What to build:** o usuário pode excluir um Agente criado que não usa mais, e ele sai da grade (e das sugestões do autocompletar de @). O Agente padrão de cada Especialidade não oferece exclusão (ADR 0005). Nenhum Agente pode ser renomeado, e não existe opção de criar Especialidade. A exclusão vale até recarregar a página.

**Blocked by:** 03 (Grade de Agentes e nova casca)

**Status:** closed

- [x] Um Agente criado oferece a exclusão, com confirmação, e some da grade depois de excluído
- [x] Depois de excluir, o usuário volta para a página de Agentes se estava na página do Agente excluído
- [x] O Agente padrão não oferece exclusão
- [x] Não existe opção de renomear nenhum Agente, nem de criar Especialidade

## Comments

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
