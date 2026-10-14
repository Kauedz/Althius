begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a1100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'equipe@althius.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b1100000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('b1100000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b1100000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'admin', true),
  ('b1100000-0000-0000-0000-000000000002', 'a1100000-0000-0000-0000-000000000002', 'member', true),
  ('b1100000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000003', 'member', true);
insert into private.althius_staff (user_id) values ('a1100000-0000-0000-0000-000000000003');

select ok(
  has_function_privilege('authenticated', 'public.list_visible_signal_catalog(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_visible_signal_catalog(uuid)', 'execute'),
  'a tela lê o catálogo visível; anon não'
);
select ok(
  not has_table_privilege('anon', 'public.signal_catalog', 'select'),
  'anon não lê a tabela'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000001')),
  26,
  'vinte e seis cards globais'
);
select is(
  (select collector_types::text from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000001') where id = 'abertura-de-vagas'),
  '{vaga_linkedin,vaga_indeed,vaga_comex,vaga_logistica,vaga_engenharia_manutencao}',
  'abertura de vagas une os cinco coletores de vaga'
);
select is(
  (select cardinality(niche_slugs)::integer from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000001') where id = 'abertura-de-vagas'),
  8,
  'abertura de vagas vale para os oito nichos'
);
select ok(
  not exists (
    select 1 from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000001')
    where concat_ws(' ', name, phrase, source_label, estimated_cost_label) ~* '(apify|\yactors?\y|openai|anthropic|\yclaude\y|\ygpt[-\s]?[0-9]|\ycodex\y)'
  ),
  'nenhum card cita fornecedor ou modelo'
);
select ok(not has_function_privilege('authenticated', 'public.workspace_signal_monthly_cap(uuid)', 'execute'), 'o cliente não lê o teto em dólar do Workspace');
select throws_ok(
  $$select * from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000002')$$,
  '42501', 'not a member of this workspace',
  'membro de outro Workspace não lista o catálogo de lá'
);

select throws_ok(
  $$insert into public.signal_catalog (id, name, phrase, family, source_label, estimated_cost_label, sort_order, workspace_id)
    values ('sob-pedido', 'Sob pedido', 'Um evento combinado.', 'regulacao', 'Fonte indicada pelo cliente', 'Sem cobrança', 1, 'b1100000-0000-0000-0000-000000000001')$$,
  '42501', 'new row violates row-level security policy for table "signal_catalog"',
  'membro comum não grava card'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$insert into public.signal_catalog (id, name, phrase, family, source_label, estimated_cost_label, sort_order, workspace_id)
    values ('sob-pedido', 'Sob pedido', 'Um evento combinado.', 'regulacao', 'Fonte indicada pelo cliente', 'Sem cobrança', 1, 'b1100000-0000-0000-0000-000000000001')$$,
  'a equipe grava um card só daquele Workspace'
);
select is(
  (select id from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000001') where id = 'sob-pedido'),
  'sob-pedido',
  'o Workspace que pediu vê o card'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000002', true);
select ok(
  not exists (select 1 from public.list_visible_signal_catalog('b1100000-0000-0000-0000-000000000002') where id = 'sob-pedido'),
  'outro Workspace não vê o card sob pedido'
);
reset role;

insert into public.workspaces (id, kind, name) values ('b1100000-0000-0000-0000-000000000003', 'empresa', 'Leste');
select is(
  (select monthly_cap_usd from private.workspace_signal_budget where workspace_id = 'b1100000-0000-0000-0000-000000000003'),
  20::numeric,
  'Workspace novo já nasce com teto de US$ 20'
);

select ok(
  (select column_default from information_schema.columns
    where table_schema = 'private' and table_name = 'workspace_signal_budget' and column_name = 'monthly_cap_usd') like '%20%',
  'o default da coluna é 20'
);

select * from finish();
rollback;
