# 08: Gerar Propostas de resposta privadas

**What to build:** depois de uma resposta comercial válida, usar o Rhetor para interpretar o contexto restrito daquela prospecção e preparar uma Proposta de resposta visível somente ao responsável. O serviço de IA não recebe ferramenta nem credencial capaz de enviar mensagens.

**Blocked by:** 04: Primeiro ciclo real por E-mail.

**Status:** ready-for-agent

- [ ] Uma resposta válida e já persistida cria trabalho idempotente para gerar uma única Proposta de resposta.
- [ ] O contexto enviado à IA contém apenas os dados comerciais necessários daquela Conta-alvo, Contato, Sequência e conversa relevante.
- [ ] O texto recebido e a proposta ficam acessíveis somente ao responsável; outros participantes veem apenas evento e status.
- [ ] A proposta registra mensagem de origem, canal, destinatário, revisão e estado, sem capacidade de envio automático.
- [ ] Falha ou indisponibilidade da IA preserva a resposta e a pausa, informa o titular e permite nova tentativa segura.
- [ ] Uma nova mensagem recebida marca a proposta anterior como desatualizada e impede seu envio sem nova revisão do titular.
- [ ] Testes demonstram que gerar a proposta não chama a Unipile e não retoma a Sequência.

## Dependências externas

- Serviço/modelo de IA e credencial de backend definidos para o Rhetor.

