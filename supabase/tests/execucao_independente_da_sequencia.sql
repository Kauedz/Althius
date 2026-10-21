begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(37);

create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'e2-titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('e2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'e2-colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e2100000-0000-0000-0000-000000000001', 'empresa', 'Cliente E2');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
select w.id, 'escala', date_trunc('month', now()) from public.workspaces w
where w.id = 'e2100000-0000-0000-0000-000000000001'
on conflict (workspace_id) do nothing;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'member', true),
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

select pg_temp.relogio('2026-09-30 10:00-03');
select is(
  private.next_send_slot('2026-09-30 10:00-04', 0, '{"de":"09:00","ate":"18:00"}', 'America/Manaus', array[1,2,3,4,5]),
  '2026-09-30 10:00-04'::timestamptz,
  'a confirmed timezone keeps the slot in that zone');
select is(
  private.next_send_slot('2026-09-30 10:00-03', 0, '{"de":"09:00","ate":"18:00"}', 'America/Sao_Paulo', array[1]),
  '2026-10-05 09:00-03'::timestamptz,
  'a Wednesday is not eligible when only Monday was confirmed');

create function pg_temp.envios(p_sequence uuid, p_step text default null)
returns setof private.sequence_step_sends
language sql
security definer
set search_path = ''
as $f$
  select e.* from private.sequence_step_sends e
  where e.sequence_id = p_sequence and (p_step is null or e.step_id = p_step);
$f$;
grant execute on function pg_temp.envios(uuid, text) to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta-legado', id::text from public.save_target_account(
  'e2100000-0000-0000-0000-000000000001', 'Empresa Legado', 'https://legado.e2.test');
insert into ids select 'conta-paralela', id::text from public.save_target_account(
  'e2100000-0000-0000-0000-000000000001', 'Empresa Paralela', 'https://paralela.e2.test');
insert into ids select 'conta-parcial', id::text from public.save_target_account(
  'e2100000-0000-0000-0000-000000000001', 'Empresa Parcial', 'https://parcial.e2.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-paralela'), 'Maria Souza', 'Diretora', 'maria@e2.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-paralela'), 'João Lima', 'Gerente', 'joao@e2.test');
insert into ids select 'maria-legado', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-legado'), 'Maria Legado', 'Diretora', 'maria-legado@e2.test');
insert into ids select 'joao-legado', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-legado'), 'João Legado', 'Gerente', 'joao-legado@e2.test');
insert into ids select 'maria-parcial', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-parcial'), 'Maria Parcial', 'Diretora', 'maria-parcial@e2.test');
insert into ids select 'joao-parcial', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-parcial'), 'João Parcial', 'Gerente', 'joao-parcial@e2.test');

create function pg_temp.passo(p_id text, p_contato text, p_delay int, p_liberacao text default null, p_pred text default null)
returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'canal', 'email', 'contatoId', (select valor from ids where chave = p_contato),
    'delayDiasUteis', p_delay, 'titulo', p_id, 'assunto', p_id, 'corpo', 'Olá.',
    'liberacao', p_liberacao, 'predecessorId', p_pred));
$f$;

create function pg_temp.agenda(p_max int default 3, p_gap int default 30) returns jsonb language sql as $f$
  select jsonb_build_object(
    'fuso', 'America/Sao_Paulo', 'diasUteis', jsonb_build_array(1, 2, 3, 4, 5),
    'janela', jsonb_build_object('de', '09:00', 'ate', '18:00'),
    'maximoDiario', p_max, 'intervaloMinutos', p_gap);
$f$;

insert into ids select 'legado', id::text from public.create_sequence(
  'e2100000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-legado'),
  jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de":"09:00","ate":"18:00"}'::jsonb, 'steps',
    jsonb_build_array(pg_temp.passo('l1', 'maria-legado', 0), pg_temp.passo('l2', 'joao-legado', 0))));
insert into ids select 'paralela', id::text from public.create_sequence(
  'e2100000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-paralela'),
  jsonb_build_object('steps', jsonb_build_array(
    pg_temp.passo('a', 'maria', 0, 'ativacao'),
    pg_temp.passo('b', 'joao', 0, 'ativacao'),
    pg_temp.passo('c', 'maria', 1, 'predecessor', 'a'),
    pg_temp.passo('d', 'joao', 0, 'manual'))));

insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'e2100000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-e2', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-e2', 'SYNC_SUCCESS');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select is(
  (select outcome from public.activate_sequence(
    (select valor::uuid from ids where chave = 'paralela'), array['a'], '{"fuso":"Nao/Existe"}'::jsonb)),
  'agenda_invalida', 'activation refuses an unconfirmed timezone');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.activate_sequence(
    (select valor::uuid from ids where chave = 'paralela'), array['a'], pg_temp.agenda())$$,
  '42501', 'sequence not found or not owned by active user',
  'another participant cannot authorize a path');

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select is(
  (select outcome || ' ' || step_id || ' ' || (scheduled_for = '2026-09-30 10:00-03')
    from public.activate_sequence((select valor::uuid from ids where chave = 'legado'))),
  'activated l1 true', 'a document without explicit release stays serial');
select is(
  (select status from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'legado'))
    where step_id = 'l2'),
  'waiting', 'the second legacy step is not scheduled with the first');

select is(
  (select count(*)::int from public.activate_sequence(
    (select valor::uuid from ids where chave = 'paralela'), array['a','b','c','d'], pg_temp.agenda())),
  4, 'partial confirmation can include every complete path');
select is(
  (select status || ' ' || (scheduled_for = '2026-09-30 10:00-03')
    from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'paralela')) where step_id = 'a'),
  'scheduled true', 'an independent path is scheduled from activation');
select is(
  (select status || ' ' || (scheduled_for = '2026-09-30 10:30-03')
    from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'paralela')) where step_id = 'b'),
  'scheduled true', 'the second independent path respects the account interval');
select is(
  (select status from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'paralela')) where step_id = 'c'),
  'waiting', 'a predecessor does not release the dependent at activation');
select is(
  (select outcome from public.release_manual_sequence_step(
    (select valor::uuid from ids where chave = 'legado'), 'l2')),
  'not_authorized', 'manual release does not authorize a step outside the snapshot');

reset role;
update private.sequence_step_sends
set status = 'sent', sent_at = '2026-09-30 10:00-03'
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'a';
select private.schedule_next_step((select valor::uuid from ids where chave = 'paralela'), '2026-09-30 10:00-03');
select is(
  (select status || ' ' || (scheduled_for = '2026-10-01 10:00-03')
    from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'c'),
  'scheduled true', 'the dependent waits the confirmed send, not the forecast');

update private.sequence_step_sends
set status = 'failed', scheduled_for = null
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'a';
update private.sequence_step_sends
set status = 'waiting', scheduled_for = null
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'c';
select private.schedule_next_step((select valor::uuid from ids where chave = 'paralela'), private.clock_now());
select is(
  (select status from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'c'),
  'waiting', 'a failed predecessor does not release the dependent');

update private.sequence_step_sends
set status = 'uncertain', sent_at = null, scheduled_for = null
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'a';
select private.schedule_next_step((select valor::uuid from ids where chave = 'paralela'), private.clock_now());
select is(
  (select status from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'a'),
  'uncertain', 'an uncertain send is not scheduled again');
select is(
  (select status from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'c'),
  'waiting', 'an uncertain predecessor does not release the dependent');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select is(
  (select outcome from public.release_manual_sequence_step(
    (select valor::uuid from ids where chave = 'paralela'), 'd')),
  'released', 'manual release schedules an already authorized step and does not mint a destination');
select is(
  (select status || ' ' || destination from public.list_sequence_step_sends(
    (select valor::uuid from ids where chave = 'paralela')) where step_id = 'd'),
  'scheduled joao@e2.test', 'manual release schedules the already authorized destination');

insert into ids select 'parcial', id::text from public.create_sequence(
  'e2100000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-parcial'),
  jsonb_build_object('steps', jsonb_build_array(
    pg_temp.passo('p1', 'maria-parcial', 0, 'ativacao'),
    pg_temp.passo('p2', 'joao-parcial', 0, 'ativacao'))));
select is(
  (select count(*)::int from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'parcial'))
    where step_id = 'p2'),
  0, 'a step left out of the confirmation has no send yet');
select public.activate_sequence(
  (select valor::uuid from ids where chave = 'parcial'), array['p1'], pg_temp.agenda(1, 0));
select is(
  (select count(*)::int from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'parcial'))
    where step_id = 'p2'),
  0, 'completing the other path still requires a new confirmation');
reset role;
update private.sequence_step_sends
set status = 'sent', sent_at = '2026-09-30 10:00-03'
where sequence_id = (select valor::uuid from ids where chave = 'parcial') and step_id = 'p1';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select public.activate_sequence(
  (select valor::uuid from ids where chave = 'parcial'), array['p2'], pg_temp.agenda(1, 0));
select is(
  (select destination from pg_temp.envios((select valor::uuid from ids where chave = 'parcial'), 'p1')),
  'maria-parcial@e2.test', 'a later confirmation does not rewrite a destination already sent');
select is(
  (select count(*)::int from pg_temp.envios((select valor::uuid from ids where chave = 'parcial'), 'p2')),
  1, 'the newly confirmed path gets one send');

reset role;
update private.sequence_step_sends
set scheduled_for = '2026-10-20 10:00-03', claimed_until = null
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id = 'd';
update private.sequence_step_sends
set status = 'scheduled', scheduled_for = '2026-09-30 10:00-03', claimed_until = null
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and step_id in ('a', 'b');
update private.sequence_authorizations
set document = document || jsonb_build_object('maximoDiario', 1)
where sequence_id = (select valor::uuid from ids where chave = 'paralela') and revoked_at is null;
set local role service_role;
select is(
  (select count(*)::int from public.claim_due_step_sends(10)
    where send_id in (
      select id from pg_temp.envios((select valor::uuid from ids where chave = 'paralela'))
      where step_id in ('a', 'b'))),
  1, 'two due paths of the same account reserve only one slot');
select is(
  (select count(*)::int from pg_temp.envios((select valor::uuid from ids where chave = 'paralela'))
    where step_id in ('a', 'b')),
  2, 'the deferred path is the same row, not a duplicate send');
select is(
  (select count(*)::int from public.claim_due_step_sends(10)
    where send_id in (
      select id from pg_temp.envios((select valor::uuid from ids where chave = 'paralela'))
      where step_id in ('a', 'b'))),
  0, 'a second reservation does not take the claimed or deferred path');

-- O excedente da Conta espera o próximo dia permitido: continua programado, não é cancelado.
select is(
  (select string_agg(status || ' ' || ((scheduled_for at time zone 'America/Sao_Paulo')::date = '2026-10-01'), ',')
    from pg_temp.envios((select valor::uuid from ids where chave = 'paralela'))
    where step_id in ('a', 'b') and claimed_until is null),
  'scheduled true', 'the path over the daily limit waits for the next allowed day');

-- Documento antigo (sem liberação): a fila serial de hoje, sem os limites novos da Conta.
reset role;
update private.sequence_step_sends
set status = 'sent', sent_at = '2026-09-30 10:00-03', claimed_until = null
where sequence_id = (select valor::uuid from ids where chave = 'legado') and step_id = 'l1';
select private.schedule_next_step((select valor::uuid from ids where chave = 'legado'), '2026-09-30 10:00-03');
select is(
  (select status || ' ' || (scheduled_for = '2026-09-30 10:00-03')
    from pg_temp.envios((select valor::uuid from ids where chave = 'legado'), 'l2')),
  'scheduled true', 'a legacy step follows the previous send exactly like the serial queue');
create temporary table reservados (send_id uuid, owner_user_id uuid);
grant all on reservados to authenticated, service_role;
set local role service_role;
insert into reservados select * from public.claim_due_step_sends(50);
select is(
  (select count(*)::int from reservados
    where send_id in (select id from pg_temp.envios((select valor::uuid from ids where chave = 'legado'), 'l2'))),
  1, 'a legacy authorization without daily limit is claimed as before');

-- Garantias da reserva: nada antes de Ativar envios; manual e dependente fora até a vez deles.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta-garantias', id::text from public.save_target_account(
  'e2100000-0000-0000-0000-000000000001', 'Empresa Garantias', 'https://garantias.e2.test');
insert into ids select 'ana', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-garantias'), 'Ana Reis', 'Diretora', 'ana@e2.test');
insert into ids select 'beto', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-garantias'), 'Beto Dias', 'Gerente', 'beto@e2.test');
insert into ids select 'garantias', id::text from public.create_sequence(
  'e2100000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-garantias'),
  jsonb_build_object('steps', jsonb_build_array(
    pg_temp.passo('g1', 'ana', 0, 'ativacao'),
    pg_temp.passo('g2', 'beto', 0, 'ativacao'),
    pg_temp.passo('gp', 'beto', 0, 'predecessor', 'g1'),
    pg_temp.passo('gm', 'ana', 0, 'manual'))));
select is(
  (select count(*)::int from pg_temp.envios((select valor::uuid from ids where chave = 'garantias'))),
  0, 'nothing is queued before Ativar envios');
select is(
  (select count(*)::int from public.activate_sequence(
    (select valor::uuid from ids where chave = 'garantias'), array['g1','g2','gp','gm'], pg_temp.agenda(10, 0))),
  4, 'the four steps are authorized together');

set local role service_role;
delete from reservados;
insert into reservados select * from public.claim_due_step_sends(50);
select is(
  (select string_agg(e.step_id, ',' order by e.step_id)
    from pg_temp.envios((select valor::uuid from ids where chave = 'garantias')) e
    join reservados r on r.send_id = e.id),
  'g1,g2', 'only the paths released by activation are claimed');
select is(
  (select string_agg(step_id || ' ' || status || ' ' || (scheduled_for is null), ',' order by step_id)
    from pg_temp.envios((select valor::uuid from ids where chave = 'garantias'))
    where step_id in ('gm', 'gp')),
  'gm waiting true,gp waiting true', 'the manual and the dependent step stay unscheduled');

reset role;
update private.sequence_step_sends
set status = 'sent', sent_at = '2026-09-30 10:00-03'
where sequence_id = (select valor::uuid from ids where chave = 'garantias') and step_id = 'g1';
select private.schedule_next_step((select valor::uuid from ids where chave = 'garantias'), '2026-09-30 10:00-03');
select pg_temp.relogio('2026-09-30 11:00-03');
set local role service_role;
delete from reservados;
insert into reservados select * from public.claim_due_step_sends(50);
select is(
  (select string_agg(e.step_id, ',' order by e.step_id)
    from pg_temp.envios((select valor::uuid from ids where chave = 'garantias')) e
    join reservados r on r.send_id = e.id),
  'gp', 'the dependent is claimed after the predecessor is sent; the manual step still is not');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select is(
  (select outcome from public.release_manual_sequence_step(
    (select valor::uuid from ids where chave = 'garantias'), 'gm')),
  'released', 'the owner releases the manual step');
set local role service_role;
delete from reservados;
insert into reservados select * from public.claim_due_step_sends(50);
select is(
  (select string_agg(e.step_id, ',' order by e.step_id)
    from pg_temp.envios((select valor::uuid from ids where chave = 'garantias')) e
    join reservados r on r.send_id = e.id),
  'gm', 'the manual step is claimed only after it is released');

-- O teto diário da Conta remetente conta os envios de todos os caminhos juntos.
reset role;
select private.set_send_rate_enabled(true);
insert into private.send_caps (workspace_id, kind, period, max_sends)
values ('e2100000-0000-0000-0000-000000000001', 'email', 'day', 1)
on conflict (workspace_id, kind, period) do update set max_sends = excluded.max_sends;
update private.sequence_step_sends
set sender_account_id = (select id from private.sender_accounts where unipile_account_id = 'unipile-e2'),
    rate_kind = 'email'
where sequence_id = (select valor::uuid from ids where chave = 'garantias') and step_id = 'g1';
set local role service_role;
select is(
  (select outcome from public.release_due_step_send(
    (select id from pg_temp.envios((select valor::uuid from ids where chave = 'garantias'), 'g2')))),
  'daily_cap', 'a parallel path does not exceed the sender daily cap already used by the other path');
select is(
  (select status || ' ' || deferred_reason || ' '
      || ((scheduled_for at time zone 'America/Sao_Paulo')::date > '2026-09-30')
    from pg_temp.envios((select valor::uuid from ids where chave = 'garantias'), 'g2')),
  'scheduled daily_cap true', 'the capped path waits for another day');
reset role;
update private.send_caps set max_sends = 2
where workspace_id = 'e2100000-0000-0000-0000-000000000001' and kind = 'email' and period = 'day';
update private.sequence_step_sends set scheduled_for = '2026-09-30 10:00-03', claimed_until = null
where sequence_id = (select valor::uuid from ids where chave = 'garantias') and step_id = 'g2';
set local role service_role;
select is(
  (select outcome from public.release_due_step_send(
    (select id from pg_temp.envios((select valor::uuid from ids where chave = 'garantias'), 'g2')))),
  'released', 'with room under the cap the same path goes out');

select * from finish();
rollback;
