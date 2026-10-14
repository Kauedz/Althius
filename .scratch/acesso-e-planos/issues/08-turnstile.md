# 08: Turnstile ligado

**What to build:** o token do Turnstile em todo caminho de entrada (senha, código, Google, cadastro por convite, reenvio).

**GATE:** nenhum valor de chave no repositório; só documentação.

**Blocked by:** 05.

**Status:** ready-for-human

## Passos do Nan
Configurar `VITE_TURNSTILE_SITE_KEY` no build e a chave secreta em Supabase Auth (Authentication > Attack Protection > CAPTCHA, provider Turnstile).

## Critérios
- [x] `signInWithIdToken` leva `captchaToken`.
- [x] README e `.env.example` descrevem a configuração.
