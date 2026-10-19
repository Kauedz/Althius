# 03: Conferir o catálogo do Meta Ads

**What to build:** confirmar por pgTAP que `private.integration_catalog.writes` do `meta-ads` é `true` (o seed de 20260929140000 já põe assim) e que `kinds = {oauth_mcp}`. É uma migration só se algo divergir. O objetivo é só travar o estado esperado.

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito; vira closed no merge)

## Pode mexer
- `supabase/tests/meta_ads_catalogo.sql`

## Comments

**19/10/2026 (agente).** pgTAP novo `supabase/tests/meta_ads_catalogo.sql` (3 asserções: `writes`, `kinds = {oauth_mcp}` e sem portal fixo). Não precisou de migration: o seed já estava assim. Roda no CI.
