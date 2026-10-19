# 01: O Lusha conta como Integração que gasta

**What to build:** `writes = true` no catálogo (migration aditiva com pgTAP próprio) e `ferramentasGastam: true` no perfil do Lusha, com o teste Deno de que toda ferramenta do Lusha sai como "escreve ou gasta", mesmo com `readOnlyHint`. Mesmo desenho de `conector-clay/01`.

**Blocked by:** nenhum (usa `ferramentasGastam`, que vem do `conector-clay`).

**Status:** ready-for-agent

## Pode mexer
- `supabase/migrations/<novo>_lusha_gasta_creditos.sql`, `supabase/tests/lusha_gasta_creditos.sql`
- `supabase/functions/_shared/integracoes/perfis.ts` (Lusha) e `_shared/integration-access.test.ts`

## Não mexa
- `specialty_default_permissions` (decisão pendente em `conector-clay/01`) e os testes antigos.

## Comments
