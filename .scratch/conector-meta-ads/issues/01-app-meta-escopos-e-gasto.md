# 01: App Meta da Althius, escopos mínimos e gasto

**What to build:**
- **Perfil do Meta Ads:** `registro: 'preregistrado'`, aceitando cliente público (App ID sem segredo); `escopos: ['ads_mcp_management', 'ads_read']`; `ferramentasGastam: true`.
- **Cliente pré-registrado público.** Em `cliente-oauth.ts`, hoje o pré-registrado exige segredo, por causa do HubSpot. Entra uma opção do perfil (por exemplo `clientePublico: true`) que aceita só o `client_id`. Sem o App ID, o cartão continua em "Precisa configurar".

**Blocked by:** nenhum.

**Status:** ready-for-agent

- [ ] Teste Deno (`integration-connect`): com `META_ADS_MCP_CLIENT_ID` e sem segredo, o consentimento vai para `www.facebook.com/v26.0/dialog/oauth` com `client_id`, PKCE e `scope=ads_mcp_management ads_read`, sem registro dinâmico. Sem o App ID, "Precisa configurar".
- [ ] Teste Deno (`integration-callback`): a troca vai a `graph.facebook.com/v26.0/oauth/access_token` como cliente público.
- [ ] Teste Deno: as ferramentas do Meta Ads saem todas como gasto.
- [ ] O HubSpot continua exigindo segredo (os testes antigos ficam verdes sem mudança).

## Pode mexer
- `supabase/functions/_shared/integracoes/perfis.ts` (Meta Ads e o tipo `PerfilOAuth`), `cliente-oauth.ts` e os testes de `integration-connect`, `integration-callback` e `integration-access`

## Não mexa
- Os perfis dos outros conectores.

## Comments
