# 01: O Lusha conta como Integração que gasta

**What to build:** `writes = true` no catálogo (migration aditiva com pgTAP próprio) e `ferramentasGastam: true` no perfil do Lusha, com o teste Deno de que toda ferramenta do Lusha sai como "escreve ou gasta", mesmo com `readOnlyHint`. Mesmo desenho de `conector-clay/01`.

**Blocked by:** nenhum (usa `ferramentasGastam`, que vem do `conector-clay`).

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Pode mexer
- `supabase/migrations/<novo>_lusha_gasta_creditos.sql`, `supabase/tests/lusha_gasta_creditos.sql`
- `supabase/functions/_shared/integracoes/perfis.ts` (Lusha) e `_shared/integration-access.test.ts`

## Não mexa
- `specialty_default_permissions` (decisão pendente em `conector-clay/01`) e os testes antigos.

## Comments

**19/10/2026 (agente).**
- Migration `20261104130000_lusha_gasta_creditos.sql` (`writes = true`) e pgTAP `lusha_gasta_creditos.sql`. O pgTAP roda no CI; não há Postgres local.
- `ferramentasGastam: true` no perfil do Lusha.
- Teste Deno em `integration-access.test.ts` ("as ferramentas do Lusha gastam créditos…"): vermelho antes da mudança, verde depois.
- `deno test supabase/functions/_shared`: 788 passaram.
