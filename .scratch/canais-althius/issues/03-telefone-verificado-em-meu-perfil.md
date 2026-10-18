# 03: Telefone verificado em Meu perfil

**What to build:** Código de 6 dígitos pelo template de autenticação (R$ 0,035 por entrega), guardado como hash, com validade e limites de tentativas e de reenvios (para conter o custo). Sem reserva por SMS. Único entre Contas. Suspenso sem login na Althius por 30 dias, sem novo código. E-mail ao verificar. Último Workspace e opt-in de avisos por tipo. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] RLS e RPCs para iniciar, confirmar, reenviar, trocar e remover
- [ ] Bloco em Meu perfil com o número da Althius e atalho `wa.me`
- [ ] pgTAP, Deno e Vitest
