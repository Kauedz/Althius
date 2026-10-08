# 05: Esqueci a senha

**What to build:** uma Conta de usuário que esqueceu a senha pede a redefinição em `/esqueci-a-senha`, confirma com código ou link, define uma nova senha e as outras sessões são encerradas. Também é o caminho para quem só tem Google definir uma senha.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 04: Entrar com senha ou com código.

**Status:** ready-for-agent (num navegador sem escolha salva, o link de redefinir abre a Demonstração e deixa entrar sem trocar a senha; ver Comments de 2026-10-07)

- [x] O pedido responde de forma genérica, exista ou não a conta. — `raiz.test.tsx` › Esqueci a senha › "responde igual exista ou não a Conta de usuário" (mesmo texto de status, sem alerta, nenhum e-mail para quem não tem conta).
- [x] O e-mail traz código de 6 dígitos e link; os dois levam à definição da nova senha. — testes "redefinição por código" e "o link do e-mail… leva à nova senha" (`resetPasswordForEmail` com `redirectTo` = origem + `/redefinir-a-senha`, `verifyOtp` type `recovery`). **pending-human:** o modelo de e-mail "Reset Password" do Supabase precisa trazer `{{ .Token }}` além do link (e entrega por SMTP real), fora do alcance do código.
- [x] A nova senha segue a mesma política do cadastro (mínimo de 8, medidor, mostrar/ocultar). — `CampoDeNovaSenha` (src/auth/nova-senha.tsx) usado no cadastro e na redefinição; `definirNovaSenha` do teste cobre recusa < 8, medidor, mostrar/ocultar, autocomplete new-password. Bloqueio de senha vazada fica no Auth-06.
- [x] Após a troca, as outras sessões da Conta de usuário são encerradas e a pessoa entra no Workspace de entrada. — teste "redefinição por código": sessão aberta noutro aparelho encerrada (`signOut({ scope: 'others' })`), a desta aba continua e abre o Workspace; senha antiga recusada e nova aceita; o link volta ao destino lembrado.
- [x] Testes de raiz cobrem pedido genérico, redefinição por código e encerramento das outras sessões. — 5 testes em `describe('Esqueci a senha')` (inclui conta só com Google definindo a primeira senha e link inválido).

## Comments

- Branch `ralph/auth-05-esqueci-a-senha`, criada da junção de Auth-03 + Auth-04 (commit de merge próprio; o Supabase falso foi unificado num só modelo de Contas de usuário).
- Fluxo: `/esqueci-a-senha` → código (ou link para `/redefinir-a-senha`) → sessão de recuperação (`redefinindoSenha` no contexto, também ligado pelo evento `PASSWORD_RECOVERY`) → "Defina uma nova senha" → `updateUser` + `signOut({ scope: 'others' })` → Workspace de entrada.
- Refactor único: `CampoDoCodigo` comum às etapas de código de cadastro, entrada e redefinição.
- pending-human: modelo "Reset Password" com `{{ .Token }}` e o link; `/redefinir-a-senha` nas URLs de redirecionamento do Supabase Auth de cada ambiente.

- 2026-10-07 (reconciliação contra a `main` 59e53a6): a branch `ralph/auth-05-esqueci-a-senha` está na `main`. O rótulo `done` saiu: não é do vocabulário e o critério 2 não fecha.
  - Testes rodados: os 6 de "Esqueci a senha" (`src/raiz.test.tsx`), dentro da rodada de 33 da autenticação, todos verdes, entre eles "redefinição por código: a nova senha encerra as outras sessões e a pessoa entra no Workspace de entrada", "o link do e-mail, aberto neste navegador, também leva à nova senha e depois ao destino lembrado" e "/redefinir-a-senha sem link válido explica e oferece pedir outro".
  - Cumpridos: o pedido genérico (`src/auth/tela-esqueci-a-senha.tsx:39-47,67-70`); a mesma política de senha (`tela-esqueci-a-senha.tsx:116-146`); as outras sessões encerradas (`src/auth/contexto.tsx:141-149,316-326`).
  - Parcial (critério 2): num navegador sem escolha salva, o link de `/redefinir-a-senha` abre a Demonstração. Depois de "Acessar tela de login Supabase", a pessoa entra no Workspace sem passar por "Defina uma nova senha". O motivo: `redefinindoSenha` nasce de `pathname === '/redefinir-a-senha'` (`contexto.tsx:167`), mas a Demonstração já trocou o endereço, e o evento `PASSWORD_RECOVERY` passou sem ouvinte. Reproduzido com o Supabase falso num teste de diagnóstico fora do repositório. `/esqueci-a-senha` aberto direto também cai na Demonstração. É o achado (a) da auditoria, detalhado no ticket 03.
  - Falta (agente): a correção (A) do ticket 03 cobrindo `/esqueci-a-senha` e `/redefinir-a-senha`, com dois testes de raiz sem `ultimoAmbiente`: o link de redefinição num navegador sem escolha salva pede a nova senha antes de abrir o Workspace; `/esqueci-a-senha` aberto direto mostra o pedido.
  - Humano, no ticket 10: o modelo "Reset Password" com `{{ .Token }}` e `/redefinir-a-senha` nas Redirect URLs de cada ambiente.
- 2026-10-08 (branch `ralph/auth-03-05-redefinir-senha`, junto com o Auth-03): o link do e-mail abria a Demonstração num navegador que nunca tinha escolhido o Workspace operacional, por exemplo quem entrou por `/entrar` → "Esqueci a senha" sem clicar em nada. `/esqueci-a-senha` aberto direto também. A raiz só tratava `/entrar` e o convite como Workspace operacional.
  - Primeiro ato, vermelho: "o link do e-mail abre a nova senha, e não a Demonstração, num navegador que nunca escolheu o Workspace operacional" (o link caía no onboarding da Demonstração). Correção em `src/raiz.tsx` e `src/auth/destino.ts` (`ehCaminhoDeAcesso`); detalhes no comentário de 2026-10-08 do Auth-03.
  - Testes em `src/raiz.test.tsx`: o de cima; "quem abre /esqueci-a-senha pela primeira vez neste navegador…" e "quem abre /redefinir-a-senha pela primeira vez neste navegador…" (link aberto noutro navegador: tela de link expirado, não a Demonstração). Conferido por mutação: tirar `/redefinir-a-senha` da regra derruba esse teste.
  - Conferência visual (Chrome headless, perfil novo, Supabase falso dos testes): [link de redefinição](prints/05-link-de-redefinicao-navegador-novo.jpg), [a 360px](prints/05-link-de-redefinicao-360.jpg), [depois da nova senha](prints/05-depois-da-nova-senha.jpg), [/esqueci-a-senha direto](prints/05-esqueci-a-senha-navegador-novo.jpg). Nenhum erro no console.
