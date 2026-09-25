# 20: Executar convites e mensagens de Sequência pelo LinkedIn

**What to build:** vendedor responsável envia ações compatíveis pelo seu LinkedIn conectado, e mensagens recebidas pausam a Sequência da Conta mantendo conteúdo privado.

**Blocked by:** 17: Vincular Sequências e responsabilidades às Contas reais; 16: Conectar e reconciliar Contas remetentes pela Unipile.

**Status:** ready-for-agent

- [ ] Identidade LinkedIn do Contato resolve para alvo compatível antes de qualquer envio.
- [ ] Convite, mensagem e InMail só são oferecidos quando relacionamento, tipo de conta, elegibilidade e capacidade permitem.
- [ ] Limite de crédito, assinatura ou relação aparece como impedimento acionável e não dispara retry cego.
- [ ] Resposta comercial real pausa idempotentemente a Sequência da Conta; aceite de convite, eco de nota e eventos técnicos não são tratados como resposta.
- [ ] Conteúdo de mensagem fica restrito ao titular; o Workspace vê status/evento mínimo.
- [ ] Evento repetido, atrasado ou fora de ordem não duplica Interação nem reativa passos.
- [ ] URL LinkedIn ausente bloqueia somente passos dependentes desse canal.

