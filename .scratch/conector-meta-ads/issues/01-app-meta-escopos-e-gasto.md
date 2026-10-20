# 01: App Meta da Althius, escopos mínimos e gasto

**What to build:**
- **Perfil do Meta Ads:** `registro: 'preregistrado'`, aceitando cliente público (App ID sem segredo); `escopos: ['ads_mcp_management', 'ads_read']`; `ferramentasGastam: true`.
- **Cliente pré-registrado público.** Em `cliente-oauth.ts`, hoje o pré-registrado exige segredo, por causa do HubSpot. Entra uma opção do perfil (por exemplo `clientePublico: true`) que aceita só o `client_id`. Sem o App ID, o cartão continua em "Precisa configurar".

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [ ] Teste Deno (`integration-connect`): com `META_ADS_MCP_CLIENT_ID` e sem segredo, o consentimento vai para `www.facebook.com/v26.0/dialog/oauth` com `client_id`, PKCE e `scope=ads_mcp_management ads_read`, sem registro dinâmico. Sem o App ID, "Precisa configurar".
- [ ] Teste Deno (`integration-callback`): a troca vai a `graph.facebook.com/v26.0/oauth/access_token` como cliente público.
- [ ] Teste Deno: as ferramentas do Meta Ads saem todas como gasto.
- [ ] O HubSpot continua exigindo segredo (os testes antigos ficam verdes sem mudança).

## Pode mexer
- `supabase/functions/_shared/integracoes/perfis.ts` (Meta Ads e o tipo `PerfilOAuth`), `cliente-oauth.ts` e os testes de `integration-connect`, `integration-callback` e `integration-access`

## Não mexa
- Os perfis dos outros conectores.

## Comments

**19/10/2026 (agente).**
- **Perfil do Meta Ads:** `registro: 'preregistrado'` com `clientePublico: true`, escopos `ads_mcp_management ads_read` e `ferramentasGastam: true`.
- **`cliente-oauth.ts`:** o pré-registrado público passa só com o client id. O HubSpot, confidencial, continua exigindo o segredo; os testes antigos dele seguem verdes sem mudança.
- **Testes novos:**
  - `integration-connect/handler-meta-ads.test.ts`: com o App ID, o consentimento vai a `www.facebook.com/v26.0/dialog/oauth` com PKCE e os escopos, sem tocar no registro dinâmico; sem o App ID, 503 `nao_configurada`, sem tentativa. Os dois falharam antes da mudança.
  - `integration-callback/handler-meta-ads.test.ts`: a troca em `graph.facebook.com` como cliente público (`client_id` e PKCE, sem segredo). Passou de primeira: com o perfil antigo (registro dinâmico, mais o App ID do ambiente) a troca já saía assim; o teste trava o comportamento.
  - `integration-access.test.ts`: as ferramentas do Meta Ads saem todas como gasto.
- `deno test supabase/functions`: 1646 passaram.

**Revisão (19/10):** `ads_mcp_management` é o escopo do caso de uso do MCP e pode permitir gestão pelo servidor: "só leitura" vale para `ads_read`, não para o par. Por isso `ferramentasGastam` é a trava; o comentário do perfil foi corrigido.
