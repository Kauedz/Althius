# 07: Executar passos e receber respostas pelo LinkedIn

**What to build:** ampliar o executor para convite, mensagem e InMail pelo LinkedIn pessoal do responsável, respeitando relação, elegibilidade e capacidade da conta. Resposta real pausa a Conta-alvo; aceite de convite, eco da nota e evento de relação não são tratados como resposta.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** ready-for-agent

- [ ] A identidade pública do Contato é resolvida para o identificador nativo correto antes do envio.
- [ ] Convite, mensagem e InMail são enviados somente quando a conta e a relação suportam o subtipo escolhido.
- [ ] Falta de crédito, assinatura, elegibilidade ou relação aparece como impedimento acionável e não gera retentativa cega.
- [ ] `new_relation`, aceite de convite, nota original e eventos técnicos não são contados como resposta comercial.
- [ ] Uma mensagem real do Contato pausa toda a Sequência da Conta-alvo, preservando conteúdo privado e evento público mínimo.
- [ ] Eventos atrasados, repetidos ou fora de ordem não duplicam Interação nem fazem a Sequência oscilar incorretamente.
- [ ] Testes cobrem ao menos um caminho permitido e os principais impedimentos de convite, mensagem e InMail.

## Dependências externas

- LinkedIn do titular conectado e perfil real de teste indicado pelo usuário, com capacidade compatível com o subtipo validado.

