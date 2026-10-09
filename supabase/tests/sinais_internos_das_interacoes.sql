begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(55);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é de fora. Nenhum actor do Apify está disponível: os Sinais internos não
-- dependem dele.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@fora.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fc000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fc000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'admin', true),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 'member', true),
  ('fc000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('dc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test', 'delta.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000001', 'Epsilon', 'https://epsilon.test', 'epsilon.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-000000000001', 'Zeta', 'https://zeta.test', 'zeta.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-000000000001', 'Eta', 'https://eta.test', 'eta.test', '5c000000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000009', 'fc000000-0000-0000-0000-000000000002', 'Sul S/A', 'https://sul.test', 'sul.test', '5c000000-0000-0000-0000-000000000003');

-- As Interações reais de cada Conta, em dias atrás. O Sinal dispara no dia em que o prazo venceu (a Interação mais o prazo):
--   Alfa     e-mail enviado 40, mensagem enviada 35                       → sem resposta desde o e-mail de 40 dias
--   Beta     e-mail enviado 60, e-mail recebido 50                        → a conversa parou há 50 dias
--   Gama     e-mail enviado 10                                            → ainda dentro do prazo de 30 dias
--   Delta    e-mail enviado 100, reunião 90, e-mail enviado 50, mensagem enviada 45
--            → sem resposta desde o e-mail de 50 dias; continuou escrevendo, então não é negociação parada
--   Epsilon  e-mail enviado 40, mas a Conta está arquivada                → não recebe Sinal
--   Zeta     nenhuma Interação                                            → nada
--   Eta      e-mail enviado 400                                           → o prazo venceu há muito: Sinal já vencido
insert into public.account_interactions (id, workspace_id, target_account_id, kind, occurred_at, recorded_by) values
  ('ec000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'email-enviado', now() - interval '40 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'mensagem-enviada', now() - interval '35 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000002', 'email-enviado', now() - interval '60 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000002', 'email-recebido', now() - interval '50 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000003', 'email-enviado', now() - interval '10 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000004', 'email-enviado', now() - interval '100 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000004', 'reuniao', now() - interval '90 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000008', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000004', 'email-enviado', now() - interval '50 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000009', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000004', 'mensagem-enviada', now() - interval '45 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000005', 'email-enviado', now() - interval '40 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000013', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000007', 'email-enviado', now() - interval '400 days', '5c000000-0000-0000-0000-000000000001');
update public.target_accounts set archived_at = now() where id = 'dc000000-0000-0000-0000-000000000005';

-- A Aderência fica separada: Alfa já é Fit e Beta é Não fit (Descartada) antes de qualquer Sinal.
select private.record_prospecting_event('fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'fit');
select private.record_prospecting_event('fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000002', 'nao_fit');

create temporary table r (k text primary key, id uuid, at timestamptz) on commit drop;
grant all on r to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);

-- 1. O catálogo: os Sinais internos reais e de onde vêm; os externos seguem o estado do actor deles.
select is(
  (select array_agg(row(signal_type, origin, state)::text order by signal_type) from public.list_signal_catalog()
   where origin = 'interno'),
  array['(negociacao_parada,interno,available)', '(sem_resposta,interno,available)'],
  'o catálogo traz os dois Sinais internos que saem das Interações, disponíveis'
);
select is(
  (select row(origin, state)::text from public.list_signal_catalog() where signal_type = 'vaga_linkedin'),
  '(externo,testing)', 'um Sinal externo aparece com o estado do actor dele'
);
select is(
  (select count(*)::integer from public.list_signal_catalog() where signal_type = 'proposta_recusada'), 0,
  'proposta recusada não entra: nenhuma Interação a registra'
);

-- 2. O Monitoramento interno: configuração própria, criada por qualquer participante, sem actor disponível.
insert into r (k, id) select 'sem', public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Sem resposta em 30 dias', 'rascunho',
  '{"accountIds":["dc000000-0000-0000-0000-000000000001","dc000000-0000-0000-0000-000000000002","dc000000-0000-0000-0000-000000000003","dc000000-0000-0000-0000-000000000004","dc000000-0000-0000-0000-000000000005","dc000000-0000-0000-0000-000000000006","dc000000-0000-0000-0000-000000000007"]}',
  '{"prazo":"30"}', 24);
select is(
  (select row(signal_type, state, criteria ->> 'prazo')::text from public.list_signal_monitors('fc000000-0000-0000-0000-000000000001')
   where id = (select id from r where k = 'sem')),
  '(sem_resposta,rascunho,30)', 'o Monitoramento interno fica gravado como rascunho, com o prazo'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{}', '{"prazo":"0"}', 24)$$,
  '22023', 'invalid monitor', 'prazo zero é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{}', '{"prazo":"trinta"}', 24)$$,
  '22023', 'invalid monitor', 'prazo que não é número de dias é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{}', '{"prazo":"400"}', 24)$$,
  '22023', 'invalid monitor', 'prazo acima de um ano é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{}', '{"prazo":"30","etapas":["Proposta"]}', 24)$$,
  '22023', 'invalid monitor', 'um critério que a avaliação não usa é recusado em vez de fingir que filtra'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{}', '{}', 24)$$,
  '22023', 'invalid monitor', 'sem prazo é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Recusadas', 'rascunho', '{}', '{"prazo":"90"}', 24)$$,
  '55000', 'signal type is not available', 'um Sinal interno fora do catálogo não cria Monitoramento'
);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Ruim', 'rascunho', '{"accountIds":["dc000000-0000-0000-0000-000000000009"]}', '{"prazo":"30"}', 24)$$,
  '22023', 'invalid monitor', 'Conta de outro Workspace no público é recusada'
);

reset role;
select is(
  (select count(*)::integer from private.signal_monitor_runs where monitor_id = (select id from r where k = 'sem')), 0,
  'o rascunho não roda'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 3. Ativar avalia as Interações na hora: uma rodada registrada, e um Sinal por silêncio encontrado.
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'ativo')$$, (select id from r where k = 'sem')), 'Bruno ativa o Monitoramento');

reset role;
insert into r (k, id) select 'run1', x.id from private.signal_monitor_runs x where x.monitor_id = (select id from r where k = 'sem');
select is(
  (select row(state, accounts_checked, signals_new, signals_repeated, error is null, finished_at is not null)::text
   from private.signal_monitor_runs where id = (select id from r where k = 'run1')),
  '(concluida,6,3,0,t,t)', 'a rodada fica registrada: 6 Contas operáveis avaliadas, 3 Sinais novos'
);
select is(
  (select row(g.signal_type, g.event_key, g.origin_interaction_id, g.run_id = (select id from r where k = 'run1'), g.source,
     g.monitor_id = (select id from r where k = 'sem'), g.fired_at = now() - interval '10 days')::text
   from private.signals g where g.target_account_id = 'dc000000-0000-0000-0000-000000000001'),
  '(sem_resposta,sem_resposta|ec000000-0000-0000-0000-000000000001,ec000000-0000-0000-0000-000000000001,t,"Interações da Conta",t,t)',
  'o Sinal de Alfa guarda a Conta, a Interação de origem, a rodada, o dia em que o prazo venceu e a identidade do silêncio'
);
select is(
  (select phrase from private.signals where target_account_id = 'dc000000-0000-0000-0000-000000000001'),
  'Sem resposta desde ' || to_char((now() - interval '40 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
  'a frase diz desde quando não há resposta'
);
select matches(
  (select evidence from private.signals where target_account_id = 'dc000000-0000-0000-0000-000000000001'),
  '^Primeiro envio sem resposta: e-mail em [0-9]{2}/[0-9]{2}/[0-9]{4}\. Nenhuma resposta, ligação ou reunião registrada desde então \(prazo do Monitoramento: 30 dias\)\.$',
  'a evidência descreve a Interação de origem sem dado pessoal'
);
select is(
  (select event_key from private.signals where target_account_id = 'dc000000-0000-0000-0000-000000000004' and signal_type = 'sem_resposta'),
  'sem_resposta|ec000000-0000-0000-0000-000000000008',
  'em Delta, o silêncio começa no primeiro envio depois da reunião'
);
select is(
  (select count(*)::integer from private.signals where target_account_id in (
    'dc000000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000003',
    'dc000000-0000-0000-0000-000000000005', 'dc000000-0000-0000-0000-000000000006')), 0,
  'Beta respondeu, Gama está no prazo, Epsilon está arquivada e Zeta não tem Interação: nenhum Sinal'
);
select is(
  (select row(m.last_run_at = now(), m.next_run_at = now() + interval '24 hours', m.last_error is null)::text
   from private.signal_monitors m where m.id = (select id from r where k = 'sem')),
  '(t,t,t)', 'a próxima avaliação fica para daqui a 24 horas'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select row(signal_type, source, valid)::text from public.list_signals('fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001')),
  '(sem_resposta,"Interações da Conta",t)', 'o Sinal aparece nos Sinais da Conta, com a fonte'
);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('fc000000-0000-0000-0000-000000000001')
   where target_account_id = 'dc000000-0000-0000-0000-000000000001'),
  '(1,t)', 'Alfa fica Quente pelo Sinal interno'
);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('fc000000-0000-0000-0000-000000000001')
   where target_account_id = 'dc000000-0000-0000-0000-000000000007'),
  '(0,f)', 'o silêncio de 400 dias entra no histórico já vencido: ativar não deixa Eta Quente'
);
select is(
  (select row(last_run ->> 'state', (last_run ->> 'accountsChecked')::integer, (last_run ->> 'signalsNew')::integer,
     (last_run ->> 'signalsRepeated')::integer, last_run ->> 'finishedAt' is not null)::text
   from public.list_signal_monitors('fc000000-0000-0000-0000-000000000001') where id = (select id from r where k = 'sem')),
  '(concluida,6,3,0,t)', 'a lista de Monitoramentos traz a última rodada'
);

reset role;
select is(
  (select stage from private.prospecting_stages where target_account_id = 'dc000000-0000-0000-0000-000000000001'),
  'fit', 'o Sinal não mexe na Aderência: Alfa continua Fit'
);

-- 4. Negociação parada: a última Interação foi uma conversa e nada mais aconteceu no prazo. Criado já ativo, avalia na
-- hora.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000001', true);
insert into r (k, id) select 'parada', public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'negociacao_parada', 'Paradas há 30 dias', 'ativo',
  '{"accountIds":["dc000000-0000-0000-0000-000000000001","dc000000-0000-0000-0000-000000000002","dc000000-0000-0000-0000-000000000004"]}',
  '{"prazo":30}', 24);
reset role;
select is(
  (select array_agg(row(target_account_id, event_key, fired_at = now() - interval '20 days')::text order by event_key)
   from private.signals where signal_type = 'negociacao_parada'),
  array['(dc000000-0000-0000-0000-000000000002,negociacao_parada|ec000000-0000-0000-0000-000000000004,t)'],
  'só Beta parou depois de uma conversa: Alfa nunca conversou e Delta continuou escrevendo (é Ausência de resposta)'
);
select is(
  (select phrase from private.signals where target_account_id = 'dc000000-0000-0000-0000-000000000002'),
  'Negociação parada desde ' || to_char((now() - interval '50 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
  'a frase diz desde quando a negociação parou'
);
select matches(
  (select evidence from private.signals where target_account_id = 'dc000000-0000-0000-0000-000000000002'),
  '^Última Interação: e-mail recebido em [0-9]{2}/[0-9]{2}/[0-9]{4}\. Nenhuma Interação registrada desde então \(prazo do Monitoramento: 30 dias\)\.$',
  'a evidência da negociação parada aponta a última Interação'
);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('fc000000-0000-0000-0000-000000000001')
   where target_account_id = 'dc000000-0000-0000-0000-000000000002'),
  '(1,t)', 'Beta fica Quente mesmo Não fit'
);
select is(
  (select stage from private.prospecting_stages where target_account_id = 'dc000000-0000-0000-0000-000000000002'),
  'descartada', 'e o Não fit de Beta continua onde estava'
);
select is(
  (select stage from private.prospecting_stages where target_account_id = 'dc000000-0000-0000-0000-000000000004'),
  'quente', 'Delta, sem Aderência, foi para Quente no kanban pela Ausência de resposta'
);

-- 5. A rodada seguinte: reencontrar o mesmo silêncio não conta de novo nem renova o prazo.
update private.signals set fired_at = now() - interval '29 days'
where target_account_id = 'dc000000-0000-0000-0000-000000000001' and signal_type = 'sem_resposta';
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'sem');
select is(private.run_due_internal_signal_monitors(), 1, 'só o Monitoramento vencido roda');
select is(
  (select row(state, signals_new, signals_repeated)::text from private.signal_monitor_runs
   where monitor_id = (select id from r where k = 'sem') and id <> (select id from r where k = 'run1')),
  '(concluida,0,3)', 'a segunda rodada reencontra os três silêncios'
);
select is(
  (select row(count(*), min(fired_at) = now() - interval '29 days', bool_and(seen_again_at = now()))::text from private.signals
   where target_account_id = 'dc000000-0000-0000-0000-000000000001' and signal_type = 'sem_resposta'),
  '(1,t,t)', 'Alfa continua com um Sinal só, com a data do primeiro disparo, e o reencontro fica anotado'
);
select is(
  (select count(*)::integer from private.signal_monitor_runs where monitor_id = (select id from r where k = 'parada')), 1,
  'o Monitoramento que não venceu não roda de novo'
);

-- 6. Um silêncio novo é outro acontecimento: Alfa respondeu há 3 dias e ficou sem resposta de novo. Bruno encurta o
-- prazo para 1 dia, e salvar um Monitoramento ativo avalia na hora.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, occurred_at, recorded_by) values
  ('ec000000-0000-0000-0000-000000000011', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'email-recebido', now() - interval '3 days', '5c000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000012', 'fc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'email-enviado', now() - interval '2 days', '5c000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select lives_ok(
  format($$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', %L, 'sem_resposta', 'Sem resposta em 1 dia', 'ativo',
    '{"accountIds":["dc000000-0000-0000-0000-000000000001","dc000000-0000-0000-0000-000000000002","dc000000-0000-0000-0000-000000000003","dc000000-0000-0000-0000-000000000004","dc000000-0000-0000-0000-000000000005","dc000000-0000-0000-0000-000000000006","dc000000-0000-0000-0000-000000000007"]}',
    '{"prazo":"1"}', 24)$$, (select id from r where k = 'sem')),
  'Bruno encurta o prazo do Monitoramento ativo'
);
reset role;
select is(
  (select array_agg(row(event_key, fired_at = now() - interval '1 day')::text order by event_key) from private.signals
   where target_account_id = 'dc000000-0000-0000-0000-000000000001' and signal_type = 'sem_resposta'),
  array['(sem_resposta|ec000000-0000-0000-0000-000000000001,f)', '(sem_resposta|ec000000-0000-0000-0000-000000000012,t)'],
  'o silêncio depois da resposta é um Sinal novo, que dispara quando o novo prazo vence'
);

-- 7. Pausado não roda, mesmo vencido.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'pausado')$$, (select id from r where k = 'sem')), 'Bruno pausa');
reset role;
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'sem');
select is(private.run_due_internal_signal_monitors(), 0, 'o pausado não roda');
select is(
  (select count(*)::integer from private.signals where monitor_id = (select id from r where k = 'sem')), 5,
  'pausar preserva os Sinais anteriores'
);

-- 8. A varredura externa e a busca de novo não tocam os internos (não chamam o Apify nem cobram crédito).
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'parada');
select is(private.signal_monitors_due(), false, 'o relógio da varredura externa não vê Monitoramento interno vencido');
select is(
  (select count(*)::integer from public.claim_due_signal_monitors(20)), 0,
  'o signal-runner não reivindica Monitoramento interno'
);
select is(
  (select count(*)::integer from private.rescan_monitors('fc000000-0000-0000-0000-000000000001')), 0,
  '"Buscar Sinais de novo" não conta Monitoramento interno'
);

-- 9. Uma falha na avaliação fica registrada na rodada e no Monitoramento, sem derrubar o relógio.
create or replace function private.internal_signal_candidates(p_workspace_id uuid, p_signal_type text, p_days integer, p_account_ids uuid[])
returns table (target_account_id uuid, interaction_id uuid, event_key text, phrase text, evidence text, fired_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'falha simulada no teste';
end;
$$;
select is(private.run_due_internal_signal_monitors(), 1, 'o relógio termina mesmo com a falha');
select is(
  (select row(state, error)::text from private.signal_monitor_runs
   where monitor_id = (select id from r where k = 'parada') order by started_at desc, id desc limit 1),
  '(falhou,"Não foi possível avaliar as Interações. A próxima rodada tenta de novo.")',
  'a rodada que falhou guarda o motivo em palavras do produto'
);
select is(
  (select last_error from public.list_signal_monitors('fc000000-0000-0000-0000-000000000001') where id = (select id from r where k = 'parada')),
  'Não foi possível avaliar as Interações. A próxima rodada tenta de novo.',
  'e o Monitoramento mostra o motivo da última rodada'
);
select is(
  (select count(*)::integer from private.signals where signal_type = 'negociacao_parada'), 1,
  'a falha não apaga nem inventa Sinal'
);

-- 10. Isolamento: quem é de fora não vê nem cria nada no Norte.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.save_signal_monitor('fc000000-0000-0000-0000-000000000001', null, 'sem_resposta', 'Intrusa', 'rascunho', '{}', '{"prazo":"30"}', 24)$$,
  '42501', 'active workspace membership required', 'quem é de fora não cria Monitoramento no Norte'
);
select throws_ok(
  $$select * from public.list_signals('fc000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de fora não lê os Sinais do Norte'
);
select is(
  (select count(*)::integer from public.list_signals('fc000000-0000-0000-0000-000000000002')), 0,
  'o Sul não recebe Sinal do Norte'
);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.list_signal_catalog()$$,
  '42501', 'authentication required', 'o catálogo exige uma sessão'
);

-- 11. O registro de actors continua aberto a actors novos, que entram no catálogo como externos; um actor nunca
-- assume um Sinal interno.
reset role;
insert into private.signal_actors (actor_id, signal_type) values ('alguem~actor-novo', 'tipo_novo_externo');
select is(
  (select row(origin, state)::text from private.signal_catalog where signal_type = 'tipo_novo_externo'),
  '(externo,)', 'o actor novo entra no catálogo como externo'
);
select throws_ok(
  $$insert into private.signal_actors (actor_id, signal_type) values ('alguem~outro-actor', 'sem_resposta')$$,
  '23514', 'an actor cannot implement an internal signal', 'um actor não pode atender um Sinal interno'
);
select is(
  (select count(*)::integer from information_schema.table_privileges
   where table_schema = 'private' and table_name in ('signal_catalog', 'signal_monitor_runs')
     and grantee in ('anon', 'authenticated', 'service_role')), 0,
  'o catálogo e as rodadas só se leem pelas funções'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'signal_monitor_runs')
  and (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'signal_catalog'),
  'RLS ligado nas tabelas novas'
);

select * from finish();
rollback;
