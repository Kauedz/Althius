# 01: O Clay conta como Integração que gasta

**What to build:** as ferramentas do Clay gastam créditos do workspace Clay do Cliente. Por isso o Clay passa a `writes = true`, com Propor como padrão das Especialidades que o usam, e toda ferramenta do Clay é tratada como escrita ou gasto, mesmo com `readOnlyHint`. Sem regra do Administrador, toda chamada pede Aprovação (ADR-0022). Decisão do usuário em 19/10/2026.

**Blocked by:** nenhum.

**Status:** needs-info (código pronto; falta a decisão sobre o padrão Propor, ver Comments)

- [x] Migration aditiva `20261104120000_clay_gasta_creditos.sql`: `writes = true` para `clay`.
- [ ] `specialty_default_permissions` de `clay` de `ler` para `propor`: espera decisão (conflita com testes antigos, ver Comments).
- [x] pgTAP próprio: `supabase/tests/clay_gasta_creditos.sql` (roda no CI; não houve Postgres local nesta máquina).
- [x] Perfil do Clay com `ferramentasGastam: true`, e `escreve` sempre verdadeiro nas ferramentas do Clay. Teste Deno em `integration-access.test.ts`, vermelho antes da mudança (`buscar` vinha com `escreve: false`).

## Pode mexer
- `supabase/migrations/<novo>_clay_gasta_creditos.sql`, `supabase/tests/clay_gasta_creditos.sql`
- `supabase/functions/_shared/integracoes/perfis.ts` (campo novo), `conectores.ts` (Clay), `_shared/integration-access.ts` (`ferramentaDoMcp`) e os testes deles

## Não mexa
- As Permissões dos Agentes já criados; as funções de Aprovação; outros conectores.

## Comments

**19/10/2026 (agente, branch `conector-clay-funcional`).** O padrão Propor nas Especialidades conflita com a regra "nenhum teste antigo alterado". O seed dos Agentes padrão lê `specialty_default_permissions`, e três pgTAP antigos fixam o Scopus com Clay em Ler: `agentes_e_permissoes.sql:83`, `aprovacoes_reais.sql:61` (a recusa "com a Permissão Ler") e `agentes_e_permissoes.sql:517`. Por isso a migration só liga `writes` e deixa o padrão em Ler, que é o lado mais restritivo: com `ferramentasGastam`, Ler não chama nenhuma ferramenta do Clay, e Propor ou Executar pedem Aprovação a cada chamada, até o Administrador decidir outra regra. **Decisão pendente do usuário:** subir o padrão para Propor (nova migration mais a atualização desses três testes) ou manter Ler.
