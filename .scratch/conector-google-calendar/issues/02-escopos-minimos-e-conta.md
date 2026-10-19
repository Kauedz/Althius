# 02: Escopos mínimos do Calendar e conta identificada

**What to build:**
- Trocar os escopos do perfil do Calendar pelos de leitura da spec, mais `openid email`.
- Identificar a conta pelo `email`: pela resposta do token (`id_token`) ou pelo userinfo (`openidconnect.googleapis.com/v1/userinfo`). Se não houver `email`, o cartão mostra só "Conectado".

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Teste Deno: os escopos do consentimento e a conta vinda do userinfo, com o token no cabeçalho e nunca no log.

## Pode mexer
- `conectores.ts` (Calendar), `identificacao.ts` se precisar e os testes

## Comments
