# Handoff: orquestracao 01, Rotinas que rodam sozinhas

Branch `kaue/orq-01-rotinas`, base `main` (4424cc6). Ticket: `.scratch/orquestracao/issues/01-rotinas-que-rodam-sozinhas.md`, 11 de 11 critérios marcados. Nada foi aplicado no remoto nem publicado. Nenhuma Edge Function muda.

## O que foi feito

O pg_cron (`althius-agent-routines`, `*/5 * * * *`) chama `private.enqueue_due_agent_routines(p_now)`, que cria uma Execução `trigger_kind = 'rotina'` na mesma fila de `private.agent_runs` quando chega a hora de cada Rotina ativa. O worker do Hermes, a `agent-conversation` e `_shared/orquestracao.ts` não foram tocados, e os 1009 testes Deno passam sem edição.

- **Migration** `supabase/migrations/20261012120532_rotinas_que_rodam_sozinhas.sql` (aditiva, mais uma troca de assinatura explicada abaixo):
  - `private.agent_routines` ganha `owner_id`, `day_of_month` (1 a 28, obrigatório só na mensal), `next_run_at`, `last_fired_at` e `conversation_id`. `private.agent_runs` ganha `trigger_kind` e `routine_id` (`on delete set null`).
  - `private.next_routine_run(...)`: o próximo horário depois de um instante, na hora de Brasília, sempre no futuro. Um gatilho (`agent_routines_schedule`) o calcula ao criar a Rotina, ao mudar a agenda e ao retomar, então retomar nunca recupera horário perdido.
  - `private.enqueue_due_agent_routines(p_now)`: por Rotina vencida e não pausada, na ordem: dono ativo (senão pausa, `sem_dono`); Execução anterior aberta (pula, `execucao_aberta`, sem gastar o teto); teto (`consume_automation_cap` no escopo `rotina:<id>`, devolve `confirmar`, `sem_teto` ou `teto_atingido`); cria a Execução (`criada`). O próximo horário avança em todos os casos. A chave do pedido sai da Rotina e do horário previsto, e a violação do índice de uma Execução aberta por Conversa devolve o crédito e vira `execucao_aberta`.
  - Escopo `rotina:<id>` em `private.automation_scopes` ("Rotina · {Agente} · {início da tarefa}") e `private.automation_scope_runs` (a Rotina tem executor), mais o `check` do escopo em `private.automation_settings`. Apagar a Rotina leva o teto dela junto (gatilho).
  - `claim_agent_run` fecha como `routine_paused` a Execução de Rotina cuja Rotina foi pausada ou apagada, sem evento de modelo; a checagem de `membership_inactive` continua antes.
  - `create_agent_routine`, `update_agent_routine` e `list_agent_routines` passam a aceitar e devolver `day_of_month`; a lista devolve também o teto, o gasto do mês e por que a Rotina não roda.
- **Front**, só o que a tela precisa: a aba Rotinas pede o dia do mês da Rotina mensal e diz se a Rotina roda sozinha ou por que não; a página Automação e tetos ganha o grupo "Rotinas" (só aparece se houver alguma).

## Decisões (os padrões propostos nas dúvidas do ticket, sem resposta do Renan)

2. Só `rotina:<id>`, sem `acao:agentes` nem `agente:<id>`. O gasto continua somando em `agent_round`.
3. O teto vale com a cobrança desligada.
4. O dono é quem criou a Rotina. Quem edita uma Rotina cujo dono saiu do Workspace assume o dono.
5. `day_of_month` de 1 a 28, pedido na tela. As Rotinas mensais que já existiam ganharam o dia 1.
6. A Conversa da Rotina não entra no `history` do claim; ficou como estava (o claim não foi mexido nisso).

A dúvida 1 (a área do Renan) segue aberta: a lista de arquivos compartilhados abaixo é o que eu alterei.

## O que o ticket não previa

- `list_agent_routines`, `create_agent_routine` e `update_agent_routine` mudam de assinatura (colunas e parâmetro novos). Para não virar sobrecarga (o pgTAP de Agentes conta 15 funções por nome), as antigas saem (`drop function`) e as novas têm `p_day_of_month default null`: quem chama com seis argumentos continua valendo. A `list_agent_routines` não estava no "Pode mexer" (só a create e a update), mas sem ela a tela não lê o dia do mês nem o teto.
- O `check` do escopo em `private.automation_settings` (`automation_settings_scope_check`) é trocado por um que aceita `rotina:<uuid>`. Sem isso o Administrador não conseguiria aprovar o teto da Rotina.
- O relógio chama `private.expire_run_if_stale` na Execução aberta da Rotina: com o worker desligado, uma Execução parada além do prazo de 10 minutos fecha como `timeout` e não prende a Rotina para sempre.
- `conversation_id` na Rotina (a Conversa é criada no primeiro disparo e reaproveitada). Se o dono muda, o próximo disparo abre outra Conversa dele.
- O front tolera um banco sem a migration: só a Rotina mensal manda `p_day_of_month`, e a tela omite o teto quando a lista não o traz.

## Arquivos compartilhados que alterei (Renan: agentes, créditos e Aprovações)

- `supabase/migrations/20261012120532_rotinas_que_rodam_sozinhas.sql` (arquivo novo), que redefine:
  - tetos e créditos: `private.automation_scopes`, `private.automation_scope_runs` e o `check` de `private.automation_settings`;
  - Agentes: `public.claim_agent_run`, `create_agent_routine`, `update_agent_routine`, `list_agent_routines`, e colunas novas em `private.agent_routines` e `private.agent_runs`.
- `projeto-althius-frontend/src/paginas/configuracoes/secao-automacao.tsx` (o grupo Rotinas).
- `projeto-althius-frontend/src/fonte/automacao-tipos.ts` (o tipo `rotina` na união; `supabase-automacao.ts` não precisou mudar).
- `projeto-althius-frontend/src/fonte/tipos.ts` (campos novos opcionais em `Rotina`; `NovaRotina` os omite).
- `projeto-althius-frontend/src/fonte/supabase-agentes.ts`, `src/paginas/rotulos.ts` (`descreverFrequencia`) e `src/paginas/secoes/rotinas.tsx`.
- Nenhum teste existente foi alterado. Testes novos: `supabase/tests/rotinas_que_rodam_sozinhas.sql` (89), `src/fonte/supabase-agentes-rotinas.test.ts`, `src/paginas/rotulos-rotinas.test.ts`, `src/paginas/rotinas-que-rodam-sozinhas.test.tsx` e `src/paginas/configuracoes/automacao-rotinas.test.tsx`.

## Testes

- **Vermelho antes:** o pgTAP falhou com `column "routine_id" does not exist` (nenhuma estrutura existia); os 4 arquivos vitest falharam (10 de 11 testes vermelhos) antes do código.
- **Depois:** pgTAP do zero num Postgres 16 descartável com todas as migrations em ordem: a suíte inteira passa e `rotinas_que_rodam_sozinhas.sql` fecha 89/89. Deno: `deno test --allow-all supabase/functions` 1009 passaram, 0 falharam. Vitest, `tsc -b` e `oxlint`: ver o PR (o vitest inteiro rodou com `--maxWorkers=2`).
- **Os testes têm dentes:** com uma mutação de cada vez no SQL, falham as asserções certas ao tirar a checagem do dono (3), o recálculo ao retomar (2), a consulta ao teto (4), o `routine_paused` do claim (4), a expiração da Execução parada (3) e ao trocar o fuso de Brasília por UTC (41). Tirar só o `if exists` da Execução aberta não falha nenhum teste: o índice de uma Execução aberta por Conversa devolve o mesmo resultado (é a segunda trava, de propósito).
- O pgTAP não usa o relógio do banco para o disparo: `p_now` e os horários são fixos (09:00 de Brasília é 12:00 UTC). Só a retomada compara com `now()`, por faixa (próximo horário depois de agora e em até um dia). Evita o teste que quebra quando a data passa.
- O job do pg_cron não existe no Postgres local: o teste passa pela saída `sem pg_cron`. Quem o prova de verdade é o job "Banco" do CI (imagem com pg_cron).

## Passos do Nan

1. Com o CI verde e antes do merge, aplicar `supabase/migrations/20261012120532_rotinas_que_rodam_sozinhas.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (bloco atômico no `execute_sql`, depois conferir o `md5` do histórico e os advisors). Ela troca assinaturas de três funções e um `check`: nenhuma linha sai.
2. Conferir o relógio: `select jobname, schedule, command from cron.job where jobname = 'althius-agent-routines';` deve mostrar `*/5 * * * *`.
3. Nada a publicar nas Edge Functions. Publicar o frontend para a aba Rotinas e a página de Automação mostrarem o teto e o dia do mês (o frontend antigo continua funcionando com o banco novo).
4. As Rotinas que já existiam ganham dono (quem as gravou por último) e próximo horário, mas nascem sem teto: nenhuma roda até um Administrador aprovar o teto em Configurações › Automação e tetos, grupo Rotinas.
5. Para ver uma Rotina rodar de verdade, o worker do Hermes precisa estar ligado no computador do Nan (`supabase/functions/_hermes-worker/README.md`). Num Workspace de teste: criar uma Rotina diária para daqui a poucos minutos, aprovar um teto de 5 créditos e o automático dela, e esperar. Conferir com `select id, status, trigger_kind, routine_id, error_code from private.agent_runs where trigger_kind = 'rotina' order by created_at desc limit 5;`. Sem o worker, a Execução fica `queued` e vira `timeout` depois de 10 minutos.

## Riscos e o que não foi feito

- A estimativa que o relógio soma ao teto (3 rodadas de `agent_round`, hoje 3 créditos por disparo) é provisória: o ticket 02 acerta a diferença no fim da Execução. Com a chave de IA do cliente a estimativa sai maior do que o custo real.
- O resultado da Rotina não vai para o `destination_channel` (Slack, WhatsApp, Teams, e-mail): não há conector de saída, e o ticket deixou isso de fora. A Execução termina na Atividade do Agente.
- A Atividade do Agente no Workspace operacional ainda não lista Execuções (`atividade: async () => []`): ver a Execução da Rotina na tela depende de outro ticket. A Conversa da Rotina aparece na lista de Conversas do dono, no Agente.
- Um disparo atrasado (o cron parado) sai uma vez, atrasado; os horários intermediários não são recuperados.
