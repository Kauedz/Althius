# 26: Nomes no lugar de UUIDs no modo operacional

**What to build:** no Workspace operacional, mostrar o nome do Workspace e da Conta-alvo onde hoje aparece o UUID ou um rótulo genérico.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] O seletor "Selecione o Workspace" lista os Workspaces pelo nome, e não pelo UUID (hoje mostra `ca40c1d2-…` e `05bb7bb8-…`).
- [ ] A barra lateral mostra o nome do Workspace escolhido, e não o rótulo genérico "Workspace".
- [ ] O "Resumo da Conta-alvo" que outro participante vê mostra o nome da Conta-alvo, e não o UUID. A Participação ativa já pode ler `target_accounts`.
- [ ] O detalhe de uma Sequência recém-criada mostra o nome da Conta-alvo desde a primeira renderização. Hoje o título e a trilha mostram o UUID até recarregar.

## Comments

- 2026-09-26: encontrado na conferência do canais-02, com as sessões reais na pré-produção. Prints: [Sequência recém-criada](../../canais-cadencia-backend/issues/prints/02-menu-de-canais.jpg) e [visão do Outro Membro](../../canais-cadencia-backend/issues/prints/02-outro-membro.jpg).
