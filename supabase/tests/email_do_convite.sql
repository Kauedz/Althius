begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

-- Workspace Norte: Ana é Administradora, Bruno é Membro. Ana convida Carla e Eva; Iara é de fora.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('41000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('41000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('41000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'iara@outra.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c1000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('c1000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c1000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'admin', true),
  ('c1000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'member', true),
  ('c1000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000009', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
create temporary table convites on commit drop as
  select 'carla' as quem, id, token from public.invite_to_workspace('c1000000-0000-0000-0000-000000000001', 'carla@gmail.com', 'member')
  union all
  select 'eva', id, token from public.invite_to_workspace('c1000000-0000-0000-0000-000000000001', 'eva@gmail.com', 'admin');
create function pg_temp.convite(p_quem text) returns uuid language sql as $f$
  select id from convites where quem = p_quem;
$f$;

-- 1. A Administradora reserva o envio e recebe o que o e-mail mostra.
create temporary table reserva on commit drop as
  select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'));
select is((select email from reserva), 'carla@gmail.com', 'a reserva devolve o e-mail convidado');
select is((select token from reserva), (select token from convites where quem = 'carla'), 'e o token do link de aceite');
select is((select workspace_name || ' / ' || inviter_name || ' / ' || role from reserva), 'Norte / Ana Lima / member',
  'o nome do Workspace, quem convida e o papel');

-- 2. Os limites: um envio por minuto e três por dia para o mesmo convite.
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'))$$,
  '54000', 'invitation email limit reached', 'o mesmo convite não recebe dois e-mails no mesmo minuto');
reset role;
update private.workspace_invitation_emails set requested_at = now() - interval '2 minutes';
set local role authenticated;
select lives_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'))$$,
  'passado um minuto, o convite pode ser reenviado');
reset role;
update private.workspace_invitation_emails set requested_at = now() - interval '2 minutes';
set local role authenticated;
select lives_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'))$$,
  'o terceiro envio do dia sai');
reset role;
update private.workspace_invitation_emails set requested_at = now() - interval '2 minutes';
set local role authenticated;
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'))$$,
  '54000', 'invitation email limit reached', 'o quarto envio do dia para o mesmo convite é recusado');

-- 3. O limite do Workspace: cinquenta envios por dia, somando os convites.
reset role;
insert into private.workspace_invitation_emails (invitation_id, workspace_id, requested_at)
  select (select id from convites where quem = 'carla'), 'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours'
  from generate_series(1, 47);
set local role authenticated;
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('eva'))$$,
  '54000', 'invitation email limit reached', 'o Workspace não passa de cinquenta e-mails de convite por dia');
reset role;
select is((select count(*)::int from private.workspace_invitation_emails e
           where e.invitation_id = pg_temp.convite('eva')), 0, 'uma reserva recusada não grava nada');
delete from private.workspace_invitation_emails;
set local role authenticated;

-- 4. Só Administrador ativo, só convite pendente do próprio Workspace.
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('eva'))$$,
  '42501', 'only administrators can manage participants', 'um Membro não manda e-mail de convite');
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000002', pg_temp.convite('eva'))$$,
  'P0002', 'pending invitation not found', 'o Administrador de outro Workspace não alcança o convite');
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('eva'))$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace é recusado');
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select public.revoke_workspace_invitation(pg_temp.convite('eva'));
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('eva'))$$,
  'P0002', 'pending invitation not found', 'um convite revogado não recebe e-mail');

-- 5. Sem sessão, nada.
reset role;
set local role anon;
select throws_ok(
  $$select * from public.claim_invitation_email('c1000000-0000-0000-0000-000000000001', pg_temp.convite('carla'))$$,
  '42501', 'permission denied for function claim_invitation_email', 'o visitante anônimo não reserva envio');
reset role;
select is((select count(*)::int from private.workspace_invitation_emails), 0, 'as recusas não deixam reserva');

select * from finish();
rollback;
