> **SUPERSEDED (15/10/2026, rodada 4):** o Canal é **só WhatsApp**, pela Cloud API direta, sem SMS nem iMessage. Veja o [ADR-0027](../../docs/adr/0027-canal-whatsapp-com-controle-total.md), a [spec](./spec.md) e o [decisoes.md](./decisoes.md). Continuam valendo o mapa de ferramentas (seção 3), os níveis de risco e a segurança.

# Proposta: controlar a Althius inteira pelo SMS (e depois pelo WhatsApp, com o mesmo núcleo)

Status: proposta, para decisão do Renan. Ainda não muda spec.md, ADR nem issues. Data: 15/10/2026.
Base: [spec.md](./spec.md), [ADR-0026](../../docs/adr/0026-whatsapp-da-althius-numero-unico-pela-api-oficial.md), [pesquisa-instinct.md](./pesquisa-instinct.md), [validacao-instinct-2026-10-15.md](./validacao-instinct-2026-10-15.md) e o código do repo (`supabase/migrations`, `supabase/functions`, `projeto-althius-frontend/src/paginas`).

## 1. Visão e princípio

A pessoa com Participação manda um SMS ao número da Althius e faz o que faria na tela: consulta Contas-alvo e Sinais, pergunta quem respondeu, pede ao Agente, cria ou pausa Sequência e Rotina, revisa Playbook, convida alguém, conecta Integração e recebe avisos. O WhatsApp entra depois, pelo mesmo núcleo, trocando só o adaptador.

**Princípio inegociável: o chat nunca pode mais que a tela.**
- Toda ferramenta do chat chama **a mesma RPC que a tela chama**, **em nome da Conta de usuário** reconhecida pelo Telefone verificado. Valem a mesma RLS, o mesmo papel (Administrador/Membro), a mesma Permissão do Agente, o mesmo contrato (ADR-0025) e os mesmos Créditos.
- Nenhuma RPC nova "de canal" pode pular uma conferência. As únicas RPCs novas são de infraestrutura: identidade, sessão, token de confirmação e envio. As de negócio são as que já existem.
- O que a tela exige como login forte (segredos, OAuth, apagar dado) o chat entrega como **link de uso único com login**, como no Instinct.
- O cliente só vê **Créditos**. Nunca custo em dólar, nunca o provedor, nunca os rótulos internos de nicho.

Como "agir em nome da Conta": hoje as RPCs usam `auth.uid()`. A Edge Function do canal emite, para cada ferramenta, um **JWT curto (60 s) do próprio usuário**, assinado com o segredo do projeto e com `sub` = Conta, `role=authenticated` e uma claim `canal=sms`. Assim ela chama a RPC como a tela chamaria. A alternativa, uma RPC de service role que "repassa a identidade" (como a spec do WhatsApp propõe para as Aprovações), exige reescrever cada RPC. Recomendação: JWT curto, com a claim `canal` gravada na Atividade. **Decisão aberta D2.**

## 2. Diagrama

```mermaid
flowchart LR
  P[Provedor SMS<br/>(depois: WhatsApp Cloud API)] -->|webhook assinado| W[Edge Function<br/>canal-sms-events<br/>sem JWT]
  W --> A[Adaptador de Canal<br/>_shared/canal/adaptador.ts<br/>interface única SMS/WhatsApp]
  A -->|evento normalizado:<br/>texto, número E.164, id| D[Reserva idempotente<br/>claim_channel_message]
  D --> I[Identidade<br/>Telefone verificado → Conta de usuário]
  I --> X[Workspace<br/>último usado / lista numerada]
  X --> C{Comando curto?<br/>SIM, 1, 2, PARAR, AJUDA,<br/>trocar de workspace}
  C -->|sim| T[Resolve token pendente<br/>ou sessão]
  C -->|não| O[Orquestrador<br/>Coordenação / motor dos Agentes<br/>agent-conversation, _hermes-worker]
  O --> F[Ferramentas do Canal<br/>= RPCs da tela, com JWT do usuário]
  T --> F
  F -->|leitura| R[Resposta]
  F -->|reversível| S[Pede SIM no chat<br/>token de uso único]
  F -->|irreversível/sensível| L[Link de uso único<br/>com login na Althius]
  R --> E[Entrega<br/>canal-delivery via pg_net<br/>quebra em segmentos]
  S --> E
  L --> E
  E --> A
  A --> P
  N[Avisos proativos<br/>Rotinas, respostas, Aprovações] --> E
```

Partes que se reaproveitam:
- o padrão `createHandler(deps)`, a assinatura e a reserva de evento de `slack-channel-events` (`claim_slack_channel_event`);
- a execução com `trigger_kind='canal'` e a entrega por `pg_net` (`slack-channel-delivery`, `agent_runs_slack_channel_delivery`);
- a Coordenação (issue 04 do WhatsApp);
- as Aprovações (`decide_approval`, `approve_reply_proposal`, `reject_reply_proposal`, `claim_approved_action`);
- o Telefone verificado (issue 02 do WhatsApp).

## 3. Mapa de ferramentas por área

Todos os nomes de RPC e de função abaixo existem hoje no repo, nas migrations ou no front. Onde falta algo, está marcado **FALTA**. Risco: **L** = leitura (responde direto), **R** = reversível (pede SIM no chat), **I** = irreversível ou sensível (link de uso único com login).

| Área | Ferramenta do Canal | RPC / função real | Risco |
|---|---|---|---|
| Créditos | saldo e consumo | `get_credit_balance`, `list_credit_entries`, `get_contract_summary` | L |
| Créditos | limite por membro (Administrador) | `set_member_credit_limit`, `set_workspace_monthly_limit` | R |
| Contas-alvo | buscar / detalhar | `agent_search_target_accounts`, `agent_read_accounts_and_signals`, tabela `target_accounts` (RLS) | L |
| Contas-alvo | salvar / transferir responsável | `save_target_account`, `transfer_target_account_responsibility` | R |
| Contas-alvo | arquivar / restaurar | `archive_target_account`, `restore_target_account` | R |
| Contas-alvo | apagar | `erase_target_account` | I |
| Contas-alvo | descobrir contas (cotação em Créditos) | `quote_account_discovery` → `agent_request_account_discovery` / `begin_account_discovery`; Edge `account-discovery` | R (mostra Créditos) |
| Contas-alvo | aceitar ou descartar descobertas | `list_discovered_accounts`, `accept_discovered_account`, `discard_discovered_account` | R |
| Contatos | ler / atualizar / canais | `list_contact_channels`, `update_contact`, `set_contact_channels`, `create_contact` | L / R |
| Contatos | revelar contato (Créditos) | `quote_reveal_contact` → `begin_reveal_contact` | R (mostra Créditos) |
| Contatos | apagar | `erase_contact` | I |
| Sinais | listar / pedir novo sinal | `list_signals`, `list_account_signals`, `list_visible_signal_catalog`, `request_signal` | L / R |
| Sinais | buscar de novo (Créditos) | `quote_account_rescan` → `request_account_rescan` | R |
| Sequências | listar / detalhar | tabela `sequences` (RLS, como em `fonte/supabase-sequencias.ts`), `get_owned_sequence`, `list_sequence_step_sends` | L |
| Sequências | criar (rascunho) | `create_sequence`, `update_owned_sequence` | R |
| Sequências | ativar | `get_sequence_authorization` → `activate_sequence` | I (dispara envios a terceiros) |
| Sequências | pausar / retomar | **FALTA RPC dedicada**: hoje a tela faz `update` em `sequences`. Proposta: `set_sequence_paused` | R |
| Sequências | confirmar passo | `confirm_sequence_step` | R |
| Mensagens | mandar mensagem a um Contato | Proposta de resposta: `request_reply_proposal_again`/`edit_reply_proposal` → `approve_reply_proposal`; Edge `reply-proposal-send` | I* |
| Quem respondeu | respostas e resultados | `list_send_outcomes`, `send_outcome_rates`, `send_outcome_rates_by_approach`, `list_received_chat_messages`, `list_received_emails`, `list_reply_proposals`, tabela `account_interactions` | L |
| Rotinas | listar / criar / editar | `list_agent_routines`, `create_agent_routine`, `update_agent_routine` | L / R |
| Rotinas | pausar | `set_agent_routine_paused` | R |
| Rotinas | apagar | `delete_agent_routine` | I |
| Playbooks | ler seções | `list_playbook_sections`, `get_playbook_section` | L |
| Playbooks | propor revisão | `agent_propose_playbook_revision` (vira Aprovação) | R |
| Playbooks | salvar / restaurar versão | `save_playbook_section`, `restore_playbook_version` | R |
| Agentes | listar / conversar | `list_agents`, `start_agent_run` / `begin_agent_round`, Edge `agent-conversation` | L |
| Agentes | criar / configurar | `create_agent`, `save_agent_settings`, `set_agent_skill_active` | R |
| Agentes | memória | `list_agent_memory`, `edit_agent_memory_fact`, `delete_agent_memory_fact` | L / R |
| Agentes | apagar Agente | `delete_agent` | I |
| Aprovações | fila / decidir | `list_approvals`, `decide_approval`, `cancel_approval`, `approve_reply_proposal`, `reject_reply_proposal` | R (ação de Integração: I*) |
| Participações | listar / convites | `list_workspace_participants`, `list_workspace_invitations` | L |
| Participações | convidar / revogar convite | `invite_to_workspace` + Edge `workspace-invitation-email`, `revoke_workspace_invitation` | R |
| Participações | mudar papel / remover | `change_participant_role`, `remove_participant` | I |
| Integrações | estado | `list_workspace_integrations`, `integration_access_status` | L |
| Integrações | conectar / reconectar | `start_integration_connect` + Edge `integration-connect`/`integration-callback` (OAuth) | I (link OAuth) |
| Integrações | habilitar ou desabilitar no Workspace / regra de ferramenta | `enable_workspace_integration`, `disable_workspace_integration`, `set_integration_tool_rule` | I |
| Integrações | salvar chave de API | `save_integration_api_key` | **nunca no chat**: só link |
| Envio a ferramenta de vendas | entregar Conta à ferramenta conectada | `agent_propose_crm_handoff` → `crm_handoff_approval`; Edge `crm-handoff` | R (Aprovação) |
| Contas remetentes | estado / conectar | `list_owned_sender_accounts`, Edge `sender-accounts` (Unipile) | L / I (link) |
| Relatórios | uso e resultado | `get_cost_report` (**só Créditos ao cliente**; nunca US$), `send_outcome_rates*`, `list_queued_agent_runs` | L |
| Configurações | ritmo de envio, preferências | `set_send_pacing`, `set_send_cap`, `save_automation_setting`, `save_my_preferences` | R |

\* Mandar mensagem a terceiro e ação em Integração são **irreversíveis**. Proposta: mostrar o texto completo e aceitar "SIM" só se a Conta confirmou login nas últimas 12 h (step-up). Fora disso, vai link. **Decisão aberta D3.**

Implementação: as ferramentas entram no catálogo do motor como ferramentas de plataforma, no padrão de `agent_run_tools_context` e `integration-tools`. Cada uma tem um descritor (nome, RPC, nível de risco e papéis que podem). O Agente propõe a chamada. Quem decide se executa, pede SIM ou manda link é **o código, pelo nível de risco**, e não o modelo.

## 4. Níveis de risco

| Nível | Exemplos | Fluxo no SMS |
|---|---|---|
| **Leitura** | saldo, quem respondeu, listar Sequências | executa e responde |
| **Reversível** | pausar Sequência ou Rotina, criar rascunho, convidar, aceitar descoberta, gastar Créditos | resposta "Vou pausar a Sequência *Fintechs SP* (12 Contatos ativos). Responda SIM para confirmar ou NAO." O token de uso único fica ligado ao payload (hash, como `private.approval_payload_hash`), à Conta e ao Workspace, e vale 10 min. O "SIM" só vale se houver **exatamente um** token pendente. Com mais de um, a mensagem pede "SIM 2". |
| **Irreversível / sensível** | ativar Sequência, apagar, mudar papel, remover Participação, conectar ou desconectar Integração, mandar mensagem a terceiro (fora do step-up) | link de uso único, curto (`althius.app/a/Xk3…`), que **exige login** e mostra a confirmação na tela. Expira em 15 min e vale para uma ação só. Depois de decidir, a pessoa recebe "Feito." por SMS. |
| **Integrações** | conectar HubSpot, Google Ads etc. | sempre link para o OAuth (`start_integration_connect` → Edge `integration-connect`), já ligado à Integração, como o ConnectPage do Instinct. Chave de API nunca é digitada no SMS. |

## 5. Segurança

- **SIM swap / chip roubado:**
  - o SMS prova a posse do chip, não a pessoa, e por isso nada irreversível sai só por SMS;
  - revalidar o Telefone verificado a cada 30 dias (novo código);
  - se o provedor oferecer sinal de troca de chip (Infobip e Twilio têm produto de "SIM swap check"; na Zenvia é **incerto**), consultar antes de ações R;
  - avisar por e-mail toda primeira mensagem de um telefone recém-verificado.
- **STOP / opt-out:**
  - PARAR, SAIR e STOP desligam os avisos proativos na hora e respondem confirmando; VOLTAR religa; AJUDA responde com o link de suporte;
  - os comandos são reconhecidos sem IA e nunca chegam ao Agente;
  - opt-in explícito para proativos em Meu perfil.
- **Rate limit:**
  - por número: no máximo 20 mensagens a cada 10 min e 200 por dia;
  - por Workspace: um teto de Execuções por hora;
  - números desconhecidos têm teto global, com no máximo uma resposta por número por dia, contra flood e custo.
- **Idempotência:** cada id de mensagem do provedor é reservado uma vez (padrão `claim_slack_channel_event`) e usado como `client_request_id`. O token SIM é de uso único. A entrega é reservada uma vez.
- **Auditoria:** toda ferramenta grava na Atividade a Conta, o Workspace, `canal=sms`, a RPC, o hash do payload e o resultado. Os logs nunca trazem o texto, só os ids, como já faz `slack-channel-events`.
- **Assinatura do webhook:** verificada pelo método do provedor, em tempo constante. Se o provedor não assinar (é o caso de alguns callbacks de SMS), usar um segredo na URL e uma lista de IPs, registrando o risco.
- **Créditos por mensagem:** recusas, comandos, leituras simples e a escolha de Workspace **não gastam Crédito**, e o custo do SMS fica com a Althius. Cada Execução de Agente gasta Créditos como no app (`reserve_credits`/`settle_credits`). Pergunta aberta: repassar o custo do SMS como Crédito por segmento (D5).

## 6. Provedor SMS no Brasil

| | Twilio | Zenvia | Infobip | AWS End User Messaging (SNS) |
|---|---|---|---|---|
| 2-way no BR | Sim, mas **o long code BR é só P2P**. Para A2P, usa número internacional e "SenderId is not preserved" ([Twilio BR](https://www.twilio.com/en-us/guidelines/br/sms)). Short code em 2–4 semanas. | Sim: respostas chegam pela URL de callback (evento Reply) ([Zenvia KB](https://support.zenvia.com/kb/pt-br/article/294715/sms-integracao-e-enderecos-de-rede-url), [webhook de eventos](https://zenvia.movidesk.com/kb/article/365096/servico-webhook-de-eventos)). A URL é cadastrada **por e-mail ao atendimento**. Número dedicado ou short code próprio: **a confirmar com vendas**. | Sim: VLN ou short code no BR, inbound por webhook ([Infobip](https://support.infobip.com/how-do-i-use-sms-for-two-way-messaging), [docs](https://www.infobip.com/docs/sms/communication-options)) | Sim: o Brasil aparece com inbound suportado, e 2-way exige long code ou short code dedicado, com entrada pelo SNS ([AWS](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html), [2-way](https://docs.aws.amazon.com/sms-voice/latest/userguide/two-way-sms.html)) |
| Preço público | US$ 0,0599 por segmento de saída e de entrada; número internacional US$ 1,15/mês ([Twilio preços BR](https://www.twilio.com/en-us/sms/pricing/br), out/2026) | R$ 0,10 → R$ 0,07 por SMS, conforme o pacote (R$ 100 a R$ 2.000) ([Zenvia preços](https://zenvia.com/precos/)). Preço do inbound: **desconhecido** | Calculadora por país, sem valor fixo publicado ([Infobip preços](https://www.infobip.com/sms/pricing)): **desconhecido** | Por operadora, em CSV ([AWS preços](https://aws.amazon.com/end-user-messaging/pricing/)). Valor do BR **não verificado** |
| WhatsApp depois | Sim (BSP) | Sim (BSP; templates a partir de R$ 0,47–0,55) | Sim (BSP) | Sim (AWS Social Messaging), menos maduro |
| SIM swap check | Sim (Lookup) | **Desconhecido** | Sim | Não |
| Encaixe | Ótima documentação, mas o remetente não preservado é ruim para conversa | Local, em BRL, rotas nacionais, SMS e WhatsApp num contrato só | Global, forte em 2-way, preço opaco | Infra própria AWS, sem relação com o stack atual (Supabase) |

**Recomendação: Zenvia** para produção. É local, cobra em BRL, tem o menor preço público por SMS, recebe respostas por callback e serve de BSP para o WhatsApp depois, com um contrato só. O WhatsApp pode até ficar na Cloud API direta, se for mais barato.
- **Condição:** antes de assinar, confirmar com vendas três pontos: (1) um número ou short code **dedicado** e bidirecional, (2) o preço do inbound, (3) se o callback é assinado. Se a Zenvia falhar em (1), a segunda opção é a **Infobip** (VLN dedicado + SIM swap).
- **Twilio** só para **protótipo e testes**, com número internacional, sabendo que o remetente muda.
- Tudo atrás do adaptador: trocar de provedor é trocar um módulo.

## 7. Limites do SMS e como desenhar para eles

- **Tamanho:** 160 caracteres em GSM-7, ou **70** com acento ou emoji (UCS-2). Uma mensagem concatenada fica em 153 ou 67 por segmento, **cada segmento é cobrado** e a entrada também é cobrada no Twilio. Português tem acento, então conte com 70/67. Regras:
  - respostas com no máximo 3 segmentos;
  - acima disso, mandar um resumo e um link de leitura (com login);
  - opção de "modo sem acento" (transliterar) para caber em GSM-7. **D6.**
- **Sem botões:** usar códigos curtos e fixos:
  - SIM/NAO para confirmar;
  - 1, 2, 3 para escolher na lista;
  - "SIM 2" quando houver mais de um pendente;
  - MAIS para a próxima página;
  - AJUDA, PARAR, VOLTAR;
  - "trocar de workspace" e "nova conversa".
- **Sem formatação nem mídia:** nada de negrito nem listas largas, e sem áudio. Áudio e mídia ficam para o WhatsApp.
- **Ordem não garantida:** a AWS avisa que o inbound pode chegar fora de ordem. Ordenar pelo timestamp do provedor e tratar um só pedido por vez ("ainda estou trabalhando").
- **Custo:** cada pergunta e resposta de 2–3 segmentos custa aproximadamente R$ 0,30–0,60 com inbound pago (estimativa pela tabela Twilio), ou menos na Zenvia. Avisos proativos multiplicam isso. Daí o opt-in e o resumo diário.

## 8. Avisos proativos e "quem respondeu"

- **"Quem respondeu?" (pull):** a ferramenta L junta `list_send_outcomes` + `list_received_chat_messages` + `list_received_emails` + `list_reply_proposals`, filtrando pela Conta e pelo período ("hoje", "esta semana"). Responde em lista numerada curta: "3 responderam hoje: 1) João (Acme), LinkedIn; 2)… Responda 1 para ver a resposta e a sugestão."
- **Proativo (push, com opt-in por tipo em Meu perfil):**
  - resposta de lead recebida com Proposta de resposta pronta: "João (Acme) respondeu. Proposta pronta. Responda VER." O gancho é a criação da Proposta (`enqueue_reply_proposal` / `reply-proposal-runner`);
  - Aprovação esperando a pessoa (`list_approvals`);
  - Rotina terminou (`finish_agent_run` com `trigger_kind` de Rotina);
  - Sinal novo em Conta-alvo da pessoa (`record_signal_on_known_account`);
  - Sequência pausada por falta de Conta remetente (`hold_sequences_of_lost_sender`);
  - Créditos acabando (`credit_headroom`).
- **Mecanismo:** uma tabela de avisos, `channel_notices`, recebe uma linha por gatilho no banco e é drenada pela Edge `canal-delivery` via `pg_net`. Ela respeita o opt-in, o horário (09h–21h, sem domingo para o que não for urgente, alinhado às regras de operadora citadas pela Twilio BR), o agrupamento (no máximo 1 SMS a cada 30 min, juntando os avisos) e o teto diário.
- No WhatsApp, o mesmo aviso fora das 24h vira template de utilidade. É o mesmo núcleo, e o adaptador decide.

## 9. Impacto no plano atual

**ADR-0026 precisa mudar:**
- hoje ele diz "O SMS não é um Canal: serve só para o código de verificação e para avisos";
- nesta proposta, o **SMS vira um Canal** e o WhatsApp vira o segundo adaptador;
- é preciso um **ADR novo, "ADR-0027: Canal da Althius por SMS e WhatsApp com controle total pelas RPCs da tela"**, cobrindo o princípio "chat ≤ tela", o JWT curto do usuário, os três níveis de risco, o provedor de SMS e o opt-out. O ADR-0026 fica só com a parte do WhatsApp (número único, API oficial, cláusula 4.7) e passa a citar o 0027.

**Issues existentes de `canais-althius`:**

| Issue | Destino |
|---|---|
| 01 Adaptador com simulador | **Muda**: a interface vira "adaptador de Canal" (SMS e WhatsApp). O simulador é o mesmo. |
| 02 Telefone verificado | **Fica** (sem mudança de escopo) + revalidação a cada 30 dias e opt-in de avisos. |
| 03 Habilitar em Conexões | **Muda**: o cartão passa a ser "SMS" (depois WhatsApp), e o SMS aparece no catálogo. |
| 04 Coordenação no motor | **Fica**, generalizada para a origem `sms`/`whatsapp`. |
| 05 Conversar por texto | **Muda**: primeiro pelo SMS (segmentação, sem formatação). |
| 06 Workspace e Conversa nova | **Fica**. |
| 07 Janela de 24h | **Adia**: só para o adaptador WhatsApp. |
| 08 Áudio transcrito | **Adia**: só WhatsApp. |
| 09 Aprovar Proposta por botão | **Muda**: vira "SIM no chat com token" (SMS) e botão (WhatsApp, depois). |
| 10 Aprovação de ação | **Muda**: entra na regra de risco I (link com login, ou step-up). |
| 11 Provedor real | **Divide**: 11a SMS (Zenvia), 11b WhatsApp (depois do retorno sobre a 4.7). |
| 12 Validação E2E | **Divide**: 12a SMS, 12b WhatsApp. |

**Lista nova, em ordem:**
1. **ADR-0027** e atualização do ADR-0026 (doc).
2. **01′ Adaptador de Canal + simulador** (SMS primeiro).
3. **02 Telefone verificado** (+ revalidação e opt-in).
4. **03′ Habilitar o Canal SMS em Conexões.**
5. **N1 Identidade do usuário para as ferramentas** (JWT curto, claim `canal`, auditoria). **Novo.**
6. **04 Coordenação no motor** (origem `sms`).
7. **05′ Conversar por SMS** (leitura: Créditos, Contas, Sinais, quem respondeu).
8. **06 Workspace e Conversa nova.**
9. **N2 Catálogo de ferramentas de plataforma por risco** (descritor, papéis, L/R/I), começando pelas de leitura. **Novo.**
10. **N3 Confirmação SIM com token de uso único** (risco R). **Novo.** Absorve parte da 09.
11. **N4 Link de ação de uso único com login** (risco I + OAuth de Integração). **Novo.** Absorve a 10.
12. **N5 Ferramentas de gestão:** Sequências (inclui a RPC que falta, `set_sequence_paused`), Rotinas, Playbooks, Participações, Agentes. **Novo**, possivelmente dividido por área.
13. **09′ Mandar mensagem a Contato pelo SMS** (Proposta + step-up).
14. **N6 Avisos proativos** (`channel_notices`, opt-in, horário, agrupamento, PARAR/VOLTAR). **Novo.**
15. **N7 Segurança operacional:** rate limit, teto de desconhecidos, alerta de SIM swap. **Novo.**
16. **11a Provedor SMS real** (Zenvia) + wizard.
17. **12a Validação ponta a ponta SMS.**
18. Depois: **11b WhatsApp real** (Cloud API ou BSP, depois do retorno da Meta), **07** janela de 24h, **08** áudio, botões no lugar de SIM, **12b**.

## 10. Decisões abertas para o Renan

- **D1:** SMS primeiro mesmo? Ele custa mais por mensagem que o WhatsApp de serviço e não tem áudio. A vantagem é não depender da cláusula 4.7 da Meta.
- **D2:** como agir em nome do usuário: JWT curto do usuário (recomendado) ou RPCs de service role com a identidade repassada.
- **D3:** mandar mensagem a lead e fazer ação em Integração pelo SMS: só por link, ou "SIM" com step-up (login nas últimas 12 h)?
- **D4:** provedor: Zenvia (recomendado, depende de confirmar número dedicado bidirecional e preço do inbound) ou Infobip.
- **D5:** o custo do SMS fica com a Althius ou vira Crédito por segmento para o cliente?
- **D6:** transliterar acentos para caber em 160 caracteres?
- **D7:** quem pode o quê pelo chat: o mesmo que a tela (proposta) ou um subconjunto inicial (por exemplo, sem `remove_participant` e sem `delete_agent` na v1, mesmo com link)?
- **D8:** horário e teto dos avisos proativos (proposta: 09h–21h, 1 SMS a cada 30 min, no máximo 10 por dia).
