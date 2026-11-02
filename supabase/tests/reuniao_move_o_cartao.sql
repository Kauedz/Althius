begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

-- Ana (dona das Sequências) no Norte; Carla no Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fe000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fe000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'admin', true),
  ('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000002', 'admin', true);

-- Quatro Contas da Ana, uma Sequência e um Envio em cada:
-- Alfa (reunião pela pessoa), Beta (oportunidade pelo Agente), Gama (já No CRM), Delta (só resposta positiva).
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('de000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '5e000000-0000-0000-0000-000000000001'),
  ('de000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '5e000000-0000-0000-0000-000000000001'),
  ('de000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', '5e000000-0000-0000-0000-000000000001'),
  ('de000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test', 'delta.test', '5e000000-0000-0000-0000-000000000001');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000001');
insert into public.contacts (id, workspace_id, name, created_by) values
  ('ce000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'Sara', '5e000000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000002', 'Rui', '5e000000-0000-0000-0000-000000000002');
insert into public.sequences (id, workspace_id, target_account_id, owner_user_id) values
  ('ee000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000001');
insert into private.sequence_step_sends (id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, sent_at) values
  ('ae000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'p1', '5e000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now()),
  ('ae000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000001', 'p1', '5e000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'email', 'sara@beta.test', 'sent', now()),
  ('ae000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000001', 'p1', '5e000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'email', 'sara@gama.test', 'sent', now()),
  ('ae000000-0000-0000-0000-000000000004', 'ee000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000001', 'p1', '5e000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'email', 'sara@delta.test', 'sent', now()),
  -- Um Envio gravado no Sul que aponta para a Sequência da Alfa do Norte.
  ('ae000000-0000-0000-0000-000000000005', 'ee000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000002', 'p9', '5e000000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-000000000002', 'email', 'rui@sul.test', 'sent', now());

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.estagio(p uuid) returns text language sql as $$
  select stage from public.list_prospecting_stages('fe000000-0000-0000-0000-000000000001') where target_account_id = p
$$;

-- Preparação: a Gama já foi enviada ao CRM.
select private.record_prospecting_event('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000003', 'enviada_ao_crm');

-- 1. Um Agente do Sul marca reunião no Envio do Sul que aponta para a Alfa: não alcança a Conta do Norte.
select public.classify_send_outcome('ae000000-0000-0000-0000-000000000005', 'reuniao_marcada',
  (select id from private.agents where workspace_id = 'fe000000-0000-0000-0000-000000000002' and specialty = 'ethos'));
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000001'), 'em_abordagem', 'Envio de outro Workspace não alcança a Conta');

-- 2. Resposta positiva não é reunião.
select public.set_send_outcome('ae000000-0000-0000-0000-000000000004', 'resposta_positiva');
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000004'), 'em_abordagem', 'resposta positiva não leva a Reunião');

-- 3. A pessoa marca reunião num Envio da Alfa: a Conta vai para Reunião, com o evento no histórico.
select public.set_send_outcome('ae000000-0000-0000-0000-000000000001', 'reuniao_marcada');
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000001'), 'reuniao', 'reunião marcada leva a Conta a Reunião');
select is(
  (select event from private.prospecting_stage_history
   where target_account_id = 'de000000-0000-0000-0000-000000000001' and to_stage = 'reuniao'),
  'reuniao_marcada', 'o histórico registra o evento de reunião'
);

-- 4. Reclassificar o Envio não volta o cartão; marcar de novo não duplica o histórico.
select public.set_send_outcome('ae000000-0000-0000-0000-000000000001', 'resposta_negativa');
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000001'), 'reuniao', 'reclassificar o Envio não volta o cartão');
select public.set_send_outcome('ae000000-0000-0000-0000-000000000001', 'reuniao_marcada');
select is(
  (select count(*)::integer from private.prospecting_stage_history
   where target_account_id = 'de000000-0000-0000-0000-000000000001' and to_stage = 'reuniao'),
  1, 'Conta já em Reunião não muda'
);

-- 5. Oportunidade pelo Agente também leva a Reunião (pressupõe a reunião).
select public.classify_send_outcome('ae000000-0000-0000-0000-000000000002', 'oportunidade',
  (select id from private.agents where workspace_id = 'fe000000-0000-0000-0000-000000000001' and specialty = 'ethos'));
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000002'), 'reuniao', 'oportunidade pelo Agente leva a Reunião');
select is(
  (select event from private.prospecting_stage_history
   where target_account_id = 'de000000-0000-0000-0000-000000000002' and to_stage = 'reuniao'),
  'reuniao_marcada', 'com o evento de reunião no histórico'
);

-- 6. Conta em No CRM continua em No CRM.
select public.set_send_outcome('ae000000-0000-0000-0000-000000000003', 'reuniao_marcada');
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000003'), 'no_crm', 'Conta em No CRM continua em No CRM');

-- 7. Uma linha gravada direto (sem passar pela função) também move: o gatilho é na tabela.
update private.send_outcomes set outcome = 'reuniao_marcada' where send_id = 'ae000000-0000-0000-0000-000000000004';
select is(pg_temp.estagio('de000000-0000-0000-0000-000000000004'), 'reuniao', 'mudar o desfecho para reunião leva a Reunião');

-- 8. A função do gatilho é só interna.
select ok(
  not has_function_privilege('authenticated', 'private.prospecting_on_send_outcome()', 'execute')
    and not has_function_privilege('service_role', 'private.prospecting_on_send_outcome()', 'execute'),
  'a função do gatilho é só interna'
);

select * from finish();
rollback;
