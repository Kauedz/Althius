# 05: Servidor lê o ICP do Playbook

**Status:** needs-hermes

**Hermes:** sim (publica de novo `account-discovery`, `signal-plan` e `account-fit-explanation`)

**Blocked by:** nenhum

**Decisões:** ADR-0034, decisão 6.

## O que construir

As Edge Functions param de chamar `get_my_workspace_icp` e voltam a ler o ICP da seção `icp` do Playbook do Workspace (`get_playbook_section('icp')`), mais o mini-ICP do onboarding (`get_my_day0`) quando ajudar.

- `account-discovery` (#316, Fase 1a): sai `lerIcpEstruturado` e `criteriosComIcpEstruturado`; a busca volta a usar `lerIcp` + `criteriosDoIcp`, que já existem e leem o Playbook. `temIcp` e `icpVersion` continuam no retorno, vindos do Playbook. `pontuacao.ts` e `setores.ts` (#319) ficam.
- `signal-plan` (#303, #308): o prompt recebe o texto da seção `icp` do Playbook e o mini-ICP, no lugar do registro estruturado. Sai `icp-nos-criterios.ts` (`completarComIcp`): a geografia não é mais preenchida automaticamente a partir do ICP.
- `account-fit-explanation` (#329): não muda o código; a RPC que ele usa é redefinida no ticket 07. Conferir que `explicacao.ts` aceita `icp: null`.

## Pode mexer

- `supabase/functions/account-discovery/{handler,index}.ts` e `handler.test.ts`.
- `supabase/functions/signal-plan/{handler,index,planejador-por-ia}.ts`, `icp-nos-criterios.ts` (remover) e testes; `signal-plan/README.md`.
- `supabase/functions/account-fit-explanation/*` só para testes.
- `e2e/tests/api/06-signal-plan.spec.ts` (o caso "geografia do ICP vira localizacao" sai).

## Não mexa

- Migrations (ticket 07). `supabase/functions/agente/` e `_shared/agente/` (ticket 08).
- `_shared/icp-do-crm/*` e `_shared/integracoes/perfis.ts`.
- Arquivos do Kauê.

## Critérios

- [ ] Nenhuma das três funções chama `get_my_workspace_icp`. (`git grep` no PR e Deno.)
- [ ] A busca de empresas monta os critérios pelo Playbook `icp`. (Deno `account-discovery/handler.test.ts`.)
- [ ] O Plano do Sinal recebe o ICP do Playbook no prompt. (Deno `signal-plan/handler.test.ts`.)

## Passos do Nan

1. Depois do merge, publicar `account-discovery`, `signal-plan` e `account-fit-explanation`. A IA que executar o ticket entrega os comandos prontos para o PowerShell.
