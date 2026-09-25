# 04: Entrar com senha ou com código

**What to build:** uma Conta de usuário entra em `/entrar` com e-mail e senha, ou com "Entrar com código" (código de 6 dígitos + link por e-mail), e chega ao Workspace certo.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 01: Rotas e casca visual das telas de acesso; 02: Workspace pessoal criado no primeiro acesso.

**Status:** ready-for-agent

- [ ] `/entrar` oferece e-mail e senha, "Entrar com código" e "Esqueci a senha", com link para `/cadastro`. O formulário de link antigo é substituído.
- [ ] "Entrar com código" não cria Conta de usuário; pede o código na mesma tela e aceita o link no mesmo navegador.
- [ ] Senha errada ou e-mail inexistente mostram só "E-mail ou senha incorretos".
- [ ] Após o login: último Workspace usado com Participação ativa → Workspace pessoal. Nunca abre Workspace sem Participação ativa.
- [ ] Testes de raiz cobrem senha certa, senha errada, código e a ordem de entrada no Workspace.
