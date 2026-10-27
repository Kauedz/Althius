# 17: Segurança operacional

**What to build:** Rate limit por número e por Workspace, teto para números desconhecidos, e-mail de telefone recém-verificado, suspensão por 30 dias sem login aplicada no handler. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 07.

**Status:** ready-for-human

- [x] Limites configuráveis
- [x] Atividade sem texto
- [x] Deno e pgTAP


## Comments

### 2026-10-24

Implementados limites por número (20 mensagens em 10 minutos e 200 por dia) e por Workspace (20 Execuções por hora no padrão), configuráveis por RPC restrita ao backend; o teto de desconhecidos segue uma resposta por número por dia. O handler grava na Atividade o resultado e o hash da mensagem, sem texto. E-mail após verificação e suspensão após 30 dias já existiam nos fluxos de verificação/identidade e foram conferidos.

Testes: `deno check supabase/functions/*/index.ts`, `deno test supabase/functions`, pgTAP focado e suíte completa pgTAP. Migration nova `20261122131700_seguranca_operacional_whatsapp.sql`; não aplicada remotamente.
