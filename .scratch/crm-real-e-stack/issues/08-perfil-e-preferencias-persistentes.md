# 08: Persistir perfil e preferências

**What to build:** cada participante edita o perfil e as preferências já apresentadas em Configurações e encontra seus valores salvos após sair e entrar novamente.

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md); Auth-05: [Esqueci a senha](../../autenticacao-google-email/issues/05-esqueci-a-senha.md) (substituem o CRM-02).

**Status:** ready-for-agent

- [ ] Perfil e preferências pertencem à identidade ou Workspace conforme seu escopo e são persistidos no backend.
- [ ] Tema e preferências de notificação sobrevivem a sessão e dispositivo.
- [ ] Formulários indicam salvamento, validação, falha e retry sem mostrar sucesso antes da confirmação do backend.
- [ ] Preferências privadas de um usuário não sobrescrevem preferências de outro participante.
- [ ] Trocar senha exige a senha atual (ou reautenticação por código) e segue a política da [spec de autenticação](../../autenticacao-google-email/spec.md); quem entrou só com Google pode definir uma senha sem perder a identidade Google.
- [ ] Plano e consumo permanecem identificados como demonstração, fora do escopo de billing.

