# 03: Cadastro com nome, e-mail e senha, e verificação por código

**What to build:** um visitante abre `/cadastro`, informa nome, e-mail e senha, recebe um e-mail com código de 6 dígitos e link, confirma o endereço digitando o código na mesma tela e cai no seu Workspace pessoal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 01: Rotas e casca visual das telas de acesso; 02: Workspace pessoal criado no primeiro acesso.

**Status:** ready-for-agent

- [ ] `/cadastro` pede só nome, e-mail e senha, dentro da casca das telas de acesso, com link para `/entrar`.
- [ ] Senha com mínimo de 8 caracteres, sem regras de composição, com medidor de força, mostrar/ocultar e `autocomplete` para gerenciadores de senha.
- [ ] Após "Criar conta", a mesma tela pede o código de 6 dígitos; o link do e-mail também confirma no mesmo navegador. Sem verificação não há sessão nem Workspace.
- [ ] "Reenviar código" com intervalo mínimo visível e "Corrigir e-mail" sem perder o nome digitado.
- [ ] Atualizar a página na etapa do código mantém a etapa.
- [ ] Cadastro com e-mail já existente mostra a mesma resposta do cadastro novo; o e-mail enviado explica como entrar.
- [ ] Texto de aceite passivo com links para Termos de Uso e Política de Privacidade abaixo do botão; o aceite é gravado pelo bootstrap.
- [ ] Testes de raiz com o Supabase falso (ampliado para cadastro, confirmação e reenvio) cobrem o caminho completo, e-mail existente, senha curta e atualização da página.
