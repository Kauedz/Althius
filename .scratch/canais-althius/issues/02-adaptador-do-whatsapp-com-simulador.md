# 02: Adaptador do WhatsApp com simulador

**What to build:** Módulo `_shared/canal/` com a interface do WhatsApp (validar e normalizar o webhook, inclusive o bloco `pricing` dos status; enviar texto, botões e template; baixar mídia) e um simulador com modo de desenvolvimento. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Simulador com assinatura HMAC em tempo constante, guardando os envios
- [ ] Seleção simulado ou real num único ponto
- [ ] Nenhum texto ao usuário cita o provedor
- [ ] Deno
