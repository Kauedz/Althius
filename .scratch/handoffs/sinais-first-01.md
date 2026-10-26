# Handoff — sinais-first-01: ICP estruturado único

## Estado

`BLOCKED`: o ticket `.scratch/sinais-first/issues/01-icp-estruturado-unico.md` exige semear o ICP estruturado a partir de `MiniIcpEProduto` quando esse mini-ICP existir. No caminho operacional atual, esses dados não são persistidos nem chegam à criação do Workspace.

## O que foi conferido

- Branch: `ralph/sinais-first-01-icp-estruturado-unico`.
- A branch contém somente o commit base `d8dcd00 docs(sinais-first): ADR-0033, spec e 15 tickets da frente Sinais first` sobre `main`; o `Blocked by` do ticket é nenhum.
- O ticket e a spec estão completos para este gate, e a ADR-0033 está aceita. Nenhum código foi alterado e nenhum teste foi executado.
- `MiniIcpEProduto` está definido em `projeto-althius-frontend/src/fonte/onboarding-tipos.ts`, mas suas operações de gravação existem apenas na fonte simulada `simulada-onboarding.ts`.
- `criarFonteDeOnboardingSupabase` em `projeto-althius-frontend/src/fonte/supabase-onboarding.ts` retorna `miniIcp`, `oQueVende` e `porQueCompram` vazios. A migration `20261121130000_day0_operacional.sql` persiste Day0, não os campos de produto/ICP.
- `public.create_company_workspace(text, uuid)` em `supabase/migrations/20260928111628_workspace_da_empresa.sql` recebe apenas nome e chave idempotente. Não há outro caminho encontrado que transporte os campos de `MiniIcpEProduto` para a criação do Workspace.
- A seção `icp` do Playbook atual é versionada em `private.playbook_section_versions`; qualquer uso como fonte alternativa precisa preservar a exigência de tabela nova do ticket e de uma única fonte de verdade.

## O que falta para retomar

Definir/implementar, antes ou junto deste ticket, um caminho operacional já autorizado para persistir e disponibilizar `MiniIcpEProduto` ao semeador na criação do Workspace, ou esclarecer que a semeadura pode usar somente a seção existente do Playbook neste momento. Não escolher esse comportamento por conta própria: altera a origem de dados definida no critério do ticket.

## Próxima sessão

Retomar este mesmo ticket e branch depois que a fonte operacional estiver definida. Não começar outro ticket. Então fazer TDD com pgTAP na fronteira de leitura autenticada e isolamento por Workspace, implementar somente o escopo do ticket, rodar a suíte local indicada no ticket, revisar `git diff BASE...HEAD` e atualizar o ticket com resultados verificados.

## Skills sugeridas

- `implement`
- `tdd`
- `code-review`
- `handoff`

## Observação de git

O handoff foi salvo no repositório conforme solicitado. Nenhum `git add` ou `git commit` foi executado, conforme o guardrail de sandbox informado para esta sessão.
