# 09: Janela de 24 horas e contador de custo

**What to build:** Fora da janela, só template de utilidade sem conteúdo, com o resultado pendente até a pessoa responder. Contador mensal por número de respostas de serviço e templates, alimentado pelo `pricing` dos status: alerta à equipe em 800 respostas, decisão humana em 1.000. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] Pendentes entregues em ordem antes da mensagem nova
- [ ] Custo registrado como da Althius, nunca como Crédito
- [ ] Deno com relógio simulado e pgTAP
