# 07: Banco sem o ICP estruturado

**Status:** ready-for-agent

**Hermes:** não

**Blocked by:** 05, 06 e 08 (nenhum código pode estar chamando o que esta migration remove)

**Decisões:** ADR-0034, decisão 6. Decisão a confirmar: Aderência das empresas achadas por Sinal (padrão recomendado: `sem_dado`).

## O que construir

Uma migration nova, nesta ordem (os gatilhos ficam em tabelas centrais, então saem primeiro):

1. `drop trigger` de `sync_playbook_icp_to_workspace_icp` (em `private.playbook_section_versions`), `refresh_market_discovery_fit` (em `private.discovery_reasons`), `refresh_market_discovery_origin` (em `private.discovered_accounts`) e `refresh_market_discovery_for_icp` (em `private.workspace_icp_versions`).
2. Redefinir, a partir da última definição na `main`:
   - `public.save_my_day0` e `public.create_company_workspace`: sem a chamada a `seed_workspace_icp` e sem o `v_fallback`. Ficam as 3 colunas do mini-ICP em `day0_companies` e a ação `produto`.
   - `public.list_discovered_accounts`: sem o `case … score_market_discovery_icp(...)`, voltando ao comportamento de `20261026100000_feedback_que_ensina.sql` com o que veio depois.
   - `public.get_discovered_account_fit_explanation`: a chave `icp` passa a vir do texto da seção `icp` do Playbook e de `day0_companies.o_que_vende`, ou `null` quando não houver.
3. Empresas achadas por Sinal (`origin = 'sinal'`): `fit_level = 'sem_dado'` e `fit_score = null` (padrão recomendado). É um `update` de dado: **pedir o "sim" do dono do produto antes de aplicar no remoto** (AGENTS.md).
4. `drop function` de `get_my_workspace_icp`, `save_my_workspace_icp_fields`, `list_signal_catalog_for_my_icp`, `seed_workspace_icp`, `sync_playbook_icp_to_workspace_icp`, `score_market_discovery_icp`, `refresh_market_discovery_*`, `normalize_icp_field`, `icp_sector_matches` e `normalize_sector_text` (os dois últimos só eram usados pela pontuação; conferir com `git grep` antes).
5. `private.workspace_icp_versions` **fica** (só leitura, sem uso). Não apagar.

## Pode mexer

- Uma migration nova e o pgTAP dela (`supabase/tests/sem_icp_estruturado.sql`).
- Remover os pgTAP que testam só o que saiu: `icp_estruturado_unico.sql`, `catalogo_ranqueado_pelo_icp.sql`, `aderencia_candidatas_sinais_mercado.sql`, `campos_estruturados_do_icp.sql`, `aderencia_setor_declarado.sql`. Ajustar `aderencia_explicada.sql` à nova chave `icp`.

## Não mexa

- Migrations já aplicadas.
- `private.workspace_icp_versions`, `day0_companies` e qualquer linha que não seja o `fit_level`/`fit_score` de `origin = 'sinal'`.
- Funções de Sequência e da cadência.

## Critérios

- [ ] Inserir uma versão do Playbook `icp` não grava nada em `workspace_icp_versions`. (pgTAP.)
- [ ] Criar Workspace e salvar o mini-ICP no Day0 funcionam e gravam os 3 campos. (pgTAP.)
- [ ] `list_discovered_accounts` devolve `sem_dado` para `origin = 'sinal'` e o mesmo de antes para as demais. (pgTAP.)
- [ ] A explicação da Aderência traz o ICP do Playbook. (pgTAP.)
- [ ] `supabase db reset && supabase test db` verde três vezes seguidas.

## Passos do Nan

1. Confirmar no chat a decisão sobre a Aderência de `origin = 'sinal'` antes de aplicar.
2. A migration é aplicada pela IA no remoto seguindo `docs/agents/migrations.md`, depois do CI verde e do "sim" do passo 1.
