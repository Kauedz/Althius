# 22: Criar Workspace da empresa

**What to build:** a partir do Workspace pessoal, a pessoa escolhe explicitamente criar um Workspace da empresa, torna-se sua Administradora e passa a operar nele, com dados e plano separados do pessoal. Regras na [spec de autenticação](../../autenticacao-google-email/spec.md) e na [ADR-0011](../../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md).

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md) (substitui o CRM-02).

**Status:** ready-for-agent

- [ ] Existe uma ação explícita "Criar Workspace da empresa", com o nome da empresa informado. O nome pode vir sugerido da empresa do Day0, sem ser aplicado sozinho.
- [ ] Cadastro, login, Day0 e troca de Workspace nunca criam um Workspace da empresa sem essa ação.
- [ ] A criação do Workspace da empresa e da Participação de Administrador é atômica e idempotente: repetir o pedido ou clicar duas vezes não gera dois Workspaces.
- [ ] O novo Workspace aparece no seletor e abre em seguida. O Workspace pessoal continua disponível.
- [ ] Nada do Workspace pessoal é copiado ou movido: Contas-alvo, Contatos, Sequências, Memória do Workspace, Contas remetentes e plano permanecem onde estavam.
- [ ] O nome do Workspace pessoal não muda.
