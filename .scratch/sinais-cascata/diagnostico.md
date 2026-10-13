# Fatia 0: diagnóstico (Sinais vazios, monitor que nunca roda, rescan da TOTVS sem erro real)

Status: resolved (diagnóstico do código; a confirmação em produção é uma consulta de leitura do Nan, abaixo).

Sem código de produto nesta fatia. Nada foi lido nem escrito no banco de produção: as consultas ficam prontas para o
Nan rodar no SQL Editor (todas só `select`).

> O que não deu para conferir: os arquivos `.scratch/sinais/*` citados no prompt não estão no repositório (nem em
> nenhuma branch), então o "0 linhas em `private.signals`" e o "único Monitoramento nunca rodou" são tomados do
> enunciado, não de uma consulta minha.

## 1. Por que `private.signals` tem 0 linhas e o Monitoramento nunca rodou

O caminho de um Sinal é uma corrente de cinco elos; qualquer um que falhe deixa o Monitoramento parado **sem rastro**:

| # | Elo | O que o código faz | Como falha em silêncio |
| --- | --- | --- | --- |
| 1 | Actor `available` | `claim_due_signal_monitors` e `private.signal_monitors_due()` fazem `join private.signal_actors ... a.state = 'available'` (`20260930180000_monitoramento_real_de_sinais.sql`, ~l.512 e ~l.553). `save_signal_monitor` também só aceita Sinal `available`. | Os 9 actors nascem `testing`. Só `.scratch/sinais-reais/registro-apos-o-teste.sql` (passo do Nan) os liberta. Se o actor voltou a `testing`/`out` depois de o Monitoramento ser criado, a rodada nunca é reivindicada e **`last_error` fica nulo**. |
| 2 | Endereço da função | `private.kick_signal_runner()` retorna `false` quando `function_url is null` (l.518–534). | O passo manual `select private.configure_signal_runner('https://<ref>.supabase.co')` é um por projeto. Sem ele o relógio dispara a cada 10 min e **não faz nada, sem log**. |
| 3 | `pg_cron` + `pg_net` | O bloco `do $cron$` (l.786–796) só agenda se as duas extensões estão *disponíveis*. | Num projeto sem elas (ou restaurado/migrado sem elas), não há job `althius-signal-runner`. Nenhum erro. |
| 4 | Função implantada | `net.http_post` é assíncrono; a resposta vai para `net._http_response`. | `signal-runner` não implantado (ou `verify_jwt` errado) devolve 404/401 e **ninguém lê** `net._http_response`. |
| 5 | Dado da Conta | `entrada()` do adaptador lança `SemDadoParaVarrer` sem página do LinkedIn; o Monitoramento termina com `last_error` ("Contas sem a página da empresa no LinkedIn…"). | Esse caso **grava `last_run_at`** e o motivo. Logo, se `last_run_at` é nulo, o problema está nos elos 1–4, não aqui. |

O mesmo vale para o modo "confirmar": `varrerMonitor` para com `MOTIVO_DA_PARADA.confirmar`, mas chama `finish(...)`, que
preenche `last_run_at` e `last_error`. Um Monitoramento com `last_run_at` nulo **não** foi parado por "confirmar".

**Conclusão do diagnóstico:** o sintoma "nunca rodou" (sem `last_run_at`, sem `last_error`) só é produzido pelos elos
1–4, e o elo 2 (`configure_signal_runner` não rodado) é o mais provável por ser o único passo 100% manual e sem
retorno. O código não tem bug nesses elos; o defeito é de **observabilidade**: nada diz ao dono que o relógio não está
chamando. A fatia 2 acrescenta `private.signal_runner_diagnostics()` (só leitura, uma linha) para essa conferência
ficar uma chamada só, e grava no run da cascata o erro real de cada passo.

### Consultas de leitura para o Nan (SQL Editor, na ordem; pare na primeira que explicar)

```sql
-- 1. Elo 1: algum actor está disponível? Qual o estado do actor do Monitoramento?
select a.signal_type, a.actor_id, a.state, a.version from private.signal_actors a order by a.signal_type;

-- 2. O Monitoramento: ativo? venceu? está reservado? já rodou? tem motivo?
select m.id, m.signal_type, m.state, m.next_run_at, m.claimed_until, m.last_run_at, m.last_error, m.scan_offset,
       jsonb_array_length(coalesce(m.audience -> 'accountIds', '[]'::jsonb)) as contas_no_publico
from private.signal_monitors m order by m.created_at;

-- 3. Elo 2: o endereço da função está gravado? (não imprime o token)
select (function_url is not null) as tem_endereco, function_url, updated_at from private.signal_runner_settings;

-- 4. Elo 3: as extensões e o job existem e estão ativos?
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
select jobid, jobname, schedule, active from cron.job where jobname like 'althius-signal%';

-- 5. O relógio disparou? (últimas execuções do job)
select d.jobid, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname = 'althius-signal-runner' order by d.start_time desc limit 10;

-- 6. Elo 4: o que a função respondeu ao relógio? (404 = não implantada; 401 = token; 5xx = erro dela)
select id, status_code, left(content::text, 200) as corpo, created
from net._http_response order by created desc limit 10;

-- 7. O Monitoramento está vencido para o relógio?
select private.signal_monitors_due() as ha_monitor_vencido;

-- 8. Elo 5 (se last_run_at existe): as Contas do público têm LinkedIn?
select count(*) filter (where t.linkedin_url is null) as sem_linkedin, count(*) as total
from private.signal_monitors m
join public.target_accounts t on t.workspace_id = m.workspace_id and t.id::text in (select jsonb_array_elements_text(m.audience -> 'accountIds'));

-- 9. O automático deixa rodar? (modo, teto, pausa, gasto)
select s.scope, s.mode, s.monthly_cap, s.paused_at from private.automation_settings s where s.scope = 'acao:varredura';
select r.action_key, r.status, r.amount, r.created_at from private.credit_reservations r
where r.action = 'account_scan' order by r.created_at desc limit 10;

-- 10. Resultado final
select count(*) as sinais from private.signals;
```

Leitura das respostas: (1) vazio de `available` → rode o bloco do actor em `registro-apos-o-teste.sql` depois da
execução real; (3) `tem_endereco = false` → `select private.configure_signal_runner('https://<ref>.supabase.co');`;
(4) sem job → as extensões não existem neste projeto; (6) `404` → `supabase functions deploy signal-runner`.

## 2. Por que o rescan TOTVS (`47723e73…`) falhou sem run id nem erro real

O rescan percorre `varrerBusca` → `varrerConta` → `deps.apify.run(...)` (`signal-runner/handler.ts`). Rastreando uma falha:

1. **O cliente usa o endpoint síncrono** `run-sync-get-dataset-items` (`signal-scan/apify.ts`, `rodar`). Em erro HTTP,
   o código faz `await resposta.body?.cancel()` e lança `new ApifyRequestError(status, runId)` com o `runId` do
   cabeçalho `x-apify-run-id`. Esse cabeçalho **não vem** nessa chamada (a própria nota do arquivo registra isso na
   execução real de 30/09). O corpo, que traz o erro verdadeiro do Apify, é **descartado sem ser lido**.
2. **`ApifyRequestError` só guarda o status**: `message = "Apify respondeu HTTP <n>"`. Nada do corpo.
3. **A falha não grava custo nem run**: em `varrerConta`, `gravarCustoDaExecucao` roda **depois** de
   `deps.apify.run` voltar com sucesso. Se `run` lança, não há `record_signal_scan_cost`, e o run (que talvez exista
   no Apify) nunca é associado ao Workspace.
4. **O erro some no `catch`**: em `varrerBusca`, o `catch (e)` só chama `log(...)` (console da função, que não é
   persistido pelo produto) e `falhas++`. Ao final, `buscas.finish(..., 'stopped', 0, '1 varredura falhou; tente de
   novo mais tarde.')`. O que chega a `signal_rescans.last_error` é essa frase genérica.
5. **Agravante conhecido:** o `signal-scan` da produção não tem o commit `bfef6c3` (corrige `custoDaExecucaoLida` para
   usar `usageTotalUsd` quando o actor cobra por evento e nenhum evento aparece); o commit não foi implantado.

**Causa-raiz:** não existe registro por passo. A falha de um run termina em `console.log` e numa frase genérica; o
run id (que só o corpo/a leitura posterior revela) e o erro real não têm onde ficar.

**O que o rescan da TOTVS gravaria com a fatia 2:** uma linha em `private.signal_cascade_runs` (estado `failed`,
`friendly_error` sem provedor) e uma linha em `private.signal_cascade_run_steps` com `apify_run_id` (da resposta do
`POST /v2/acts/{id}/runs`, não de `/runs/last`), `http_status`, `real_error` (truncado, sem segredo), `token_index`
usado e `cost_usd` real do run, mais a reserva liberada. A busca continua dizendo ao usuário só a frase neutra.

### Consulta de leitura para o rescan

```sql
select r.id, r.state, r.origin, r.scanned, r.last_error, r.requested_at, r.finished_at
from private.signal_rescans r where r.id::text like '47723e73%';
-- o que o Apify cobrou na Conta (se algo foi gravado)
select c.occurred_at, c.model_or_actor, c.input_units, c.cost_usd, c.source_ref
from private.action_costs c where c.action_type = 'apify_actor' order by c.occurred_at desc limit 20;
```
