# 02: Conectar o Lusha pela autorização no próprio Lusha (OAuth)

**What to build:** o perfil do Lusha ganha `oauth` com registro dinâmico em `auth.lusha.com`, como cliente confidencial, escopo `mcp`, PKCE e `enviarRecurso`, e o seed ganha `kinds = {oauth_mcp, api_key}` numa migration aditiva. A chave de API continua como está. O cartão passa a mostrar "Conectar no Lusha" e "Usar chave de API".

**Blocked by:** nenhum.

**Status:** needs-info (código pronto na branch local `lusha-oauth-pendente`; parado por conflito com um pgTAP antigo)

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

**19/10/2026 (agente).** Feito e guardado na branch local `lusha-oauth-pendente`, fora do caminho principal:
- o perfil com `oauth` (registro dinâmico em `auth.lusha.com`, escopo `mcp`, cliente confidencial);
- a migration `20261104131000_lusha_por_oauth.sql` (`kinds = {oauth_mcp, api_key}`) com o pgTAP `lusha_por_oauth.sql`;
- o teste `integration-connect/handler-lusha-oauth.test.ts`: registro com `client_secret_post`, segredo guardado, consentimento em `auth.lusha.com/oauth-ui/authorize` com `scope=mcp`, PKCE e `resource`. Vermelho antes, verde depois; `deno test supabase/functions` passou com 1634.

**Por que parou:** o pgTAP antigo `supabase/tests/acessos_as_integracoes.sql` (linhas 109 a 113) afirma "o Lusha só conecta por chave de API: sem OAuth não há tentativa". A migration nova quebra essa asserção, e o repositório proíbe alterar pgTAP antigo. O teste Deno `perfis.test.ts`, que espelha o seed, também muda (`lusha: kinds`).

**Decisão do usuário:** autorizar a troca dessa asserção (ela pode passar a usar o `rd-station`, que continua só por chave) ou manter o Lusha só por chave.
