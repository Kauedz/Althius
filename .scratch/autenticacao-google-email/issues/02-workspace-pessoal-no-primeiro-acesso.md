# 02: Workspace pessoal criado no primeiro acesso

**What to build:** toda Conta de usuário com e-mail verificado que entra na Althius passa a ter seu Workspace pessoal, com o nome da pessoa, ela como Titular e Administrador. Ao entrar, cai nele. A mensagem "Nenhum Workspace ativo" deixa de fazer parte do caminho normal. Verificável com o login por link já existente.

Spec: [Cadastro e login com Google, senha ou código](../spec.md). Regras do Workspace pessoal: [ADR-0011](../../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md).

**Blocked by:** None (can start immediately).

**Status:** closed

- [x] Nasce a tabela de Workspaces, com tipo (pessoal ou da empresa) e referência ao Titular do Workspace pessoal, integrada às Participações existentes e com RLS: ninguém enxerga o Workspace pessoal de outra Conta de usuário sem Participação.
- [x] Uma RPC de bootstrap cria, na mesma transação, o Workspace pessoal (nome inicial da pessoa, nunca deduzido do e-mail) e a Participação de Administrador. Chamá-la de novo não cria nada.
- [x] O bootstrap recusa Conta de usuário sem e-mail verificado.
- [x] O bootstrap grava versão e data do aceite dos Termos de Uso e da Política de Privacidade.
- [x] O Titular não pode ser removido nem rebaixado no próprio Workspace pessoal.
- [x] O app chama o bootstrap após a sessão, com estados de carregamento, falha e nova tentativa, e abre o Workspace pessoal quando não há outro destino.
- [x] Testes pgTAP cobrem criação única, repetição sem duplicar, recusa sem verificação, aceite dos Termos, proteção do Titular e isolamento; teste de raiz cobre a entrada no Workspace pessoal.

## Comments

**2026-09-25:** implementado na migration `20260925140000_workspace_pessoal.sql`: tabela `workspaces` com `kind` (pessoal/empresa) e `owner_user_id` do Titular; as Participações existentes viram Workspaces da empresa antes da FK; tabela `terms_acceptances`; trigger que protege o Titular; RPC `bootstrap_personal_workspace(p_terms_version)`. Evidência: `supabase/tests/workspace_pessoal.sql` passa 19/19 no Postgres local (antes falhava porque a RPC não existia) e os testes de raiz em "Workspace pessoal no primeiro acesso" passam. **Pending-apply:** a migration ainda não foi aplicada no Supabase remoto. Até lá, o app real mostra a falha com "Tentar novamente". O nome inicial vem de `full_name` ou `name` nos metadados; sem nome, fica "Workspace pessoal". A versão dos Termos está em `src/auth/termos.ts`. A entrada abre o Workspace salvo na aba (`sessionStorage`) e, sem ele, o pessoal. O último Workspace usado de forma persistente e o convite ficam para os tickets seguintes. `responsabilidade_exclusiva.sql` falha 7/12 localmente também na main (validação de canal da Sequência), fora deste escopo.
