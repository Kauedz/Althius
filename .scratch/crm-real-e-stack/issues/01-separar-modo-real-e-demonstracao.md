# 01: Separar modo real e Demonstração

**What to build:** ao entrar no Althius, o usuário consegue identificar se está usando um Workspace operacional ou a Demonstração. Um Workspace real nunca recebe dados, resultados ou ações roteirizadas.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O modo Demonstração mantém selo, fonte e estado isolados dos Workspaces reais.
- [ ] Uma sessão autenticada real não injeta Contas, Contatos, Sinais, Conversas ou Aprovações de demonstração.
- [ ] Ações cujo domínio ainda não foi conectado exibem estado indisponível claro e não simulam sucesso.
- [ ] Os adapters são selecionados pela sessão e Workspace no ponto de composição da aplicação; telas existentes continuam consumindo seus contratos.
- [ ] Mudança entre ambientes não compartilha cache, subscriptions, uploads ou estado local de Workspace.

