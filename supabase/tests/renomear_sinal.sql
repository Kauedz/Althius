begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(12);

-- Sinais first 09: renomear um Monitoramento muda só o nome. Plano, versão, critérios, Agenda e estado ficam como estavam.
-- Só quem criou, ou um Administrador, renomeia; quem é de outro Workspace não vê nem renomeia.
-- Ana: Administradora do Norte e criadora. Caio: participante do Norte, não criou. Bia: Administradora do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('f8600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@renomear.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f8600000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'caio@renomear.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f8600000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'bia@renomear.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f8610000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('f8610000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f8610000-0000-4000-8000-000000000001', 'f8600000-0000-4000-8000-000000000001', 'admin', true),
  ('f8610000-0000-4000-8000-000000000001', 'f8600000-0000-4000-8000-000000000002', 'member', true),
  ('f8610000-0000-4000-8000-000000000002', 'f8600000-0000-4000-8000-000000000003', 'admin', true);
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, criteria, every_hours,
                                     created_by, plan_version)
values ('f8620000-0000-4000-8000-000000000001', 'f8610000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Nome original',
        'rascunho', '{"accountIds":[]}', '{"palavras":"dados"}', 24, 'f8600000-0000-4000-8000-000000000001', 3);

-- 1. A criadora renomeia; o nome perde os espaços das pontas; nome vazio, longo demais ou Monitoramento inexistente é recusado.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f8600000-0000-4000-8000-000000000001', true);
select is(public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-000000000001', '  Nome novo  '),
  'f8620000-0000-4000-8000-000000000001'::uuid, 'renomear devolve o id do Monitoramento');
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-000000000001', '   ')$q$,
  '22023', 'invalid monitor', 'nome em branco é recusado');
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-000000000001', repeat('x', 121))$q$,
  '22023', 'invalid monitor', 'nome com mais de 120 caracteres é recusado');
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-0000000000ff', 'Outro')$q$,
  'P0002', 'monitor not found', 'Monitoramento inexistente é recusado');

-- 2. Participante que não criou não renomeia.
select set_config('request.jwt.claim.sub', 'f8600000-0000-4000-8000-000000000002', true);
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-000000000001', 'Do Caio')$q$,
  '42501', null, 'participante que não criou não renomeia');

-- 3. Outro Workspace: nem pelo Workspace alheio, nem pelo próprio apontando para o Monitoramento alheio.
select set_config('request.jwt.claim.sub', 'f8600000-0000-4000-8000-000000000003', true);
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', 'f8620000-0000-4000-8000-000000000001', 'Fora')$q$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace é recusado');
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000002', 'f8620000-0000-4000-8000-000000000001', 'Fora')$q$,
  'P0002', 'monitor not found', 'o próprio Workspace não alcança o Monitoramento de outro');
reset role;

-- 4. Só o nome mudou.
select is((select name from private.signal_monitors where id = 'f8620000-0000-4000-8000-000000000001'),
  'Nome novo', 'o nome foi gravado sem os espaços das pontas');
select is((select (plan_version, every_hours, state, criteria, schedule, plan, created_by)::text
           from private.signal_monitors where id = 'f8620000-0000-4000-8000-000000000001'),
  (select (3, 24, 'rascunho'::text, '{"palavras":"dados"}'::jsonb, null::jsonb, null::jsonb,
           'f8600000-0000-4000-8000-000000000001'::uuid)::text),
  'versão do Plano, Agenda, critérios, estado e criador ficam como estavam');
select is((select count(*)::int from private.signal_monitors where workspace_id = 'f8610000-0000-4000-8000-000000000001'),
  1, 'renomear não cria outro Monitoramento');

-- 5. Permissões da função.
select ok(not has_function_privilege('anon', 'public.rename_signal_monitor(uuid,uuid,text)', 'execute'),
  'anon não executa rename_signal_monitor');
select ok(has_function_privilege('authenticated', 'public.rename_signal_monitor(uuid,uuid,text)', 'execute'),
  'authenticated executa rename_signal_monitor');

select * from finish();
rollback;
