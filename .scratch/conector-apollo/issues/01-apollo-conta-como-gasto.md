# 01: O Apollo conta como Integração que gasta

**What to build:** `writes = true` (migration aditiva com pgTAP) e `ferramentasGastam: true` no perfil do Apollo, com o teste Deno. Mesmo desenho de `conector-clay/01`.

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Pode mexer
- `supabase/migrations/<novo>_apollo_gasta_creditos.sql`, `supabase/tests/apollo_gasta_creditos.sql`, o perfil do Apollo em `perfis.ts` e `integration-access.test.ts`

## Não mexa
- `specialty_default_permissions` e os testes antigos.

## Comments

**19/10/2026 (agente).**
- Migration `20261104132000_apollo_gasta_creditos.sql` (`writes = true`) e pgTAP `apollo_gasta_creditos.sql` (2 asserções; roda no CI).
- `ferramentasGastam: true` no perfil.
- Teste Deno em `integration-access.test.ts`, vermelho antes e verde depois.
- Nenhum pgTAP antigo fixa `writes` do Apollo. O `aprovacoes_reais.sql:65-67` usa o Apollo com Propor numa Integração não habilitada e não depende disso.
