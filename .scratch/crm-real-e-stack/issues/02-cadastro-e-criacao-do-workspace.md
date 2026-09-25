# 02: Cadastrar e criar o Workspace pessoal

**What to build:** um visitante se cadastra com Google ou com e-mail e senha (verificando o e-mail por código), entra também por código, recupera a senha, e no primeiro acesso passa a operar no seu Workspace pessoal como Administrador.

**Revisão de escopo (2026-09-25):** a [spec de autenticação](../../autenticacao-google-email/spec.md) detalha telas, métodos de entrada, regras de senha, o Workspace pessoal automático também para convidados e a criação explícita do Workspace da empresa. A identidade continua no Supabase Auth ([ADR-0012](../../../docs/adr/0012-supabase-auth-como-identidade.md)), agora com senha além do código.

**Blocked by:** 01: Separar modo real e Demonstração.

**Status:** ready-for-agent

- [ ] Rotas `/cadastro`, `/entrar` e `/esqueci-a-senha` da Althius, com tela dividida no desktop e coluna única no celular (360px), usando Supabase Auth.
- [ ] "Continuar com Google" pelo botão oficial do Google (ID token) e One Tap em `/entrar` e `/cadastro`; a escolha de conta mostra a Althius, não `*.supabase.co`.
- [ ] Cadastro por e-mail pede nome, e-mail e senha, e exige o código de 6 dígitos antes do primeiro acesso. Sem verificação não há sessão, Workspace nem Participação.
- [ ] Senha com mínimo de 8 caracteres, sem regras de composição, bloqueio de senhas vazadas (na tela pelo Pwned Passwords enquanto no Supabase Free; no servidor quando auto-hospedado, conforme o [ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md)), medidor de força e mostrar/ocultar.
- [ ] `/entrar` aceita senha ou "Entrar com código"; erros de login e respostas de cadastro com e-mail existente não revelam se o e-mail está cadastrado.
- [ ] Esqueci a senha por código + link, com a mesma política, encerrando as outras sessões após a troca.
- [ ] CAPTCHA invisível (Turnstile) em cadastro, login com senha, envio de código e redefinição.
- [ ] Aceite passivo dos Termos de Uso e da Política de Privacidade, com versão e data guardadas.
- [ ] Google, senha e código do mesmo e-mail verificado resultam na mesma Conta de usuário.
- [ ] Convite preenche e trava o e-mail; o Google só aceita o convite com conta do mesmo e-mail.
- [ ] A criação do Workspace pessoal (nome inicial da pessoa) e da Participação de Administrador é atômica e idempotente, inclusive para quem se cadastra por convite.
- [ ] Repetir callback, login ou inicialização não cria Workspace nem Participação duplicada.
- [ ] Cadastro não cria Workspace da empresa nem associa o usuário a Workspace de terceiros por domínio de e-mail.
- [ ] Após o cadastro, a aplicação abre o Workspace pessoal criado, com estados operacionais de carregamento, falha e nova tentativa.

## Fora deste ticket

- Ação de criar Workspace da empresa por escolha explícita.
- Sugestão de Workspace da empresa por domínio: depende de um mecanismo de domínio validado ainda não definido.
- Trocar ou definir senha em Perfil (CRM-08).
- MFA (autenticador TOTP).
- SMTP de produção, verificação de marca no Google Cloud e conta Turnstile são pré-requisitos de ambiente, listados na spec de autenticação.
