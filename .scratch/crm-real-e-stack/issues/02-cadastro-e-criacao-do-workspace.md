# 02: Cadastrar e criar o Workspace do usuário

**What to build:** um visitante se cadastra, verifica o e-mail e, no primeiro acesso, passa a operar em um Workspace próprio como Administrador.

**Blocked by:** 01: Separar modo real e Demonstração.

**Status:** ready-for-agent

- [ ] Cadastro público, verificação de e-mail, login e recuperação de acesso usam identidade persistente do Supabase Auth.
- [ ] A criação inicial de Workspace e Membership Administrador é atômica e idempotente.
- [ ] Repetir callback, login ou inicialização não cria Workspace nem Membership duplicada.
- [ ] Cadastro não pesquisa nem associa automaticamente o usuário a Workspace de terceiros por domínio de e-mail.
- [ ] Após o cadastro, a aplicação apresenta o Workspace real criado e estados operacionais de carregamento, falha e nova tentativa.

