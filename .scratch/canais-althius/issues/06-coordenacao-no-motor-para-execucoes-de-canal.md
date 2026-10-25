# 06: Coordenação no motor para Execuções de Canal

**What to build:** Execuções `canal` de origem `whatsapp` entram na Coordenação com os Agentes filtrados pela lista de canais. O Slack continua com um Agente por fio. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** None.

**Status:** ready-for-human

- [x] Origem `whatsapp` aceita (migração aditiva)
- [x] Ponte `agent-conversation` e worker do Hermes
- [x] Testes do Slack verdes

## Comments

### 2026-10-24 — Codex

- Incluída a origem `whatsapp` na constraint de origem das Conversas e no payload de `claim_agent_run`; as Execuções WhatsApp carregam somente Agentes com `whatsapp` em `agent_settings.channels`.
- A ponte `agent-conversation` e o worker Hermes mantêm o filtro de Agente único apenas para o Slack. WhatsApp preserva a Coordenação e as Menções da reserva.
- AC verificados: origem aceita e Agentes filtrados cobertos por migration/pgTAP; ponte e worker cobertos por Deno; a suíte Deno completa validou Slack; pgTAP completo passou.
- Testes: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca06`; `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` (1.798 passed, 0 failed, 39 ignored); frontend `npm run lint` e `npx tsc -b`.
- A migration não foi aplicada no Supabase remoto. Alterações ficaram sem commit conforme a regra de git do worktree.
