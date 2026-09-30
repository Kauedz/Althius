begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('53000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values ('f3000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f3000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'admin', true);

-- Três Contas da Ana: Alfa (Sequência com envio e resposta), Beta e Gama (ganchos simulados).
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('d3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '53000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '53000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', '53000000-0000-0000-0000-000000000001');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001');
insert into public.contacts (id, workspace_id, name, created_by) values
  ('c3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'Sara', '53000000-0000-0000-0000-000000000001');
insert into public.sequences (id, workspace_id, target_account_id, owner_user_id) values
  ('e3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001');
insert into private.sender_accounts (id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status) values
  ('b3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'email', 'unipile-ana', 'GOOGLE', 'ready');

create function pg_temp.estagio(p uuid) returns text language sql as $$
  select stage from public.list_prospecting_stages('f3000000-0000-0000-0000-000000000001') where target_account_id = p
$$;
-- list_prospecting_stages exige Participação ativa: as leituras rodam como a Ana.
select set_config('request.jwt.claim.sub', '53000000-0000-0000-0000-000000000001', true);

-- 1. O gancho não é chamável pelos papéis do app.
select ok(
  not has_function_privilege('authenticated', 'private.record_prospecting_event(uuid, uuid, text)', 'execute')
    and not has_function_privilege('service_role', 'private.record_prospecting_event(uuid, uuid, text)', 'execute'),
  'o gancho dos eventos é só interno'
);

-- 2. Envio real: passo confirmado não move; enviado move para Em abordagem, com o evento no histórico.
insert into private.sequence_step_sends (id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination) values
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'p1',
   '53000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000001'), 'descoberta', 'passo só confirmado não move a Conta');
update private.sequence_step_sends set status = 'sent', sent_at = now() where id = 'a3000000-0000-0000-0000-000000000001';
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000001'), 'em_abordagem', 'o primeiro envio leva a Em abordagem');
select is(
  (select event from private.prospecting_stage_history where target_account_id = 'd3000000-0000-0000-0000-000000000001'),
  'primeiro_envio', 'o histórico registra o evento de envio'
);

-- 3. Resposta real: vai para Respondeu.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, recorded_by) values
  ('a3100000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'email-recebido', '53000000-0000-0000-0000-000000000001');
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id,
                                     sender_account_id, provider_email_id, received_at) values
  ('a3100000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001', 'email-1', now());
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000001'), 'respondeu', 'a resposta leva a Respondeu');

-- 4. Outro envio depois da resposta não volta o cartão.
insert into private.sequence_step_sends (sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, sent_at) values
  ('e3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'p2',
   '53000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now());
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000001'), 'respondeu', 'um envio depois da resposta não volta a Conta');

-- 5. Os ganchos simulados das outras specs.
select is(private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'sinal_novo'), true, 'Sinal novo move');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000002'), 'quente', 'Sinal novo leva a Quente');
select is(private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'fit'), true, 'Fit move');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000002'), 'fit', 'Fit leva a Fit');
select is(private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'sinal_novo'), false, 'um Sinal novo não tira a Conta de Fit');
select is(private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'sinais_vencidos'), true, 'Sinais vencidos antes da abordagem movem');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000002'), 'descoberta', 'Sinais vencidos voltam a Descoberta');
select private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'reuniao_marcada');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000002'), 'reuniao', 'reunião marcada leva a Reunião');
select private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'sinais_vencidos');
select private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'enviada_ao_crm');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000002'), 'no_crm', 'depois da abordagem, Sinais vencidos não voltam; o envio ao CRM leva a No CRM');
select private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000003', 'nao_fit');
select is(pg_temp.estagio('d3000000-0000-0000-0000-000000000003'), 'descartada', 'Não fit leva a Descartada');
select is(private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000003', 'fit'), false, 'um evento não reabre a Descartada');
select throws_ok(
  $$select private.record_prospecting_event('f3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000003', 'outro')$$,
  '22023', 'unknown prospecting event', 'evento fora da lista é recusado'
);

select * from finish();
rollback;
