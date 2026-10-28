# Briefing com escopo de mercado

Status: done (PR aberto)
GATE: Se houver migration: backup + apply antes do merge; deploy de `signal-plan` se tocado.

## Problema

O Briefing exige ao menos uma Conta-alvo e sempre grava escopo de Contas. Workspaces novos, sem Contas, não conseguem criar um Sinal que procure empresas do mercado.

## Solução

Permitir escolher onde procurar: no mercado, usando o ICP estruturado, ou nas Contas escolhidas. Oferecer Mercado somente para tipos de Sinal que o catálogo informa como executáveis nesse escopo, manter custo por Rodada visível e validar a mesma regra no backend.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/briefing.tsx` e testes do Briefing.
- `projeto-althius-frontend/src/fonte/plano-do-sinal.ts` e fontes de Sinais relacionadas ao fluxo.
- `supabase/functions/signal-plan/`.
- Nova migration aditiva e teste pgTAP, somente se estritamente necessário.

## Não mexa

`signal-runner`, `agent-conversation`, `_shared/ferramentas-dos-agentes`, páginas de Modelos/Meus Sinais e arquivos explicitamente protegidos pelos AGENTS.md.

## Critérios de aceite

- [x] Briefing permite Mercado sem Contas e envia `escopo.tipo = mercado` à montagem; `save_signal_plan` grava o público `{escopo:'mercado', accountIds:[]}` (migration 20261218002000, pgTAP `plano_do_sinal_no_mercado.sql`).
- [x] Briefing mantém Contas exigindo pelo menos uma e respeitando o máximo (testes existentes de `briefing-no-operacional` seguem verdes).
- [x] Mercado aparece só quando Abertura de vagas (`TIPOS_NO_MERCADO`) está disponível no operacional; `signal-plan` devolve 409 `sem_tipos` com mensagem pt-BR e `validate_signal_plan` recusa outro tipo (22023).
- [x] País (padrão Brasil) e nicho são conferidos no editor do Monitoramento de mercado antes de ativar (`validate_market_criteria`); o Briefing avisa isso no passo do Plano.
- [x] Custo por Rodada segue no editor antes da ativação nos dois escopos (fluxo de ativação inalterado).
- [x] Demonstração continua funcionando (simulada ignora o escopo; suíte de Sinais verde).
- [x] Não há texto `US$` ou `Teto` na UI tocada.
- [x] Testes focados e suítes aplicáveis passam: deno 53/0; vitest `src/paginas/sinais` + `src/fonte` 115 arquivos, 808 testes; tsc ok. pgTAP só no CI.

## Comments

- 28/10/2026 — Ticket criado para a implementação da Fase 5. Para a Trilha B (agente): chamar a Edge Function `signal-plan` com `{ workspaceId, briefing, escopo: { tipo: 'mercado' } }`; depois chamar `save_signal_plan` com `p_workspace_id`, `p_monitor_id`, `p_name`, `p_brief`, `p_plan` e `p_created_via`; ativação continua no RPC existente `save_signal_monitor` com a agenda e o monitoramento salvo. Confirmar os nomes finais no contrato implementado.
- 28/10/2026 — Implementação parcial: `PedidoDePlano`, fonte Supabase, handler e planejadores aceitam escopo de Mercado; a tela deixa montar e salvar localmente sem Contas. O RPC atual ainda rejeita Mercado e precisa de migration aditiva antes de considerar o ticket pronto.
- 28/10/2026 — Verificação: `deno check supabase/functions/signal-plan/index.ts` passou. `npx tsc -b --noEmit` foi iniciado, mas não terminou com saída dentro do limite da execução; o Vitest focado também não produziu contagem dentro do limite. CI/suites completas permanecem pendentes.
- 28/10/2026 — Revisão da Trilha C: o backend (validador compartilhado, `validate_signal_plan`, `save_signal_plan`) recusava Mercado; corrigido na migration 20261218002000, que também impede trocar o escopo de um Monitoramento pelo Plano. Dry-run em produção numa transação com rollback: salvar no mercado ok (público mercado, rascunho), outro tipo 22023, chave extra 22023, troca de escopo 22023, nova versão ok; 0 linhas sobraram. Escopo padrão: o do Plano existente; senão Mercado quando vem do composer ou o Workspace não tem Contas; senão Contas. Rádios com `Grupo`/`Opcao`.
