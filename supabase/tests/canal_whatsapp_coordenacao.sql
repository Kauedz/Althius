begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('62000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated',
        'canais06@althius.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name)
values ('aaaaaaaa-6000-0000-0000-000000000006', 'empresa', 'Canal WhatsApp');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
select 'aaaaaaaa-6000-0000-0000-000000000006', 'escala', date_trunc('month', now());
select public.grant_credits('aaaaaaaa-6000-0000-0000-000000000006', 100, 'plano', 'créditos de teste');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('aaaaaaaa-6000-0000-0000-000000000006', '62000000-0000-0000-0000-000000000006', 'admin', true);
select private.seed_default_agents('aaaaaaaa-6000-0000-0000-000000000006');
update private.agent_settings s
set channels = case when a.specialty in ('scopus', 'ethos') then array['whatsapp']::text[] else array['slack']::text[] end
from private.agents a
where a.id = s.agent_id and a.workspace_id = 'aaaaaaaa-6000-0000-0000-000000000006';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000006', true);
select set_config('t.run', (select run_id::text from public.start_agent_run(
  'aaaaaaaa-6000-0000-0000-000000000006', null, null, 'Pergunta pelo WhatsApp', '{}',
  'c2000000-0000-0000-0000-000000000006')), true);
reset role;
update private.agent_conversations c set origin = 'whatsapp'
from private.agent_runs r where r.id = current_setting('t.run')::uuid and c.id = r.conversation_id;
update private.agent_runs set trigger_kind = 'canal' where id = current_setting('t.run')::uuid;
set local role service_role;
select set_config('t.claim', public.claim_agent_run(current_setting('t.run')::uuid)::text, true);
reset role;

select is(current_setting('t.claim')::jsonb ->> 'origin', 'whatsapp',
  'a motor recebe a origem WhatsApp da Conversa');
select is(
  (select array_agg(item ->> 'id' order by item ->> 'id')
   from jsonb_array_elements(current_setting('t.claim')::jsonb -> 'agents') item),
  (select array_agg(a.id::text order by a.id::text)
   from private.agents a join private.agent_settings s on s.agent_id = a.id
   where a.workspace_id = 'aaaaaaaa-6000-0000-0000-000000000006' and 'whatsapp' = any(s.channels)),
  'a reserva inclui somente Agentes habilitados para WhatsApp');
select is(
  (select array_agg(a.specialty order by a.specialty)
   from private.agents a join private.agent_settings s on s.agent_id = a.id
   where a.workspace_id = 'aaaaaaaa-6000-0000-0000-000000000006' and 'whatsapp' = any(s.channels)),
  array['ethos', 'scopus']::text[], 'o Workspace de teste separa os Agentes de WhatsApp dos demais');

select * from finish();
rollback;
