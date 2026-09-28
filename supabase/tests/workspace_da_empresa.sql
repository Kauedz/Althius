begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);

-- Marina já tem o Workspace pessoal, com uma Conta-alvo e uma Conta remetente; ela cria o Workspace da empresa.
-- Rui é outra Conta de usuário verificada; Nina ainda não verificou o e-mail.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'marina@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Marina Alves"}', false, false),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rui@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Rui Souza"}', false, false),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'nina@norte.com.br', '', null, now(), now(), '{}', '{"name":"Nina"}', false, false);

-- Quantas linhas cada tabela com workspace_id guarda para o Workspace: é o que prova que nada foi copiado, movido ou
-- criado além da Participação e do histórico.
create function pg_temp.linhas_do_workspace(p_workspace_id uuid)
returns table (tabela text, linhas bigint)
language plpgsql
as $$
declare
  t record;
begin
  for t in
    select c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.column_name = 'workspace_id' and c.table_schema in ('public', 'private') and tb.table_type = 'BASE TABLE'
  loop
    tabela := t.table_schema || '.' || t.table_name;
    execute format('select count(*) from %I.%I where workspace_id = $1', t.table_schema, t.table_name)
      into linhas using p_workspace_id;
    return next;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
create temporary table pessoal on commit drop as select * from public.bootstrap_personal_workspace('2026-09-25');

reset role;
insert into public.target_accounts (workspace_id, name, canonical_url, domain, created_by)
select id, 'Alfa', 'https://alfa.com.br', 'alfa.com.br', '50000000-0000-0000-0000-000000000001' from pessoal;
insert into private.sender_accounts (workspace_id, owner_user_id, channel, unipile_account_id, provider, status)
select id, '50000000-0000-0000-0000-000000000001', 'email', 'unipile-da-marina', 'GOOGLE', 'ready' from pessoal;
create temporary table pessoal_antes on commit drop as
  select * from pg_temp.linhas_do_workspace((select id from pessoal));
grant select on pessoal, pessoal_antes to authenticated;

-- Sem sessão, ninguém cria Workspace.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_company_workspace('Norte', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '42501', null,
  'o visitante anônimo não cria Workspace da empresa');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_company_workspace('Norte', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '42501', 'authentication required',
  'sem Conta de usuário na sessão, a criação é recusada');

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.create_company_workspace('Norte', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '42501', 'email not verified',
  'quem não verificou o e-mail não cria Workspace da empresa');

-- O nome da empresa é informado pela pessoa.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_company_workspace('   ', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '22023', 'company name is required',
  'o nome da empresa não pode ficar em branco');
select throws_ok(
  $$select public.create_company_workspace(null, 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '22023', 'company name is required',
  'o nome da empresa é obrigatório');
select throws_ok(
  format($$select public.create_company_workspace(%L, 'aaaaaaaa-0000-4000-8000-000000000001')$$, repeat('a', 101)),
  '22023', 'company name is too long',
  'o nome da empresa tem no máximo 100 caracteres');
select throws_ok(
  $$select public.create_company_workspace('Norte', null)$$,
  '22023', 'request id is required',
  'o pedido precisa da chave que o torna repetível');
select is((select count(*)::int from public.workspaces), 1, 'pedidos recusados não criam Workspace');

-- A criação.
create temporary table empresa on commit drop as
  select * from public.create_company_workspace('  Norte Distribuidora ', 'aaaaaaaa-0000-4000-8000-000000000001');

select is((select kind from empresa), 'empresa', 'a ação cria um Workspace da empresa');
select is((select name from empresa), 'Norte Distribuidora', 'o Workspace da empresa tem o nome informado');
select is((select owner_user_id from empresa), null, 'o Workspace da empresa não tem Titular');
select is(
  (select role || ':' || active from public.workspace_memberships
    where workspace_id = (select id from empresa) and user_id = '50000000-0000-0000-0000-000000000001'),
  'admin:true', 'quem cria é Administradora ativa do Workspace da empresa');
select is(
  (select array_agg(name order by name) from public.workspaces),
  array['Marina Alves', 'Norte Distribuidora'],
  'o novo Workspace aparece para a criadora ao lado do pessoal');

-- Repetir o pedido (nova tentativa, clique duplo) com a mesma chave não cria outro.
select is(
  (select id from public.create_company_workspace('Norte Distribuidora', 'aaaaaaaa-0000-4000-8000-000000000001')),
  (select id from empresa), 'repetir o pedido com a mesma chave devolve o mesmo Workspace');
select is(
  (select name from public.create_company_workspace('Norte Distribuidora S.A.', 'aaaaaaaa-0000-4000-8000-000000000001')),
  'Norte Distribuidora', 'a repetição devolve o Workspace já criado, sem renomeá-lo');
select is((select count(*)::int from public.workspaces where kind = 'empresa'), 1,
  'repetir o pedido não cria um segundo Workspace da empresa');
select is(
  (select count(*)::int from public.workspace_memberships where workspace_id = (select id from empresa)), 1,
  'repetir o pedido não cria outra Participação');

-- Nada do Workspace pessoal muda.
select is((select name from public.workspaces where id = (select id from pessoal)), 'Marina Alves',
  'o nome do Workspace pessoal não muda');
select is(
  (select role || ':' || active from public.workspace_memberships
    where workspace_id = (select id from pessoal) and user_id = '50000000-0000-0000-0000-000000000001'),
  'admin:true', 'a Participação no Workspace pessoal continua a mesma');

reset role;
select is(
  (select array_agg(tabela || '=' || linhas order by tabela) from pg_temp.linhas_do_workspace((select id from pessoal))),
  (select array_agg(tabela || '=' || linhas order by tabela) from pessoal_antes),
  'nenhum registro do Workspace pessoal é copiado, movido ou apagado');
select is(
  (select array_agg(tabela || '=' || linhas order by tabela)
     from pg_temp.linhas_do_workspace((select id from empresa)) where linhas > 0),
  array['private.company_workspace_requests=1', 'private.workspace_participation_events=1', 'public.workspace_memberships=1'],
  'o Workspace da empresa nasce só com a Participação da criadora, o pedido e o histórico');
select is(
  (select event || ':' || new_role from private.workspace_participation_events where workspace_id = (select id from empresa)),
  'workspace_criado:admin', 'o histórico de participação registra a criação do Workspace e o papel da criadora');
select is(
  (select actor_user_id from private.workspace_participation_events where workspace_id = (select id from empresa)),
  '50000000-0000-0000-0000-000000000001'::uuid, 'o histórico registra quem criou o Workspace');

-- A chave é da Conta de usuário: outra pessoa com o mesmo valor cria o próprio Workspace e não recebe o da Marina.
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select isnt(
  (select id from public.create_company_workspace('Sul Varejo', 'aaaaaaaa-0000-4000-8000-000000000001')),
  (select id from empresa), 'a mesma chave de outra Conta de usuário não devolve o Workspace da Marina');
select is((select array_agg(name order by name) from public.workspaces), array['Sul Varejo'],
  'o Workspace da empresa da Marina fica invisível para quem não participa dele');

-- Um novo pedido, com outra chave, é outra escolha explícita e cria outro Workspace.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select isnt(
  (select id from public.create_company_workspace('Norte Distribuidora', 'aaaaaaaa-0000-4000-8000-000000000002')),
  (select id from empresa), 'um novo pedido, com outra chave, cria outro Workspace da empresa');

select throws_ok(
  $$insert into public.workspaces(kind, name) values ('empresa', 'Por fora')$$,
  '42501', null,
  'o cliente não cria Workspace da empresa por fora da função');

-- Removida do Workspace que criou, a pessoa não volta a ele repetindo o pedido antigo.
reset role;
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select id, '50000000-0000-0000-0000-000000000002', 'admin', true from empresa;
update public.workspace_memberships set active = false
where workspace_id = (select id from empresa) and user_id = '50000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.create_company_workspace('Norte Distribuidora', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required',
  'repetir o pedido de um Workspace do qual a pessoa foi removida não devolve a Participação');
reset role;
select is(
  (select active from public.workspace_memberships
    where workspace_id = (select id from empresa) and user_id = '50000000-0000-0000-0000-000000000001'),
  false, 'a Participação removida continua encerrada');

select * from finish();
rollback;
