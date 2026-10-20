# 01: O Clay conta como Integração que gasta

**What to build:** as ferramentas do Clay gastam créditos do workspace Clay do Cliente. Por isso o Clay passa a `writes = true` (e Propor como padrão das Especialidades que o usam, pendente: ver Comments), e toda ferramenta do Clay é tratada como escrita ou gasto, mesmo com `readOnlyHint`. Sem regra do Administrador, toda chamada pede Aprovação (ADR-0022). Decisão do usuário em 19/10/2026.

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [x] Migration aditiva `20261104120000_clay_gasta_creditos.sql`: `writes = true` para `clay`.
- [x] `specialty_default_permissions` de `clay` de `ler` para `propor` (migration 20261104133000; pgTAP antigos atualizados, ver Comments).
- [x] pgTAP próprio: `supabase/tests/clay_gasta_creditos.sql` (roda no CI; não houve Postgres local nesta máquina).
- [x] Perfil do Clay com `ferramentasGastam: true`, e `escreve` sempre verdadeiro nas ferramentas do Clay. Teste Deno em `integration-access.test.ts`, vermelho antes da mudança (`buscar` vinha com `escreve: false`).

## Pode mexer
- `supabase/migrations/<novo>_clay_gasta_creditos.sql`, `supabase/tests/clay_gasta_creditos.sql`
- `supabase/functions/_shared/integracoes/perfis.ts` (campo novo), `conectores.ts` (Clay), `_shared/integration-access.ts` (`ferramentaDoMcp`) e os testes deles

## Não mexa
- As Permissões dos Agentes já criados; as funções de Aprovação; outros conectores.

## Comments

**19/10/2026 (agente, branch `conector-clay-funcional`).** O padrão Propor nas Especialidades conflita com a regra "nenhum teste antigo alterado". O seed dos Agentes padrão lê `specialty_default_permissions`, e três pgTAP antigos fixam o Scopus com Clay em Ler: `agentes_e_permissoes.sql:83`, `aprovacoes_reais.sql:61` (a recusa "com a Permissão Ler") e `agentes_e_permissoes.sql:517`. Por isso a migration só liga `writes` e deixa o padrão em Ler, que é o lado mais restritivo: com `ferramentasGastam`, Ler não chama nenhuma ferramenta do Clay, e Propor ou Executar pedem Aprovação a cada chamada, até o Administrador decidir outra regra. **Decisão pendente do usuário:** subir o padrão para Propor (nova migration mais a atualização desses três testes) ou manter Ler.

**19/10/2026 (agente), com a autorização do usuário.**
- Migration `20261104133000_clay_padrao_propor.sql`: `specialty_default_permissions` do Clay passa de Ler a Propor. Vale para os Agentes padrão semeados daqui em diante; os existentes não mudam.
- **pgTAP antigos alterados:**
  1. `agentes_e_permissoes.sql:83`: o Scopus agora começa com `clay=propor`. A asserção ficou `'apollo=ler, clay=propor, hubspot=propor, lusha=ler'`, com a descrição citando a migration.
  2. `aprovacoes_reais.sql`, item 2: antes do `throws_ok` "com a Permissão Ler, a ação é recusada", o teste agora põe o Scopus em Ler no Clay (um `update`, como o próprio arquivo já faz para o Apollo). A intenção do teste fica igual.
  3. `clay_gasta_creditos.sql`, que é desta frente, passou a esperar Propor.
- O `agentes_e_permissoes.sql:517`, citado antes, não muda: ele usa uma Permissão do Clay inserida à mão como Ler.
- **PGlite:** `agentes_e_permissoes` 112/112, `aprovacoes_reais` 30/30, `clay_gasta_creditos` 2/2, `permissao_por_ferramenta` 30/30.
