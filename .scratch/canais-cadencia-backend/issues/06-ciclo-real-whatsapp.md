# 06: Executar passos e receber respostas pelo WhatsApp

**What to build:** ampliar o executor para enviar passos reais pelo WhatsApp pessoal do responsável e receber respostas no mesmo modelo de privacidade e pausa validado por E-mail. Mensagens próprias, conversas pessoais e eventos técnicos não podem ser confundidos com resposta comercial.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** in-progress. A parte 1 (o envio) está pronta e testada localmente, nada foi aplicado no remoto. A parte 2 (o recebimento) espera o JSON real do `message.new`, que a Unipile não documenta; a parte 1 captura o formato dele (ver Comments).

- [x] O responsável envia um passo ao número real e normalizado do Contato usando apenas sua Conta remetente de WhatsApp. (Backend, Executor e tela prontos e cobertos por pgTAP e Deno; a validação com o número real fica para o teste do Nan.)
- [ ] Uma conversa existente é reutilizada quando correlacionada com segurança; uma nova conversa é iniciada somente para o destinatário aprovado. (Parte 1: a nova conversa só abre para o número confirmado e depois de conferir que ele tem WhatsApp, e a conversa que a própria Althius abriu é reutilizada pelos passos seguintes ao mesmo número. Falta correlacionar uma conversa que já existia antes, o que depende do `message.new` real: parte 2.)
- [ ] O evento `message_received` (na v2 é `message.new`) distingue mensagem recebida do Contato, envio do próprio titular e envio feito pela API. (Parte 2.)
- [ ] Conversa pessoal ou sem correlação com Contato participante não vira Interação compartilhada nem pausa a Sequência. (Parte 2. Na parte 1 os eventos `message.*` só são reconhecidos com 200 e não criam nada.)
- [ ] Resposta comercial real pausa a Conta-alvo de forma idempotente e mantém o conteúdo restrito ao responsável. (Parte 2.)
- [x] Timeout ou aceitação incerta não provoca reenvio cego nas rotas de chat. (Tempo esgotado, falha de rede e 5xx no envio ficam `uncertain`, com uma só chamada de envio, e o titular resolve com "Saiu" ou "Não saiu".)
- [ ] Reconexão deduplica o backlog relevante antes de permitir continuação da Sequência. (Parte 2. Hoje uma Conta de WhatsApp que volta de uma queda passa pela reconciliação sem conversas a conferir e é liberada.)

## Dependências externas

- WhatsApp do titular conectado e número real de teste indicado pelo usuário.

## Implementação local

Só a metade do envio. Migration `supabase/migrations/20260929190000_ciclo_real_whatsapp.sql` (aditiva) e pgTAP `supabase/tests/ciclo_real_whatsapp.sql` (158 asserções); Edge Functions (`_shared/send-whatsapp.ts`, `sequence-runner`, `sequence-step-sends`, `unipile-account-status`) com 77 testes Deno novos; tela em `detalhe-sequencia.tsx` e nas fontes.

- **Visão `target_contacts`:** `whatsapp` só mostra o telefone principal quando o Contato o marcou como WhatsApp (`phone_whatsapp`). Antes o principal aparecia como `whatsapp` mesmo com a marca desligada. O telefone segue em `phone`. Na tela, o Contato ganhou `telefoneSemWhatsApp` para a edição sem as listas (quando a leitura das listas falha) não apagar um telefone que ela deixou de mostrar como WhatsApp.
- **Passo de WhatsApp, como o de E-mail (ADR-0008, ADR-0014):**
  - `confirm_whatsapp_step` fixa o número da posição `destino` da lista inteira de telefones (ausente vale 1), só se ele for marcado como WhatsApp; senão recusa com um erro claro (`contact has no phone destination`, `contact phone at this position is not flagged as whatsapp`, `invalid destination position in the step`). O principal sem a marca também falha fechado.
  - `release_whatsapp_step_send` (titular) e `release_due_whatsapp_step_send` (Executor) revalidam titular, Participação, responsabilidade, versão, pausa, janela, Contato vinculado e o número: ele só sai se ainda for um dos telefones do Contato marcados como WhatsApp (`destination_changed` se saiu da lista, `destination_no_whatsapp` se perdeu a marca; nos dois o passo espera a reconfirmação). A Conta remetente é a de WhatsApp do próprio responsável, `ready` e sem reconciliação pendente (`sender_not_ready` senão); a de outro participante nunca serve. Um Envio de outro canal é recusado (`wrong_channel`) nos dois caminhos.
  - `activate_sequence` e `private.schedule_next_step` passam a incluir passos de WhatsApp (LinkedIn continua parando a Sequência). Bloqueios novos da ativação: `contact_without_phone`, `phone_not_whatsapp`, `whatsapp_sender_not_ready`. O passo de WhatsApp sempre sai sozinho; só o de E-mail tem modo manual.
  - O texto vem do documento autorizado, com as variáveis preenchidas (`render_step_template`); WhatsApp não tem assunto.
  - Um envio aceito registra a Interação compartilhada `mensagem-enviada` (sem conteúdo). O id da conversa do provedor vai em `provider_chat_id` (coluna nova, apagada junto com o Destino na desidentificação, porque traz o telefone).
- **Antispam no banco, por Conta remetente:** o espaçamento mínimo é uma constante só, `private.whatsapp_send_spacing()` (30 segundos). `claim_due_step_sends` entrega no máximo um passo por Conta por chamada e nenhum enquanto a Conta estiver dentro do espaçamento (medido pela última liberação e pela última reserva, `claimed_at`); a liberação confere de novo e devolve `sender_spacing`. O passo continua vencido e sai numa rodada seguinte.
- **Edge Functions:** `sequence-runner` e `sequence-step-sends` despacham pelo canal do Envio (`claim_due_step_sends` devolve o `channel`; o titular pergunta a `step_send_channel`). O núcleo do WhatsApp é `_shared/send-whatsapp.ts`, com a porta `UnipileChat` (`userExists`, `startChat`, `sendInChat`). A primeira mensagem confere o número (404 bloqueia com `destination_no_whatsapp`; falha da conferência vira `destination_check_failed`, sem enviar, e o banco agenda nova tentativa) e abre a conversa; com uma conversa gravada, envia nela. 2xx é aceito, 4xx é recusa, 429 respeita o `Retry-After`, tempo esgotado, falha de rede e 5xx ficam incertos. A chave da API só vai no cabeçalho, nunca na URL.
- **Captura do formato dos webhooks `message.*`:** `unipile-account-status` reconhece qualquer `message.*` com 200 e não cria nada. Só com o segredo `UNIPILE_CAPTURE_SHAPES` igual a `1`, guarda em `private.webhook_shape_captures` (RLS, sem acesso dos papéis do app, no máximo 20 linhas por tipo e 200 no total) um formato censurado do corpo: chaves, aninhamento, 3 primeiros itens das listas, booleanos, nulos, números que não parecem telefone ou id e o tamanho das strings; só os valores de `type`, `event`, `provider`, `source`, `kind`, `direction`, `status`, `content_type` e `role` em forma de token ficam. Como ler: `supabase/functions/README.md`.
- **Tela:** o passo de WhatsApp tem o mesmo "Confirmar e enviar", "Reconfirmar e enviar", "Saiu" e "Não saiu", o painel de envios automáticos e a confirmação da ativação dos passos de E-mail. Mensagens novas em português, como "Este número não tem WhatsApp". A Demonstração não muda. LinkedIn segue "ainda não disponível neste Workspace".

## Comments

### Decisões da parte 1

- **`confirm_sequence_step` continua recusando o passo de WhatsApp** (o pgTAP do canais-04 exige o erro `0A000`): o WhatsApp ganhou `confirm_whatsapp_step`, `release_whatsapp_step_send`, `release_due_whatsapp_step_send`, `step_send_channel` e `block_whatsapp_step_send`, e as Edge Functions escolhem o caminho pelo canal do Envio. Sem conseguir saber o canal, o envio do titular segue pelo E-mail, e o banco recusa o que não é E-mail (`wrong_channel`). `resolve_uncertain_step` reconfirma pelo canal do passo.
- **O que a Unipile documenta e o que não** (pelo usuário, Unipile API v2): o id do destinatário é o número internacional, sem `+` nem formatação, mais `@s.whatsapp.net`; `GET /v2/{account_id}/users/{user_id}` responde 200 (existe) ou 404 (sem WhatsApp); `POST /chats/send` abre a conversa individual (`{user_ids, text}`), que é única por usuário, e devolve um `chat_id` igual ao id do destinatário; `POST /chats/{chat_id}/messages/send` envia nela (`{text}`). **Não estão documentados** o corpo da resposta desses envios (só "200") nem o JSON do `message.new`, nem se ele também sai para mensagens do titular ou da API. Por isso: qualquer 2xx é "aceito", o id da mensagem só é lido de `message_id` quando vier como texto e fica nulo senão, e nada depende de nomes de campos desconhecidos.
- **`chat_id` gravado:** o `chat_id` da resposta, quando vier; senão o id do destinatário (a igualdade documentada). A conversa só é reutilizada por um passo da mesma Sequência, ao mesmo Contato, pela mesma Conta e para o mesmo número. **Conferir no primeiro envio real** que o segundo passo ao mesmo número sai por `chats/{chat_id}/messages/send` sem erro (o `@` do id vai codificado como `%40` no caminho).
- **5xx e 408 no envio são incertos, não falha:** a requisição pode ter sido aceita, e reenviar mensagem de WhatsApp é pior que esperar o titular. Só 4xx é recusa. Já a conferência do número (`userExists`) que falha não enviou nada, então conta como tentativa falha: 5 e 30 minutos (ou o `Retry-After`) e, na terceira, o passo fica `failed` até o titular reconfirmar.
- **Espaçamento de 30 s** (a Unipile pede evitar menos de 10 a 20 s e avisa que abrir muitas conversas sem resposta pode restringir a conta). Mora numa constante SQL só. O Executor roda por minuto e envia no máximo um passo de WhatsApp por Conta por rodada, então na prática o ritmo é de uma mensagem por minuto por Conta.
- **`step_signature` passou a incluir `destino`:** trocar o número (ou o e-mail) de um passo pendente depois da ativação revoga a versão autorizada e cancela os pendentes, para o envio nunca sair para um número diferente do que o documento mostra. Vale também para o E-mail (antes, trocar `destino` não revogava nada).
- **`private.release_step_send` (E-mail)** agora recusa um Envio de outro canal e a resposta "Re:" só continua a conversa de outro e-mail (`channel = 'email'`): o `message_id` de uma mensagem de WhatsApp nunca vira `reply_to_message_id`.
- **Redações do formato dos webhooks:** além do pedido, um inteiro que pode ser telefone ou id (10 dígitos ou mais e fora da faixa de datas em milissegundos) vira `"<number:N>"`, e uma chave que não parece nome de campo (um id ou telefone como chave) vira `"<key:N#i>"`. Nada é guardado se o formato passar de 60 mil caracteres.
- **Reconexão:** o Executor já reconcilia uma Conta que volta de uma queda antes de liberá-la; para uma Conta de WhatsApp a lista de conversas é vazia (`conversations_to_reconcile` só olha `provider_thread_id` e `provider_email_id`, e o WhatsApp grava `provider_chat_id`), então ela é liberada sem conferir nada. Isso é aceitável enquanto nenhuma resposta é recebida, e é trabalho da parte 2.

### Não usar com destinatário real antes da parte 2

Sem o recebimento, uma resposta do Contato **não pausa a Sequência**: os passos seguintes continuam saindo. Testar só com o número de teste indicado pelo usuário, com um passo de cada vez, até a parte 2.

### O que a parte 2 precisa

1. **Ingestão de `message.new`** (irmã de `ingest_unipile_email_event`, sem inventar campos): tabelas `private.unipile_message_events` (dedupe pelo `id` do evento e pelo par Conta remetente + id da mensagem) e `private.received_messages` (conteúdo só do titular), RPC `ingest_unipile_message_event` numa transação, e `list_received_messages` só para o titular. A Interação compartilhada de uma resposta recebida precisa de um `kind` novo (a constraint de `account_interactions.kind` só tem `mensagem-enviada`, sem recebida): estender por migration.
2. **Distinguir três origens**, que só o JSON real diz como: (a) mensagem do Contato (resposta), (b) mensagem do próprio titular digitada no celular, (c) eco de um envio feito pela API. Precisa saber quais campos dizem a direção/o remetente, se o `message.new` sai também para (b) e (c), e como reconhecer o eco de um envio nosso (o id da mensagem na resposta do envio é desconhecido; hoje fica nulo, então a correlação teria de ser por conversa e horário, ou por um campo que o `message.new` traga).
3. **Regra da conversa pessoal:** só vira resposta comercial a mensagem recebida numa conversa que a Althius abriu (`provider_chat_id` gravado) ou cujo número, no id do chat, é um telefone marcado como WhatsApp de um Contato vinculado à Conta-alvo de uma Sequência ativa do titular daquela Conta remetente. Qualquer outra (conversa pessoal, grupo, número sem Contato) é registrada só como evento técnico do provedor, sem Interação, sem pausa e sem IA. Atenção ao id `@lid`: ele pode não trazer o telefone, e a correlação por número falharia; decidir com o JSON real (e talvez `GET users/{user_id}`).
4. **Pausa idempotente:** um `message.new` repetido, fora de ordem ou reentregue não duplica Interação nem pausa de novo; a pausa vale para a Sequência inteira da Conta-alvo e usa a trava da Sequência, como no E-mail. Publicar só "Contato respondeu; sequência pausada" para os demais.
5. **Deduplicação do backlog na reconexão:** ao voltar de uma queda (e no `account.initial_sync.completed` do WhatsApp) a Unipile pode reentregar mensagens do período fora do ar. Incluir os chats do WhatsApp em `conversations_to_reconcile`, conferir cada conversa relevante pela API (`GET` de mensagens do chat, forma desconhecida) e deduplicar pelo id da mensagem antes de liberar a Conta. Não importar a caixa inteira.
6. **`message.receipt.read`** (recibo de leitura) e `message.delivery` não contam como resposta; se forem mostrados, é só como status.

**O JSON real que a parte 2 espera**, capturado na tabela `private.webhook_shape_captures` (o formato censurado; nada de conteúdo):

- um `message.new` de uma resposta do Contato ao teste;
- um `message.new` de uma mensagem que o titular digitou no próprio celular para o Contato;
- o que o WhatsApp do titular receber quando a Althius envia pela API (para saber se há `message.new` de eco e como reconhecê-lo);
- um `message.receipt.read` e um `message.delivery`, se saírem.

Falta também o corpo da resposta 200 de `chats/send` e de `messages/send`, que os webhooks não mostram. Ele não é registrado hoje. Se a parte 2 precisar dele, o jeito mais simples é gravar o formato censurado dessa resposta na mesma tabela (com o OK do Nan, por mudar a função de envio).

### Passos remotos, para o Nan (nada disto foi feito)

1. Aplicar a migration: `npx supabase db push --linked` (conforme `docs/agents/migrations.md`; ela é só aditiva e vem depois de todas as outras: a do WhatsApp é a última em `supabase/migrations`).
2. Publicar as funções, depois do banco: `npx supabase functions deploy sequence-step-sends --project-ref <ref>`, `npx supabase functions deploy sequence-runner --no-verify-jwt --project-ref <ref>` e `npx supabase functions deploy unipile-account-status --no-verify-jwt --project-ref <ref>`.
3. Segredo para capturar o formato (digitando no próprio terminal): `npx supabase secrets set UNIPILE_CAPTURE_SHAPES=1 --project-ref <ref>`. Depois de capturar, trocar o valor ou tirar o segredo.
4. **Precisa do OK do Nan:** o Webhook Endpoint compartilhado da Unipile passa a receber também `message.new` (e `message.receipt.read`, se quiser os recibos). Pelo painel da Unipile; o `scripts/wizard-canais-04.sh` só documenta e não altera o endpoint.
5. Conectar o WhatsApp do titular, mandar uma mensagem do número de teste para ele e ler o formato capturado:

   ```sql
   select event_type, captured_at, jsonb_pretty(shape) as formato
   from private.webhook_shape_captures
   order by event_type, id;
   ```

6. Teste do envio, com o número de teste: um passo de WhatsApp, "Confirmar e enviar" e, depois, uma Sequência ativada com dois passos ao mesmo número (o segundo deve sair na mesma conversa). Conferir o estado em `private.sequence_step_sends` (`status`, `last_error`, `provider_chat_id`) e o `message.new` do eco nas capturas.
