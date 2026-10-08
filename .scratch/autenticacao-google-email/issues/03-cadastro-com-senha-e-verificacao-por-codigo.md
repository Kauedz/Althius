# 03: Cadastro com nome, e-mail e senha, e verificação por código

**What to build:** um visitante abre `/cadastro`, informa nome, e-mail e senha, recebe um e-mail com código de 6 dígitos e link, confirma o endereço digitando o código na mesma tela e cai no seu Workspace pessoal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 01: Rotas e casca visual das telas de acesso; 02: Workspace pessoal criado no primeiro acesso.

**Status:** ready-for-human (código pronto; a correção de 2026-10-08 está na branch `ralph/auth-03-05-redefinir-senha`; falta só o e-mail para conta existente, que depende do SMTP do Auth-10)

- [x] `/cadastro` pede só nome, e-mail e senha, dentro da casca das telas de acesso, com link para `/entrar`.
- [x] Senha com mínimo de 8 caracteres, sem regras de composição, com medidor de força, mostrar/ocultar e `autocomplete` para gerenciadores de senha.
- [x] Após "Criar conta", a mesma tela pede o código de 6 dígitos; o link do e-mail também confirma no mesmo navegador. Sem verificação não há sessão nem Workspace.
- [x] "Reenviar código" com intervalo mínimo visível e "Corrigir e-mail" sem perder o nome digitado.
- [x] Atualizar a página na etapa do código mantém a etapa.
- [ ] Cadastro com e-mail já existente mostra a mesma resposta do cadastro novo; o e-mail enviado explica como entrar. — A tela já responde igual (teste "cadastro com e-mail que já tem conta mostra a mesma resposta do cadastro novo"). Falta o e-mail: o Supabase não envia nada no `signUp` de um e-mail já confirmado, então o aviso depende do SMTP e de um envio próprio (Auth-10).
- [x] Texto de aceite passivo com links para Termos de Uso e Política de Privacidade abaixo do botão; o aceite é gravado pelo bootstrap.
- [x] Testes de raiz com o Supabase falso (ampliado para cadastro, confirmação e reenvio) cobrem o caminho completo, e-mail existente, senha curta e atualização da página.

## Comments

- 2026-09-25 (Auth-03, half Ralph): tela em `src/auth/tela-de-cadastro.tsx`; contexto ganhou `cadastrar`, `confirmarCodigoDoCadastro`, `reenviarCodigoDoCadastro` (`signUp` com `full_name`, `verifyOtp` type `signup`, `resend`); `destinoDepoisDoAcesso` vale também em `/cadastro`. Evidência: 10 testes em `src/raiz.test.tsx` (describe "Cadastro com senha"), suíte 540/540, `tsc -b` limpo. Etapa do código guardada em sessionStorage (`althius:cadastro`: nome, e-mail, envio; nunca a senha); reenvio a cada 60 s.
  - pending-human: (1) o Supabase não envia e-mail no `signUp` de e-mail já existente — o "e-mail que explica como entrar" exige Send Email Hook ou equivalente com o SMTP (item deixado aberto; a tela já responde igual). (2) Modelo "Confirm signup" do Supabase precisa trazer `{{ .Token }}` (6 dígitos) além do link. (3) `/termos` e `/privacidade` são endereços provisórios em `src/auth/termos.ts`; os documentos não existem ainda.
- 2026-10-08 (branch `ralph/auth-03-05-redefinir-senha`, junto com o Auth-05): num navegador que nunca tinha escolhido o Workspace operacional, `/cadastro` abria a Demonstração, e o link de confirmação (que volta ao `destino`, fora das telas de acesso) também. A raiz (`src/raiz.tsx`) só tratava `/entrar` e o convite como Workspace operacional.
  - Correção: `ehCaminhoDeAcesso` (`src/auth/destino.ts`) cobre as quatro telas de acesso e o link do convite. Quem abre um desses endereços fica com o Workspace operacional lembrado neste navegador, para os links do e-mail abertos aqui caírem nele. O botão "Abrir Demonstração (sem login)" continua gravando a Demonstração.
  - Testes em `src/raiz.test.tsx`: "quem abre /cadastro pela primeira vez neste navegador vê a tela de acesso, e não a Demonstração"; "o link do e-mail abre o Workspace pessoal, e não a Demonstração, num navegador que nunca escolheu o Workspace operacional"; "num navegador novo, a Demonstração aberta a partir de /entrar continua aberta ao atualizar a página". Suíte completa 1078/1078 antes dos ajustes da revisão (os testes afetados passam depois deles); `tsc -b` e `oxlint` limpos.
  - Conferência visual (Chrome headless, perfil novo, 1400×900 e 360px) com o Supabase falso dos testes, porque não há `.env` com Supabase local: [cadastro](prints/03-cadastro-navegador-novo.jpg), [cadastro a 360px](prints/03-cadastro-360.jpg), [código](prints/03-confirme-seu-email.jpg), [link de confirmação → Workspace pessoal](prints/03-link-de-confirmacao.jpg). Nenhum erro no console.
  - Decisão a confirmar: lembrar o Workspace operacional só por abrir uma tela de acesso faz quem visitou `/cadastro` e saiu ver `/entrar` ao voltar ao início, e não mais a Demonstração. A alternativa é os links do e-mail voltarem por `/entrar?destino=…`, o que muda as URLs de redirecionamento do Supabase e testes antigos.
