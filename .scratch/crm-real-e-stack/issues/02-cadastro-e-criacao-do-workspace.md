# 02: Cadastrar e criar o Workspace pessoal

**What to build:** um visitante se cadastra com Google ou e-mail (link ou código), e no primeiro acesso passa a operar no seu Workspace pessoal como Administrador.

**Revisão de escopo (2026-09-25):** a [spec de autenticação](../../autenticacao-google-email/spec.md) detalha os métodos de entrada, o Workspace pessoal automático também para convidados e a criação explícita do Workspace da empresa. A identidade continua no Supabase Auth ([ADR-0012](../../../docs/adr/0012-supabase-auth-como-identidade.md)).

**Blocked by:** 01: Separar modo real e Demonstração.

**Status:** ready-for-agent

- [ ] Cadastro público, login e recuperação de acesso usam Supabase Auth com Google e e-mail (link no mesmo navegador ou código), numa tela de login da Althius.
- [ ] Google, link e código do mesmo e-mail verificado resultam na mesma Conta de usuário.
- [ ] A criação do Workspace pessoal (nome inicial da pessoa) e da Participação de Administrador é atômica e idempotente, inclusive para quem se cadastra por convite. O cadastro só por e-mail pede o nome antes de concluir.
- [ ] Repetir callback, login ou inicialização não cria Workspace nem Participação duplicada.
- [ ] Cadastro não cria Workspace da empresa nem associa o usuário a Workspace de terceiros por domínio de e-mail.
- [ ] Após o cadastro, a aplicação abre o Workspace pessoal criado, com estados operacionais de carregamento, falha e nova tentativa.

## Fora deste ticket

- Ação de criar Workspace da empresa por escolha explícita.
- Sugestão de Workspace da empresa por domínio: depende de um mecanismo de domínio validado ainda não definido.
- SMTP de produção e verificação de marca no Google Cloud são pré-requisitos de ambiente, listados na spec de autenticação.
