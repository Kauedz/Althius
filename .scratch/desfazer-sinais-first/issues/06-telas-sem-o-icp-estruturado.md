# 06: Telas sem o ICP estruturado

**Status:** ready-for-agent

**Hermes:** não

**Blocked by:** 04 (os dois mexem em `fonte/supabase-sinais.ts`)

**Decisões:** ADR-0034, decisão 6. Decisão a confirmar: ler o site para sugerir o mini-ICP (padrão recomendado: manter, só com os 3 campos).

## O que construir

- **Onboarding** (`checklist.tsx`, `day0-operacional.tsx`, `icp-do-day0.tsx`, `fonte/supabase-onboarding.ts`, `onboarding-tipos.ts`, `simulada-onboarding.ts`, `indisponivel.ts`, `regras-onboarding.ts`): o mini-ICP continua com os 3 campos (o que vende, para quem, por que compram), salvo por `save_my_day0` (ação `produto`). Saem Setor, Porte e Região, `lerIcp` (`get_my_workspace_icp`) e `salvarProduto` via `save_my_workspace_icp_fields`. A sugestão pelo site (`icp-site-read`) fica, só para os 3 campos.
- **Playbook** (`secao-playbook.tsx`, `fonte/supabase-playbook.ts`, `playbook-tipos.ts`, `simulada-playbook.ts`): saem os blocos `CamposDoIcp` e `MaisDoIcp` e os métodos `camposDoIcp`/`salvarCamposDoIcp`. A seção `icp` volta a ser só o editor do Playbook, aprovado pela Revisão como sempre.
- `fonte/campos-do-icp.ts`: `PORTES_DO_ICP` vai para `fonte/opcoes-da-busca.ts` (usado por `descobertas.tsx`, #316/#328/#332). O resto do arquivo sai.
- **e2e:** `e2e/support/global-setup.ts` e `fixture-icp.ts` passam a semear o ICP de QA pela seção `icp` do Playbook. `e2e/tests/02-day0-icp.spec.ts` deixa de afirmar Setor, Porte e Região.

## Pode mexer

- Os arquivos acima e os testes deles (`campos-do-icp.test.ts`, `supabase-onboarding.test.ts`, `supabase-playbook.test.ts`, `regras-onboarding.test.ts`, `playbook.test.tsx`, `day0-operacional.test.tsx`, `onboarding.test.tsx`).
- `paginas/descobertas.tsx` só para trocar o import de `PORTES_DO_ICP`.
- `supabase/functions/icp-site-read/handler.ts` só para parar de sugerir Setor, Porte e Região, com o teste e o README.
- `e2e/support/*`, `e2e/tests/02-day0-icp.spec.ts`, `e2e/README.md`.

## Não mexa

- Migrations (ticket 07). `paginas/sinais/*` (ticket 04).
- Arquivos do Kauê.

## Critérios

- [ ] O onboarding pergunta e salva os 3 campos do mini-ICP, sem Setor, Porte e Região. (Vitest `day0-operacional.test.tsx`, `supabase-onboarding.test.ts`.)
- [ ] O Playbook não mostra os campos estruturados do ICP; editar a seção `icp` continua passando pela Revisão. (Vitest `playbook.test.tsx`.)
- [ ] Nenhum arquivo do frontend chama `get_my_workspace_icp` nem `save_my_workspace_icp_fields`. (`git grep` no PR.)
- [ ] O filtro de Porte em Descobertas continua igual. (Vitest.)
- [ ] O `global-setup` do e2e semeia o ICP pelo Playbook e os smokes passam.
