# 09: Janela de 24 horas e contador de custo

**What to build:** Fora da janela, só template de utilidade sem conteúdo, com o resultado pendente até a pessoa responder. Contador mensal por número de respostas de serviço e templates, alimentado pelo `pricing` dos status: alerta à equipe em 800 respostas, decisão humana em 1.000. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 07.

**Status:** ready-for-human

- [x] Pendentes entregues em ordem antes da mensagem nova
- [x] Custo registrado como da Althius, nunca como Crédito
- [x] Deno com relógio simulado e pgTAP

## Comments

### 2026-10-25

O webhook agora entrega todas as respostas pendentes na ordem antes de tratar a mensagem nova. Os status do WhatsApp alimentam contadores mensais separados de respostas de serviço e templates, usando o timestamp do status, deduplicando cada `message_id` e registrando os alertas quando o total combinado chega a 800 e 1.000. Os alertas são enviados à equipe Althius; em 1.000 o Canal continua enviando. O uso fica em tabelas privadas, sem lançamentos de Crédito.

Verificação: `deno test -A` em `supabase/functions` (1.901 testes, 0 falhas); `deno check supabase/functions/canal-whatsapp-events/index.ts`; pgTAP focado (15/15) e suíte pgTAP completa passaram. Nenhuma chamada à Meta/Resend real, migration aplicada ou deploy.
