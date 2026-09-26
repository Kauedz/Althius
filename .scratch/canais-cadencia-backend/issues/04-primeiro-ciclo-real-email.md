# 04: Primeiro ciclo real por E-mail

**What to build:** completar o primeiro tracer bullet externo: o responsável confirma um passo de E-mail, a Althius envia pela Conta remetente dele, recebe uma resposta real, registra a Interação privada e pausa toda a Sequência da Conta-alvo. Os demais participantes veem somente o evento e o status.

**Blocked by:** 02: Documento da Sequência com destinatários reais; 03: Conectar canais pessoais pela Unipile.

**Status:** ready-for-agent

- [ ] Um passo confirmado é enviado ao endereço real do Contato usando exclusivamente a Conta remetente de E-mail do responsável.
- [ ] Confirmar o passo fixa o Destino usado no envio ([ADR-0014](../../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- [ ] Se na hora de enviar o Destino atual do Contato for diferente do confirmado, o passo não sai e aguarda a reconfirmação do Vendedor responsável. Isso vale para mudança por Administrador, importação ou enriquecimento, e o envio não vai nem para o Destino antigo nem para o novo.
- [ ] O resultado do provedor fica persistido sem apresentar aceitação como entrega ou leitura comprovada.
- [ ] O webhook v1 é autenticado, persistido e confirmado dentro do prazo esperado pelo provedor, com processamento posterior idempotente.
- [ ] `mail_received`, `mail_sent` e `mail_moved` são distinguidos; uma mensagem do próprio titular não pausa a Sequência.
- [ ] Uma resposta real pausa todos os passos da Conta-alvo em uma transação e não afeta Sequências de outras Contas-alvo.
- [ ] Somente o responsável lê assunto, corpo e anexos; os demais veem “Contato respondeu; sequência pausada”, sem conteúdo livre.
- [ ] Evento repetido ou fora de ordem não duplica Interação, evento público nem contagem.
- [ ] Timeout ou resultado incerto é reconciliado antes de qualquer reenvio; a idempotência limitada da Unipile não substitui o controle durável da Althius.

## Dependências externas

- Conta de E-mail conectada e destinatário real informado pelo usuário, com capacidade de enviar e responder ao teste.

