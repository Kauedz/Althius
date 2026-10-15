# 12: Link de ação de uso único com login e OAuth

**What to build:** Ações irreversíveis aceitam botão ou SIM só com login nas últimas 12 h; senão, link `/a/<token>` com login, 15 min. Integração sempre por link OAuth; chave de API nunca pelo chat. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 11.

**Status:** ready-for-agent

- [ ] Step-up testado nos dois lados
- [ ] Página nova no front
- [ ] pgTAP, Deno e Vitest
