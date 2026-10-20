# 02: Conectar o Lusha pela autorização no próprio Lusha (OAuth)

**What to build:** o perfil do Lusha ganha `oauth` com registro dinâmico em `auth.lusha.com`, como cliente confidencial, escopo `mcp`, PKCE e `enviarRecurso`, e o seed ganha `kinds = {oauth_mcp, api_key}` numa migration aditiva. A chave de API continua como está. O cartão passa a mostrar "Conectar no Lusha" e "Usar chave de API".

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [x] Teste Deno: a descoberta parte de `https://mcp.lusha.com`, chega a `auth.lusha.com` e registra com `token_endpoint_auth_method` de segredo (o Lusha não aceita `none`). O segredo do cliente fica guardado.
- [ ] Teste Deno: a volta do OAuth troca o código com `client_secret_post` ou `client_secret_basic`.
- [x] pgTAP: `kinds` do Lusha.
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

**19/10/2026 (agente), depois da autorização do usuário para atualizar pgTAP antigos quando o catálogo muda de propósito.** O código da branch `lusha-oauth-pendente` entrou na `conectores-em-construcao`: o perfil, a migration `20261104131000`, o `handler-lusha-oauth.test.ts` e o `perfis.test.ts`.

**pgTAP antigo alterado:** `supabase/tests/acessos_as_integracoes.sql`, item 7. Antes: `throws_ok` com "o Lusha só conecta por chave de API: sem OAuth não há tentativa". Agora: `lives_ok` com "o Lusha conecta também pela autorização no app". A cobertura da recusa `integration kind not supported` foi para o `lusha_por_oauth.sql` (3 asserções), com o RD Station, que segue só por chave, liberado e habilitado só dentro do teste. O plano do arquivo antigo continua 66.

**Validação:** desta vez os pgTAP rodaram de verdade, num PGlite (Postgres 16.4 em WASM) com `@electric-sql/pglite-pgtap`, o esqueleto de `scripts/pgtap-local.sh` e as migrations em ordem. A suíte inteira deu 136 arquivos verdes; `lusha_por_oauth.sql` 3/3 e `acessos_as_integracoes.sql` 66/66. O executor fica no scratchpad da sessão, fora do repositório.
