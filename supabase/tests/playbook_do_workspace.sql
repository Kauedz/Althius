begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(27);

-- Usuários: Ana (Admin Norte), Bruno (Membro Norte), Carla (Admin Sul), Diego (sem participação), Eva (ex-Admin Norte).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('51000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('51000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Bruno Reis"}', false, false),
  ('51000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{"full_name":"Carla Dias"}', false, false),
  ('51000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@fora.com.br', '', now(), now(), now(), '{}', '{"full_name":"Diego Silva"}', false, false),
  ('51000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Eva Rocha"}', false, false);

insert into public.workspaces (id, kind, name) values
  ('ef000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('ef000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ef000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'admin', true),
  ('ef000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'member', true),
  ('ef000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000005', 'admin', false),
  ('ef000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 'admin', true);

-- 1. A tabela não é lida nem escrita diretamente pelos papéis do app.
select ok(
  (select relrowsecurity from pg_class where oid = 'private.playbook_section_versions'::regclass),
  'RLS ligado nas versões do Playbook'
);
select ok(
  not has_table_privilege('authenticated', 'private.playbook_section_versions', 'select')
    and not has_table_privilege('service_role', 'private.playbook_section_versions', 'select'),
  'nenhum papel do app lê a tabela diretamente'
);

-- 2. Anônimo não lê nem grava.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anônimo não lista o Playbook'
);
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"texto":"x"}')$$,
  '42501', null, 'anônimo não grava o Playbook'
);

-- 3. Administrador ativo grava; a lista traz as 16 seções na ordem.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001')),
  16, 'o Playbook tem as 16 seções fixas'
);
select is(
  (select array_agg(section order by "position")
   from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001'))[1:4],
  array['empresa', 'icp', 'mercado', 'personas'],
  'as seções vêm na ordem do modelo'
);
select is(
  (select version from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001') where section = 'icp'),
  null, 'seção ainda não escrita vem sem versão'
);
select is(
  public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"texto":"Incorporadoras médias"}'),
  1, 'primeira gravação é a versão 1'
);
select is(
  public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"texto":"Incorporadoras de SP"}'),
  2, 'segunda gravação é a versão 2'
);
select is(
  public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'empresa',
    '{"texto":"Vendemos IA para incorporadoras", "linhas":[{"cliente":"Alfa"}]}'),
  1, 'Empresa gravada com texto e linhas'
);
select is(
  (select content ->> 'texto' from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001')
   where section = 'icp'),
  'Incorporadoras de SP', 'a lista traz a versão vigente'
);
select is(
  (select updated_by from public.list_playbook_sections('ef000000-0000-0000-0000-000000000001') where section = 'icp'),
  '51000000-0000-0000-0000-000000000001'::uuid, 'a versão guarda o autor'
);

-- 4. Seção desconhecida e conteúdo inválido são recusados.
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'base_de_pesquisa', '{"texto":"x"}')$$,
  '22023', 'unknown playbook section', 'seção fora do catálogo é recusada'
);
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"outra":"x"}')$$,
  '22023', 'invalid playbook content', 'chave desconhecida no conteúdo é recusada'
);
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"linhas":["x"]}')$$,
  '22023', 'invalid playbook content', 'linha que não é objeto é recusada'
);

-- 5. Restaurar grava uma versão nova igual à antiga.
select is(
  public.restore_playbook_version('ef000000-0000-0000-0000-000000000001', 'icp', 1),
  3, 'restaurar a versão 1 cria a versão 3'
);
select is(
  (public.get_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp') -> 'content' ->> 'texto'),
  'Incorporadoras médias', 'a versão 3 tem o conteúdo da versão 1'
);
select is(
  jsonb_array_length(public.get_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp') -> 'history'),
  3, 'o histórico guarda as 3 versões'
);
select throws_ok(
  $$select public.restore_playbook_version('ef000000-0000-0000-0000-000000000001', 'icp', 9)$$,
  'P0002', 'playbook version not found', 'restaurar versão inexistente falha'
);

-- 6. Membro ativo lê e não grava.
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select is(
  (public.get_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp') ->> 'version')::integer,
  3, 'membro lê a seção'
);
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"texto":"x"}')$$,
  '42501', 'only administrators can edit the playbook', 'membro não grava'
);
select throws_ok(
  $$select public.restore_playbook_version('ef000000-0000-0000-0000-000000000001', 'icp', 1)$$,
  '42501', 'only administrators can edit the playbook', 'membro não restaura'
);

-- 7. Administrador inativo e quem é de fora não gravam nem leem.
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.save_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp', '{"texto":"x"}')$$,
  '42501', 'active workspace membership required', 'Administrador inativo não grava'
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.get_playbook_section('ef000000-0000-0000-0000-000000000001', 'icp')$$,
  '42501', 'active workspace membership required', 'Administrador de outro Workspace não lê'
);

-- 8. A leitura dos Agentes é só de service_role e traz a Empresa mais as seções da Especialidade.
select throws_ok(
  $$select public.playbook_for_specialty('ef000000-0000-0000-0000-000000000001', 'scopus')$$,
  '42501', null, 'usuário autenticado não chama a leitura dos Agentes'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.playbook_for_specialty('ef000000-0000-0000-0000-000000000001', 'scopus')) e),
  array['empresa', 'icp'],
  'Scopus recebe a Empresa e o ICP (o Mercado ainda não foi escrito)'
);
select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.playbook_for_specialty('ef000000-0000-0000-0000-000000000001', 'rhetor')) e),
  array['empresa'],
  'Rhetor recebe só a Empresa enquanto as seções dele estão vazias'
);

select * from finish();
rollback;
