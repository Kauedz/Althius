# 03: Conferir o catálogo do Meta Ads

**What to build:** confirmar por pgTAP que `private.integration_catalog.writes` do `meta-ads` é `true` (o seed de 20260929140000 já põe assim) e que `kinds = {oauth_mcp}`. É uma migration só se algo divergir. O objetivo é só travar o estado esperado.

**Blocked by:** nenhum.

**Status:** ready-for-agent

## Pode mexer
- `supabase/tests/meta_ads_catalogo.sql`

## Comments
