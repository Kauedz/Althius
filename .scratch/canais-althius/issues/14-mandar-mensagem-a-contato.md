# 14: Mandar mensagem a um Contato pelo chat

**What to build:** O Agente prepara a Proposta de resposta pela Conta remetente do titular (Unipile); o chat mostra texto, Contato e canal com botões; vale com login nas últimas 12 h, senão link. Envio por `approve_reply_proposal` e `reply-proposal-send`. A leitura da caixa de leads continua pela Unipile. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 12, 13.

**Status:** ready-for-agent

- [ ] Sem Conta remetente pronta, avisa e não prepara
- [ ] Conteúdo só para o titular
- [ ] Nada em dobro
- [ ] pgTAP e Deno
