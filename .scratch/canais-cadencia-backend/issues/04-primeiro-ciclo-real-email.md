# 04: Primeiro ciclo real por E-mail

**What to build:** completar o primeiro tracer bullet externo: o responsável confirma um passo de E-mail, a Althius envia pela Conta remetente dele, recebe uma resposta real, registra a Interação privada e pausa toda a Sequência da Conta-alvo. Os demais participantes veem somente o evento e o status.

**Blocked by:** nada. O 02 está fechado, e a parte de conexão do 03 já funciona com uma conta real. O que falta no 03 (os estados em `/conexoes`) não bloqueia o envio.

**Status:** in-progress

- [x] Um passo confirmado é enviado ao endereço real do Contato usando exclusivamente a Conta remetente de E-mail do responsável. (Backend pronto no PR 1; a validação com o destinatário real fica para depois da tela.)
- [x] O passo só sai com a Conta remetente em `ready`. Em `syncing`, `reconnect_required` ou com `reconciliation_required`, ele espera. Esse é o bloqueio de envio na reconexão do canais-03.
- [x] Confirmar o passo fixa o Destino usado no envio ([ADR-0014](../../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- [x] Se na hora de enviar o Destino atual do Contato for diferente do confirmado, o passo não sai e aguarda a reconfirmação do Vendedor responsável. Isso vale para mudança por Administrador, importação ou enriquecimento, e o envio não vai nem para o Destino antigo nem para o novo.
- [x] O resultado do provedor (`id` e `message_id` do envio) fica persistido sem apresentar aceitação como entrega ou leitura comprovada.
- [x] Os eventos de e-mail chegam pelo mesmo Webhook Endpoint da v2, autenticados pela assinatura HMAC. O evento é gravado e confirmado com `2xx` em menos de 5 segundos, e o processamento é idempotente pelo `id` do evento.
- [x] Antes de enviar o próximo passo de uma conversa, o executor confere essa conversa pela API. A Unipile tenta a entrega só mais duas vezes (2 s e 12 s), então uma resposta perdida no webhook não pode deixar a Sequência seguir.
- [x] `email.new` na caixa de entrada, `email.new` nos itens enviados e `email.new.bounce` são distinguidos. Uma mensagem do próprio titular (`from` igual ao endereço da Conta remetente) não pausa a Sequência.
- [x] A resposta é ligada ao passo enviado pela conversa: o `thread_id` do e-mail enviado, ou o `In-Reply-To` dos `headers` igual ao `message_id` enviado. E-mail de outra conversa não pausa nada.
- [x] Uma resposta real pausa todos os passos da Conta-alvo em uma transação e não afeta Sequências de outras Contas-alvo.
- [x] Somente o responsável lê assunto, corpo e anexos; os demais veem “Contato respondeu; sequência pausada”, sem conteúdo livre.
- [x] Assunto, corpo e anexos da mensagem recebida ficam gravados na própria Interação (schema privado da Althius), não como uma referência a buscar na Unipile depois. Os anexos chegam como `url` e precisam ser baixados e guardados. Isso preserva o contexto que a IA usa mesmo depois de uma troca de conta Unipile ([ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)).
- [x] Evento repetido ou fora de ordem não duplica Interação, evento público nem contagem.
- [ ] Timeout ou resultado incerto é reconciliado antes de qualquer reenvio. A Unipile v2 não documenta chave de idempotência no envio. Cada envio leva um cabeçalho próprio da Althius em `custom_headers`, com o id do passo. O `email.new` dos itens enviados que traz esse cabeçalho prova que o provedor aceitou; conferir no primeiro envio real se o cabeçalho volta no evento.

## Implementação local

Três PRs em sequência: (1) envio, (2) resposta (webhook, Interação privada e pausa) e (3) tela.

- **PR 1 (envio):**
  - Migration `supabase/migrations/20260926163645_envios_de_passo_por_email.sql`: tabela `private.sequence_step_sends` (um Envio do passo por Sequência e passo, com Destino fixado, Conta remetente, status `confirmed` → `sending` → `sent`/`failed`/`uncertain`, `awaiting_reconfirmation` e `bounced`, ids do provedor e último erro) e as RPCs `confirm_sequence_step` e `list_sequence_step_sends` (titular, `auth.uid()`), `release_sequence_step_send` e `record_sequence_step_send_result` (só `service_role`). `account_interactions.source` passa a aceitar `sequencia`: um envio aceito vira a Interação `email-enviado` da Conta-alvo, sem conteúdo.
  - Edge Function `sequence-step-sends` (`supabase/functions/README.md`): libera, envia por `POST /v2/{account_id}/emails/send` com o cabeçalho `X-Althius-Envio` e grava o resultado. Timeout e falha de rede ficam `uncertain`.
  - Testes: pgTAP `supabase/tests/envios_de_passo_por_email.sql` (45 asserções) e Deno `supabase/functions/sequence-step-sends/handler.test.ts` (da requisição à resposta, Unipile e banco injetados). O CI ganhou o job "Edge Functions".
  - Assunto e corpo saem do documento privado na hora do envio; só o Destino fica fixo. Versionar o conteúdo é o canais-05.
  - Um passo cujo assunto começa com `Re:` sai na mesma conversa, com `reply_to_message_id` igual ao `message_id` do último e-mail enviado ao mesmo Contato nesta Sequência.
- **PR 1 mergeado em 2026-09-26 (#46).** A migration `20260926163645` ainda não foi aplicada no `ycbdilsmydvzezhlymty` e a função `sequence-step-sends` ainda não foi publicada: a sessão não tinha o MCP do Supabase. Aplicar com `docs/agents/migrations.md` antes do primeiro teste real.
- **PR 2 (resposta):**
  - Migration `supabase/migrations/20260926173314_ingestao_de_email_da_unipile.sql`: `private.unipile_email_events` (um por entrega, dedupe pelo `id` do evento e pelo par Conta remetente + `email.id`), `private.received_emails` (assunto, corpo, anexos: só o titular lê, por `get_received_email`), a RPC `ingest_unipile_email_event` (eco, resposta, bounce ou sem relação numa transação; a resposta grava a Interação `email-recebido` e pausa a Sequência com `motivoPause` "Contato respondeu"), `conversation_for_send`, `record_received_email_attachment` e `get_received_email_attachment_path`. `private.mark_step_send_sent` passa a ser usada pelo resultado do envio e pelo eco que reconcilia um envio incerto. O bucket privado `email-attachments` só é criado onde o Storage existe (o CI roda sem storage-api).
  - `unipile-account-status` ganhou `handler.ts` com dependências injetadas e trata `email.new`/`email.new.bounce`; os anexos baixam depois do 2xx. `received-email-attachments` devolve a URL assinada só ao titular. `sequence-step-sends` confere a conversa na Unipile antes de um passo `Re:`.
  - `scripts/wizard-unipile.sh` lista os 9 eventos. **O Webhook Endpoint já cadastrado precisa ganhar `email.new` e `email.new.bounce` pelo painel da Unipile (ou rodando o wizard de novo): isso é passo do usuário.**
  - Testes: pgTAP `supabase/tests/ingestao_de_email_da_unipile.sql` (51 asserções, com as do PR 3) e Deno nas três funções.
  - O endereço do titular é aprendido pelo `from` do eco do próprio envio (`sender_accounts.email_address`), sem depender do formato do envelope. Respostas automáticas (`mailer-daemon`, `no-reply`, `Auto-Submitted`) não pausam. Uma resposta de outra pessoa da Conta-alvo na mesma conversa pausa, mas a Interação pública não a atribui ao Contato do passo.
  - A conferir no primeiro ciclo real: a forma da resposta de `GET /v2/{account_id}/threads/{thread_id}` e de `GET /v2/{account_id}/email-senders`, se o `account_name` do envelope traz o endereço do titular, e se o cabeçalho `X-Althius-Envio` volta no `email.new` dos itens enviados.
- **Ativação:** `scripts/wizard-canais-04.sh` conduz as três migrations, os segredos, a publicação das três funções e os eventos de e-mail no Webhook Endpoint, e descreve o ciclo real.
- **PR 3 (tela), adaptação mínima sem mudar o desenho:**
  - O rodapé do step, que dizia "Ainda não enviado" no Workspace operacional, mostra o Envio real: Confirmado, Aguardando reconfirmação, Enviando, Enviado (data e Destino, "aceito pelo provedor; não é entrega nem leitura"), Falhou, Envio incerto ou Devolvido, e um único botão "Confirmar e enviar" (ou "Reconfirmar e enviar"), só para passos de E-mail. Um bloqueio do backend aparece como aviso no rodapé, com o motivo.
  - A timeline marca o passo concluído pelo Envio `sent` (na Demonstração continua o `passoAtual`) e mostra "Respondeu" quando há resposta ligada ao Envio.
  - Abaixo da regra de pause, o painel "Respostas recebidas" (remetente, data, assunto, corpo em texto e anexos: imagens em miniatura que ampliam na própria página, PDF no leitor do navegador e o resto baixando com o nome original; o arquivo vem por URL assinada e vira um `blob:` com o tipo decidido pela tela, nunca HTML ou SVG) só existe para o Responsável. O resumo de outro participante mostra "Contato respondeu; sequência pausada" no lugar do status.
  - `FonteDeSequencias` ganhou `envios`, `confirmarPasso`, `enviarPasso`, `respostasRecebidas` e `urlDoAnexo`; a Demonstração devolve listas vazias e não envia nada. Migration `supabase/migrations/20260926180204_respostas_recebidas_da_sequencia.sql` (`list_received_emails`). O Supabase falso dos testes ganhou as Edge Functions (`funcoes`).
  - Testes: vitest em `src/fonte/supabase-sequencias.test.ts` e `src/raiz.test.tsx` ("Envio e resposta da Sequência no Workspace operacional").

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
- **Entrega:** a Unipile espera `2xx` em menos de 5 segundos e tenta de novo só duas vezes, depois de 2 e de 12 segundos (docs/configure-a-webhook). Cada evento traz um `id` (`evt_…`).
- **Webhook:** o Webhook Endpoint criado pelo `scripts/wizard-unipile.sh` só assina eventos de conta. Este ticket acrescenta `email.new` e `email.new.bounce` à lista do wizard e ao endpoint já cadastrado, editado pelo painel da Unipile.

## Dependências externas

- **Conta de E-mail conectada:** `althius.relacionamento@gmail.com`, Conta remetente `GOOGLE` do Vendedor responsável, em `ready` desde 2026-09-26.
- **Destinatário real:** uma caixa que o usuário acesse e que não seja a da Conta remetente, porque a resposta do próprio titular não conta. Ela precisa conseguir responder ao teste.
