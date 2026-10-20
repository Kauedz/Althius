# 02: Conversas só aparecem disponíveis com o motor dos Agentes no ar

Spec: [../spec.md](../spec.md) (US 3, 4).

**What to build:** com o Hermes como motor, o Workspace operacional só oferece as Conversas quando o worker deu sinal de vida há menos de 2 minutos. Com o motor fora do ar, a página de Agentes e `/conversa` dizem "O motor dos Agentes está fora do ar agora. Tente de novo em alguns minutos." em vez do aviso genérico, e nenhum pedido é guardado para morrer no prazo.

**GATE:** uma migration aditiva com pgTAP, sem aplicar no remoto; sem deploy; sem citar Hermes na tela (ADR-0004); pt-BR.

**Blocked by:** None para o código; o deploy vem depois do 01.

**Status:** ready-for-agent

**Quem faz:** agente de código; Nan publica. **Esforço:** M.

## Pode mexer

- migration nova: tabela privada do sinal de vida do motor e RPC `service_role` para gravar e ler; pgTAP
- `supabase/functions/_hermes-worker/worker.ts` e `main.ts` (gravar o sinal de vida a cada ciclo) e testes Deno novos
- `supabase/functions/agent-conversation/handler.ts` e `index.ts` (capability com relógio injetado e `motivo`) e testes Deno novos
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (`conversasDisponiveis` devolve também o motivo), `fonte/ambiente.ts` (texto), `auth/aplicativo.tsx` (repassar o motivo), testes Vitest novos

## Não mexa

- `conversas-reais.test.tsx` (é do [suite-verde/01](../../suite-verde/issues/01-conversa-coordenada-volta-apos-recarregar.md))
- a Demonstração; as RPCs de Execução (`claim_agent_run` etc.)

## Critérios

- [ ] O worker grava o sinal de vida a cada ciclo de busca (Deno)
- [ ] Capability com Hermes: sinal < 2 min → `available: true`; velho ou ausente → `available: false, motivo: 'motor_fora_do_ar'` (Deno)
- [ ] Sem Hermes: regra de hoje, com `motivo: 'sem_modelo'` quando falso (Deno)
- [ ] A RPC do sinal de vida recusa `authenticated` e `anon` (pgTAP)
- [ ] A tela mostra o texto do motivo; nenhum texto cita fornecedor (Vitest)
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
