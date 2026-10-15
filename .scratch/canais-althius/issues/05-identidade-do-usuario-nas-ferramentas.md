# 05: Identidade do usuário nas ferramentas (JWT curto)

**What to build:** O executor chama as RPCs da tela com um JWT do usuário (`sub` = Conta, `role=authenticated`, `canal=whatsapp`, 60 s). O segredo não sai do servidor; o JWT nunca vai ao modelo nem ao log. A Atividade registra Conta, canal, ferramenta, hash e resultado. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] Mesma recusa da tela
- [ ] JWT expirado recusado
- [ ] Deno e pgTAP
