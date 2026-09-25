# 07: Continuar com Google

**What to build:** um visitante cria a conta ou entra com Google em um clique, pelo botão oficial ou pelo One Tap, vendo "Althius" na escolha de conta, e chega à mesma Conta de usuário que teria com senha ou código.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 04: Entrar com senha ou com código; 06: Bloqueio de senhas vazadas.

**Status:** ready-for-agent

- [ ] Botão oficial do Google Identity Services no topo de `/cadastro` e `/entrar`, com login por ID token e nonce; escopos só `openid`, `email` e `profile`.
- [ ] One Tap em `/entrar` e `/cadastro` quando há sessão Google no navegador; nunca dentro do app.
- [ ] Cancelar a escolha de conta volta à tela sem mensagem de erro.
- [ ] O nome da pessoa vem do Google; o aceite passivo dos Termos também vale aqui.
- [ ] Senha → Google e Google → definir senha (pelo "Esqueci a senha") chegam à mesma Conta de usuário, sem Workspace duplicado.
- [ ] O Google Identity Services entra pela dependência injetada dos serviços do navegador; testes de raiz cobrem cadastro, login, cancelamento e as duas vinculações.
