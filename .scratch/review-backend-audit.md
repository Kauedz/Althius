# Auditoria backend — main 04c1d18

Escopo: revisão estática de Edge Functions, adaptadores, migrations, worker e CI. Nenhuma consulta remota, aplicação de migration, mudança de segredo ou implementação. AGENTS.md e guia da plataforma lidos; skill Supabase consultada. A existência de código/migration prova implementação, não deploy nem comportamento real.

Complemento da frente principal: Deno979/979 e gate separado2/2 passaram, check limpo. CI do PR172 aplicou migrations do zero e pgTAP77 arquivos/2998 testes passou. A tentativa isolada bloqueada descrita ao fim é histórica; não prevalece sobre esses resultados. Eles não comprovam configuração/execução remota.

## Achados acionáveis

1. **P1 — E-mail v1 impede continuidade de cadência e reconciliação.** `supabase/functions/_shared/unipile/bridge-v1.ts:78-80` rejeita incondicionalmente `getEmail`, `listThreadEmails`, `listEmailSenders`. `send-step.ts:161` chama listEmailSenders ao conferir conversa existente; `send-step.ts:239-243` devolve `thread_check_failed` antes da liberação do próximo envio. `sequence-runner/handler.ts:171-173` também impede reconciliação de conta reconectada com páginas de e-mail. Impacto: o primeiro envio não demonstra funcionamento da cadência completa. O envio de resposta aprovada também confere conversa (`reply-proposal-send/handler.ts:87-95`). Critério: teste com adaptador v1 real, primeiro envio, resposta recebida, pausa, reconexão e próximo passo sem resposta; manter proteção contra webhook perdido, sem simplesmente retirar a conferência.
2. **P2 — Log temporário copia metadados pessoais e campos imprevistos do webhook.** `unipile-account-status/handler.ts:174-177` remove somente strings de body/body_plain e espalha o restante do JSON; `:266` escreve raw. Assim assunto, remetente, destinatários, anexos, headers e qualquer novo campo vão para logs. Está antes da restrição de credencial query-key `:269-273`. Não foi demonstrado vazamento de segredo: o achado é minimização insuficiente de dados de e-mail. Critério: remover temp_v1_mail_raw após validação ou usar allowlist de IDs estritamente necessários; teste garante ausência de endereço, assunto, texto, headers, anexos e campos extras.
3. **P2 — CRM-11 ainda não tem trilha persistida de execução externa com erro/correlação.** `signal-scan/handler.ts` na falha do Apify somente loga e responde 502/504; `signal-scan/index.ts` oferece actorForScan e recordCost, não persiste a falha. A execução agendada pelo signal-runner é diferente: `index.ts:104-109` passa p_error; `20260930180000_monitoramento_real_de_sinais.sql:597` persiste last_error. Portanto a alegação genérica de que nenhum erro é salvo é incorreta. A tabela `private.signal_monitor_runs` da migration `20261009050000` é preenchida pelo monitor interno; o runner externo não cria linhas nela. O ticket CRM-11 pede estado, timestamps, erro e correlação por execução. Critério: simular timeout/HTTP Apify, persistir rodada externa correlacionada e erro visível; repetir tentativa sem duplicar Sinais/cobrança.

## Alegações de hoje

- in_reply_to está implementado em `20261010011333_resposta_de_email_v1_por_in_reply_to.sql:39-40,132-145` e `events-v1.ts:232-253`; comparação é limitada ao envio da mesma conta remetente. Testes cobrem formato sintético; `events-v1.test.ts:262` e migration :10 explicitam formato real não confirmado. Manter como parcial/bloqueado por evidência real; não marcar resposta de sequência 3 recebida.
- temp_v1_mail_raw ainda existe. Remoção pendente confirmada.
- Quatro envios diretos pela Unipile não demonstram registro no app. Instagram não integra o contrato de envio do app: send-chat-step.ts:17 aceita somente whatsapp/linkedin e enviador-de-resposta.ts:13 somente email/whatsapp/linkedin. Envio direto externo não fecha suporte Instagram no app; permanece fora deste corte e precisa decisão de escopo.
- Hermes possui worker local/VPS implementado; indisponibilidade da senha root e execuções de ontem são relatos não confirmados nesta revisão. Não registrar indisponibilidade atual como fato comprovado.

## Inventário por área

| Área | Edge/worker | Tabelas e RPCs principais | Situação e limite |
|---|---|---|---|
| Sequências/canais | sender-accounts, unipile-account-status, sequence-step-sends, sequence-runner, sequence-attachments, received-email-attachments | private.sender_accounts, sender_connection_attempts, unipile_connections, sequence_documents, sequence_authorizations, sequence_step_sends, sequence_sender_holds, received_emails, received_chat_messages, unipile_email_events, unipile_chat_events, sequence_attachments; ingest_unipile_email_event, ingest_unipile_chat_event, claim_sender_reconciliations | Código de envio, ingestão, reconexão, idempotência, anexos e conciliação; e-mail v1 bloqueado conforme achado. V1 também rejeita anexo e reply_to_message_id (bridge-v1.ts:59-60), portanto paridade v2 não entregue. |
| Agentes/Hermes | agent-conversation, _hermes-worker/main.ts/worker.ts | private.agent_conversations, agent_runs, agent_run_events, agent_permissions, agent_settings; start_agent_run, claim_agent_run, append_agent_run_event, finish_agent_run, agent_search_target_accounts, agent_run_playbook, record_agent_run_cost | Fila, claim e idempotency keys implementados; ferramentas e dados passam por run_id; isolamento precisa pgTAP executado. README documenta timeout 10min se worker desligado, até 8min por run. Runtime/modelo/contêiner não confirmados. |
| Propostas de resposta | reply-proposal-runner, reply-proposal-send | private.reply_proposals, reply_proposal_jobs, reply_proposal_runner_settings; claim_reply_proposal_jobs, reply_proposal_context, reply_proposal_ai_key, consume_reply_proposal_cap, refund_reply_proposal_cap | Geração, teto, revisão e envio implementados. Falha de conferência bloqueia envio; e-mail v1 não atende. |
| Sinais | signal-scan, signal-runner e adaptadores | private.signal_actors, signal_monitors, signals, signal_rescans, signal_catalog, signal_monitor_runs; claim_due_signal_monitors, begin_account_scan, end_account_scan, record_signal, finish_signal_monitor_run, claim_signal_rescans | Reserva/debito/devolução, teto, datas e dedupe implementados; telemetria externa parcial CRM-11. Disponibilidade/custos reais dos actors não verificados. |
| Enriquecimento | account-discovery, account-enrichment, contact-photo-lookup | private.target_account_enrichments, proposed_contacts, discovery_runs, discovered_accounts, discovery_actors; existing_reveal_value, begin_reveal_contact, finish_reveal_contact, begin_cnpj_receita, finish_cnpj_receita, record_proposed_contact, count_known_committee_people | Cache consultado antes de revelar, reserva/finalização e custo no servidor. Resultado real e não duplicidade concorrente dependem testes de banco. |
| Créditos/cobrança | stripe-billing, stripe-webhook; _shared/orquestracao.ts | private.credit_action_prices, credit_reservations, credit_entries, credit_member_limits, workspace_billing, workspace_subscriptions, billing_settings, stripe_events, seat_credit_grants; billing_context, record_stripe_customer, apply_stripe_subscription, grant_seat_credits | Assinatura de webhook, eventos datados e cota por fatura implementados; checkout/renovação reais e preço/configuração não verificados. |
| Integrações/CRM | integration-connect, integration-callback, integration-tools, crm-handoff | private.integration_catalog, integration_connection_profiles, integration_accesses, integration_connect_attempts, integration_oauth_clients, integration_tool_rules, crm_handoffs; _shared/integration-access.ts e integracoes/banco-supabase.ts | OAuth/state, REST/MCP, permissões Ler/Propor/Executar e aprovação implementados. HubSpot/Notion perfis presentes; perfis.ts lista naoConfirmado explicitamente. Ticket 09 requer prova real. Não tratar catálogo como integração testada. |
| Segurança/ops | _shared/cors.ts, storage-purge, .github/workflows/ci.yml | RPCs de token dos runners, RLS privada e views security_invoker | Cobertura estática presente; nenhuma garantia de configuração remota ou deploy Caddy obtida. |

## Segurança e operação

`supabase/config.toml`: verify_jwt=false explicitamente em unipile-account-status (assinatura v2/header v1), sequence-runner, storage-purge, signal-runner e reply-proposal-runner (tokens do banco), stripe-webhook (assinatura), integration-callback (state OAuth), existing-account-email (resposta indistinguível/limite). Restantes declarações são true; funções sem seção específica usam default e exigem revisão do comando de deploy efetivo. Ausência de JWT nesses endpoints não é, isoladamente, vulnerabilidade.

CORS (`_shared/cors.ts`) usa APP_ORIGIN e admite localhost; isso não dispensa auth. Links de convite usam origem listada, sem aceitar localhost arbitrário. RLS aparece explicitamente nas tabelas privadas analisadas, views novas usam security_invoker e RPCs privilegiadas revogam public/anon conforme migrations. Nenhuma exploração de isolamento foi comprovada nesta amostragem; sem pgTAP não emitir selo de segurança. raw_user_meta_data encontrado para nome de exibição, não evidência de autorização baseada em metadado editável.

CI versiona jobs de frontend (npm ci/lint/test/build), banco (Supabase 2.118.0, migrations do zero, pgTAP) e funções (deno check e deno test + sem-base-fixa com permissão de leitura). CI verde não é prova de frontend/Edge/worker/migrations já implantados. README do Hermes contém modelo de exemplo e instruções de desabilitar toolsets; configuração real não foi inspecionada. Necessária decisão operacional sobre dono do deploy/worker e canal de acesso VPS, sem trocar ou pedir senha no chat.

## Feedback executado por esta frente

### Inventário verify_jwt de cada função

Leitura de `supabase/config.toml` versus os 25 diretórios com `index.ts`. Default refere-se à ausência de override versionado; não confirma flags do deploy remoto.

| Função | verify_jwt versionado |
|---|---|
| account-discovery | default true, sem seção própria |
| account-enrichment | default true, sem seção própria |
| account-password | true |
| agent-conversation | true |
| contact-photo-lookup | true |
| crm-handoff | true |
| csv-import | true |
| existing-account-email | false; resposta indistinguível/limite |
| integration-callback | false; state OAuth |
| integration-connect | true |
| integration-tools | true |
| received-email-attachments | default true, sem seção própria |
| reply-proposal-runner | false; token do runner |
| reply-proposal-send | true |
| sender-accounts | true |
| sequence-attachments | true |
| sequence-runner | false; token do runner |
| sequence-step-sends | default true, sem seção própria |
| signal-runner | false; token do runner |
| signal-scan | true |
| storage-purge | false; token do serviço |
| stripe-billing | true |
| stripe-webhook | false; assinatura Stripe |
| unipile-account-status | false; assinatura v2/header v1 |
| workspace-invitation-email | true |

Não concluir que verify_jwt=true sozinho protege as autorizações de negócio: handler/RPC conferem identidade/participação e escopo. Inventário de tabelas/RPCs acima é de contratos principais; não é listagem exaustiva de toda coluna e política histórica.

Comando: `deno test supabase/functions/_shared/unipile/bridge.test.ts supabase/functions/_shared/unipile/events-v1.test.ts supabase/functions/unipile-account-status/handler-v1.test.ts supabase/functions/reply-proposal-send/handler.test.ts supabase/functions/signal-runner/handler.test.ts`.
Resultado: GATE FAIL de infraestrutura, exit 1 antes de testes: não foi possível baixar manifesto https://jsr.io/@std/assert/meta.json; download de registry.npmjs.org/zod também foi iniciado. Nenhum teste dessa chamada passou ou falhou logicamente. A frente principal pode repetir com dependências disponíveis; não contar testes existentes como executados.

## Tickets/decisões para consolidação

- Não encerrar CRM-11 enquanto execução externa persistida/correlacionada com erro não for demonstrada.
- Não encerrar validação real canais-17 somente pelo teste direto fora do app; exigir sender account, envio do app, webhook e interação ligada à sequência em cada canal.
- Abrir ticket P1 continuidade/reconciliação e-mail v1, com critérios do achado 1.
- Abrir ticket P2 remover/minimizar log temporário, com critérios do achado 2.
- Usar CRM-11 existente para achado 3; evitar duplicata.
- Renan: obter acesso operacional VPS por via segura e confirmar resposta real ao e-mail; não alegar que sua senha mudou.
- Kauê/engenharia: teste integrado e-mail v1, deploy/runtime, provas LinkedIn/WhatsApp pelo app, validação HubSpot/Notion. A atribuição nominal é proposta baseada no relato, não ownership confirmado nos tickets.
- Decisão produto: anunciar explicitamente capacidades v1 (primeiro envio simples, sem anexo/resposta em thread) ou exigir paridade antes de disponibilizar cadência e resposta aprovada.

