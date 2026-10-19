# 02: Conectar o Lusha pela autorização no próprio Lusha (OAuth)

**What to build:** o perfil do Lusha ganha `oauth` com registro dinâmico em `auth.lusha.com`, como cliente confidencial, escopo `mcp`, PKCE e `enviarRecurso`, e o seed ganha `kinds = {oauth_mcp, api_key}` numa migration aditiva. A chave de API continua como está. O cartão passa a mostrar "Conectar no Lusha" e "Usar chave de API".

**Blocked by:** nenhum.

**Status:** ready-for-agent

- [ ] Teste Deno: a descoberta parte de `https://mcp.lusha.com`, chega a `auth.lusha.com` e registra com `token_endpoint_auth_method` de segredo (o Lusha não aceita `none`). O segredo do cliente fica guardado.
- [ ] Teste Deno: a volta do OAuth troca o código com `client_secret_post` ou `client_secret_basic`.
- [ ] pgTAP: `kinds` do Lusha.
- [ ] Desconectar um Acesso OAuth revoga em `auth.lusha.com/oauth/revoke` (o mecanismo vem do `conector-clay/02`; só o teste do Lusha é novo).

## Pode mexer
- `supabase/functions/_shared/integracoes/perfis.ts` (Lusha) e os testes de `integration-connect`, `integration-callback` e `integration-access`
- `supabase/migrations/<novo>_lusha_por_oauth.sql`, `supabase/tests/lusha_por_oauth.sql`

## Não mexa
- O caminho da chave (`x-api-key`) e os testes antigos do Lusha.

## Comments
