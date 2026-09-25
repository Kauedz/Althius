# 20: Executar convites e mensagens de Sequência pelo LinkedIn

> **Ponteiro — não implementar neste ticket.**
>
> **Implementado por canais-07 (Ciclo real LinkedIn).**
> Fonte de verdade: [`../../canais-cadencia-backend/issues/07-ciclo-real-linkedin.md`](../../canais-cadencia-backend/issues/07-ciclo-real-linkedin.md).
> Unipile e ciclos de canal ficam em `.scratch/canais-cadencia-backend/`; o CRM não reimplementa.
>
> Conteúdo histórico abaixo mantido só como referência.

---

**What to build:** vendedor responsável envia ações compatíveis pelo seu LinkedIn conectado, e mensagens recebidas pausam a Sequência da Conta mantendo conteúdo privado.

**Blocked by:** 17: Vincular Sequências e responsabilidades às Contas reais; 16: Conectar e reconciliar Contas remetentes pela Unipile.

**Status:** superseded

- [ ] Identidade LinkedIn do Contato resolve para alvo compatível antes de qualquer envio.
- [ ] Convite, mensagem e InMail só são oferecidos quando relacionamento, tipo de conta, elegibilidade e capacidade permitem.
- [ ] Limite de crédito, assinatura ou relação aparece como impedimento acionável e não dispara retry cego.
- [ ] Resposta comercial real pausa idempotentemente a Sequência da Conta; aceite de convite, eco de nota e eventos técnicos não são tratados como resposta.
- [ ] Conteúdo de mensagem fica restrito ao titular; o Workspace vê status/evento mínimo.
- [ ] Evento repetido, atrasado ou fora de ordem não duplica Interação nem reativa passos.
- [ ] URL LinkedIn ausente bloqueia somente passos dependentes desse canal.

