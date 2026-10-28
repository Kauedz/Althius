begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

-- Fase 6b: a explicação da Aderência é lida só por membro, gravada só pela função e nunca mexe na nota.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('76b00000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'explica@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
       ('76b00000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fora@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f6b00000-0000-4000-8000-000000000001', 'empresa', 'Norte'), ('f6b00000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f6b00000-0000-4000-8000-000000000001', '76b00000-0000-4000-8000-000000000001', 'admin', true),
  ('f6b00000-0000-4000-8000-000000000002', '76b00000-0000-4000-8000-000000000002', 'admin', true);
insert into private.discovered_accounts (id, workspace_id, name, name_key, source_actor, sector, size_label, country, fit_score, fit_level, reasons)
values ('e6b00000-0000-4000-8000-000000000001', 'f6b00000-0000-4000-8000-000000000001', 'Corretora Norte', 'corretora norte', 'teste',
        'Insurance Agencies and Brokerages', '11-50', 'Brasil', 71, 'medio',
        '[{"criterio":"setor","atende":true,"texto":"Setor: atua em Insurance Agencies and Brokerages."}]');

select ok(has_function_privilege('authenticated', 'public.get_discovered_account_fit_explanation(uuid)', 'execute'), 'authenticated lê pela RPC');
select ok(not has_function_privilege('anon', 'public.get_discovered_account_fit_explanation(uuid)', 'execute'), 'anon não lê');
select ok(not has_function_privilege('authenticated', 'public.save_discovered_account_fit_explanation(uuid,text,text)', 'execute'), 'authenticated não grava');
select ok(has_function_privilege('service_role', 'public.save_discovered_account_fit_explanation(uuid,text,text)', 'execute'), 'service_role grava');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76b00000-0000-4000-8000-000000000001', true);
select is((select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') ->> 'fitLevel'), 'medio', 'o membro lê a nota guardada');
select is((select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') -> 'explanation'), 'null'::jsonb, 'sem explicação guardada');
select is((select (public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') ->> 'modelAllowed')::boolean), true, 'dentro do limite do dia');

select set_config('request.jwt.claim.sub', '76b00000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001')$$,
  'P0002', 'discovered account not found', 'membro de outro Workspace não lê');

reset role;
set local role service_role;
select throws_ok($$select public.save_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001', '', 'ia')$$,
  '22023', 'invalid fit explanation', 'texto vazio é recusado');
select lives_ok($$select public.save_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001', 'Atua em seguros, como o ICP pede.', 'ia')$$,
  'a função grava a explicação');
reset role;
select is((select fit_level || '|' || fit_score || '|' || reasons::text from private.discovered_accounts where id = 'e6b00000-0000-4000-8000-000000000001'),
  'medio|71|[{"texto": "Setor: atua em Insurance Agencies and Brokerages.", "atende": true, "criterio": "setor"}]', 'gravar a explicação não muda a nota');

set local role authenticated;
select set_config('request.jwt.claim.sub', '76b00000-0000-4000-8000-000000000001', true);
select is((select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') ->> 'explanation'), 'Atua em seguros, como o ICP pede.', 'a explicação guardada volta enquanto a nota é a mesma');
select is((select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') ->> 'explanationSource'), 'ia', 'com a origem');

reset role;
update private.discovered_accounts set fit_level = 'alto', fit_score = 90 where id = 'e6b00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '76b00000-0000-4000-8000-000000000001', true);
select is((select public.get_discovered_account_fit_explanation('e6b00000-0000-4000-8000-000000000001') -> 'explanation'), 'null'::jsonb, 'nota mudou: a explicação antiga não vale mais');

select * from finish();
rollback;
