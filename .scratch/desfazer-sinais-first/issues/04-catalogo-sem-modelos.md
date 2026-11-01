# 04: Catálogo sem Modelos e sem "Para o seu nicho"

**Status:** ready-for-human

**Hermes:** não

**Blocked by:** 01 (o composer deixa de mandar `origem: 'composer'` para `/sinais/novo` lá)

**Decisões:** ADR-0034, decisões 3 e 4.

## O que construir

- `pagina-sinais.tsx` e `vitrine.ts`: a prateleira "Para o seu nicho" volta a sair de `nichoDoWorkspace(segmentos)` (Segmentos do ICP da Memória) e `montarPrateleiras({nicho})`, como em `git show d73ba30e^1:`. Saem `icpDoWorkspace` e `catalogoParaIcp`.
- `briefing.tsx`: sai o caminho `?modelo=` (Plano-semente) e os botões "Usar o Modelo" do #320; fica "Pedir à equipe Althius". O Briefing volta a montar o Plano só pelo `signal-plan`. O que o #322 trouxe (escopo mercado) fica.
- `vitrine-pecas.tsx`, `catalogo-visivel.ts`, `estado.tsx`, `pedido-de-sinal.tsx`: o card do catálogo volta a abrir o formulário/Briefing do tipo, sem Plano-semente. Sai o renomear Sinal pela interface e a separação "Meus Sinais" × "Modelos" volta ao que era antes do #309.
- `fonte/supabase-sinais.ts`, `simulada-sinais.ts`, `sinais-tipos.ts`, `plano-do-sinal.ts`: saem `listarModelos`, `cotarPlanoSemente`, `renomear`, `catalogoParaIcp`, `icpDoWorkspace`. O `save_signal_plan` continua sendo chamado com `p_created_via = 'sinais_novo'` (o banco não muda).
- **Sem migration.** As colunas e funções de Modelos ficam no banco (o #322 depende delas). Os 2 gatilhos `refresh_signal_model_seed*` continuam: são baratos e só rodam quando o catálogo muda.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/*` e `fonte/{supabase-sinais,simulada-sinais,sinais-tipos,plano-do-sinal}.ts`, com os testes (`vitrine.test.ts`, `modelo-no-briefing.test.tsx`, `pedido-vira-modelo.test.tsx`, `pagina-sinais-reorganizada.test.tsx`, `plano-no-supabase.test.ts`, `supabase-sinais.test.ts`).
- `e2e/tests/03-para-o-seu-nicho.spec.ts`.

## Não mexa

- Migrations e Edge Functions.
- O fluxo do Sinal de mercado (#322) e o extrato por Sinal (#326).
- `composer.tsx` e `agentes.tsx` (tickets 01 e 02).

## Critérios

- [x] "Para o seu nicho" usa os Segmentos do ICP da Memória e não chama `list_signal_catalog_for_my_icp`. (Vitest `vitrine.test.ts` e `sinais-internos-reais.test.tsx`; smoke `03-para-o-seu-nicho`.)
- [x] Abrir um card do catálogo leva ao Briefing do tipo, sem Plano-semente nem "Usar o Modelo". (Vitest `sinais-internos-reais.test.tsx`: os cards abrem `/sinais/tipos/<id>` e nenhum link tem `modelo=`.)
- [x] Criar um Sinal por `/sinais/novo`, incluindo um Sinal de mercado, continua funcionando e grava `created_via = 'sinais_novo'`. (Vitest `plano-no-supabase.test.ts`: a chamada não manda `p_created_via`, e o banco tem uma só `save_signal_plan`, com padrão `'sinais_novo'`.)
- [x] Nenhuma tela oferece renomear Sinal. (Vitest `sinais-internos-reais.test.tsx`.)
