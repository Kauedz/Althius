# 03: Cadastro com nome, e-mail e senha, e verificação por código

**What to build:** um visitante abre `/cadastro`, informa nome, e-mail e senha, recebe um e-mail com código de 6 dígitos e link, confirma o endereço digitando o código na mesma tela e cai no seu Workspace pessoal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 01: Rotas e casca visual das telas de acesso; 02: Workspace pessoal criado no primeiro acesso.

**Status:** ready-for-human (código pronto na branch `ralph/auth-03-cadastro-com-senha`; falta a parte do e-mail para conta existente, abaixo)

- [x] `/cadastro` pede só nome, e-mail e senha, dentro da casca das telas de acesso, com link para `/entrar`.
- [x] Senha com mínimo de 8 caracteres, sem regras de composição, com medidor de força, mostrar/ocultar e `autocomplete` para gerenciadores de senha.
- [x] Após "Criar conta", a mesma tela pede o código de 6 dígitos; o link do e-mail também confirma no mesmo navegador. Sem verificação não há sessão nem Workspace.
- [x] "Reenviar código" com intervalo mínimo visível e "Corrigir e-mail" sem perder o nome digitado.
- [x] Atualizar a página na etapa do código mantém a etapa.
- [ ] Cadastro com e-mail já existente mostra a mesma resposta do cadastro novo; o e-mail enviado explica como entrar.
- [x] Texto de aceite passivo com links para Termos de Uso e Política de Privacidade abaixo do botão; o aceite é gravado pelo bootstrap.
- [x] Testes de raiz com o Supabase falso (ampliado para cadastro, confirmação e reenvio) cobrem o caminho completo, e-mail existente, senha curta e atualização da página.

## Comments

- 2026-09-25 (Auth-03, half Ralph): tela em `src/auth/tela-de-cadastro.tsx`; contexto ganhou `cadastrar`, `confirmarCodigoDoCadastro`, `reenviarCodigoDoCadastro` (`signUp` com `full_name`, `verifyOtp` type `signup`, `resend`); `destinoDepoisDoAcesso` vale também em `/cadastro`. Evidência: 10 testes em `src/raiz.test.tsx` (describe "Cadastro com senha"), suíte 540/540, `tsc -b` limpo. Etapa do código guardada em sessionStorage (`althius:cadastro`: nome, e-mail, envio; nunca a senha); reenvio a cada 60 s.
  - pending-human: (1) o Supabase não envia e-mail no `signUp` de e-mail já existente — o "e-mail que explica como entrar" exige Send Email Hook ou equivalente com o SMTP (item deixado aberto; a tela já responde igual). (2) Modelo "Confirm signup" do Supabase precisa trazer `{{ .Token }}` (6 dígitos) além do link. (3) `/termos` e `/privacidade` são endereços provisórios em `src/auth/termos.ts`; os documentos não existem ainda.
