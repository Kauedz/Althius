# Retomada concluída — 2026-10-24

Código de frontend concluído e autorização da matriz registrada em Comments/Pode mexer do ticket. Estado anterior abaixo é histórico, substituído por esta seção.

- Fonte com leitura detalhada `conversasDisponiveis(cliente, true)`; mantém retorno booleano sem segundo argumento para compatibilidade com consumidores/testes existentes. Motivos conhecidos são filtrados; falha de rede não inventa motivo.
- Aplicativo, composição, contexto e aviso repassam/exibem o motivo. `motor_fora_do_ar`: texto exato do AC, sem fornecedor/composer/aviso de conexão inicial. Sem modelo mantém genérico. Demonstração intacta. **Sem polling**, exigido pela spec, apesar da sugestão anterior.
- Vitest vermelho primeiro: 2 falhas reais em Agentes e `/conversa`, depois 2 verdes. Validação solicitada: 8 arquivos/77 testes verdes (Fonte existente + agentes* + auth) e 1 arquivo/5 testes novos da Fonte. Logs `/tmp/c02-frontend-{red,green}.log`, `/tmp/c02-vitest-retomada.log`, `/tmp/c02-fonte-retomada.log`.
- Oxlint exit 0 (avisos), tsc -b exit 0; logs `/tmp/c02-{oxlint,tsc}-retomada.log`. Deno heartbeat cached-only 9/9; log `/tmp/c02-deno-heartbeat-retomada.log`. Alteração de handler.test.ts SOMENTE inclui `motivo: 'sem_modelo'` na expectativa exata. Execução desse teste bloqueada por JSR ausente no cache; log `/tmp/c02-deno-tocados.log`.
- AC de frontend marcado; AC agregado permanece aberto. Matriz roda suíte Deno completa fora do sandbox e confere visual; Nan aplica migration e publica após CI. Ticket ready-for-human pelos passos de publicação. Nenhum SQL alterado ou reaplicado nesta retomada; evidências pgTAP anteriores preservadas.
- Rascunho atualizado em `/workspace/ralph-wt/_pr/conversas-02.md`. Nenhum commit, push, deploy, remoto, worker ligado, pkill ou killall. Git somente leitura. Revisão manual do diff e diff --check sem problemas adicionais. Não foi invocada code-review, nem agentes paralelos.

---

# conversas-02 — continuidade (2026-10-24)

Ticket: `.scratch/conversas-pelo-hermes/issues/02-conversas-so-disponiveis-com-o-motor-no-ar.md`.
Branch: `ralph/conversas-02-heartbeat-do-hermes`; base/origin/main `6e384dc`.
Implementação parcial no worktree, sem commits (git somente leitura), push, deploy, worker ligado ou aplicação remota. Migration pendente de apply: sim.

## Próxima ação

Aguardar autorização solicitada para editar os caminhos compartilhados fora do Pode mexer: `projeto-althius-frontend/src/fonte/contexto.tsx` e `src/components/modulo-indisponivel.tsx` (eventualmente `fonte/composicao.ts`, se necessário). Guia `docs/visao-geral-da-plataforma.md` §4.2 exige perguntar antes. Fonte, ambiente e auth estão autorizados pelo ticket, mas não foram alterados para evitar deixar o frontend com contrato incompleto. Exibir o motivo sem citar fornecedor e verificar Agentes e `/conversa` com Vitest novo. Considerar atualização periódica da capability para refletir queda sem reload, sem recriar as fontes a cada consulta sem mudança.

Também aguardar exceção pontual para atualizar `agent-conversation/handler.test.ts`: teste antigo espera exatamente `{ available: false }`; AC novo exige incluir `motivo: 'sem_modelo'`. Nada nesse arquivo foi alterado. A revisão apontou essa incompatibilidade previsível; não considerar suíte completa verde enquanto pendente.

## Evidências e revisão

Ver comentário datado e ACs no ticket e `/workspace/ralph-wt/_pr/conversas-02.md` (rascunho parcial, não commitar/abrir).
Logs temporários: `/tmp/c02-pgtap-red.log`, `/tmp/c02-pgtap-green.log`, `/tmp/c02-pgtap-full.log`, `/tmp/c02-deno-full.log`, `/tmp/c02-deno-check.log`, `/tmp/c02-vitest.log`.
Deno novo: 9 testes passaram com `deno test --cached-only supabase/functions/agent-conversation/heartbeat.test.ts supabase/functions/_hermes-worker/heartbeat.test.ts`; check dos módulos/testes novos passou. Suíte inteira Deno bloqueada: `jsr:@std/assert@1` ausente; check de entrypoints tentou resolver npm, cache `/home/box/.cache/deno` sem escrita. Não buscar serviços remotos para contornar. O primeiro comando Deno tentou JSR automaticamente; depois foram usados comandos cached-only (atenção: npm ainda pode tentar resolver mesmo com essa flag).
pgTAP próprio 10/10, completo 154 arquivos/5.471 assertivas. Frontend atual: 74 arquivos/468 testes verdes; oxlint sem erros, avisos existentes. `npx tsc -b` passou (exit 0).

`git diff origin/main...HEAD` vazio por não haver commits; revisão da skill code-review foi feita em dois agentes sobre diff do worktree + novos arquivos. Standards: expectativa antiga incompatível. Spec: frontend pendente e suíte Deno não validada; backend sem divergência adicional identificada. Repetir revisão após alterações restantes.

## Restrições

Preservar todas as proibições do pedido original; não tocar Sinais/Kauê/CONTEXT.md/conversas-reais.test.tsx nem migrations antigas. Não commitar/push. Node 22: `export PATH=/workspace/tools/node22/bin:$PATH`. Não chamar remoto/ligar worker/deploy. pgTAP: bancos `pgtap_c02` e `pgtap_c02_full`, porta 55432. Chrome não sobe: matriz tira prints depois. Comandos dos Passos do Nan estão no rascunho do PR e são apenas instruções futuras.

## Suggested skills

`tdd` para frontend red-first; `diagnosing-bugs` para cache Deno caso necessário; `code-review` para o diff final; `pr` para atualizar rascunho externo; `handoff` para este documento. Skills lidas diretamente em `.claude/skills/`: ferramenta Skill não estava disponível.
