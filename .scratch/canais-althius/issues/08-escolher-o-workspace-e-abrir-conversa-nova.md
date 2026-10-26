# 08: Escolher o Workspace e abrir uma Conversa nova

**What to build:** Lista numerada, último lembrado, "trocar de workspace", "nova conversa", virada depois de 4 horas, prefixo com o nome do Workspace. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 07.

**Status:** ready-for-human

- [x] Comandos sem IA
- [x] Escolha sem Crédito
- [x] pgTAP e Deno

## Comments

### 2026-10-24

Troca de Workspace e `nova conversa` são comandos do handler, sem abrir Execução; a troca força Conversa nova e a flag continua ativa se a abertura for recusada. A resposta e respostas pendentes usam o nome do Workspace original no prefixo. O corte após quatro horas já existia em `start_channel_run` e foi coberto por pgTAP. A escolha não lança Créditos. Os três critérios foram verificados nos testes Deno e pgTAP. `deno test supabase/functions` passou (1.811 aprovados, 39 ignorados), `deno check supabase/functions/*/index.ts`, lint, TypeScript, Vitest (1.952 aprovados, 4 ignorados) e a suíte pgTAP completa passaram. Migration nova `20261122130800_prefixo_workspace_na_conversa_whatsapp.sql`; não aplicada remotamente.
