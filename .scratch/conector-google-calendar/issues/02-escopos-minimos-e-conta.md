# 02: Escopos mínimos do Calendar e conta identificada

**What to build:**
- Trocar os escopos do perfil do Calendar pelos de leitura da spec, mais `openid email`.
- Identificar a conta pelo `email`: pela resposta do token (`id_token`) ou pelo userinfo (`openidconnect.googleapis.com/v1/userinfo`). Se não houver `email`, o cartão mostra só "Conectado".

**Blocked by:** 01.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [ ] Teste Deno: os escopos do consentimento e a conta vinda do userinfo, com o token no cabeçalho e nunca no log.

## Pode mexer
- `conectores.ts` (Calendar), `identificacao.ts` se precisar e os testes

## Comments

**19/10/2026 (agente).**
- Escopos: `openid email calendar.calendarlist.readonly calendar.events.freebusy calendar.events.readonly`. Saiu o `calendar.events`, de escrita.
- Conta pelo userinfo (`openidconnect.googleapis.com/v1/userinfo`, com o token no cabeçalho): `email`, ou `name`.
- `integration-callback/handler-google.test.ts`, 2 casos: a conta com o token no cabeçalho, fora do log, e o refresh token guardado; sem o userinfo, conecta e mostra só "Conectado". Com a identificação desligada de propósito, o primeiro caso falhou.
- `deno test supabase/functions`: 1650 passaram; `deno check` limpo.
