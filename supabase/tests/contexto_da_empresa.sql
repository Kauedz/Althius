begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

-- Usuários: Ana (Admin Norte), Bruno (Membro Norte), Carla (Admin Sul), Diego (sem participação), Eva (ex-Admin Norte).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('5c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Bruno Reis"}', false, false),
  ('5c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{"full_name":"Carla Dias"}', false, false),
  ('5c000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@fora.com.br', '', now(), now(), now(), '{}', '{"full_name":"Diego Silva"}', false, false),
  ('5c000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Eva Rocha"}', false, false);

insert into public.workspaces (id, kind, name) values
  ('5c100000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('5c100000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('5c100000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'admin', true),
  ('5c100000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 'member', true),
  ('5c100000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000005', 'admin', false),
  ('5c100000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', 'admin', true);

insert into public.day0_companies (workspace_id, empresa, dominio) values
  ('5c100000-0000-0000-0000-000000000001', 'Norte Sistemas', 'norte.com.br');

-- Um Playbook escrito não vira contexto: o contexto nasce vazio.
insert into private.playbook_section_versions (workspace_id, section, version, content) values
  ('5c100000-0000-0000-0000-000000000001', 'icp', 1, '{"texto":"ICP antigo do Playbook"}');

-- 1. A tabela não é lida nem escrita diretamente pelos papéis do app.
select ok(
  (select relrowsecurity from pg_class where oid = 'private.company_context_versions'::regclass),
  'RLS ligado nas versões do Contexto da empresa'
);
select ok(
  not has_table_privilege('authenticated', 'private.company_context_versions', 'select')
    and not has_table_privilege('service_role', 'private.company_context_versions', 'select'),
  'nenhum papel do app lê a tabela diretamente'
);

-- 2. Anônimo não lê nem grava.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.get_company_context('5c100000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anônimo não lê o contexto'
);
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', 'a', 'b', 'c', null)$$,
  '42501', null, 'anônimo não grava o contexto'
);

-- 3. Sem nada escrito: vazio, com o site do onboarding, sem copiar o Playbook.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000001', true);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'version',
  null, 'sem versão enquanto ninguém escreveu'
);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'icp',
  '', 'o ICP do Playbook não é copiado para o contexto'
);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'site',
  'norte.com.br', 'o site vem do cadastro da empresa'
);
select is(
  (public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'can_edit')::boolean,
  true, 'o Administrador pode editar'
);

-- 4. O Administrador grava; cada gravação é uma versão nova e fica vigente na hora.
select is(
  public.save_company_context('5c100000-0000-0000-0000-000000000001',
    'Vendemos software para incorporadoras.', E'ICP primário: incorporadoras.\nICP secundário: construtoras.',
    'Diretor comercial.', null),
  1, 'a primeira gravação é a versão 1'
);
select is(
  public.save_company_context('5c100000-0000-0000-0000-000000000001',
    'Vendemos software para incorporadoras.', E'ICP primário: incorporadoras.\nICP secundário: construtoras.',
    'Diretor comercial.', 1),
  1, 'gravar o mesmo texto não cria versão'
);
select is(
  public.save_company_context('5c100000-0000-0000-0000-000000000001',
    'Vendemos software para incorporadoras.', 'ICP primário: incorporadoras de SP.', 'Diretor comercial.', 1),
  2, 'a segunda gravação é a versão 2'
);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'icp',
  'ICP primário: incorporadoras de SP.', 'a versão nova fica vigente'
);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'updated_by',
  '5c000000-0000-0000-0000-000000000001', 'a versão guarda o autor'
);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'origin',
  'manual', 'a gravação à mão é de origem manual'
);

-- 5. Quem gravou sobre uma versão antiga é recusado, sem perder a vigente.
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', 'x', 'y', 'z', 1)$$,
  '40001', 'company context changed', 'gravar sobre uma versão que já mudou é recusado'
);
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', 'x', 'y', 'z', null)$$,
  '40001', 'company context changed', 'gravar como se não houvesse versão também é recusado'
);
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', repeat('a', 40001), 'y', 'z', 2)$$,
  '22023', 'company context too long', 'texto maior que o limite é recusado'
);

-- 6. Membro ativo lê e não grava.
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select is(
  (public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'version')::integer,
  2, 'o Membro lê a versão vigente'
);
select is(
  (public.get_company_context('5c100000-0000-0000-0000-000000000001') ->> 'can_edit')::boolean,
  false, 'o Membro não pode editar'
);
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', 'x', 'y', 'z', 2)$$,
  '42501', 'only administrators can edit the company context', 'o Membro não grava'
);

-- 7. Ex-Administrador e quem é de fora não leem nem gravam; outro Workspace não vê nada daqui.
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.save_company_context('5c100000-0000-0000-0000-000000000001', 'x', 'y', 'z', 2)$$,
  '42501', 'active workspace membership required', 'Administrador inativo não grava'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.get_company_context('5c100000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa não lê'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000003', true);
select is(
  public.get_company_context('5c100000-0000-0000-0000-000000000002') ->> 'version',
  null, 'o Workspace Sul continua vazio'
);

-- 8. As Edge Functions leem pelo service_role a mesma versão vigente; o app não chama essa função.
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.company_context_for_workspace(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.company_context_for_workspace(uuid)', 'execute'),
  'só o service_role lê o contexto pela função das Edge Functions'
);

select * from finish();
rollback;
