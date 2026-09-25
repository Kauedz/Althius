# 02: Workspace pessoal criado no primeiro acesso

**What to build:** toda Conta de usuário com e-mail verificado que entra na Althius passa a ter seu Workspace pessoal, com o nome da pessoa, ela como Titular e Administrador. Ao entrar, cai nele. A mensagem "Nenhum Workspace ativo" deixa de fazer parte do caminho normal. Verificável com o login por link já existente.

Spec: [Cadastro e login com Google, senha ou código](../spec.md). Regras do Workspace pessoal: [ADR-0011](../../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Nasce a tabela de Workspaces, com tipo (pessoal ou da empresa) e referência ao Titular do Workspace pessoal, integrada às Participações existentes e com RLS: ninguém enxerga o Workspace pessoal de outra Conta de usuário sem Participação.
- [ ] Uma RPC de bootstrap cria, na mesma transação, o Workspace pessoal (nome inicial da pessoa, nunca deduzido do e-mail) e a Participação de Administrador. Chamá-la de novo não cria nada.
- [ ] O bootstrap recusa Conta de usuário sem e-mail verificado.
- [ ] O bootstrap grava versão e data do aceite dos Termos de Uso e da Política de Privacidade.
- [ ] O Titular não pode ser removido nem rebaixado no próprio Workspace pessoal.
- [ ] O app chama o bootstrap após a sessão, com estados de carregamento, falha e nova tentativa, e abre o Workspace pessoal quando não há outro destino.
- [ ] Testes pgTAP cobrem criação única, repetição sem duplicar, recusa sem verificação, aceite dos Termos, proteção do Titular e isolamento; teste de raiz cobre a entrada no Workspace pessoal.
