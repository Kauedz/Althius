# account-password

A troca (ou a primeira definição) de senha em Configurações → Meu perfil, no Workspace operacional (CRM-08). A senha só
muda no servidor, depois de a função conferir que é a pessoa: com a senha atual ou com o código de entrada enviado ao
e-mail da sessão (o caminho de quem entrou só com Google). O navegador não chama mais `signInWithPassword`, `verifyOtp`
nem `updateUser({ password })` nesse fluxo.

## Contrato

`POST /functions/v1/account-password`, com o JWT da sessão (`verify_jwt = true` em `supabase/config.toml`) e a chave
publicável no cabeçalho `apikey`, como o `supabase.functions.invoke` manda.

```json
{
  "confirmacao": { "tipo": "senha", "senhaAtual": "…", "captchaToken": "…" },
  "novaSenha": "…"
}
```

ou `"confirmacao": { "tipo": "codigo", "codigo": "123456", "captchaToken": "…" }`. O código é pedido antes, pelo fluxo
de "Entrar com código" (`signInWithOtp` com `shouldCreateUser: false` e CAPTCHA). O `captchaToken` é um token novo do
Turnstile por tentativa (ação `troca_de_senha`); sem o Turnstile configurado, vem sem ele.

A Conta de usuário é sempre a do JWT, e o e-mail da confirmação é o da sessão: id ou e-mail no corpo são ignorados.

Deu certo: `200 { ok: true, outrasSessoesEncerradas: boolean, sessao: { access_token, refresh_token, expires_in,
expires_at, token_type } }`. O navegador adota `sessao` (`auth.setSession`) e continua dentro do Workspace; se não
conseguir, sai, e a nova senha vale na entrada.

Recusas, sempre `{ erro }`, sem detalhe:

| `erro` | HTTP | Quando |
| --- | --- | --- |
| `sem_sessao` | 401 | Sem JWT, ou a sessão do JWT já foi encerrada no Supabase Auth. |
| `pedido_invalido` | 400 | Corpo fora do formato (tipo desconhecido, senha atual vazia, código que não é de 6 a 10 dígitos). |
| `senha_fraca` | 422 | Com `motivo`: `curta` (menos de 8 caracteres), `longa` (mais de 72 bytes) ou `vazada` (Pwned Passwords). Vale antes da confirmação: não gasta o código nem a tentativa. |
| `limite` | 429 | Cinco tentativas sem sucesso em 15 minutos para a Conta de usuário, ou o limite de taxa do Supabase Auth. |
| `captcha_invalido` | 400 | O Supabase Auth recusou o CAPTCHA (`captcha_failed`): ausente, inválido ou já usado. |
| `confirmacao_invalida` | 400 | Senha atual ou código errado, expirado ou de outra Conta de usuário. O mesmo erro para os dois. |
| `mesma_senha` | 422 | A nova senha é igual à atual (`same_password` do Supabase Auth). |
| `falha` | 502 | Banco ou Supabase Auth fora do ar, ou resposta inesperada. |

## O que a função faz, em ordem

1. `GET /auth/v1/user` com o JWT: a Conta de usuário e o e-mail dela. A sessão precisa ainda existir.
2. A política de senha (`_shared/politica-de-senha.ts`, a mesma da tela): mínimo de 8 caracteres, até 72 bytes (o
   limite do bcrypt do Supabase Auth), e o Pwned Passwords por k-anonimato (só os 5 primeiros caracteres do SHA-1 saem
   do servidor). Se o Pwned Passwords falhar ou demorar mais de 2 s, a troca segue, como na tela. O Supabase Auth do
   projeto tem `password_min_length = 6` e `password_hibp_enabled = false` (plano Free): esta é a barreira do servidor.
3. `claim_password_change_attempt` (chave de serviço; migration `20261009213521_troca_de_senha_no_servidor.sql`):
   reserva uma tentativa. Cinco nos últimos 15 minutos param a Conta de usuário. O limite de taxa do Supabase Auth vale
   por IP, e todas as chamadas da função saem do mesmo lugar, então ele sozinho não protege uma conta.
4. A confirmação no Supabase Auth, com o e-mail da sessão e a chave publicável de quem chamou, sem `Authorization`
   (o Auth vê um pedido comum, e o CAPTCHA vale):
   - senha atual: `POST /auth/v1/token?grant_type=password` com `gotrue_meta_security.captcha_token`;
   - código: `POST /auth/v1/verify` com `type: 'email'` (o token do Turnstile vai junto, se veio; hoje o GoTrue não
     protege `/verify` com CAPTCHA).
   Isso abre uma sessão nova; ela precisa ser da Conta de usuário do JWT, senão é encerrada e a resposta é
   `confirmacao_invalida`. Uma confirmação certa esquece as tentativas (`clear_password_change_attempts`).
5. A troca: `PUT /auth/v1/user` com a sessão nova, `{ password, current_password }` (a senha atual só no caminho da
   senha). O Supabase Auth recusa a mesma senha, manda o e-mail "Password changed" quando ligado e encerra, na mesma
   transação, todas as outras sessões da Conta de usuário, inclusive a que chamou a função; nas versões recentes, também
   cria a identidade `email` na primeira senha de quem só tinha Google (a identidade Google continua na mesma Conta de
   usuário). Se ele recusar, a sessão nova é encerrada.
6. `POST /auth/v1/logout?scope=others` com a sessão nova, para a resposta dizer se as outras sessões caíram
   (`outrasSessoesEncerradas`). Se essa chamada falhar, a senha já foi trocada e a resposta diz `false`.
7. A resposta leva a sessão nova ao navegador.

O log diz o desfecho (`trocada`, `confirmacao_invalida`, `limite`…), a etapa e o `error_code` do Supabase Auth, com o
id da Conta de usuário; nunca senha, código, token, CAPTCHA ou e-mail (teste "nenhum log leva…").

### Por que não `auth.admin.updateUserById`

A primeira ideia era trocar com `auth.admin.updateUserById(userId, { password })` e encerrar as outras sessões com
`auth.admin.signOut(jwt, 'others')`. No GoTrue, a troca pelo admin chama `user.UpdatePassword(tx, nil)`, e sem sessão
isso encerra **todas** as sessões da Conta de usuário, inclusive a do navegador que pediu
([admin.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/admin.go#L268),
[models/user.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/models/user.go#L457-L463)):
quem trocou a senha cairia para fora do app no próximo refresh, e o `signOut(jwt, 'others')` falharia com
`session_not_found`. A troca pelo admin também não manda o e-mail "Password changed". Com `PUT /user` na sessão aberta
pela confirmação, o Auth mantém essa sessão, encerra as outras, aplica `same_password`, `current_password` e o aviso
por e-mail, e a sessão vai para o navegador. A troca continua só no servidor: o navegador nunca recebe a sessão antes
de a troca acontecer.

## Configuração do Supabase Auth

Lido no `ycbdilsmydvzezhlymty` em 09/10/2026: CAPTCHA ligado (Turnstile), `security_update_password_require_reauthentication = true`,
`security_update_password_require_current_password = false`, `mailer_notifications_password_changed_enabled = false`.

- **Secure password change** (`secure_password_change = true` em `[auth.email]` do `config.toml`; no painel, já ligado):
  um `updateUser({ password })` numa sessão aberta há mais de 24 horas precisa de reautenticação (`nonce`). A função
  troca com a sessão recém-aberta pela confirmação, então nunca cai nisso.
- **Require current password when updating** (`security_update_password_require_current_password`): **é seguro ligar.**
  O CLI 2.118 (o do CI) não tem chave para ela no `config.toml`
  ([template do config](https://github.com/supabase/cli/blob/v2.118.0/apps/cli-go/pkg/config/templates/config.toml)),
  então liga-se no painel. Pelo código do GoTrue
  ([user.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/user.go#L169-L198),
  [models/factor.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/models/factor.go#L66-L73)),
  o `updateUser({ password })` passa a exigir `current_password` só quando a Conta de usuário já tem senha **e** a sessão
  não é de recuperação (as abertas por um código do e-mail, de entrada, cadastro ou redefinição, ou por um link de
  entrada ou de redefinição: `otp`, `magiclink`, `recovery`;
  [verify.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/verify.go#L285)).
  Com ela ligada:
  - **Meu perfil:** continua funcionando. No caminho da senha, a sessão da confirmação é de senha e a função manda
    `current_password`; no do código, a sessão é `otp`.
  - **Esqueci a senha** (`src/auth/nova-senha.tsx`, pelo código ou pelo link): continua funcionando, porque a sessão é
    `recovery`.
  - **Quem só tem Google, sem senha:** continua definindo a primeira senha (pelo código em Meu perfil, ou pelo "Esqueci a
    senha"); a exigência só vale para quem já tem senha.
  - **Um `updateUser({ password })` direto do navegador** numa sessão aberta por senha ou Google, de quem tem senha, é
    recusado com `current_password_required`. Continua passando numa sessão aberta por código ou link do e-mail (quem a
    abriu provou ter a caixa de entrada, como no código da troca) e para quem ainda não tem senha (só Google), nesse
    caso só nas primeiras 24 horas da sessão, por causa do "Secure password change". Essas brechas são do GoTrue, não do
    app; o fluxo do app não usa esse caminho.
  Testes: `perfil-e-preferencias-reais.test.tsx` e `raiz.test.tsx` ("com a senha atual exigida pelo Supabase Auth…"),
  com o dublê simulando a regra.
- **E-mail "Password changed"** (Authentication → Emails → Notifications): recomendado. Sai do `PUT /user`, então cobre
  Meu perfil (por esta função) e o "Esqueci a senha".

### CAPTCHA

O GoTrue protege `/token` (senha) com o CAPTCHA e não protege `/verify`
([api.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/api.go#L268-L274),
[middleware.go](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/middleware.go#L242-L281)).
A função chama `/token` sem `Authorization`: um pedido com a chave de serviço pularia o CAPTCHA. O Supabase Auth confere
o token na Cloudflare com o IP que ele vê (o da Edge Function, não o do navegador); a Cloudflare documenta o `remoteip`
como opcional, sem um erro de IP diferente na lista de erros do `siteverify`, mas isso fica para conferir no teste
manual (a troca pela senha atual com o Turnstile real).

### Limite de taxa do Supabase Auth

O Auth limita `/token` e `/verify` por IP, e todas as chamadas da função saem da Edge Function, não do navegador. Se
muitas pessoas trocarem a senha ao mesmo tempo, o limite pode ser atingido para todas (`limite`, "Muitas tentativas…").
Com o uso de hoje isso não preocupa; se aparecer no log (`authCode: over_request_rate_limit`), aumentar os limites em
Authentication → Rate Limits.

## Segredos

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` vêm do runtime; `APP_ORIGIN` é o mesmo das outras funções (CORS em
`_shared/cors.ts`). Nada novo a configurar.

## Testes

`handler.test.ts` vai da requisição à resposta com um Supabase Auth e um Pwned Passwords falsos atrás de um `fetch`
injetado, sem rede: sem JWT, senha certa e errada, código certo e errado, sessão de outra Conta, CAPTCHA ausente,
recusado ou repetido, política antes da confirmação, Pwned Passwords fora do ar, mesma senha, limites do Auth e das
tentativas, banco fora, falha ao encerrar as outras sessões, pedido fora do formato e logs sem segredo.
`_shared/politica-de-senha.test.ts` cobre tamanho e k-anonimato; `supabase/tests/troca_de_senha_no_servidor.sql`, o
limite de tentativas.
