begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(80);

-- Ritmo de envio por Conta remetente (anti-bloqueio no LinkedIn e no WhatsApp): variação aleatória no horário do
-- passo, intervalo mínimo entre envios da mesma Conta, limites por dia e por semana e o motivo do adiamento.

-- O relógio da agenda fica parado onde o teste quiser, só dentro desta transação.
create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create function pg_temp.envio(p_step text) returns private.sequence_step_sends language sql as $f$
  select * from private.sequence_step_sends where step_id = p_step;
$f$;

create function pg_temp.agendar(p_step text, p_at timestamptz) returns void language sql as $f$
  update private.sequence_step_sends set scheduled_for = p_at where step_id = p_step;
$f$;

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('d0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-0000000000ad', 'authenticated', 'authenticated', 'admin@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-0000000000ff', 'authenticated', 'authenticated', 'fora@outra.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('d1000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('d1000000-0000-0000-0000-000000000002', 'empresa', 'Outra empresa');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'member', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b', 'member', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000ad', 'admin', true),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000ff', 'admin', true);

create function pg_temp.como(p_user text) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p_user, true), set_config('request.jwt.claim.role', 'authenticated', true);
$f$;

-- Uma Conta-alvo com um Contato completo e uma Sequência de um passo de um canal, em nome de p_dono.
create function pg_temp.nova_sequencia(p_dono text, p_chave text, p_canal text, p_n integer, p_subtipo text default null)
returns void language plpgsql as $f$
declare
  v_conta uuid;
  v_contato uuid;
  v_seq uuid;
begin
  perform pg_temp.como(p_dono);
  select id into v_conta from public.save_target_account(
    'd1000000-0000-0000-0000-000000000001', 'Empresa ' || p_chave, 'https://' || p_chave || '.test');
  select id into v_contato from public.create_contact(v_conta, 'Pessoa ' || p_chave, 'Diretor',
    p_chave || '@' || p_chave || '.test', '11 9' || lpad(p_n::text, 8, '0'), 'https://www.linkedin.com/in/pessoa-' || p_chave);
  select id into v_seq from public.create_sequence('d1000000-0000-0000-0000-000000000001', v_conta::text,
    jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
      'steps', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', p_chave, 'canal', p_canal, 'contatoId', v_contato, 'delayDiasUteis', 0, 'titulo', p_chave,
        'corpo', 'Olá, tudo bem?', 'assunto', case when p_canal = 'email' then 'Assunto ' || p_chave end,
        'subtipoLinkedIn', case when p_canal = 'linkedin' then coalesce(p_subtipo, 'convite') end)))));
  insert into ids values ('seq-' || p_chave, v_seq::text);
end
$f$;

create function pg_temp.ativar(p_dono text, p_chave text) returns text language plpgsql as $f$
declare
  v_resultado text;
begin
  perform pg_temp.como(p_dono);
  select outcome into v_resultado from public.activate_sequence((select valor::uuid from ids where chave = 'seq-' || p_chave));
  return v_resultado;
end
$f$;

grant execute on function pg_temp.relogio(timestamptz), pg_temp.envio(text), pg_temp.agendar(text, timestamptz),
  pg_temp.como(text), pg_temp.nova_sequencia(text, text, text, integer, text), pg_temp.ativar(text, text)
  to authenticated, service_role;

-- As Contas remetentes pelo mesmo caminho da conexão real: a e b no LinkedIn, b também no WhatsApp, a no e-mail.
create function pg_temp.conectar(p_dono text, p_canal text, p_unipile text, p_provider text) returns void language plpgsql as $f$
declare
  v_tentativa uuid;
begin
  perform pg_temp.como(p_dono);
  select attempt_id into v_tentativa from public.create_sender_connection_attempt(
    'd1000000-0000-0000-0000-000000000001', p_canal, null);
  perform public.complete_sender_connection_attempt(v_tentativa, p_unipile, p_provider, 'CREATION_SUCCESS');
  perform public.apply_unipile_sender_status(p_unipile, 'SYNC_SUCCESS');
end
$f$;

select pg_temp.conectar('d0000000-0000-0000-0000-00000000000a', 'linkedin', 'unipile-li-a', 'LINKEDIN');
select pg_temp.conectar('d0000000-0000-0000-0000-00000000000a', 'email', 'unipile-em-a', 'GOOGLE');
select pg_temp.conectar('d0000000-0000-0000-0000-00000000000b', 'linkedin', 'unipile-li-b', 'LINKEDIN');
select pg_temp.conectar('d0000000-0000-0000-0000-00000000000b', 'whatsapp', 'unipile-wa-b', 'WHATSAPP');
select private.set_chat_channel_enabled('linkedin', true);
select private.set_chat_channel_enabled('whatsapp', true);

-- O Executor de conversa, um minuto por vez: reserva, libera e grava o resultado, como o sequence-runner.
create temporary table registro (
  n serial, at timestamptz, send_id uuid, passo text, canal text, outcome text, motivo text,
  reagendado timestamptz, folga interval);

create function pg_temp.simular(p_inicio timestamptz, p_minutos integer) returns void language plpgsql as $f$
declare
  t timestamptz;
  r record;
  v record;
  e private.sequence_step_sends;
  s private.sender_accounts;
begin
  for i in 0..p_minutos loop
    t := p_inicio + make_interval(mins => i);
    perform pg_temp.relogio(t);
    for r in select * from public.claim_due_chat_step_sends(5) loop
      select * into v from public.release_due_chat_step_send(r.send_id);
      select * into e from private.sequence_step_sends where id = r.send_id;
      select * into s from private.sender_accounts where id = e.sender_account_id;
      insert into registro (at, send_id, passo, canal, outcome, motivo, reagendado, folga)
      values (t, r.send_id, e.step_id, e.channel, v.outcome, e.deferred_reason, e.scheduled_for,
        case when v.outcome = 'released' then s.next_send_allowed_at - t end);
      if v.outcome = 'released' then
        perform public.record_chat_step_send_result(r.send_id,
          case when e.step_id like 'unc%' then 'uncertain' else 'sent' end,
          'chat-' || e.step_id, 'msg-' || e.step_id, 'user-' || e.step_id,
          case when e.channel = 'linkedin' then coalesce(v.linkedin_subtype, 'convite') end, null);
      end if;
    end loop;
  end loop;
end
$f$;

-- 1. O ritmo nasce desligado e tem padrões seguros por canal e por tipo; só o administrador do banco o liga.
select is(private.send_rate_enabled(), false, 'the pacing starts switched off, so nothing changes until it is turned on');
select is((select min_gap_seconds || '-' || max_gap_seconds from private.send_rate_settings
  where workspace_id is null and channel = 'linkedin'), '120-300', 'LinkedIn waits 2 to 5 minutes between sends by default');
select is((select min_gap_seconds || '-' || max_gap_seconds from private.send_rate_settings
  where workspace_id is null and channel = 'whatsapp'), '60-180', 'WhatsApp waits 1 to 3 minutes between sends by default');
select is((select min_gap_seconds || '-' || max_gap_seconds from private.send_rate_settings
  where workspace_id is null and channel = 'email'), '20-60', 'e-mail waits 20 to 60 seconds between sends by default');
select is((select schedule_jitter_seconds from private.send_rate_settings where workspace_id is null and channel = 'linkedin'),
  900, 'the schedule varies up to 15 minutes on LinkedIn by default');
select ok((select schedule_jitter_seconds from private.send_rate_settings where workspace_id is null and channel = 'email')
  < (select schedule_jitter_seconds from private.send_rate_settings where workspace_id is null and channel = 'linkedin'),
  'and less on e-mail');
select is((select count(*)::int from private.send_caps where workspace_id is null), 6,
  'there is a safe default cap for each kind of send');
select is((select max_sends from private.send_caps where workspace_id is null and kind = 'linkedin_invite' and period = 'day'),
  20, 'LinkedIn invitations: 20 a day by default');
select is((select max_sends from private.send_caps where workspace_id is null and kind = 'linkedin_invite' and period = 'week'),
  100, 'and 100 a week');
set local role authenticated;
select throws_ok($$select private.set_send_rate_enabled(true)$$, '42501', null, 'signed-in users cannot switch the pacing');
reset role;

-- 2. Quem configura: só o administrador do Workspace, e só o do próprio Workspace.
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 60, 120, 0)$$,
  '42501', null, 'a member cannot change the pacing');
select throws_ok($$select public.get_send_rate_settings('d1000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'a member cannot read the settings either');
select pg_temp.como('d0000000-0000-0000-0000-0000000000ff');
select throws_ok($$select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'email', 'day', 5)$$,
  '42501', null, 'the admin of another Workspace cannot change this one');
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select throws_ok($$select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 300, 120, 0)$$,
  '22023', null, 'the minimum interval cannot be longer than the maximum');
select throws_ok($$select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'sms', 1, 2, 0)$$,
  '22023', null, 'an unknown channel is refused');
select throws_ok($$select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 1, 2, -1)$$,
  '22023', null, 'a negative variation is refused');
select throws_ok($$select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'carta', 'day', 5)$$,
  '22023', null, 'an unknown kind of send is refused');
select throws_ok($$select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'email', 'day', 0)$$,
  '22023', null, 'a cap of zero is refused: no limit is a null, not a zero');
select lives_ok($$select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 120, 300, 0)$$,
  'the admin sets the LinkedIn variation to zero, to keep the next scenarios exact');
select is((select (p ->> 'schedule_jitter_seconds') || ' ' || (p ->> 'is_default')
  from jsonb_array_elements(public.get_send_rate_settings('d1000000-0000-0000-0000-000000000001') -> 'pacing') p
  where p ->> 'channel' = 'linkedin'), '0 false', 'the admin reads back the Workspace value, marked as not default');
select is((select (p ->> 'is_default') from jsonb_array_elements(public.get_send_rate_settings(
  'd1000000-0000-0000-0000-000000000001') -> 'pacing') p where p ->> 'channel' = 'email'), 'true',
  'a channel the Workspace did not touch shows the platform default');
reset role;

-- 3. A variação aleatória no horário: sempre dentro da janela, e dois agendamentos iguais não colam.
select setseed(0.42);
create temporary table amostras as
  select private.jittered_send_slot('2026-10-06 09:00-03', '{"de": "09:00", "ate": "18:00"}', 900) as t from generate_series(1, 40);
select is((select count(*)::int from amostras where t >= '2026-10-06 09:00-03' and t <= '2026-10-06 09:15-03'), 40,
  'the variation adds between 0 and 15 minutes to the slot');
select ok((select max(t) - min(t) from amostras) > interval '5 minutes', 'and the 40 draws really spread');
select is(private.jittered_send_slot('2026-10-06 09:00-03', '{"de": "09:00", "ate": "18:00"}', 0), '2026-10-06 09:00-03'::timestamptz,
  'a variation of zero keeps the exact slot');
create temporary table amostras_no_fim as
  select private.jittered_send_slot('2026-10-06 17:55-03', '{"de": "09:00", "ate": "18:00"}', 900) as t from generate_series(1, 40);
select is((select count(*)::int from amostras_no_fim where t >= '2026-10-06 17:55-03' and t < '2026-10-06 18:00-03'), 40,
  'near the end of the window the variation never leaves it');
create temporary table amostras_outra_janela as
  select private.jittered_send_slot('2026-10-06 11:50-03', '{"de": "08:00", "ate": "12:00"}', 3600) as t from generate_series(1, 40);
select is((select count(*)::int from amostras_outra_janela where t >= '2026-10-06 11:50-03' and t < '2026-10-06 12:00-03'), 40,
  'the window of the step is the one respected, not 18:00');
select setseed(0.5);
create temporary table dupla (ordem integer, t timestamptz);
insert into dupla select 1, private.jittered_send_slot('2026-10-06 09:00-03', '{"de": "09:00", "ate": "18:00"}', 900);
insert into dupla select 2, private.jittered_send_slot('2026-10-06 09:00-03', '{"de": "09:00", "ate": "18:00"}', 900);
select isnt((select date_trunc('second', t) from dupla where ordem = 1), (select date_trunc('second', t) from dupla where ordem = 2),
  'two identical schedulings do not land in the same second');

-- 4. Ativando: desligado, o passo continua saindo no início exato da janela; ligado, ganha a variação do canal.
select pg_temp.relogio('2026-10-06 10:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'off1', 'linkedin', 1);
select is(pg_temp.ativar('d0000000-0000-0000-0000-00000000000a', 'off1'), 'activated', 'the sequence is activated');
reset role;
select is((pg_temp.envio('off1')).scheduled_for, '2026-10-06 10:00-03'::timestamptz, 'with the pacing off the slot is exact, as before');
select private.set_send_rate_enabled(true);
select is(private.send_rate_enabled(), true, 'the database admin switches the pacing on');
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 120, 300, 900);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'on1', 'linkedin', 2);
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000a', 'on1');
reset role;
select ok((pg_temp.envio('on1')).scheduled_for between '2026-10-06 10:00-03' and '2026-10-06 10:15-03',
  'with the pacing on the first step leaves between 0 and 15 minutes after the slot');
update public.sequences set status = 'pausada' where id in (select valor::uuid from ids where chave in ('seq-off1', 'seq-on1'));
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 120, 300, 0);
reset role;

-- 5. Cinco passos da mesma Conta de LinkedIn vencidos às 09:10 não saem no mesmo minuto, e o passo de outra Conta
-- não espera por eles.
select pg_temp.relogio('2026-10-06 08:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'a1', 'linkedin', 11);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'a2', 'linkedin', 12);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'a3', 'linkedin', 13);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'a4', 'linkedin', 14);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'a5', 'linkedin', 15);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'b1', 'linkedin', 16);
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000a', 'a' || n) from generate_series(1, 5) n;
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000b', 'b1');
reset role;
select pg_temp.agendar('a1', '2026-10-06 09:09:00-03');
select pg_temp.agendar('a2', '2026-10-06 09:09:01-03');
select pg_temp.agendar('a3', '2026-10-06 09:09:02-03');
select pg_temp.agendar('a4', '2026-10-06 09:09:03-03');
select pg_temp.agendar('a5', '2026-10-06 09:09:04-03');
select pg_temp.agendar('b1', '2026-10-06 09:09:30-03');
select pg_temp.simular('2026-10-06 09:10-03', 30);

select is((select count(*)::int from registro where passo like 'a%' and outcome = 'released'), 5, 'all five steps of the account go out');
select is((select max(c)::int from (select count(*) c from registro where outcome = 'released' group by send_id) x), 1,
  'and none of them is released twice');
select is((select count(distinct at)::int from registro where passo like 'a%' and outcome = 'released'), 5,
  'never two sends of the same account in the same minute');
select ok((select min(gap) from (
  select at - lag(at) over (order by at) as gap from registro where passo like 'a%' and outcome = 'released') g
  where gap is not null) >= interval '2 minutes', 'each goes out at least the minimum interval after the previous one');
select ok((select bool_and(folga between interval '120 seconds' and interval '300 seconds') from registro
  where passo like 'a%' and outcome = 'released'), 'after each send the account waits 2 to 5 minutes, drawn at random');
select ok(exists (select 1 from registro where passo like 'a%' and outcome = 'rate_limited'),
  'a step that is not its turn is not sent: it is postponed');
select ok((select bool_and(motivo = 'rate_limited' and reagendado > at) from registro where outcome = 'rate_limited'),
  'the postponed step keeps the reason and a later time for the screen to show');
select is((select count(*)::int from private.sequence_step_sends where step_id ~ '^[ab][0-9]$' and deferred_reason is not null), 0,
  'once sent, no postponement reason is left behind');
select is((select at from registro where passo = 'b1' and outcome = 'released'), '2026-10-06 09:10-03'::timestamptz,
  'the step of another account goes out in the same minute, without waiting for the first one');
select is((select min(at) from registro where passo like 'a%' and outcome = 'released'), '2026-10-06 09:10-03'::timestamptz,
  'and the first account also starts at 09:10');
select is((select count(*)::int from private.sequence_step_sends where step_id ~ '^[ab][0-9]$' and status = 'sent'), 6,
  'every step ended up sent');
select is((select count(*)::int from private.sequence_step_sends where status = 'uncertain'), 0,
  'nothing was left uncertain by the postponements');
select is((select rate_kind from private.sequence_step_sends where step_id = 'a1'), 'linkedin_invite',
  'a LinkedIn invitation is counted as an invitation');

-- 6. Só os envios com resultado "enviado" contam para o limite, e o dia é o do fuso do Workspace (Brasília).
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'whatsapp', 0, 0, 0);
select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'linkedin', 0, 0, 0);
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'whatsapp_new_contact', 'day', 3);
reset role;
select pg_temp.relogio('2026-10-08 08:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'w1', 'whatsapp', 21);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'unc2', 'whatsapp', 22);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'w3', 'whatsapp', 23);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'w4', 'whatsapp', 24);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'm1', 'linkedin', 25, 'mensagem');
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000b', c) from unnest(array['w1', 'unc2', 'w3', 'w4', 'm1']) c;
reset role;
select pg_temp.agendar('w1', '2026-10-08 10:00:00-03');
select pg_temp.agendar('unc2', '2026-10-08 10:00:01-03');
select pg_temp.agendar('w3', '2026-10-08 10:00:02-03');
select pg_temp.agendar('w4', '2026-10-08 10:00:03-03');
select pg_temp.agendar('m1', '2026-10-08 10:00:04-03');
select pg_temp.simular('2026-10-08 10:00-03', 6);

select is((select count(*)::int from registro where at >= '2026-10-08 00:00-03' and at < '2026-10-09 00:00-03'
  and outcome = 'released'), 5, 'with the cap at 3 new contacts, four WhatsApp steps and a message all went out');
select is((pg_temp.envio('unc2')).status, 'uncertain', 'one WhatsApp send was left uncertain by the provider');
select is((select outcome from registro where passo = 'w4'), 'released',
  'an uncertain send does not use the daily cap: only "sent" counts');
select is((pg_temp.envio('w1')).rate_kind, 'whatsapp_new_contact', 'a first message to a Contato counts as a new contact');
select is((pg_temp.envio('m1')).rate_kind, 'linkedin_message', 'a LinkedIn message is not an invitation');
-- Estes envios saíram na quinta às 23:00 em Brasília, que já é sexta em UTC.
update private.sequence_step_sends set sent_at = '2026-10-09 02:00:00+00' where step_id in ('w1', 'w3', 'w4');

-- 7. O limite diário: o passo vai para o próximo dia útil dentro da janela, sem erro, sem envio e sem "incerto".
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'whatsapp_new_contact', 'day', 1);
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'linkedin_invite', 'day', 2);
reset role;
select pg_temp.relogio('2026-10-09 08:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'wf1', 'whatsapp', 31);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'wf2', 'whatsapp', 32);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'c1', 'linkedin', 33);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'c2', 'linkedin', 34);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'c3', 'linkedin', 35);
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000b', c) from unnest(array['wf1', 'wf2', 'c1', 'c2', 'c3']) c;
reset role;
select pg_temp.agendar('wf1', '2026-10-09 10:00:00-03');
select pg_temp.agendar('wf2', '2026-10-09 10:00:01-03');
select pg_temp.agendar('c1', '2026-10-09 10:00:02-03');
select pg_temp.agendar('c2', '2026-10-09 10:00:03-03');
select pg_temp.agendar('c3', '2026-10-09 10:00:04-03');
select pg_temp.simular('2026-10-09 10:00-03', 5);

select is((select outcome from registro where passo = 'wf1'), 'released',
  'the sends of yesterday in Brasília time do not count, even if they are already today in UTC');
select is((select outcome from registro where passo = 'wf2'), 'daily_cap', 'the second new contact of the day hits the cap');
select is((select outcome from registro where passo = 'c3'), 'daily_cap', 'so does the third invitation when the cap is two');
select is((select count(*)::int from private.sequence_step_sends where step_id in ('c1', 'c2') and status = 'sent'), 2,
  'the two invitations under the cap went out');
select is((select status || ' ' || attempts || ' ' || deferred_reason from private.sequence_step_sends where step_id = 'c3'),
  'scheduled 0 daily_cap', 'the capped step stays scheduled, with no attempt and the reason recorded');
select is((pg_temp.envio('c3')).scheduled_for, '2026-10-12 09:00-03'::timestamptz,
  'and moves to the start of the window on the next business day (Friday to Monday)');
select is((pg_temp.envio('wf2')).scheduled_for, '2026-10-12 09:00-03'::timestamptz, 'the capped WhatsApp step moves the same way');
select is((select count(*)::int from private.sequence_step_sends where step_id in ('wf2', 'c3') and status in ('uncertain', 'failed', 'sending')), 0,
  'a cap is neither an error nor an uncertain send');
select pg_temp.simular('2026-10-12 09:00-03', 3);
select is((select string_agg(passo || ' ' || outcome || ' ' || to_char(at at time zone 'America/Sao_Paulo', 'DD HH24:MI'), ', ' order by passo)
  from registro where passo in ('wf2', 'c3') and at >= '2026-10-12 00:00-03'), 'c3 released 12 09:00, wf2 released 12 09:00',
  'on the next business day the counters start over and both go out');

-- 8. O limite semanal: a semana vai de segunda a domingo; batido, o passo espera a segunda seguinte.
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'linkedin_invite', 'day', 5);
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'linkedin_invite', 'week', 3);
reset role;
select pg_temp.relogio('2026-10-13 08:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'd1', 'linkedin', 41);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'd2', 'linkedin', 42);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000b', 'd3', 'linkedin', 43);
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000b', c) from unnest(array['d1', 'd2', 'd3']) c;
reset role;
select pg_temp.agendar('d1', '2026-10-13 10:00:00-03');
select pg_temp.agendar('d2', '2026-10-13 10:00:01-03');
select pg_temp.agendar('d3', '2026-10-13 10:00:02-03');
select pg_temp.simular('2026-10-13 10:00-03', 4);
select is((select string_agg(passo || ' ' || outcome, ', ' order by passo) from registro
  where passo in ('d1', 'd2', 'd3') and at < '2026-10-14 00:00-03'), 'd1 released, d2 released, d3 weekly_cap',
  'with one invitation already this week and a cap of three, the third one of the week waits');
select is((select status || ' ' || attempts || ' ' || deferred_reason from private.sequence_step_sends where step_id = 'd3'),
  'scheduled 0 weekly_cap', 'the postponement says it was the weekly cap');
select is((pg_temp.envio('d3')).scheduled_for, '2026-10-19 09:00-03'::timestamptz, 'and the step waits for the next Monday');
select pg_temp.simular('2026-10-19 09:00-03', 2);
select is((select outcome from registro where passo = 'd3' and at >= '2026-10-19 00:00-03'), 'released',
  'in the new week the step goes out');

-- 9. E-mail: o mesmo ritmo (20 a 60 s), o mesmo limite diário, e o Executor de e-mail não gasta o lote numa Conta só.
set local role authenticated;
select pg_temp.como('d0000000-0000-0000-0000-0000000000ad');
select public.set_send_pacing('d1000000-0000-0000-0000-000000000001', 'email', 20, 60, 0);
select public.set_send_cap('d1000000-0000-0000-0000-000000000001', 'email', 'day', 2);
reset role;
select pg_temp.relogio('2026-10-20 09:00-03');
set local role authenticated;
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'e1', 'email', 51);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'e2', 'email', 52);
select pg_temp.nova_sequencia('d0000000-0000-0000-0000-00000000000a', 'e3', 'email', 53);
select pg_temp.ativar('d0000000-0000-0000-0000-00000000000a', c) from unnest(array['e1', 'e2', 'e3']) c;
reset role;
select pg_temp.agendar('e1', '2026-10-20 10:00:00-03');
select pg_temp.agendar('e2', '2026-10-20 10:00:01-03');
select pg_temp.agendar('e3', '2026-10-20 10:00:02-03');
select pg_temp.relogio('2026-10-20 10:00:05-03');
create temporary table reservados as select * from public.claim_due_step_sends(5);
select is((select count(*)::int from reservados), 1, 'the e-mail executor reserves one step per sender account, not the whole batch');
select is((select e.step_id from reservados r join private.sequence_step_sends e on e.id = r.send_id), 'e1', 'the oldest first');
select is((select outcome from public.release_due_step_send((select send_id from reservados))), 'released', 'the first e-mail is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('e1')).id, 'sent', 'em-e1', '<e1@x>', null), 'sent', 'and goes out');
select is((select rate_kind from private.sequence_step_sends where step_id = 'e1'), 'email', 'an e-mail counts as an e-mail');

-- A reserva de 2 minutos pode acabar no meio de um lote lento: o Executor a renova antes de cada envio.
select is(public.renew_due_step_send_claims(array[(pg_temp.envio('e2')).id, (pg_temp.envio('e1')).id]), 0,
  'a step nobody reserved, and a step already sent, are not renewed');
update private.sequence_step_sends set claimed_until = now() + interval '5 seconds', status = 'scheduled' where step_id = 'e3';
select is(public.renew_due_step_send_claims(array[(pg_temp.envio('e3')).id, (pg_temp.envio('e1')).id]), 1,
  'a scheduled step still reserved gets its reservation renewed, and a step already sent does not');
select ok((pg_temp.envio('e3')).claimed_until > now() + interval '90 seconds', 'for another 2 minutes');
update private.sequence_step_sends set claimed_until = null where step_id = 'e3';
set local role authenticated;
select throws_ok($$select public.renew_due_step_send_claims(array[]::uuid[])$$, '42501', null,
  'signed-in users cannot renew reservations');
reset role;

create temporary table reservados2 as select * from public.claim_due_step_sends(5);
select is((select count(*)::int from reservados2), 1, 'the next reservation again holds a single step of the account');
select is((select outcome from public.release_due_step_send((select send_id from reservados2))), 'rate_limited',
  'a second e-mail in the same second is not sent');
select ok((select e.scheduled_for between '2026-10-20 10:00:25-03' and '2026-10-20 10:01:05-03' and e.deferred_reason = 'rate_limited'
  from private.sequence_step_sends e where e.id = (select send_id from reservados2)),
  'it is postponed by 20 to 60 seconds, with the reason recorded');
-- O envio pedido à mão pelo titular também respeita o ritmo, mas não reagenda nada.
select is((select outcome from public.release_sequence_step_send((pg_temp.envio('e3')).id, 'd0000000-0000-0000-0000-00000000000a')),
  'rate_limited', 'the owner asking for a send by hand is told the account has to wait');
select is((select (e.deferred_reason is null)::text || ' ' || (e.scheduled_for = '2026-10-20 10:00:02-03')::text || ' ' || e.attempts
  from private.sequence_step_sends e where e.step_id = 'e3'), 'true true 0', 'and nothing is rescheduled or attempted by it');

select pg_temp.relogio('2026-10-20 10:02-03');
create temporary table reservados3 as select * from public.claim_due_step_sends(5);
select is((select e.step_id from reservados3 r join private.sequence_step_sends e on e.id = r.send_id), 'e3', 'two minutes later the oldest due step is next');
select is((select outcome from public.release_due_step_send((select send_id from reservados3))), 'released', 'and goes out');
select is(public.record_sequence_step_send_result((pg_temp.envio('e3')).id, 'sent', 'em-e3', '<e3@x>', null), 'sent', 'sent');
create temporary table reservados4 as select * from public.claim_due_step_sends(5);
select is((select outcome from public.release_due_step_send((select send_id from reservados4))), 'daily_cap',
  'the third e-mail of the day hits the cap of two');
select is((pg_temp.envio('e2')).scheduled_for, '2026-10-21 09:00-03'::timestamptz, 'and waits for 09:00 of the next business day');

select * from finish();
rollback;
