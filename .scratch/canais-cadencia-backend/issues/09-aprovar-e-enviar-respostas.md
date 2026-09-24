# 09: Aprovar e enviar respostas nos três canais

**What to build:** permitir que somente o titular revise, aprove ou rejeite a Proposta de resposta e, quando aprovada, envie exatamente aquela revisão pelo canal e destinatário associados. Aprovação autoriza uma mensagem, não ativa resposta automática nem retoma a Sequência.

**Blocked by:** 06: Executar passos e receber respostas pelo WhatsApp; 07: Executar passos e receber respostas pelo LinkedIn; 08: Gerar Propostas de resposta privadas.

**Status:** ready-for-agent

- [ ] Somente o titular da Conta remetente lê e decide a proposta; Membro, Administrador e usuário de outro Workspace são rejeitados pelo backend.
- [ ] Aprovar registra titular, revisão, destinatário e canal e cria um único trabalho de envio.
- [ ] Rejeitar não chama a Unipile; aprovar duas vezes ou repetir a requisição não duplica o envio.
- [ ] Editar texto, canal ou destinatário cria nova revisão que exige nova Aprovação.
- [ ] Proposta desatualizada, Conta remetente desconectada, participação removida ou responsabilidade alterada bloqueiam o envio mesmo após aprovação anterior.
- [ ] A resposta aprovada usa o contrato correto de E-mail, WhatsApp ou LinkedIn e persiste resultado ou incerteza para reconciliação.
- [ ] Aprovar ou enviar a resposta mantém a Sequência pausada até uma retomada explícita do responsável.

