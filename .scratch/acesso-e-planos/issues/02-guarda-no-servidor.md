# 02: Guarda no servidor e rodada sempre reservando

**What to build:** `reserve_credits` e as funções de ação paga exigem contrato ativo ou `unlimited_credits`; a rodada de Agente passa a sempre reservar.

**GATE:** redefinir só a partir da definição mais recente na `main` (`reserve_credits`, `request_account_rescan`, `quote_reveal_contact`: `20261015170000`). Nenhuma Edge Function de conector. Sem apagar dado.

**Blocked by:** 01.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016110000_guarda_de_contrato.sql`
- Testes pgTAP antigos que reservavam sem contrato (só a preparação e o que depende de `credits_enforced = false`)

## Não mexa
- `begin_*` (continuam traduzindo a recusa em `no_credits`). Lógica de preço.

## Critérios
- [x] Sem contrato ativo, `reserve_credits` recusa com `insufficient credits` (`P0001`, hint `contract`); com contrato ou ilimitado, segue.
- [x] `request_account_rescan` e `quote_reveal_contact` respeitam a mesma guarda.
- [x] `private.credits_enforced` devolve sempre verdadeiro; `begin_agent_round`, `claim_agent_run` e a proposta de resposta reservam sempre.
- [x] Contrato suspenso ou encerrado recusa; `starts_at` no futuro recusa.
