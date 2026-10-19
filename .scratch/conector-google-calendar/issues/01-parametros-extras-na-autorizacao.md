# 01: Parâmetros extras na autorização (access_type=offline)

**What to build:** `PerfilOAuth.parametrosDeAutorizacao?: Record<string, string>`, anexados por `urlDeConsentimento`, sem sobrescrever `client_id`, `state`, `redirect_uri`, PKCE, `scope` nem `resource`. O Calendar e o Sheets passam a usar `{ access_type: 'offline', prompt: 'consent' }`.

**Blocked by:** nenhum.

**Status:** ready-for-agent

- [ ] Teste Deno (`oauth.test.ts`): os parâmetros entram na URL, e um parâmetro reservado no perfil é ignorado.
- [ ] Teste Deno (`integration-connect`): o consentimento do Google Calendar traz `access_type=offline`.

## Pode mexer
- `supabase/functions/_shared/integracoes/oauth.ts`, `perfis.ts` (tipo), `conectores.ts` (Calendar e Sheets), `integration-connect/handler.ts` e os testes

## Comments
