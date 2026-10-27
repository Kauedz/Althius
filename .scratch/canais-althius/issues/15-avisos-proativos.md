# 15: Avisos proativos

**What to build:** `channel_notices` (Proposta de resposta, Aprovação pendente, Rotina terminada, Sinal novo, Sequência retida, Créditos baixos). Opt-in por tipo, 09h–21h, agrupados, máx. 10/dia. Fora da janela, template de utilidade (R$ 0,035). Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 09.

**Status:** ready-for-human

- [x] PARAR desliga na hora
- [x] Sem Crédito
- [x] pgTAP e Deno
- [ ] Aprovar o template de utilidade `althius_aviso_proativo` no WhatsApp Manager (pendente verificação humana)

## Comments

### 2026-10-25

A migration `20261215104000_avisos_proativos_whatsapp.sql` criou a fila privada, agrupamento, janela local das 09h às 21h, intervalo mínimo de 30 minutos, limite de 10 entregas diárias, opt-in por tipo, deduplicação dos eventos de origem, gatilhos das seis categorias e drenagem pelo `canal-delivery`. `PARAR` bloqueia novos avisos pela preferência persistida. O endpoint usa texto de serviço dentro da janela de 24 h e template sem parâmetros fora dela; uma falha libera a fila para nova tentativa. Avisos não geram lançamentos de Crédito.

Como os documentos não definem um limiar numérico para “Créditos baixos”, o gatilho avisa na transição do saldo disponível para zero, sem inventar uma faixa de alerta. O template precisa de aprovação humana antes de qualquer uso com a Meta.

Verificação: pgTAP focado (18/18), suíte pgTAP completa, `deno test -A` em `supabase/functions` (1.903 testes, 0 falhas) e `deno check supabase/functions/canal-delivery/index.ts`. Tudo rodou com o simulador; sem chamada real, aplicação de migration ou deploy.
