# 02: Conversas só aparecem disponíveis com o motor dos Agentes no ar

Spec: [../spec.md](../spec.md) (US 3, 4).

**What to build:** com o Hermes como motor, o Workspace operacional só oferece as Conversas quando o worker deu sinal de vida há menos de 2 minutos. Com o motor fora do ar, a página de Agentes e `/conversa` dizem "O motor dos Agentes está fora do ar agora. Tente de novo em alguns minutos." em vez do aviso genérico, e nenhum pedido é guardado para morrer no prazo.

**GATE:** uma migration aditiva com pgTAP, sem aplicar no remoto; sem deploy; sem citar Hermes na tela (ADR-0004); pt-BR.

**Blocked by:** None para o código; o deploy vem depois do 01.

**Status:** ready-for-human

**Quem faz:** agente de código; Nan publica. **Esforço:** M.

## Pode mexer

- migration nova: tabela privada do sinal de vida do motor e RPC `service_role` para gravar e ler; pgTAP
- `supabase/functions/_hermes-worker/worker.ts` e `main.ts` (gravar o sinal de vida a cada ciclo) e testes Deno novos
- `supabase/functions/agent-conversation/handler.ts` e `index.ts` (capability com relógio injetado e `motivo`) e testes Deno novos
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (`conversasDisponiveis` devolve também o motivo), `fonte/ambiente.ts` (texto), `auth/aplicativo.tsx` (repassar o motivo), testes Vitest novos

- Autorização da matriz (CTO em nome do Renan, 2026-10-24): `projeto-althius-frontend/src/fonte/contexto.tsx`, `src/components/modulo-indisponivel.tsx` e, se necessário, `src/fonte/composicao.ts`, somente para passar/exibir motivo sem fornecedor e sem mudar a Demonstração.
- `supabase/functions/agent-conversation/handler.test.ts`: SOMENTE incluir `motivo: 'sem_modelo'` na expectativa `{ available: false }`, sem remover/afrouxar outras asserções.

## Não mexa

- `conversas-reais.test.tsx` (é do [suite-verde/01](../../suite-verde/issues/01-conversa-coordenada-volta-apos-recarregar.md))
- a Demonstração; as RPCs de Execução (`claim_agent_run` etc.)

## Critérios

- [x] O worker grava o sinal de vida a cada ciclo de busca (Deno)
- [x] Capability com Hermes: sinal < 2 min → `available: true`; velho ou ausente → `available: false, motivo: 'motor_fora_do_ar'` (Deno)
- [x] Sem Hermes: regra de hoje, com `motivo: 'sem_modelo'` quando falso (Deno)
- [x] A RPC do sinal de vida recusa `authenticated` e `anon` (pgTAP)
- [x] A tela mostra o texto do motivo; nenhum texto cita fornecedor (Vitest)
- [ ] lint, `tsc -b`, vitest, `deno test supabase/functions` e pgTAP verdes

## Como testar

- `deno test --allow-all supabase/functions/agent-conversation supabase/functions/_hermes-worker`
- `npx vitest run --maxWorkers=2 src/fonte src/paginas/agentes*`
- `supabase test db` (CI Banco)

## Evidência (auditoria, vertical B)

- `handler.ts:174` responde `available` sem olhar o worker; `index.ts:187` com Hermes, `executar` é `() => Promise.resolve()`.
- Auditoria (INFERÊNCIA): com capability true e worker offline, as Execuções ficam na fila até o prazo (~10 min).
- O worker hoje só roda na máquina do Nan (contexto do Renan).

## Passos do Nan

- Aplicar a migration, publicar `agent-conversation`, atualizar e reiniciar o worker; desligar o worker e conferir o aviso em até 2 minutos; religar e conferir o composer.

## Comments

- 2026-10-17, decisão do Renan (dúvida 3 da fila): com o worker do Hermes fora do ar, as Conversas ficam indisponíveis com aviso, como proposto. Não aceitar nem enfileirar pedido.

- 2026-10-24, Ralph/Codex (parcial, needs-info): backend implementado no worktree, sem commit/push/deploy/worker ligado nem aplicação remota. Migration nova `20261121140000_sinal_de_vida_do_motor.sql`; heartbeat após saúde do motor, capability com relógio injetado e recusa antes de guardar pedidos (inclui CRM). Vermelhos reproduzidos no handler, worker e pgTAP antes das correções. Deno novos: 9/9; check do handler/worker e testes novos verde; pgTAP próprio 10/10; suíte pgTAP completa 154 arquivos, 5.471 assertivas verdes. Frontend atual: Vitest 74 arquivos/468 testes verdes; oxlint sem erros (avisos preexistentes); `npx tsc -b` verde. Deno completo/entrypoints bloqueados por dependências locais ausentes/cache sem escrita. AC de frontend ainda pendente: aviso passa por `fonte/contexto.tsx` e `components/modulo-indisponivel.tsx`, fora do Pode mexer; autorização solicitada e ainda sem resposta. Revisão também identificou expectativa antiga em `agent-conversation/handler.test.ts` incompatível com o novo motivo; arquivo mantido intacto e exceção pontual solicitada. Rascunho externo em `/workspace/ralph-wt/_pr/conversas-02.md`; continuidade em `.scratch/handoffs/conversas-02.md`.

- 2026-10-24, matriz (CTO em nome do Renan), autorização na retomada: ampliação pontual do Pode mexer registrada acima. Permanecem proibidos conversas-reais.test.tsx, Sinais, arquivos do Kauê, migrations antigas, deploy, ligar worker e remoto. Git somente leitura; Deno apenas testes tocados com --cached-only; suíte completa será rodada pela matriz fora do sandbox. Interfaces Vitest autorizadas: capability da Fonte e aviso em Agentes e /conversa, vermelho antes da implementação.

- 2026-10-24, retomada concluída: autorização aplicada; motivo transportado Fonte → aplicativo → composição → contexto → aviso. Agentes e `/conversa` mostram exatamente o texto do AC para `motor_fora_do_ar`, sem fornecedor, sem composer e sem a explicação incorreta de módulo não conectado. `sem_modelo` e motivo ausente mantêm aviso genérico. Sem polling, conforme Implementation Decisions/Out of Scope da spec (a sugestão do handoff anterior não se aplica). A Fonte oferece leitura detalhada com segundo argumento `true`, preservando consumidores booleanos existentes e seus testes sem edição. Demonstração e Sinais intactos.
- Evidências desta retomada: `/tmp/c02-frontend-red.log` (2 falhas pelo texto ausente) → `/tmp/c02-frontend-green.log` (2/2); Vitest de `src/fonte/supabase-conversas.test.ts`, `src/paginas/agentes*` e `src/auth`: 8 arquivos/77 testes verdes (`/tmp/c02-vitest-retomada.log`); novo teste da Fonte: 5/5 (`/tmp/c02-fonte-retomada.log`). Oxlint exit 0, somente avisos; `tsc -b` exit 0. Deno heartbeat tocados com `--cached-only`: 9/9. `handler.test.ts` alterado estritamente na expectativa autorizada; execução cached-only bloqueada por `jsr:@std/assert@1` ausente (`/tmp/c02-deno-tocados.log`). Suíte Deno completa fica com a matriz fora do sandbox por instrução expressa; AC agregado continua desmarcado até essa verificação. pgTAP anterior preservado, sem mudanças SQL nesta retomada.
- Revisão local do diff: nenhuma alteração extra em testes antigos; nenhuma mudança nos caminhos proibidos; `git diff --check` verde. Sem commit, remoto, deploy ou worker iniciado. Próximos responsáveis: matriz valida Deno completo e captura visual; Nan aplica/publica só depois das verificações. Comandos PowerShell e migration pendente no rascunho `/workspace/ralph-wt/_pr/conversas-02.md`.

- 2026-10-24, correção da revisão cruzada (base `0c90182`): reproduzido com Deno vermelho primeiro o sinal vencendo aos 150s simulados enquanto uma execução continua pendente: capability devolvia `available: false, motivo: motor_fora_do_ar` (117 passaram/1 falhou, `/tmp/c02-correcao-red.log`). Correção em `worker.ts`: temporizador injetável renova a cada 30s durante toda a rodada, somente após saúde confirmada; sem consultas sobrepostas, falhas periódicas registradas e temporizador cancelado em `finally`, aguardando renovação em andamento. Teste novo usa relógio/temporizador injetados, sem sleep real: execução pendente >120s mantém capability disponível, motor sem saúde deixa sinal expirar, recuperação volta a disponibilizar e término cancela temporizador. Comando exato solicitado `deno test --cached-only --allow-all supabase/functions/_hermes-worker supabase/functions/agent-conversation`: **118 passaram/0 falharam** (`/tmp/c02-correcao-green.log`). `git diff --check` verde. Matriz informou antes desta correção Deno completo 1832/1832 e pgTAP novo 10/10 fora do sandbox; não repetidos aqui. Ticket/handoff/rascunho externo atualizados. Sem commit (git só leitura), remoto, deploy, aplicação SQL ou Hermes ligado; proibições preservadas. Nan mantém os Passos do Nan após CI, como documentado no rascunho.
