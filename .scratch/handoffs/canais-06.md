# Handoff — canais 06

## Estado

Implementação do ticket `.scratch/canais-althius/issues/06-coordenacao-no-motor-para-execucoes-de-canal.md` concluída e validada. As alterações estão no worktree `ralph/canais-06-coordenacao-no-motor-para-execucoes-d`; por regra do runner, não foram adicionadas nem commitadas. Não aplicar migration remota e não publicar nesta etapa.

## O que mudou

- Nova migration `supabase/migrations/20261122130600_coordenacao_whatsapp_no_motor.sql`: inclui `whatsapp` nas origens de Conversa e atualiza `claim_agent_run` para transportar a origem e retornar apenas Agentes configurados para WhatsApp quando a origem for WhatsApp.
- `agent-conversation` e Hermes restringem a regra de um Agente por fio ao Slack; o caminho WhatsApp preserva a Coordenação.
- Teste pgTAP próprio e testes Deno de WhatsApp/Slack. Detalhes e evidências no ticket e no diff.
- Corpo do PR em `/workspace/ralph-wt/_pr/canais-06.md`.

## Testes executados

- Red TDD observado nos testes focados, seguido do verde.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca06 supabase/tests/canal_whatsapp_coordenacao.sql`: 3/3.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca06`: suíte completa passou.
- `deno check supabase/functions/*/index.ts`: passou.
- `deno test supabase/functions`: 1.798 passed, 0 failed, 39 ignored.
- Frontend `npm run lint` e `npx tsc -b`: passaram; lint reportou avisos preexistentes.

## Decisões de processo

- Test seams pré-confirmados pela instrução headless: contrato de reserva/origem nos motores e teste pgTAP da migration.
- Nenhum arquivo de Sequência ou Sinais foi editado.
- Revisão Standards: sem violações documentadas; a observação sobre teste SQL acoplado à implementação foi corrigida com um teste comportamental de `claim_agent_run`.
- Revisão Spec: sem achados após a cobertura comportamental do filtro de canais.
- Guardrail do worktree proíbe `git add` e `git commit`, sobrepondo a etapa de commit da skill.

## Próxima sessão

A matriz pode adicionar e commitar as alterações e abrir o PR conforme o fluxo do repositório. A revisão final já foi feita contra a base empilhada e o ticket. Não trabalhar em outro ticket desta fila.

## Suggested skills

- `code-review` para revisar o diff final contra a branch base e o ticket 06.
- `pr` para formatar o corpo do PR se ele precisar de ajustes.
