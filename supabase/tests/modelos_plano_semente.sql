begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

-- Ana e Cris participam de Workspaces distintos.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e6000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana-modelo@test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cris-modelo@test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('e6100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('e6100000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e6100000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'admin', true),
  ('e6100000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'admin', true);

select ok((select count(*) > 0 from public.signal_model_versions where catalog_id = 'abertura-de-vagas'),
  'a migration gera uma versão inicial para os cards');
select is((select count(*) from public.current_signal_models),
  (select count(*) from public.signal_catalog), 'todo card visível tem uma versão vigente');
select is((select count(*) from public.current_signal_models m
  where coalesce(m.seed_plan #>> '{sinais,0,tipo}', '') not in (
    'vaga_linkedin','vaga_indeed','mudanca_de_emprego','nova_lideranca','entradas_e_saidas',
    'anuncio_de_movimentacao','anuncio_linkedin','anuncio_meta','anuncio_google',
    'avaliacoes_google_maps','crescimento_de_equipes','publicacao_da_empresa'
  )), 0::bigint, 'todos os cards geram tipo e Plano que o editor atual aceita');
select is((select count(*) from public.current_signal_models m
  where m.seed_plan ->> 'origem' is distinct from 'modelo'
    or coalesce(m.seed_plan ->> 'explicacao', '') = ''
    or coalesce(m.seed_plan ->> 'maxEmpresasPorRodada', '') !~ '^([1-9]|[1-9][0-9]|100)$'
    or jsonb_typeof(m.seed_plan #> '{sinais,0,criterios}') is distinct from 'object'
), 0::bigint, 'todo card tem Plano-semente preenchido e editável');
select is((select count(*) from public.signal_model_versions where catalog_id = 'abertura-de-vagas'), 1::bigint,
  'gerar novamente sem mudança é idempotente');
select is((select version from public.current_signal_models where catalog_id = 'abertura-de-vagas'), 1,
  'a versão inicial fica vigente');

select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000001', true);
select ok((select count(*) > 0 from public.list_signal_models('e6100000-0000-4000-8000-000000000001')
  where catalog_id = 'abertura-de-vagas'), 'participante ativo lê modelos do catálogo');
select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.list_signal_models('e6100000-0000-4000-8000-000000000002')
  where catalog_id = 'abertura-de-vagas'), 1::bigint, 'outro Workspace lê seu catálogo global');
select throws_ok($$select * from public.list_signal_models('e6100000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'não lê modelos como participante de outro Workspace');

select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000001', true);
update public.signal_catalog set phrase = phrase || ' Atualizado.' where id = 'abertura-de-vagas';
select is((select count(*) from public.signal_model_versions where catalog_id = 'abertura-de-vagas'), 2::bigint,
  'mudança de campo-fonte cria versão nova e preserva a anterior');
update public.signal_catalog set phrase = phrase where id = 'abertura-de-vagas';
select is((select count(*) from public.signal_model_versions where catalog_id = 'abertura-de-vagas'), 2::bigint,
  'gerar de novo sem mudança não cria versão adicional');
select is((select count(*) from public.current_signal_models where catalog_id = 'abertura-de-vagas' and version = 2), 1::bigint,
  'a versão nova passa a vigente');
select is((select version from public.current_signal_models where catalog_id = 'abertura-de-vagas'),
  (select max(version) from public.signal_model_versions where catalog_id = 'abertura-de-vagas'),
  'a leitura vigente acompanha o maior conjunto de versão, sem ordenar por created_at');
select is((select count(*) from public.signal_model_versions where catalog_id = 'abertura-de-vagas' and version = 1), 1::bigint,
  'a versão anterior continua guardada');
select set_config('request.jwt.claim.sub', 'e6000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.list_signal_models('e6100000-0000-4000-8000-000000000002')),
  (select count(*) from public.current_signal_models where catalog_id in
    (select id from public.signal_catalog where workspace_id is null or workspace_id = 'e6100000-0000-4000-8000-000000000002')),
  'a listagem de outro Workspace só inclui modelos globais ou daquele Workspace');

select * from finish();
rollback;
