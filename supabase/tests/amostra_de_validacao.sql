begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

select ok(
  has_function_privilege('service_role', 'public.record_cascade_validation_sample(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_cascade_validation_sample(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_cascade_validation_sample(uuid, jsonb)', 'execute'),
  'só service_role grava a amostra de validação');
select has_column('private', 'signal_cascade_runs', 'validation_sample', 'a execução tem a coluna da amostra');
select hasnt_column('private', 'signal_cascade_runs', 'cpf', 'a execução não tem coluna de CPF');
select ok(
  not has_table_privilege('authenticated', 'private.signal_cascade_runs', 'select')
    and not has_table_privilege('anon', 'private.signal_cascade_runs', 'select'),
  'anon e authenticated não leem a execução');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('a6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'val@empresa.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('a6000000-0000-0000-0000-000000000002', 'empresa', 'Validação');
insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, idempotency_key, est_cost_usd, est_credits, cap_usd)
select 'a6000000-0000-0000-0000-000000000002', id, 'conversa', 'k-amostra', 0.1, 1, 0.5
from private.signal_cascades where signal_type = 'vaga_comex';
create temporary table amostra_run on commit drop as
  select id from private.signal_cascade_runs where idempotency_key = 'k-amostra';
grant select on table amostra_run to service_role;

set local role service_role;
select public.record_cascade_validation_sample(
  (select id from amostra_run),
  '[
    {"cnpj":"99888777000166","nome":"JOAO 123.456.789-09"},
    {"cnpj":"123","nome":"SEM CNPJ VALIDO LTDA","email":"nao@entra.test"},
    {"cnpj":"10000000000000","nome":"EMPRESA 0 LTDA"},
    {"cnpj":"10000000000001","nome":"EMPRESA 1 LTDA"},
    {"cnpj":"10000000000002","nome":"EMPRESA 2 LTDA"},
    {"cnpj":"10000000000003","nome":"EMPRESA 3 LTDA"},
    {"cnpj":"10000000000004","nome":"EMPRESA 4 LTDA"},
    {"cnpj":"10000000000005","nome":"EMPRESA 5 LTDA"}
  ]'::jsonb
);
reset role;

select is(
  (select jsonb_array_length(validation_sample) from private.signal_cascade_runs where idempotency_key = 'k-amostra'),
  5, 'a amostra fica em 5, mesmo com mais empresas na lista');
select is(
  (select validation_sample -> 0 ->> 'nome' from private.signal_cascade_runs where idempotency_key = 'k-amostra'),
  'SEM CNPJ VALIDO LTDA', 'CNPJ inválido não impede a razão social, e o CPF nem entra');
select ok(
  (select validation_sample -> 0 ->> 'cnpj' is null
     and validation_sample::text !~ '123\.456'
     and validation_sample::text !~ 'nao@entra'
     and validation_sample::text !~ 'EMPRESA 4'
     and validation_sample -> 4 ->> 'nome' = 'EMPRESA 3 LTDA'
   from private.signal_cascade_runs where idempotency_key = 'k-amostra'),
  'CPF, e-mail e a empresa além do quinto lugar não entram');
select throws_ok(
  $$ select public.record_cascade_validation_sample('00000000-0000-0000-0000-000000000000', '[]'::jsonb) $$,
  'P0002', null, 'execução desconhecida é recusada');

select * from finish();
rollback;
