# 06: Coordenação no motor para Execuções de Canal

**What to build:** Execuções `canal` de origem `whatsapp` entram na Coordenação com os Agentes filtrados pela lista de canais. O Slack continua com um Agente por fio. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Origem `whatsapp` aceita (migração aditiva)
- [ ] Ponte `agent-conversation` e worker do Hermes
- [ ] Testes do Slack verdes
