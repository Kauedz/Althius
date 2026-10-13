begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(40);

-- Sinal interno "Proposta recusada" (auditoria de Sinais, 13/10/2026): a recusa que o Workspace registrou no desfecho de um
-- Envio (resposta negativa). Ana (Admin) e Bruno (Membro) do Norte; Carla é do Sul. Nenhum actor está disponível: o Sinal
-- interno não depende de fornecedor.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fd000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', true),
  ('fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003', 'admin', true);

-- As Contas do Norte e a do Sul. Cada uma tem a sua Sequência (uma por Conta).
--   Alfa     recusou há 40 dias (resposta ligada a uma Interação)                  → Sinal, dispara há 10 dias
--   Beta     recusou há 10 dias                                                     → ainda dentro do prazo de 30 dias
--   Gama     recusou há 60 dias, mas respondeu de novo há 20 dias                   → a recusa foi superada: nada
--   Delta    recusou há 60 dias e nós escrevemos de novo há 50 dias                 → envio nosso não supera: Sinal, dispara há 30 dias
--   Epsilon  recusou há 90 dias e de novo há 45 dias                                → um Sinal só, na recusa mais recente
--   Zeta     resposta positiva, reunião marcada e resposta simples (nenhuma recusa) → nada
--   Eta      recusou há 40 dias, mas a Conta está arquivada                         → não recebe Sinal
--   Theta    (Sul) recusou há 40 dias                                               → nunca entra no Norte
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('dd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000004', 'fd000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test', 'delta.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000005', 'fd000000-0000-0000-0000-000000000001', 'Epsilon', 'https://epsilon.test', 'epsilon.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000006', 'fd000000-0000-0000-0000-000000000001', 'Zeta', 'https://zeta.test', 'zeta.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000007', 'fd000000-0000-0000-0000-000000000001', 'Eta', 'https://eta.test', 'eta.test', '5d000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-000000000009', 'fd000000-0000-0000-0000-000000000002', 'Theta', 'https://theta.test', 'theta.test', '5d000000-0000-0000-0000-000000000003');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
select t.workspace_id, t.id, case when t.workspace_id = 'fd000000-0000-0000-0000-000000000001'
  then '5d000000-0000-0000-0000-000000000001'::uuid else '5d000000-0000-0000-0000-000000000003'::uuid end
from public.target_accounts t where t.workspace_id in ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002');
insert into public.contacts (id, workspace_id, name, created_by) values
  ('cd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'Sara', '5d000000-0000-0000-0000-000000000001'),
  ('cd000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000002', 'Tiago', '5d000000-0000-0000-0000-000000000003');
insert into public.sequences (id, workspace_id, target_account_id, owner_user_id)
select ('ed00000' || n || '-0000-0000-0000-000000000001')::uuid, t.workspace_id, t.id::text,
  case when t.workspace_id = 'fd000000-0000-0000-0000-000000000001'
    then '5d000000-0000-0000-0000-000000000001'::uuid else '5d000000-0000-0000-0000-000000000003'::uuid end
from (select t.*, right(t.id::text, 1) as n from public.target_accounts t
      where t.workspace_id in ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002')) t;
insert into private.sender_accounts (id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status) values
  ('bd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'email', 'unipile-ana', 'GOOGLE', 'ready');

-- Os Envios (todos enviados) e o desfecho de cada um. O registro da recusa é o `classified_at`.
create function pg_temp.envio(p_id text, p_conta int, p_passo text) returns void language sql as $$
  insert into private.sequence_step_sends (id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, sent_at)
  select ('ad000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid, ('ed00000' || p_conta || '-0000-0000-0000-000000000001')::uuid,
    q.workspace_id, p_passo, q.owner_user_id,
    case when q.workspace_id = 'fd000000-0000-0000-0000-000000000001' then 'cd000000-0000-0000-0000-000000000001'::uuid
      else 'cd000000-0000-0000-0000-000000000002'::uuid end,
    'email', 'destino@conta.test', 'sent', now() - interval '100 days'
  from public.sequences q where q.id = ('ed00000' || p_conta || '-0000-0000-0000-000000000001')::uuid
$$;
create function pg_temp.desfecho(p_id text, p_resultado text, p_dias int) returns void language sql as $$
  insert into private.send_outcomes (send_id, workspace_id, outcome, classified_by_kind, classified_by_user, classified_at)
  select s.id, s.workspace_id, p_resultado, 'pessoa', s.owner_user_id, now() - make_interval(days => p_dias)
  from private.sequence_step_sends s where s.id = ('ad000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid
$$;
select pg_temp.envio('1', 1, 'p1');   select pg_temp.desfecho('1', 'resposta_negativa', 40);
select pg_temp.envio('2', 2, 'p1');   select pg_temp.desfecho('2', 'resposta_negativa', 10);
select pg_temp.envio('3', 3, 'p1');   select pg_temp.desfecho('3', 'resposta_negativa', 60);
select pg_temp.envio('4', 4, 'p1');   select pg_temp.desfecho('4', 'resposta_negativa', 60);
select pg_temp.envio('5', 5, 'p1');   select pg_temp.desfecho('5', 'resposta_negativa', 90);
select pg_temp.envio('6', 5, 'p2');   select pg_temp.desfecho('6', 'resposta_negativa', 45);
select pg_temp.envio('7', 6, 'p1');   select pg_temp.desfecho('7', 'resposta_positiva', 60);
select pg_temp.envio('8', 6, 'p2');   select pg_temp.desfecho('8', 'reuniao_marcada', 60);
select pg_temp.envio('9', 6, 'p3');   select pg_temp.desfecho('9', 'resposta', 60);
select pg_temp.envio('10', 7, 'p1');  select pg_temp.desfecho('10', 'resposta_negativa', 40);
select pg_temp.envio('11', 9, 'p1');  select pg_temp.desfecho('11', 'resposta_negativa', 40);
update public.target_accounts set archived_at = now() where id = 'dd000000-0000-0000-0000-000000000007';

-- As Interações: a resposta de Alfa (ligada ao Envio 1), a de Gama depois da recusa e o nosso follow-up em Delta.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, occurred_at, recorded_by) values
  ('ec000000-0000-0000-0000-0000000000a1', 'fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'email-recebido', now() - interval '41 days', '5d000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-0000000000a3', 'fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'email-recebido', now() - interval '20 days', '5d000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-0000000000a4', 'fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'email-enviado', now() - interval '50 days', '5d000000-0000-0000-0000-000000000001');
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id,
                                     sender_account_id, provider_email_id, received_at) values
  ('ec000000-0000-0000-0000-0000000000a1', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
   'ed000001-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001',
   'bd000000-0000-0000-0000-000000000001', 'email-a1', now() - interval '41 days');

create temporary table r (k text primary key, id uuid, at timestamptz) on commit drop;
grant all on r to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);

-- 1. O catálogo traz a Proposta recusada como Sinal interno, disponível, sem actor.
select is(
  (select array_agg(row(signal_type, origin, state)::text order by signal_type) from public.list_signal_catalog()
   where origin = 'interno'),
  array['(negociacao_parada,interno,available)', '(proposta_recusada,interno,available)', '(sem_resposta,interno,available)'],
  'o catálogo traz os três Sinais internos que saem do histórico comercial, disponíveis'
);

-- 2. O Monitoramento: só o prazo, como nos outros internos.
insert into r (k, id) select 'rec', public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Recusadas há 30 dias', 'rascunho',
  '{"accountIds":["dd000000-0000-0000-0000-000000000001","dd000000-0000-0000-0000-000000000002","dd000000-0000-0000-0000-000000000003","dd000000-0000-0000-0000-000000000004","dd000000-0000-0000-0000-000000000005","dd000000-0000-0000-0000-000000000006","dd000000-0000-0000-0000-000000000007"]}',
  '{"prazo":"30"}', 24);
select is(
  (select row(signal_type, state, criteria ->> 'prazo')::text from public.list_signal_monitors('fd000000-0000-0000-0000-000000000001')
   where id = (select id from r where k = 'rec')),
  '(proposta_recusada,rascunho,30)', 'o Monitoramento fica gravado como rascunho, com o prazo'
);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Ruim', 'rascunho', '{}', '{"prazo":"30","etapas":["Proposta"]}', 24)$$,
  '22023', 'invalid monitor', 'um critério que a avaliação não usa é recusado em vez de fingir que filtra'
);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Ruim', 'rascunho', '{}', '{"prazo":"0"}', 24)$$,
  '22023', 'invalid monitor', 'prazo zero é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Ruim', 'rascunho', '{}', '{"prazo":"400"}', 24)$$,
  '22023', 'invalid monitor', 'prazo acima de um ano é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Ruim', 'rascunho', '{}', '{}', 24)$$,
  '22023', 'invalid monitor', 'sem prazo é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Ruim', 'rascunho', '{"accountIds":["dd000000-0000-0000-0000-000000000009"]}', '{"prazo":"30"}', 24)$$,
  '22023', 'invalid monitor', 'Conta de outro Workspace no público é recusada'
);

reset role;
select is(
  (select count(*)::integer from private.signal_monitor_runs where monitor_id = (select id from r where k = 'rec')), 0,
  'o rascunho não roda'
);

-- 3. Ativar avalia na hora: uma rodada registrada e um Sinal por recusa em aberto.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'ativo')$$, (select id from r where k = 'rec')), 'Bruno ativa o Monitoramento');

reset role;
insert into r (k, id) select 'run1', x.id from private.signal_monitor_runs x where x.monitor_id = (select id from r where k = 'rec');
select is(
  (select row(state, accounts_checked, signals_new, signals_repeated, error is null, finished_at is not null)::text
   from private.signal_monitor_runs where id = (select id from r where k = 'run1')),
  '(concluida,6,3,0,t,t)', 'a rodada fica registrada: 6 Contas operáveis avaliadas, 3 Sinais novos'
);
select is(
  (select array_agg(g.target_account_id::text order by g.target_account_id) from private.signals g where g.signal_type = 'proposta_recusada'),
  array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000005'],
  'só Alfa, Delta e Epsilon têm uma recusa em aberto depois do prazo'
);
select is(
  (select row(g.signal_type, g.event_key, g.origin_interaction_id, g.run_id = (select id from r where k = 'run1'), g.source,
     g.monitor_id = (select id from r where k = 'rec'), g.fired_at = now() - interval '10 days')::text
   from private.signals g where g.target_account_id = 'dd000000-0000-0000-0000-000000000001'),
  '(proposta_recusada,proposta_recusada|ad000000-0000-0000-0000-000000000001,ec000000-0000-0000-0000-0000000000a1,t,"Interações da Conta",t,t)',
  'o Sinal de Alfa guarda a Conta, a resposta de origem, a rodada, o dia em que o prazo venceu e a identidade da recusa'
);
select is(
  (select phrase from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000001'),
  'Proposta recusada desde ' || to_char((now() - interval '40 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
  'a frase diz desde quando a proposta foi recusada'
);
select matches(
  (select evidence from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000001'),
  '^Resposta negativa registrada em [0-9]{2}/[0-9]{2}/[0-9]{4}\. A Conta não voltou a conversar desde então \(prazo do Monitoramento: 30 dias\)\.$',
  'a evidência descreve a recusa sem dado pessoal'
);
select is(
  (select count(*)::integer from private.signals g
   where g.signal_type = 'proposta_recusada' and (g.phrase || ' ' || coalesce(g.evidence, '')) ~* '(@|sara|tiago|ana|bruno|destino|alfa|delta|epsilon|https?:)'),
  0, 'nem a frase nem a evidência trazem nome, e-mail, endereço ou o nome da Conta'
);
select is(
  (select row(g.origin_interaction_id is null, g.fired_at = now() - interval '30 days')::text
   from private.signals g where g.target_account_id = 'dd000000-0000-0000-0000-000000000004'),
  '(t,t)', 'a recusa sem resposta ligada não aponta Interação; o prazo de Delta venceu há 30 dias'
);
select is(
  (select event_key from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000005'),
  'proposta_recusada|ad000000-0000-0000-0000-000000000006',
  'Epsilon recusou duas vezes: o Sinal é um só, da recusa mais recente'
);
select is(
  (select count(*)::integer from private.signals where target_account_id in (
    'dd000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000003',
    'dd000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000007')), 0,
  'Beta está no prazo, Gama voltou a conversar, Zeta não recusou e Eta está arquivada: nenhum Sinal'
);
select is(
  (select count(*)::integer from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000009'), 0,
  'a Conta do Sul não recebe Sinal do Norte'
);
select is(
  (select row(m.last_run_at = now(), m.next_run_at = now() + interval '24 hours', m.last_error is null)::text
   from private.signal_monitors m where m.id = (select id from r where k = 'rec')),
  '(t,t,t)', 'a próxima avaliação fica para daqui a 24 horas'
);
select is(
  (select count(*)::integer from private.credit_reservations where workspace_id = 'fd000000-0000-0000-0000-000000000001'), 0,
  'a avaliação não reserva nem cobra crédito'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select is(
  (select row(signal_type, source, valid)::text from public.list_signals('fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001')),
  '(proposta_recusada,"Interações da Conta",t)', 'o Sinal aparece nos Sinais da Conta, com a fonte'
);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('fd000000-0000-0000-0000-000000000001')
   where target_account_id = 'dd000000-0000-0000-0000-000000000001'),
  '(1,t)', 'Alfa fica Quente pela recusa antiga'
);

-- 4. A Aderência fica separada: o Sinal não mexe nela.
reset role;
select is(
  (select count(*)::integer from private.prospecting_stage_history
   where workspace_id = 'fd000000-0000-0000-0000-000000000001' and event in ('fit', 'nao_fit')), 0,
  'o Sinal não grava Aderência (Fit nem Não fit) em nenhuma Conta'
);

-- 5. A rodada seguinte reencontra as recusas: não conta de novo nem renova o prazo.
update private.signals set fired_at = now() - interval '9 days'
where target_account_id = 'dd000000-0000-0000-0000-000000000001' and signal_type = 'proposta_recusada';
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'rec');
select is(private.run_due_internal_signal_monitors(), 1, 'só o Monitoramento vencido roda');
select is(
  (select row(state, signals_new, signals_repeated)::text from private.signal_monitor_runs
   where monitor_id = (select id from r where k = 'rec') and id <> (select id from r where k = 'run1')),
  '(concluida,0,3)', 'a segunda rodada reencontra as três recusas'
);
select is(
  (select row(count(*), min(fired_at) = now() - interval '9 days', bool_and(seen_again_at = now()))::text from private.signals
   where target_account_id = 'dd000000-0000-0000-0000-000000000001' and signal_type = 'proposta_recusada'),
  '(1,t,t)', 'Alfa continua com um Sinal só, com a data do primeiro disparo, e o reencontro fica anotado'
);

-- 6. Reclassificar o mesmo Envio mantém a chave: negativa → positiva → negativa não cria outro Sinal.
update private.send_outcomes set outcome = 'resposta_positiva' where send_id = 'ad000000-0000-0000-0000-000000000001';
update private.send_outcomes set outcome = 'resposta_negativa' where send_id = 'ad000000-0000-0000-0000-000000000001';
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'rec');
select private.run_due_internal_signal_monitors();
select is(
  (select count(*)::integer from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000001' and signal_type = 'proposta_recusada'),
  1, 'reclassificar o mesmo Envio não cria outro Sinal'
);

-- 7. Uma recusa nova é outro acontecimento: Beta recusou há 10 dias; com o prazo encurtado para 5 dias, ela entra.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select lives_ok(
  format($$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', %L, 'proposta_recusada', 'Recusadas há 5 dias', 'ativo',
    '{"accountIds":["dd000000-0000-0000-0000-000000000001","dd000000-0000-0000-0000-000000000002","dd000000-0000-0000-0000-000000000003","dd000000-0000-0000-0000-000000000004","dd000000-0000-0000-0000-000000000005","dd000000-0000-0000-0000-000000000006","dd000000-0000-0000-0000-000000000007"]}',
    '{"prazo":"5"}', 24)$$, (select id from r where k = 'rec')),
  'Bruno encurta o prazo do Monitoramento ativo'
);
reset role;
select is(
  (select row(g.event_key, g.fired_at = now() - interval '5 days')::text from private.signals g
   where g.target_account_id = 'dd000000-0000-0000-0000-000000000002'),
  '(proposta_recusada|ad000000-0000-0000-0000-000000000002,t)',
  'Beta entra quando o prazo de 5 dias vence, no dia certo'
);

-- 8. Superação em tempo de execução: Delta volta a conversar depois da recusa; o Sinal já gravado fica (é um fato
-- observado) e nenhum outro nasce.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, occurred_at, recorded_by) values
  ('ec000000-0000-0000-0000-0000000000b4', 'fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'reuniao', now() - interval '2 days', '5d000000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-0000000000b2', 'fd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002', 'ligacao', now() - interval '1 day', '5d000000-0000-0000-0000-000000000001');
select is(
  (select array_agg(row(target_account_id, event_key)::text order by target_account_id) from private.internal_signal_candidates(
    'fd000000-0000-0000-0000-000000000001', 'proposta_recusada', 5,
    array['dd000000-0000-0000-0000-000000000002'::uuid, 'dd000000-0000-0000-0000-000000000004'::uuid,
          'dd000000-0000-0000-0000-000000000005'::uuid])),
  array['(dd000000-0000-0000-0000-000000000005,proposta_recusada|ad000000-0000-0000-0000-000000000006)'],
  'depois de uma reunião ou ligação, a recusa deixa de ser candidata'
);
select is(
  (select count(*)::integer from private.signals where target_account_id = 'dd000000-0000-0000-0000-000000000004' and signal_type = 'proposta_recusada'),
  1, 'o Sinal que já tinha sido gravado fica, porque é um fato observado'
);

-- 9. Os outros dois Sinais internos seguem como estavam: a recusa não vira ausência de resposta nem negociação parada.
select is(
  (select count(*)::integer from private.internal_signal_candidates(
    'fd000000-0000-0000-0000-000000000001', 'sem_resposta', 30, array['dd000000-0000-0000-0000-000000000001'::uuid])), 0,
  'a recusa sem envio nosso depois não vira Ausência de resposta'
);
select is(
  (select count(*)::integer from private.internal_signal_candidates(
    'fd000000-0000-0000-0000-000000000001', 'negociacao_parada', 30, array['dd000000-0000-0000-0000-000000000001'::uuid])), 1,
  'a resposta recebida de Alfa continua sendo Negociação parada, como antes'
);

-- 10. Pausado não roda, mesmo vencido.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'pausado')$$, (select id from r where k = 'rec')), 'Bruno pausa');
reset role;
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'rec');
select is(private.run_due_internal_signal_monitors(), 0, 'o pausado não roda');

-- 11. A varredura externa não toca o Sinal interno.
update private.signal_monitors set next_run_at = now() - interval '1 minute', state = 'ativo' where id = (select id from r where k = 'rec');
select is(private.signal_monitors_due(), false, 'o relógio da varredura externa não vê o Monitoramento da Proposta recusada');
select is((select count(*)::integer from public.claim_due_signal_monitors(20)), 0, 'o signal-runner não o reivindica');
select is(
  (select count(*)::integer from private.rescan_monitors('fd000000-0000-0000-0000-000000000001')), 0,
  '"Buscar Sinais de novo" não conta Monitoramento interno'
);

-- 12. Isolamento: quem é de fora não cria Monitoramento no Norte.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.save_signal_monitor('fd000000-0000-0000-0000-000000000001', null, 'proposta_recusada', 'Intrusa', 'rascunho', '{}', '{"prazo":"30"}', 24)$$,
  '42501', 'active workspace membership required', 'quem é de fora não cria Monitoramento no Norte'
);

select * from finish();
rollback;
