# 08: Retirar o agente único do servidor

**Status:** needs-hermes

**Hermes:** sim (tira a Edge Function `agente` do ar)

**Blocked by:** 01 (nenhuma tela chama mais a função `agente`)

**Decisões:** ADR-0034, decisão 2.

## O que construir

Com a tela retirada no 01, o agente único (Fase 3a e o que veio em cima: Fase 4a, 7c, 7d) não tem mais quem o chame.

- Remover `supabase/functions/agente/` e `supabase/functions/_shared/agente/` (inclui `ferramentas.ts` com `ler_icp`, `salvar_icp` e `ler_site_para_icp`, `ferramenta-icp-do-crm.ts` e `ferramentas-de-conta-e-sinal.ts`), com os testes e a entrada em `supabase/config.toml`.
- `_shared/icp-do-crm/*` (#335): só era importado por `ferramenta-icp-do-crm.ts`. Remover também, conferindo antes com `git grep`.
- `_hermes-worker/sinais-ia.ts`: o roteamento de `purpose = 'agente'` pode ficar (fica ocioso) ou sair; não confundir com `reserva.kind === 'agente'`, que é a Conversa de um dos 4 Agentes e **fica**.
- **Sem migration.** As tabelas `private.agente_*`, as RPCs `agente_*` e `enqueue_agente_llm_request` ficam no banco sem uso.

## Pode mexer

- `supabase/functions/agente/`, `supabase/functions/_shared/agente/`, `supabase/functions/_shared/icp-do-crm/`, `supabase/config.toml`, `supabase/functions/README.md`.
- `supabase/functions/_hermes-worker/sinais-ia.ts` só no ramo `purpose = 'agente'`.

## Não mexa

- `_shared/integracoes/perfis.ts` (#337) e `account-enrichment` (#342).
- `supabase/functions/account-fit-explanation/` (continua publicada).
- Migrations. Arquivos do Kauê.

## Critérios

- [ ] Nenhum arquivo fora das pastas removidas importa `_shared/agente/` ou `_shared/icp-do-crm/`. (`deno check` de todas as funções.)
- [ ] `deno test` verde, incluindo `_hermes-worker`.

## Passos do Nan

1. Depois do merge, tirar a função do ar: `supabase functions delete agente --project-ref ycbdilsmydvzezhlymty`. A IA que executar o ticket confirma o comando e entrega pronto para o PowerShell.
