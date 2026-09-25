# 03: Convidar e gerenciar participantes

**What to build:** Administradores convidam pessoas para o Workspace e gerenciam as Memberships; convidados entram somente após aceitar um convite válido com a identidade correspondente.

**Blocked by:** 02: Cadastrar e criar o Workspace do usuário.

**Status:** ready-for-agent

- [ ] Convites persistem e apresentam estados pendente, aceito, expirado e revogado.
- [ ] Aceite exige autenticação com o endereço/identidade convidado e não permite associação por domínio.
- [ ] Existem somente os papéis Administrador e Membro, aplicados no backend.
- [ ] Só Administrador convida, altera papel ou remove Membership; Membro recebe recusa visível e não altera participantes.
- [ ] Remover Membership preserva a identidade global e os registros comerciais do Workspace.
- [ ] O último Administrador não pode ser removido nem rebaixado.
- [ ] Todos os participantes ativos consultam dados comerciais compartilhados; conteúdo privado de remetentes continua protegido.

