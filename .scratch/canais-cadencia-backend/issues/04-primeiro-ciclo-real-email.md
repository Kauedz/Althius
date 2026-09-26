# 04: Primeiro ciclo real por E-mail

**What to build:** completar o primeiro tracer bullet externo: o responsável confirma um passo de E-mail, a Althius envia pela Conta remetente dele, recebe uma resposta real, registra a Interação privada e pausa toda a Sequência da Conta-alvo. Os demais participantes veem somente o evento e o status.

**Blocked by:** 02: Documento da Sequência com destinatários reais; 03: Conectar canais pessoais pela Unipile.

**Status:** ready-for-human

- [x] Um passo confirmado é enviado ao endereço real do Contato usando exclusivamente a Conta remetente de E-mail do responsável.
- [x] Confirmar o passo fixa o Destino usado no envio ([ADR-0014](../../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- [x] Se na hora de enviar o Destino atual do Contato for diferente do confirmado, o passo não sai e aguarda a reconfirmação do Vendedor responsável. Isso vale para mudança por Administrador, importação ou enriquecimento, e o envio não vai nem para o Destino antigo nem para o novo.
- [x] O resultado do provedor fica persistido sem apresentar aceitação como entrega ou leitura comprovada.
- [x] O webhook v1 é autenticado, persistido e confirmado dentro do prazo esperado pelo provedor, com processamento posterior idempotente.
- [x] `mail_received`, `mail_sent` e `mail_moved` são distinguidos; uma mensagem do próprio titular não pausa a Sequência.
- [x] Uma resposta real pausa todos os passos da Conta-alvo em uma transação e não afeta Sequências de outras Contas-alvo.
- [x] Somente o responsável lê assunto, corpo e anexos; os demais veem “Contato respondeu; sequência pausada”, sem conteúdo livre. O backend entrega o evento e o status; o rótulo na interface fica pendente.
- [x] Evento repetido ou fora de ordem não duplica Interação, evento público nem contagem.
- [x] Timeout ou resultado incerto é reconciliado antes de qualquer reenvio; a idempotência limitada da Unipile não substitui o controle durável da Althius.

## Dependências externas

- Conta de E-mail conectada e destinatário real informado pelo usuário, com capacidade de enviar e responder ao teste.

## Implementação local (2026-09-26)

Implementado com a Unipile simulada nos testes. A validação com contas reais continua pendente.

- Migration: `supabase/migrations/20260926120000_primeiro_ciclo_real_email.sql`.
  - `confirm_email_step` confirma o passo e fixa o Destino atual do Contato, o conteúdo e a Conta remetente de E-mail pronta do responsável. Reconfirmar gera uma nova chave de idempotência, porque nada saiu com a anterior.
  - Só o `service_role` executa `claim_step_send`. A reserva é exclusiva e confere de novo Sequência ativa, Participação, responsabilidade, Destino atual, passo do documento e Conta remetente. Destino ou passo diferentes deixam o passo em `awaiting_reconfirmation`, qualquer que seja a origem da mudança. Uma reserva abandonada vira `uncertain`.
  - `record_step_send_result` guarda `accepted` (aceitação, não entrega), `failed` ou `uncertain`. Um resultado tardio não desfaz a aceitação. Um envio `uncertain` só volta a sair depois de `reconcile_step_send` e da decisão do titular (`resolve_uncertain_step_send`), com a mesma chave de idempotência.
  - `record_unipile_mail_event` persiste o webhook de forma idempotente, pela conta externa, o evento e o `email_id`. `process_unipile_mail_event` e `process_pending_unipile_mail_events` fazem o processamento posterior.
    - `mail_sent` é do titular e nunca pausa. O eco de um passo guarda o Message-ID e comprova um envio incerto.
    - `mail_moved` é ignorado.
    - Uma resposta correlacionada, na conversa do passo ou vinda de um Contato da Conta-alvo, pausa a Sequência numa transação. Na mesma transação, invalida os passos pendentes e grava a mensagem privada (`list_owned_sequence_messages`), a Interação `email-recebido` e o evento público `contato-respondeu` em `public.sequence_events`, sem colunas de conteúdo.
    - A mesma mensagem reentregue com outro `email_id` não duplica nada.
    - E-mail pessoal é ignorado, e o conteúdo bruto do webhook é apagado depois do processamento.
  - O envio aceito vira a Interação `email-enviado`. `account_interactions` ganhou a origem `sequencia` e `external_ref` para deduplicar.
- Edge Functions:
  - `sequence-email-steps`, com JWT, tem as ações `confirm`, `send` e `resend`.
  - `unipile-mail-webhook`, sem JWT do gateway, valida o header `Unipile-Auth` com o segredo próprio `UNIPILE_MAIL_WEBHOOK_SECRET`.
  - A lógica fica em `supabase/functions/_shared/`. O adapter da rota v1 envia `POST /api/v1/emails` multipart com `Idempotency-Key` e reconcilia por `GET /api/v1/emails?role=sent`.
  - O contrato veio dos tipos do SDK oficial `unipile-node-sdk` 1.9.3, porque a documentação da Unipile está bloqueada na rede deste ambiente.
- Testes:
  - pgTAP `supabase/tests/primeiro_ciclo_real_email.sql`: 60 asserções. Cobrem o responsável, outro Membro, o Administrador e outro Workspace.
  - Deno em `supabase/functions/_shared/*.test.ts`: 16 testes, contra o Postgres com as migrations e a Unipile simulada. O CI roda os dois no job do banco.
- Fora deste ticket:
  - a interface ainda não tem os controles de confirmar e enviar, nem o rótulo "Contato respondeu; sequência pausada" para os demais;
  - a execução em background é do canais-05;
  - anexos persistentes para envio são do canais-10.

## Pendências para fechar

- Aplicar a migration no `ycbdilsmydvzezhlymty`, com CI verde, antes do merge (`docs/agents/migrations.md`).
- Publicar `sequence-email-steps` e `unipile-mail-webhook`, com os segredos da Unipile e `UNIPILE_MAIL_WEBHOOK_SECRET`.
- Registrar o webhook de e-mail v1 na Unipile (`supabase/functions/README.md`).
- Validar com contas reais: uma Conta remetente de E-mail conectada e um destinatário real, em outra caixa, que responda ao teste. Testes com a Unipile simulada não comprovam a integração externa.
- Conferir na conta real o `account_type` que `GET /api/v1/accounts/{id}` devolve para E-mail. Os tipos do SDK listam `GOOGLE_OAUTH`, `OUTLOOK` e `MAIL`, mas `complete_sender_connection_attempt` (canais-03) aceita só `GOOGLE`, `MICROSOFT` e `IMAP`. Se a conta real vier com os nomes do SDK, a conexão de E-mail será recusada antes do tracer.
