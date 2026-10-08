# 08: CAPTCHA invisível (Turnstile)

**What to build:** bots não conseguem criar contas em massa nem testar senhas, e pessoas não veem nenhum desafio no fluxo normal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 05: Esqueci a senha; 06: Bloqueio de senhas vazadas.

**Status:** closed (o Turnstile real é critério do ticket 10)

- [x] Cloudflare Turnstile invisível em cadastro, login com senha, envio de código e redefinição; o token acompanha cada chamada ao Supabase Auth. Evidência: `raiz.test.tsx` > "CAPTCHA invisível" (token em `signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail` e também `resend`); widget com `execution: 'execute'` e `appearance: 'interaction-only'` em `servicos-do-navegador.test.ts`. Turnstile real no navegador: pending-human (lista manual da spec).
- [x] Falha do CAPTCHA mostra mensagem clara e permite tentar de novo. Evidência: testes "se o Turnstile não confirmar a pessoa…" (nova tentativa pede outro token e entra) e "se o Supabase Auth recusar o CAPTCHA…" (`captcha_failed` no cadastro, código, senha e redefinição).
- [x] O Turnstile entra pela dependência injetada dos serviços do navegador; testes de raiz cobrem token enviado e falha. Evidência: `ServicosDoNavegador.tokenDoCaptcha(acao)`; falsos em `src/test/servicos-do-navegador-falsos.ts` (`captcha`, `falhasDoCaptcha`), Supabase falso com `exigeCaptcha` e `captchasRecebidos()`; sem site key nenhum token é pedido (teste de raiz e unitário).
- [x] A configuração necessária no Supabase Auth e na Cloudflare fica descrita para o ticket 10. Evidência: seção Comments abaixo, `projeto-althius-frontend/.env.example` e README.

## Comments

- 2026-09-25 (Ralph): `tokenDoCaptcha` em `ServicosDoNavegador`; a lógica do token fica em `src/auth/contexto.tsx` (telas intactas). Cada tentativa pede token novo (o Supabase aceita cada um uma vez). O reenvio do código do cadastro (`resend`) também leva token, porque o Supabase Auth exige CAPTCHA nele quando ligado. Sem `VITE_TURNSTILE_SITE_KEY`, nada é carregado nem enviado.
- Passo a passo para o ticket 10 (pending-human, nenhuma chave foi criada aqui):
  1. Cloudflare > Turnstile > Add widget: nome "Althius", hostnames de cada ambiente (produção, preview, `localhost` para dev), modo **Invisible**. Copie a site key e a secret key.
  2. Supabase Dashboard > Authentication > Attack Protection (Bot and Abuse Protection) > Enable CAPTCHA protection: provider **Turnstile**, cole a **secret key**, salve. A secret nunca vai ao repositório nem ao `.env` do front.
  3. No front de cada ambiente, `VITE_TURNSTILE_SITE_KEY=<site key>` (`.env.local` / variáveis do deploy) e novo build. Ligar o CAPTCHA no Supabase sem a site key no front faz o Auth recusar cadastro, login com senha, código, reenvio e redefinição.
  4. Verificação manual: cadastro, login com senha, "Entrar com código", reenvio e "Esqueci a senha" funcionam sem desafio visível; nos logs do Turnstile aparecem as ações `cadastro`, `login_com_senha`, `codigo_de_entrada`, `reenvio_do_cadastro`, `redefinicao_de_senha`.

- 2026-10-07 (reconciliação contra a `main` 59e53a6): a branch `ralph/auth-08-captcha-invisivel` está na `main`. Rótulo `done` trocado por `closed`.
  - Token em cada chamada ao Auth: `src/auth/contexto.tsx:109-117,220-234,266-295`; `src/auth/servicos-do-navegador.ts:103,105` (`execution: 'execute'`, `appearance: 'interaction-only'`); testes "cadastro, login com senha, envio de código, reenvio e redefinição mandam um token novo ao Supabase Auth, sem desafio na tela" e "o reenvio do código do cadastro também leva um token".
  - Falha clara e nova tentativa: `contexto.tsx:103,111-122`; testes "se o Turnstile não confirmar a pessoa, a tela explica e a nova tentativa pede outro token e entra" e "se o Supabase Auth recusar o CAPTCHA, cadastro, envio de código e redefinição mostram a mesma mensagem clara".
  - Dependência injetada: `servicos-do-navegador.ts:19,41,166-170`; teste "sem a site key do Turnstile, nenhum token é pedido nem enviado e o acesso funciona como antes".
  - Configuração descrita para o 10: nos Comments acima, em `projeto-althius-frontend/.env.example:6-8` e no `README.md:28`.
  - Testes rodados: os 5 de "CAPTCHA invisível" (`src/raiz.test.tsx`) e os 10 de `servicos-do-navegador.test.ts`, todos verdes.
