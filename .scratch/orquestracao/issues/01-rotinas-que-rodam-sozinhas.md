# 01: Rotinas que rodam sozinhas

**What to build:** as Rotinas dos Agentes (`private.agent_routines`) existem só como cadastro: o comentário da própria tabela diz "nenhum executor as roda ainda" (`supabase/migrations/20260929140000_agentes_e_permissoes.sql:176`) e a auditoria de 01/10 repete que nada as executa. O pg_cron, que já expira as Aprovações (`althius-expire-approvals`, `20261001130000_aprovacoes_reais.sql:384`) e roda o Executor da Sequência (`20260927020000_executor_da_sequencia.sql:117`), passa a criar uma Execução do tipo `rotina` na **mesma fila** de `private.agent_runs` quando chega a hora de cada Rotina ativa. O worker do Hermes e a ponte `agent-conversation` **não mudam**: `list_queued_agent_runs` já lista tudo que está `queued`, e `claim_agent_run` já reserva uma vez só. Cada Rotina pode ser pausada e retomada, e tem um teto mensal de Créditos próprio, que o Administrador define e sem o qual a Rotina não roda ("nada automático roda sem um teto aprovado", `docs/visao-geral-da-plataforma.md`, seção 3).

**Blocked by:** None.

**Status:** ready-for-human (código e testes prontos com os padrões propostos nas dúvidas; faltam a migration `20261012120532` e ver uma Rotina rodar de verdade; ver `.scratch/handoffs/orq-01.md`)

## O que existe hoje (lido na `main` em 12/10/2026)

- `private.agent_routines` (`20260929140000_agentes_e_permissoes.sql:177`): `task`, `frequency` (`diaria`, `semanal`, `mensal`), `weekday`, `run_time` (`HH:MM`), `destination_channel`, `paused`, `updated_by`. Não tem dono, fuso, dia do mês, última nem próxima execução. As funções públicas são `create_agent_routine` (`:781`), `update_agent_routine` (`:801`), `set_agent_routine_paused` (`:822`), `delete_agent_routine` (`:840`) e `list_agent_routines`; a tela já as usa (`projeto-althius-frontend/src/fonte/supabase-agentes.ts:278-301`).
- `private.agent_runs` (`20260929180000_conversas_dos_agentes.sql:32`) exige `conversation_id`, `requested_by` (usuário), `client_request_id` (único por `requested_by`) e `request_text` de 1 a 4000 caracteres. O índice `agent_runs_one_open_per_conversation` (`:54`) deixa uma Execução aberta por Conversa.
- `claim_agent_run` (`:356`) só reserva `queued` e fecha como `membership_inactive` se quem pediu saiu do Workspace. O worker lê o `kind` da Conversa (`agente` ou `coordenada`) e o `agent_id` (`supabase/functions/_hermes-worker/worker.ts:401-410`, `_shared/orquestracao.ts:16`).
- O precedente de trabalho automático que cria pedido e consulta teto é `private.enqueue_monthly_rescans` (`20260930200000_reativacao_de_sinais.sql:410`, agendado em `:535-536`), que chama `consume_automation_cap` (`20260930170000_interruptores_e_tetos.sql:161`).
- Os escopos de teto vêm de `private.automation_scopes` (`20260930170000_interruptores_e_tetos.sql:52`: `acao:*`, `agente:<id>`, `integracao:<id>`) e quais escopos têm executor, de `private.automation_scope_runs` (`20261009010000_teto_das_propostas_de_resposta.sql:15`). A tela é `projeto-althius-frontend/src/paginas/configuracoes/secao-automacao.tsx`.
- O front já conhece o gatilho: `Gatilho = 'conversa' | 'mencao' | 'coordenacao' | 'rotina' | 'canal'` (`src/fonte/tipos.ts:338`, `src/paginas/rotulos.ts:3`).

## Desenho

- Migration aditiva em `private.agent_routines`: `owner_id` (quem criou; preenchido com `updated_by` nas linhas existentes, e a Rotina sem dono ativo não roda), `day_of_month` (só `mensal`), `next_run_at` e `last_fired_at`. Fuso fixo `America/Sao_Paulo`, como a Sequência.
- Em `private.agent_runs`: `trigger_kind` (`conversa` por padrão, ou `rotina`) e `routine_id` (referência com `on delete set null`, para o histórico sobreviver à Rotina apagada).
- Uma Conversa por Rotina, criada no primeiro disparo, de `kind = 'agente'` com o `agent_id` da Rotina e dona = o dono da Rotina. É o que mantém **o worker intacto**: para ele, é um pedido ao Agente da página. O texto do pedido é `task`.
- `private.enqueue_due_agent_routines(p_now timestamptz default now())`, chamada pelo pg_cron a cada 5 minutos (`althius-agent-routines`, só onde o pg_cron existe, como em `20261001130000_aprovacoes_reais.sql:379-385`). Para cada Rotina vencida e não pausada, na ordem: dono ativo; teto da Rotina (`consume_automation_cap(workspace, 'rotina:<id>', estimativa)`); cria a Execução com `client_request_id` derivado de (Rotina, horário previsto), para o mesmo horário nunca criar duas; avança `next_run_at`.
- Escopo novo `rotina:<id>` em `private.automation_scopes` (nome "Rotina · {Agente} · {início da tarefa}") e em `private.automation_scope_runs` (a Rotina tem executor). Assim ela aparece em Configurações › Automação e tetos sem tela nova, com o teto obrigatório.
- A estimativa que o cron soma ao teto é provisória: o limite de rodadas de uma Conversa de Agente, `MAX_RODADAS_DO_PEDIDO = 3` (`_shared/orquestracao.ts:203`), em créditos de `agent_round` (1). O ticket 02 acerta a diferença no fim da Execução.
- `claim_agent_run` passa a fechar como `routine_paused` a Execução de Rotina cuja Rotina foi pausada ou apagada depois de entrar na fila (a corrida entre o cron e o clique em "pausar"). Redefinida a partir da definição mais recente da `main`.

## Critérios

- [x] Rotina diária com `run_time = '09:00'`: com o relógio às 08:59 (Brasília) o cron não cria nada; às 09:00 cria uma Execução `queued` com `trigger_kind = 'rotina'`, `routine_id`, `requested_by` = dono e `request_text` = `task`. Rodar o cron de novo no mesmo horário não cria a segunda.
- [x] Semanal só dispara no `weekday` dela; mensal só no `day_of_month`; as três frequências avançam `next_run_at` para o próximo horário futuro.
- [x] Rotina pausada não cria Execução. Retomar não gera rajada: `next_run_at` vira o próximo horário futuro e nenhum horário perdido é recuperado.
- [x] Com a Execução anterior da mesma Rotina ainda `queued` ou `running`, o horário seguinte é pulado em vez de criar outra. Com o worker desligado, a fila guarda no máximo uma Execução por Rotina.
- [x] Execução de Rotina que entra na fila e cuja Rotina é pausada ou apagada antes do `claim_agent_run`: o claim devolve `null` e fecha a Execução como `failed` com `routine_paused`, sem evento de modelo.
- [x] Dono que saiu do Workspace: o cron não cria Execução e a Rotina fica pausada; uma Execução já na fila fecha com `membership_inactive`, como hoje.
- [x] Teto: sem teto aprovado, em `confirmar` ou no teto, o cron não cria Execução e devolve o motivo do `consume_automation_cap` (`confirmar`, `sem_teto`, `teto_atingido`); ao bater o teto sai um Aviso do Workspace uma vez. O teto de uma Rotina não bloqueia outra Rotina do mesmo Agente nem as Conversas.
- [x] `list_queued_agent_runs` lista a Execução de Rotina e `claim_agent_run` a devolve com `kind = 'agente'` e o `agent_id` da Rotina. O diff não toca `supabase/functions/_hermes-worker/` nem `_shared/orquestracao.ts`, e os testes Deno do worker passam sem edição.
- [x] Isolamento: um Workspace nunca dispara, lista nem consome o teto de Rotina de outro. As funções novas são só do cron e do `service_role` (`revoke` explícito) e as colunas novas não ficam legíveis por `authenticated` fora das funções que já existem.
- [x] `list_automation_settings` mostra as Rotinas com o teto e o gasto do mês; salvar Automático numa Rotina sem teto é recusado, como nos outros escopos.
- [x] Onde existe o pg_cron, o job `althius-agent-routines` existe com `*/5 * * * *` (mesmo molde de `supabase/tests/executor_da_sequencia.sql:88-107`).

## Pode mexer

- Uma migration nova, com timestamp UTC maior que a última da `main` (hoje `20261012120000`), e um pgTAP novo: `supabase/tests/rotinas_que_rodam_sozinhas.sql`.
- Colunas novas de `private.agent_routines` e `private.agent_runs`, e as funções `create_agent_routine`/`update_agent_routine` (só para aceitar `day_of_month` e preencher o dono), redefinidas a partir da definição mais recente.
- `private.automation_scopes` e `private.automation_scope_runs`, redefinidas a partir da mais recente (a de `20261009010000`), só para acrescentar o escopo `rotina:`.
- `claim_agent_run`, só para o fechamento `routine_paused`.
- No front, só a aba Rotinas (`projeto-althius-frontend/src/paginas/secoes/rotinas.tsx`: campo do dia do mês e o teto mostrado) e a Fonte dela, em `src/fonte/supabase-agentes.ts`.

## Não mexa

- Em `supabase/functions/_hermes-worker/`, `supabase/functions/agent-conversation/` e `_shared/orquestracao.ts`: o worker não muda é o critério do ticket.
- Em testes existentes: um ticket só acrescenta testes. Em particular `conversas_dos_agentes.sql` (lista as funções do contrato) e `interruptores_e_tetos.sql`.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Não entrega o resultado da Rotina no `destination_channel` (Slack, WhatsApp, Teams, e-mail): não há conector de saída para isso. A Execução termina na Atividade do Agente; mandar para fora segue a Permissão do Agente (ADR-0002) e é outro ticket.

## Arquivos compartilhados com a área do Renan

(Área do Renan = tetos e créditos, Aprovações e Conexões; ver a primeira dúvida.)

- `20260930170000_interruptores_e_tetos.sql`: `private.automation_scopes`, `consume_automation_cap`, `workspace_notices`. A frente de créditos (`ralph/frente-creditos`) já redefiniu o que decide quem roda sozinho em `20261009010000_teto_das_propostas_de_resposta.sql` (`automation_scope_runs`, `save_automation_setting`, `list_runnable_automation_scopes`): redefinir sempre a partir dela.
- `projeto-althius-frontend/src/paginas/configuracoes/secao-automacao.tsx` e `src/fonte/supabase-automacao.ts` (a página de Automação passa a listar Rotinas).
- `supabase/tests/interruptores_e_tetos.sql` e `teto_das_propostas_de_resposta.sql`: só leitura. O segundo afirma o comportamento de `save_automation_setting`.
- `20260929140000_agentes_e_permissoes.sql` (funções de Rotina), de `pagina-de-agentes`/`crm-real-e-stack` 13.

## Dúvidas para o Renan

1. **A "área do Renan" é esta?** Li pelo histórico: tetos e créditos (decisões dele de 08/10 em `creditos-e-planos/03`), a fila de Aprovações (`crm-real-e-stack` 15), Conexões e o `reply-proposal-runner`. Confirme se a lista acima está completa.
2. **A Rotina precisa de `acao:agentes` e do `agente:<id>` além do próprio `rotina:<id>`?** Na proposta de resposta, "Execuções de Agentes e o Rhetor precisam liberar" e a rodada soma o crédito aos dois. Padrão proposto: só `rotina:<id>`, porque o Administrador cria a Rotina de propósito e o teto dela é a aprovação; o gasto continua somando em `agent_round`.
3. **O teto vale com a cobrança desligada?** Na proposta de resposta ele vale ("o teto vale mesmo com a cobrança desligada"). Padrão proposto: igual.
4. **Quem é o dono, para o limite mensal por pessoa?** `credit_member_limits` consulta `requested_by`. Padrão proposto: o dono da Rotina; se ele sai, a Rotina pausa.
5. **`mensal` não tem dia no banco hoje.** Padrão proposto: `day_of_month` de 1 a 28, obrigatório na frequência `mensal`, pedido na tela.
6. **A Conversa da Rotina entra no `history` do claim** (as últimas 10 trocas terminadas)? Padrão proposto: não; cada disparo é independente e o histórico da Rotina é a Atividade.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md`, com o CI verde e antes do merge. O pg_cron já existe no projeto `ycbdilsmydvzezhlymty` (outros jobs usam); conferir que `althius-agent-routines` aparece em `cron.job`.
2. Nada a publicar: nenhuma Edge Function muda.
3. Para ver uma Rotina rodar de verdade, o worker do Hermes precisa estar ligado no computador do Nan (`supabase/functions/_hermes-worker/README.md`). Criar uma Rotina de teste num Workspace de teste, com teto de poucos créditos, e esperar o próximo horário. Sem o worker, a Execução fica `queued` e vira `timeout` depois do prazo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-10-12 (agente). Feito com os padrões propostos nas dúvidas 2 a 6 (a 1 só confirma a lista de arquivos compartilhados abaixo). Migration `supabase/migrations/20261012120532_rotinas_que_rodam_sozinhas.sql` (não aplicada) e pgTAP `supabase/tests/rotinas_que_rodam_sozinhas.sql` (89 asserções, escrito vermelho primeiro). Detalhes, decisões e o que o ticket não previa em `.scratch/handoffs/orq-01.md`.
  - O critério 11 (o job `althius-agent-routines`) só se prova num banco com pg_cron: o Postgres local não o tem, então o pgTAP passa pela saída `sem pg_cron`; quem prova é o job "Banco" do CI.
  - A estimativa provisória que o relógio soma ao teto é de 3 rodadas de `agent_round`. O ticket 02 acerta a diferença no fim da Execução.
