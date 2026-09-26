# 04: Primeiro ciclo real por E-mail

**What to build:** completar o primeiro tracer bullet externo: o responsável confirma um passo de E-mail, a Althius envia pela Conta remetente dele, recebe uma resposta real, registra a Interação privada e pausa toda a Sequência da Conta-alvo. Os demais participantes veem somente o evento e o status.

**Blocked by:** nada. O 02 está fechado, e a parte de conexão do 03 já funciona com uma conta real. O que falta no 03 (os estados em `/conexoes`) não bloqueia o envio.

**Status:** ready-for-agent

- [ ] Um passo confirmado é enviado ao endereço real do Contato usando exclusivamente a Conta remetente de E-mail do responsável.
- [ ] O passo só sai com a Conta remetente em `ready`. Em `syncing`, `reconnect_required` ou com `reconciliation_required`, ele espera. Esse é o bloqueio de envio na reconexão do canais-03.
- [ ] Confirmar o passo fixa o Destino usado no envio ([ADR-0014](../../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- [ ] Se na hora de enviar o Destino atual do Contato for diferente do confirmado, o passo não sai e aguarda a reconfirmação do Vendedor responsável. Isso vale para mudança por Administrador, importação ou enriquecimento, e o envio não vai nem para o Destino antigo nem para o novo.
- [ ] O resultado do provedor (`id` e `message_id` do envio) fica persistido sem apresentar aceitação como entrega ou leitura comprovada.
- [ ] Os eventos de e-mail chegam pelo mesmo Webhook Endpoint da v2, autenticados pela assinatura HMAC. A entrega é confirmada dentro do prazo do provedor e processada de forma idempotente.
- [ ] `email.new` na caixa de entrada, `email.new` nos itens enviados e `email.new.bounce` são distinguidos. Uma mensagem do próprio titular (`from` igual ao endereço da Conta remetente) não pausa a Sequência.
- [ ] A resposta é ligada ao passo enviado pela conversa: o `thread_id` do e-mail enviado, ou o `In-Reply-To` dos `headers` igual ao `message_id` enviado. E-mail de outra conversa não pausa nada.
- [ ] Uma resposta real pausa todos os passos da Conta-alvo em uma transação e não afeta Sequências de outras Contas-alvo.
- [ ] Somente o responsável lê assunto, corpo e anexos; os demais veem “Contato respondeu; sequência pausada”, sem conteúdo livre.
- [ ] Assunto, corpo e anexos da mensagem recebida ficam gravados na própria Interação (schema privado da Althius), não como uma referência a buscar na Unipile depois. Os anexos chegam como `url` e precisam ser baixados e guardados. Isso preserva o contexto que a IA usa mesmo depois de uma troca de conta Unipile ([ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)).
- [ ] Evento repetido ou fora de ordem não duplica Interação, evento público nem contagem.
- [ ] Timeout ou resultado incerto é reconciliado antes de qualquer reenvio. A Unipile v2 não documenta chave de idempotência no envio. Cada envio leva um cabeçalho próprio da Althius em `custom_headers`, com o id do passo. O `email.new` dos itens enviados que traz esse cabeçalho prova que o provedor aceitou; conferir no primeiro envio real se o cabeçalho volta no evento.

## Contratos da Unipile v2

Conferidos na documentação oficial em 2026-09-26.

- **Envio:** `POST /v2/{account_id}/emails/send`, em JSON.
  - Campos: `to` (`[{email, display_name}]`), `subject`, `html` ou `plain_text`, `reply_to_message_id` (para continuar uma conversa), `custom_headers` (`[{name, value}]`) e `tracking_options` (aberturas e cliques, desligados por padrão).
  - Resposta 200: `{"object": "EmailSent", "id", "message_id"}`. O `message_id` pode faltar.
- **Eventos:**
  - `email.new`: um e-mail entrou numa pasta. O recebido entra na caixa de entrada; o enviado, nos itens enviados.
  - `email.new.bounce`: sai no lugar do `email.new` quando o e-mail volta.
  - `email.delete`: também sai quando um e-mail é movido.
  - O payload traz `folder_id` e `email`, que é o objeto Email.
- **Objeto Email** (`GET /v2/{account_id}/emails/{email_id}`):
  - identificação: `id`, `message_id`, `thread_id`;
  - conteúdo: `subject`, `body`, `snippet`, `date`;
  - pessoas: `from`, `to`, `cc`, `bcc` e `reply_to`, todos como `[{email, display_name}]`;
  - `headers` (`[{name, value}]`), onde ficam `In-Reply-To` e `References`;
  - `attachments`, com o conteúdo acessível por `url`;
  - `folders` (no Gmail, ids de marcadores) e `is_unread`.
- **Webhook:** o Webhook Endpoint criado pelo `scripts/wizard-unipile.sh` só assina eventos de conta. Este ticket acrescenta `email.new` e `email.new.bounce` à lista do wizard e ao endpoint já cadastrado, editado pelo painel da Unipile.

## Dependências externas

- **Conta de E-mail conectada:** `althius.relacionamento@gmail.com`, Conta remetente `GOOGLE` do Vendedor responsável, em `ready` desde 2026-09-26.
- **Destinatário real:** uma caixa que o usuário acesse e que não seja a da Conta remetente, porque a resposta do próprio titular não conta. Ela precisa conseguir responder ao teste.
