begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(30);

-- Fila de entrada nas Sequências: a vaga é da Conta, por remetente. O excedente espera o próximo dia útil.
-- A Conta Quente passa na frente. Remetente novo sobe a rampa. A capacidade do Workspace soma os remetentes prontos.

create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('f11a0000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'ana@fila.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f11a0000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'bia@fila.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f11a0000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'caio@fila.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f11a0000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'duda@fila.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f11a0000-0000-4000-8000-0000000000ad', 'authenticated', 'authenticated', 'admin@fila.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f11a0000-0000-4000-8000-0000000000ff', 'authenticated', 'authenticated', 'fora@outra.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('f11a0000-0000-4000-8000-000000000010', 'empresa', 'Fila'),
  ('f11a0000-0000-4000-8000-000000000011', 'empresa', 'Outra');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f11a0000-0000-4000-8000-000000000010', 'f11a0000-0000-4000-8000-0000000000a1', 'member', true),
  ('f11a0000-0000-4000-8000-000000000010', 'f11a0000-0000-4000-8000-0000000000b1', 'member', true),
  ('f11a0000-0000-4000-8000-000000000010', 'f11a0000-0000-4000-8000-0000000000c1', 'member', true),
  ('f11a0000-0000-4000-8000-000000000010', 'f11a0000-0000-4000-8000-0000000000d1', 'member', true),
  ('f11a0000-0000-4000-8000-000000000010', 'f11a0000-0000-4000-8000-0000000000ad', 'admin', true),
  ('f11a0000-0000-4000-8000-000000000011', 'f11a0000-0000-4000-8000-0000000000ff', 'admin', true);

create function pg_temp.como(p_user text) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p_user, true), set_config('request.jwt.claim.role', 'authenticated', true);
$f$;

create function pg_temp.conectar(p_dono text, p_canal text, p_unipile text) returns void language plpgsql as $f$
declare
  v_tentativa uuid;
begin
  perform pg_temp.como(p_dono);
  select attempt_id into v_tentativa from public.create_sender_connection_attempt(
    'f11a0000-0000-4000-8000-000000000010', p_canal, null);
  perform public.complete_sender_connection_attempt(v_tentativa, p_unipile, upper(p_canal), 'CREATION_SUCCESS');
  perform public.apply_unipile_sender_status(p_unipile, 'SYNC_SUCCESS');
end
$f$;

-- Cria a Conta se p_conta for nulo e grava a Sequência de um passo de WhatsApp.
create function pg_temp.sequencia(p_dono text, p_chave text, p_conta text, p_n integer) returns void language plpgsql as $f$
declare
  v_conta uuid;
  v_contato uuid;
  v_seq uuid;
begin
  perform pg_temp.como(p_dono);
  if p_conta is null then
    select id into v_conta from public.save_target_account(
      'f11a0000-0000-4000-8000-000000000010', 'Empresa ' || p_chave, 'https://' || p_chave || '.fila.test');
    insert into ids values ('conta-' || p_chave, v_conta::text);
  else
    v_conta := p_conta::uuid;
  end if;
  select id into v_contato from public.create_contact(v_conta, 'Pessoa ' || p_chave, 'Diretor',
    p_chave || '@fila.test', '11 9' || lpad(p_n::text, 8, '0'), 'https://www.linkedin.com/in/' || p_chave);
  select id into v_seq from public.create_sequence('f11a0000-0000-4000-8000-000000000010', v_conta::text,
    jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
      'steps', jsonb_build_array(jsonb_build_object(
        'id', p_chave, 'canal', 'whatsapp', 'contatoId', v_contato, 'delayDiasUteis', 0,
        'titulo', p_chave, 'corpo', 'Olá'))));
  insert into ids values ('seq-' || p_chave, v_seq::text);
end
$f$;

create function pg_temp.ativar(p_dono text, p_chave text) returns void language plpgsql as $f$
begin
  perform pg_temp.como(p_dono);
  perform public.activate_sequence((select valor::uuid from ids where chave = 'seq-' || p_chave));
end
$f$;

create function pg_temp.dia(p_chave text) returns date language sql as $f$
  select (scheduled_for at time zone 'America/Sao_Paulo')::date
  from private.sequence_step_sends where step_id = p_chave;
$f$;

grant execute on function pg_temp.relogio(timestamptz), pg_temp.como(text), pg_temp.conectar(text, text, text),
  pg_temp.sequencia(text, text, text, integer), pg_temp.ativar(text, text), pg_temp.dia(text)
  to authenticated, service_role;

-- Duas pessoas da mesma Conta, na mesma Sequência: a segunda não abre outra Sequência (só há uma em andamento).
create function pg_temp.duas_pessoas(p_dono text) returns void language plpgsql as $f$
declare
  v_conta uuid;
  v_um uuid;
  v_dois uuid;
  v_seq uuid;
begin
  perform pg_temp.como(p_dono);
  select id into v_conta from public.save_target_account(
    'f11a0000-0000-4000-8000-000000000010', 'Empresa dupla', 'https://dupla.fila.test');
  insert into ids values ('conta-p1', v_conta::text);
  select id into v_um from public.create_contact(v_conta, 'Pessoa p1', 'Diretor',
    'p1@fila.test', '11 900000201', 'https://www.linkedin.com/in/p1');
  select id into v_dois from public.create_contact(v_conta, 'Pessoa p2', 'Diretor',
    'p2@fila.test', '11 900000202', 'https://www.linkedin.com/in/p2');
  select id into v_seq from public.create_sequence('f11a0000-0000-4000-8000-000000000010', v_conta::text,
    jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
      'steps', jsonb_build_array(
        jsonb_build_object('id', 'p1', 'canal', 'whatsapp', 'contatoId', v_um, 'delayDiasUteis', 0, 'titulo', 'p1', 'corpo', 'Olá'),
        jsonb_build_object('id', 'p2', 'canal', 'whatsapp', 'contatoId', v_dois, 'delayDiasUteis', 0, 'titulo', 'p2', 'corpo', 'Olá'))));
  insert into ids values ('seq-dupla', v_seq::text);
end
$f$;

grant execute on function pg_temp.duas_pessoas(text) to authenticated, service_role;

select private.set_chat_channel_enabled('whatsapp', true);
select private.set_send_rate_enabled(true);
select pg_temp.relogio('2026-10-14 10:00:00-03');

-- 1. A faixa, a rampa e o teto que o administrador grava.
select is((select min_sends || '-' || max_sends from private.send_caps
  where workspace_id is null and kind = 'whatsapp_new_company' and period = 'day'), '20-25',
  'o padrão de WhatsApp sorteia entre 20 e 25 empresas por dia');
select is((select count(*)::int from private.send_warmup_ramp where kind = 'whatsapp_new_company'), 14,
  'a rampa tem um degrau por dia, do 0 ao 13');
select is((select max_sends from private.send_warmup_ramp where kind = 'whatsapp_new_company' and day_index = 0), 5,
  'o dia 0 começa em 5');
select is((select max_sends from private.send_warmup_ramp where kind = 'whatsapp_new_company' and day_index = 13), 25,
  'no 14º dia a rampa chega ao padrão');

set local role authenticated;
select pg_temp.como('f11a0000-0000-4000-8000-0000000000a1');
select throws_ok($$select public.set_send_cap('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', 'day', 8)$$,
  '42501', null, 'quem não administra o Workspace não muda o teto');
select pg_temp.como('f11a0000-0000-4000-8000-0000000000ff');
select throws_ok($$select public.set_send_cap('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', 'day', 8)$$,
  '42501', null, 'o administrador de outro Workspace também não');
select pg_temp.como('f11a0000-0000-4000-8000-0000000000ad');
select lives_ok($$select public.set_send_pacing('f11a0000-0000-4000-8000-000000000010', 'whatsapp', 0, 0, 0)$$,
  'o administrador zera a variação para o horário do teste ficar exato');
reset role;

-- 2. Remetente antigo sorteia dentro da faixa, e o número não muda no mesmo dia. Remetente novo fica em 5.
-- A conclusão da conexão é do service_role: o teste chama como o dono do banco, com a sessão do titular.
select pg_temp.conectar('f11a0000-0000-4000-8000-0000000000a1', 'whatsapp', 'wa-ana');
select pg_temp.conectar('f11a0000-0000-4000-8000-0000000000b1', 'whatsapp', 'wa-bia');
update private.sender_accounts set created_at = '2026-09-01 12:00:00-03' where unipile_account_id = 'wa-ana';
update private.sender_accounts set created_at = '2026-10-14 08:00:00-03' where unipile_account_id = 'wa-bia';
insert into ids select 'remetente-wa-bia', id::text from private.sender_accounts where unipile_account_id = 'wa-bia';
select setseed(0.2);
select is(
  (select private.company_entry_cap(id, workspace_id, 'whatsapp_new_company', '2026-10-14')
    between 20 and 25 from private.sender_accounts where unipile_account_id = 'wa-ana'),
  true, 'remetente fora da rampa sorteia de 20 a 25');
select is(
  (select private.company_entry_cap(id, workspace_id, 'whatsapp_new_company', '2026-10-14')
    from private.sender_accounts where unipile_account_id = 'wa-ana'),
  (select drawn_cap from private.sender_daily_draws d
    join private.sender_accounts a on a.id = d.sender_account_id
    where a.unipile_account_id = 'wa-ana' and d.day = '2026-10-14'),
  'o sorteio do dia fica gravado');
select is(
  (select private.company_entry_cap(id, workspace_id, 'whatsapp_new_company', '2026-10-14')
    from private.sender_accounts where unipile_account_id = 'wa-bia'),
  5, 'remetente no dia 0 da rampa entra com 5 empresas');

-- 3. Seis Contas no dia 0: cinco hoje, uma amanhã. Nenhuma é cancelada.
set local role authenticated;
select pg_temp.sequencia('f11a0000-0000-4000-8000-0000000000b1', 'aq' || n, null, 100 + n) from generate_series(1, 6) n;
select pg_temp.ativar('f11a0000-0000-4000-8000-0000000000b1', 'aq' || n) from generate_series(1, 6) n;
reset role;
select is((select count(*)::int from private.sequence_step_sends
  where step_id like 'aq%' and (scheduled_for at time zone 'America/Sao_Paulo')::date = '2026-10-14'), 5,
  'cinco empresas novas ocupam o dia da rampa');
select is((select count(*)::int from private.sequence_step_sends
  where step_id like 'aq%' and (scheduled_for at time zone 'America/Sao_Paulo')::date = '2026-10-15'), 1,
  'a sexta espera o próximo dia útil');
select is((select count(*)::int from private.sequence_step_sends
  where step_id like 'aq%' and status = 'scheduled'), 6, 'as seis continuam agendadas');
select is((select count(*)::int from private.sequence_step_sends
  where step_id like 'aq%' and status in ('cancelled', 'failed')), 0, 'nada é descartado');

set local role authenticated;
select pg_temp.como('f11a0000-0000-4000-8000-0000000000b1');
select is(
  (select used_today || ' de ' || cap_today || ' hoje · ' || queued_for_tomorrow || ' na fila para amanhã'
    from public.list_my_sender_entry_quotas('f11a0000-0000-4000-8000-000000000010')
    where channel = 'whatsapp'),
  '5 de 5 hoje · 1 na fila para amanhã', 'a tela lê X de Y hoje e a fila de amanhã');
select is(
  (select warming from public.list_my_sender_entry_quotas('f11a0000-0000-4000-8000-000000000010') where channel = 'whatsapp'),
  true, 'e sabe que o remetente ainda está na rampa');
select pg_temp.como('f11a0000-0000-4000-8000-0000000000a1');
select is(
  (select count(*)::int from public.list_my_sender_entry_quotas('f11a0000-0000-4000-8000-000000000010') q
    where q.sender_account_id = (select valor::uuid from ids where chave = 'remetente-wa-bia')),
  0, 'a cota de um remetente não aparece para outro participante');
select pg_temp.como('f11a0000-0000-4000-8000-0000000000ff');
select throws_ok($$select * from public.list_my_sender_entry_quotas('f11a0000-0000-4000-8000-000000000010')$$,
  '42501', null, 'outro Workspace não lê a fila');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.list_my_sender_entry_quotas('f11a0000-0000-4000-8000-000000000010')$$,
  '28000', null, 'sem sessão a fila não abre');
reset role;

-- 4. Duas pessoas da mesma Conta contam uma. A Conta seguinte espera, na ordem de chegada.
set local role authenticated;
select pg_temp.como('f11a0000-0000-4000-8000-0000000000ad');
select public.set_send_cap('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', 'day', 1);
reset role;
update private.sender_accounts set created_at = '2026-10-14 08:00:00-03' where unipile_account_id = 'wa-ana';
set local role authenticated;
select pg_temp.duas_pessoas('f11a0000-0000-4000-8000-0000000000a1');
select pg_temp.sequencia('f11a0000-0000-4000-8000-0000000000a1', 'o1', null, 203);
select pg_temp.ativar('f11a0000-0000-4000-8000-0000000000a1', 'dupla');
select pg_temp.ativar('f11a0000-0000-4000-8000-0000000000a1', 'o1');
reset role;
select is((select count(*)::int from private.company_entry_slots q
  where q.sender_account_id = (select id from private.sender_accounts where unipile_account_id = 'wa-ana')
    and q.target_account_id = (select valor::uuid from ids where chave = 'conta-p1')),
  1, 'duas pessoas da mesma Conta ocupam uma vaga');
select is(pg_temp.dia('p1'), '2026-10-14'::date, 'a primeira pessoa sai hoje');
select is(pg_temp.dia('o1'), '2026-10-15'::date, 'a Conta seguinte espera a vez, na ordem de chegada');
select is((select status from private.sequence_step_sends where step_id = 'o1'), 'scheduled',
  'quem espera continua agendado');
update private.sequence_step_sends
set status = 'sent',
    sender_account_id = (select id from private.sender_accounts where unipile_account_id = 'wa-ana'),
    sent_at = private.clock_now()
where step_id = 'p1';
select private.schedule_next_step((select valor::uuid from ids where chave = 'seq-dupla'), private.clock_now());
select is(pg_temp.dia('p2'), '2026-10-14'::date, 'a segunda pessoa da mesma Conta sai no mesmo dia');

-- 5. A Conta Quente que chega depois passa na frente de quem não está Quente.
select pg_temp.conectar('f11a0000-0000-4000-8000-0000000000c1', 'whatsapp', 'wa-caio');
set local role authenticated;
select pg_temp.sequencia('f11a0000-0000-4000-8000-0000000000c1', 'fria', null, 301);
select pg_temp.sequencia('f11a0000-0000-4000-8000-0000000000c1', 'quente', null, 302);
reset role;
update private.sender_accounts set created_at = '2026-10-14 08:00:00-03' where unipile_account_id = 'wa-caio';
insert into private.prospecting_stages (workspace_id, target_account_id, stage)
values ('f11a0000-0000-4000-8000-000000000010', (select valor::uuid from ids where chave = 'conta-quente'), 'quente');
set local role authenticated;
select pg_temp.ativar('f11a0000-0000-4000-8000-0000000000c1', 'fria');
select pg_temp.ativar('f11a0000-0000-4000-8000-0000000000c1', 'quente');
reset role;
select is(pg_temp.dia('quente'), '2026-10-14'::date, 'a Conta Quente fica com a vaga de hoje');
select is(pg_temp.dia('fria'), '2026-10-15'::date, 'e a Conta que chegou antes espera o dia seguinte');
select is((select count(*)::int from private.sequence_step_sends
  where step_id in ('fria', 'quente') and status = 'scheduled'), 2, 'as duas seguem na fila');

-- 6. A capacidade é a soma dos remetentes prontos daquele canal. Desconectado e outro canal não entram.
set local role authenticated;
select pg_temp.como('f11a0000-0000-4000-8000-0000000000ad');
select public.set_send_cap('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', 'day', 10);
reset role;
select pg_temp.conectar('f11a0000-0000-4000-8000-0000000000d1', 'whatsapp', 'wa-duda');
select pg_temp.conectar('f11a0000-0000-4000-8000-0000000000c1', 'linkedin', 'li-caio');
update private.sender_accounts set created_at = '2026-09-01 12:00:00-03'
where workspace_id = 'f11a0000-0000-4000-8000-000000000010' and channel = 'whatsapp';
select is(
  private.workspace_entry_capacity('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', '2026-10-14'),
  (select count(*)::int * 10 from private.sender_accounts
    where workspace_id = 'f11a0000-0000-4000-8000-000000000010' and channel = 'whatsapp'
      and status = 'ready' and not reconciliation_required),
  'a capacidade do Workspace soma o teto de cada remetente pronto');
select is(
  (select count(*)::int from private.sender_accounts
    where workspace_id = 'f11a0000-0000-4000-8000-000000000010' and channel = 'whatsapp' and status = 'ready'),
  4, 'quatro números de WhatsApp prontos entram na soma');
update private.sender_accounts set status = 'disconnected' where unipile_account_id = 'wa-duda';
select is(
  private.workspace_entry_capacity('f11a0000-0000-4000-8000-000000000010', 'whatsapp_new_company', '2026-10-14'),
  30, 'o remetente desconectado sai da soma, e o LinkedIn não entra nela');

select * from finish();
rollback;
