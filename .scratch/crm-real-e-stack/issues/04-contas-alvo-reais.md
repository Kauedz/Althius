# 04: Criar e consultar Contas-alvo reais

**What to build:** participantes operam Contas-alvo reais na experiência de Contas já existente, com cadastro manual, lista, busca, filtros, detalhe e contexto preservado ao voltar.

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md) (substitui o CRM-02).

**Status:** ready-for-agent

- [ ] Contas-alvo têm identidade UUID persistente e pertencem a um Workspace.
- [ ] Participante autorizado cria e consulta Contas; Administrador pode consultar todas as Contas do Workspace.
- [ ] URL canônica corresponde a Conta existente para atualização; domínio ou identificador legal isolados não mesclam registros.
- [ ] A tela existente lê dados reais e preserva busca, filtros, ordenação, navegação ao detalhe e estado ao voltar.
- [ ] Detalhe apresenta dados existentes, estados vazios, carregamento, erro, retry e Conta não encontrada sem preencher lacunas com fixtures.
- [ ] Responsabilidade inicial manual é o criador; o backend impede edição de Conta fora da responsabilidade do Membro.
- [ ] Um responsável pode registrar uma Interação comercial manual na Conta e ver o evento no histórico correspondente.

