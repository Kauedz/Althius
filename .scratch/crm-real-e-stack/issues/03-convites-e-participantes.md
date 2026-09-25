# 03: Convidar e gerenciar participantes

**What to build:** Administradores convidam pessoas para o Workspace, pessoal ou da empresa, e gerenciam as Participações; convidados entram somente após aceitar um convite válido com a identidade correspondente.

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md); Auth-04: [Entrar com senha ou com código](../../autenticacao-google-email/issues/04-entrar-com-senha-ou-codigo.md) (substituem o CRM-02).

**Status:** ready-for-agent

- [ ] Convites persistem e apresentam estados pendente, aceito, expirado e revogado.
- [ ] O e-mail de convite é enviado pelo SMTP de produção configurado no Supabase Auth; sem ele, o convite não alega envio.
- [ ] Aceite exige autenticação com o endereço/identidade convidado e não permite associação por domínio.
- [ ] Quem se cadastra pelo convite também recebe seu Workspace pessoal (ticket 02) e entra primeiro no Workspace do convite.
- [ ] Existem somente os papéis Administrador e Membro, aplicados no backend.
- [ ] Só Administrador convida, altera papel ou remove Participação; Membro recebe recusa visível e não altera participantes.
- [ ] Remover Participação preserva a Conta de usuário, seu Workspace pessoal e os registros comerciais do Workspace.
- [ ] O último Administrador não pode ser removido nem rebaixado.
- [ ] No Workspace pessoal, o Titular não pode ser removido nem rebaixado, mesmo por outro Administrador convidado.
- [ ] Todos os participantes ativos consultam dados comerciais compartilhados; conteúdo privado de remetentes continua protegido.
