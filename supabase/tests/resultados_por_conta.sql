begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('57000000-0000-0000-0000-000000000091', 'authenticated', 'authenticated', 'ana@resultado.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('57000000-0000-0000-0000-000000000092', 'authenticated', 'authenticated', 'sul@resultado.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f7000000-0000-0000-0000-000000000091', 'empresa', 'Norte'),
  ('f7000000-0000-0000-0000-000000000092', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f7000000-0000-0000-0000-000000000091', '57000000-0000-0000-0000-000000000091', 'admin', true),
  ('f7000000-0000-0000-0000-000000000092', '57000000-0000-0000-0000-000000000092', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('d7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'Alfa', 'https://alfa.resultado.test', 'alfa.resultado.test', '57000000-0000-0000-0000-000000000091'),
  ('d7000000-0000-0000-0000-000000000092', 'f7000000-0000-0000-0000-000000000091', 'Beta', 'https://beta.resultado.test', 'beta.resultado.test', '57000000-0000-0000-0000-000000000091'),
  ('d7000000-0000-0000-0000-000000000093', 'f7000000-0000-0000-0000-000000000091', 'Futura', 'https://futura.resultado.test', 'futura.resultado.test', '57000000-0000-0000-0000-000000000091'),
  ('d7000000-0000-0000-0000-000000000094', 'f7000000-0000-0000-0000-000000000092', 'Alheia', 'https://alheia.resultado.test', 'alheia.resultado.test', '57000000-0000-0000-0000-000000000092');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000091', '57000000-0000-0000-0000-000000000091'),
  ('f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000092', '57000000-0000-0000-0000-000000000091'),
  ('f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000093', '57000000-0000-0000-0000-000000000091'),
  ('f7000000-0000-0000-0000-000000000092', 'd7000000-0000-0000-0000-000000000094', '57000000-0000-0000-0000-000000000092');
insert into public.contacts (id, workspace_id, name, created_by) values
  ('c7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'Uma', '57000000-0000-0000-0000-000000000091'),
  ('c7000000-0000-0000-0000-000000000092', 'f7000000-0000-0000-0000-000000000091', 'Dois', '57000000-0000-0000-0000-000000000091');
insert into public.sequences (id, workspace_id, target_account_id, owner_user_id) values
  ('e7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000091', '57000000-0000-0000-0000-000000000091'),
  ('e7000000-0000-0000-0000-000000000092', 'f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000092', '57000000-0000-0000-0000-000000000091'),
  ('e7000000-0000-0000-0000-000000000093', 'f7000000-0000-0000-0000-000000000091', 'd7000000-0000-0000-0000-000000000093', '57000000-0000-0000-0000-000000000091'),
  ('e7000000-0000-0000-0000-000000000094', 'f7000000-0000-0000-0000-000000000092', 'd7000000-0000-0000-0000-000000000094', '57000000-0000-0000-0000-000000000092');
insert into private.sequence_step_sends (id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, sent_at) values
  ('a7000000-0000-0000-0000-000000000091', 'e7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'p1', '57000000-0000-0000-0000-000000000091', 'c7000000-0000-0000-0000-000000000091', 'email', 'um@alfa.test', 'sent', now() - interval '2 days'),
  ('a7000000-0000-0000-0000-000000000092', 'e7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'p2', '57000000-0000-0000-0000-000000000091', 'c7000000-0000-0000-0000-000000000092', 'email', 'dois@alfa.test', 'sent', now() - interval '1 day'),
  ('a7000000-0000-0000-0000-000000000093', 'e7000000-0000-0000-0000-000000000092', 'f7000000-0000-0000-0000-000000000091', 'p1', '57000000-0000-0000-0000-000000000091', 'c7000000-0000-0000-0000-000000000091', 'email', 'beta@beta.test', 'sent', now() - interval '1 day'),
  ('a7000000-0000-0000-0000-000000000094', 'e7000000-0000-0000-0000-000000000093', 'f7000000-0000-0000-0000-000000000091', 'p1', '57000000-0000-0000-0000-000000000091', 'c7000000-0000-0000-0000-000000000091', 'email', 'futuro@futura.test', 'sent', now() + interval '1 day'),
  ('a7000000-0000-0000-0000-000000000095', 'e7000000-0000-0000-0000-000000000094', 'f7000000-0000-0000-0000-000000000092', 'p1', '57000000-0000-0000-0000-000000000092', null, 'email', 'alheia@alheia.test', 'sent', now() - interval '1 day');
insert into private.send_outcomes (send_id, workspace_id, outcome, classified_by_kind, classified_by_user) values
  ('a7000000-0000-0000-0000-000000000091', 'f7000000-0000-0000-0000-000000000091', 'resposta_positiva', 'pessoa', '57000000-0000-0000-0000-000000000091'),
  ('a7000000-0000-0000-0000-000000000092', 'f7000000-0000-0000-0000-000000000091', 'reuniao_marcada', 'pessoa', '57000000-0000-0000-0000-000000000091'),
  ('a7000000-0000-0000-0000-000000000093', 'f7000000-0000-0000-0000-000000000091', 'resposta_negativa', 'pessoa', '57000000-0000-0000-0000-000000000091');

select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000091', true);
select is((select approached_accounts from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000091')), 2::bigint,
  'respostas de dois Contatos na mesma Conta continuam contando uma vez por Conta');
select is((select positive_accounts from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000091')), 1::bigint,
  'resposta positiva e reunião na mesma Conta contam uma vez');
select is((select meeting_accounts from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000091')), 1::bigint,
  'reunião marcada conta uma vez por Conta');
select is((select negative_accounts from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000091')), 1::bigint,
  'negativa permanece separada e não cria resultado positivo');
select ok((select cutoff_at < clock_timestamp() and cutoff_at > clock_timestamp() - interval '1 minute' from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000091')),
  'o resultado declara o corte e exclui envio futuro');
select throws_ok($$select * from public.sequence_account_outcome_summary('f7000000-0000-0000-0000-000000000092')$$,
  '42501', null, 'não lê o agregado de outro Workspace');
reset role;
select ok(not has_function_privilege('anon', 'public.sequence_account_outcome_summary(uuid)', 'execute'), 'anônimo não pode ler o agregado');

select * from finish();
rollback;
