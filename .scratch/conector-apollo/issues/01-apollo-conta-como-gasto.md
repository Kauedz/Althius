# 01: O Apollo conta como Integração que gasta

**What to build:** `writes = true` (migration aditiva com pgTAP) e `ferramentasGastam: true` no perfil do Apollo, com o teste Deno. Mesmo desenho de `conector-clay/01`.

**Blocked by:** nenhum.

**Status:** ready-for-agent

## Pode mexer
- `supabase/migrations/<novo>_apollo_gasta_creditos.sql`, `supabase/tests/apollo_gasta_creditos.sql`, o perfil do Apollo em `perfis.ts` e `integration-access.test.ts`

## Não mexa
- `specialty_default_permissions` e os testes antigos.

## Comments
