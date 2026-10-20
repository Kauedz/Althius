# 01: Parâmetros extras na autorização (access_type=offline)

**What to build:** `PerfilOAuth.parametrosDeAutorizacao?: Record<string, string>`, anexados por `urlDeConsentimento`, sem sobrescrever `client_id`, `state`, `redirect_uri`, PKCE, `scope` nem `resource`. O Calendar e o Sheets passam a usar `{ access_type: 'offline', prompt: 'consent' }`.

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [ ] Teste Deno (`oauth.test.ts`): os parâmetros entram na URL, e um parâmetro reservado no perfil é ignorado.
- [ ] Teste Deno (`integration-connect`): o consentimento do Google Calendar traz `access_type=offline`.

## Pode mexer
- `supabase/functions/_shared/integracoes/oauth.ts`, `perfis.ts` (tipo), `conectores.ts` (Calendar e Sheets), `integration-connect/handler.ts` e os testes

## Comments

**19/10/2026 (agente).**
- `PerfilOAuth.parametrosDeAutorizacao` e `urlDeConsentimento({ extras })`. Os extras entram antes, e os parâmetros do OAuth (`client_id`, `state`, `redirect_uri`, PKCE, `scope`, `resource`) vêm depois, sem poder ser sobrescritos.
- O Calendar e o Sheets mandam `access_type=offline` e `prompt=consent`.
- Testes: `oauth.test.ts` (os extras entram; um `client_id`, `state` ou `redirect_uri` forjado é ignorado) e `integration-connect/handler-google.test.ts` (o consentimento do Calendar e do Sheets), vermelhos antes e verdes depois.

**Revisão (19/10):** os extras também não podem trazer `scope`, `resource` nem os nomes do PKCE quando o perfil não os define (`PARAMETROS_DO_OAUTH` em `oauth.ts`). O teste novo ficou vermelho antes da correção.
