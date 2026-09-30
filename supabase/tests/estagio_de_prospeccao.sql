begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é Admin do Sul; Eva saiu do Norte.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('52000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('52000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('52000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('52000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('f2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f2000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'admin', true),
  ('f2000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 'member', true),
  ('f2000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000005', 'member', false),
  ('f2000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000003', 'admin', true);

-- 1. Nada nas tabelas é lido nem escrito direto.
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('private.prospecting_stages'::regclass, 'private.prospecting_stage_history'::regclass,
                 'private.prospecting_stage_catalog'::regclass)),
  'RLS ligado nas tabelas do estágio'
);
select ok(
  not has_table_privilege('authenticated', 'private.prospecting_stages', 'select')
    and not has_table_privilege('authenticated', 'private.prospecting_stage_history', 'select'),
  'os papéis do app não leem as tabelas direto'
);

-- Ana cadastra duas Contas (é a responsável); Bruno cadastra uma.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000001', true);
create temporary table contas on commit drop as
  select 'a1' as k, id from public.save_target_account('f2000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test')
  union all
  select 'a2', id from public.save_target_account('f2000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
grant select on contas to authenticated;
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000002', true);
insert into contas select 'b1', id from public.save_target_account('f2000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test');
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000001', true);

-- 2. Conta nova começa em Descoberta, sem histórico.
select is(
  (select count(*)::integer from public.list_prospecting_stages('f2000000-0000-0000-0000-000000000001')
   where stage = 'descoberta'),
  3, 'as Contas começam em Descoberta'
);
select is(
  (select count(*)::integer from public.get_prospecting_history('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'))),
  0, 'sem histórico até a primeira mudança'
);

-- 3. O responsável move à mão.
select is(
  public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'quente'),
  true, 'o responsável move a Conta'
);
select is(
  (select stage from public.list_prospecting_stages('f2000000-0000-0000-0000-000000000001')
   where target_account_id = (select id from contas where k = 'a1')),
  'quente', 'a lista mostra o estágio novo'
);
select is(
  public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'quente'),
  false, 'mover para onde já está não faz nada'
);
select is(
  (select row(from_stage, to_stage, moved_by, event)::text
   from public.get_prospecting_history('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'))),
  '(descoberta,quente,52000000-0000-0000-0000-000000000001,)',
  'o histórico guarda de onde, para onde e quem'
);

-- 4. Valores inválidos e No CRM à mão.
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'quase')$$,
  '22023', 'unknown prospecting stage', 'estágio fora da lista é recusado'
);
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'no_crm')$$,
  '22023', 'only sending to the CRM sets this stage', 'No CRM não se move à mão'
);
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', gen_random_uuid(), 'fit')$$,
  'P0002', 'target account not found', 'Conta inexistente é recusada'
);

-- 5. Outro participante ativo não move a Conta alheia, nem o Admin.
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'fit')$$,
  '42501', 'only the responsible seller can move this target account', 'outro membro não move a Conta alheia'
);
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'b1'), 'fit')$$,
  '42501', 'only the responsible seller can move this target account', 'o Admin também não move a Conta de outro'
);

-- 6. Todo participante ativo vê a lista e o histórico.
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.get_prospecting_history('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'))),
  1, 'um membro ativo lê o histórico da Conta de outro'
);

-- 7. Quem saiu e quem é de fora não leem nem movem.
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.list_prospecting_stages('f2000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'participante inativo não lê'
);
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.get_prospecting_history('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'))$$,
  '42501', 'active workspace membership required', 'Admin de outro Workspace não lê'
);
select throws_ok(
  $$select public.move_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'fit')$$,
  '42501', 'active workspace membership required', 'Admin de outro Workspace não move'
);

-- 8. Anônimo e usuário do app não chamam a função de eventos.
select throws_ok(
  $$select private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a1'), 'fit', 'sinal')$$,
  '42501', null, 'o usuário do app não chama a função dos eventos'
);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.list_prospecting_stages('f2000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anônimo não lista'
);

-- 9. Eventos (chamados pelo servidor).
reset role;
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'fit', 'aderencia'),
  true, 'um evento move a Conta'
);
select is(
  (select row(moved_by, event)::text from private.prospecting_stage_history
   where target_account_id = (select id from contas where k = 'a2')),
  '(,aderencia)', 'o histórico guarda o evento e nenhum usuário'
);
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'descoberta', 'sinal_vencido'),
  true, 'antes da abordagem, um Sinal vencido volta a Conta a Descoberta'
);
select private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'em_abordagem', 'envio');
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'quente', 'sinal'),
  false, 'depois de Em abordagem, um evento não volta a Conta'
);
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'em_abordagem', 'envio'),
  false, 'repetir o mesmo evento não faz nada'
);
select private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'reuniao', 'reuniao');
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'respondeu', 'resposta'),
  false, 'uma resposta tardia não tira a Conta de Reunião'
);
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'descartada', 'sem_interesse'),
  true, 'um evento pode descartar depois da abordagem'
);
select is(
  private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'quente', 'sinal'),
  false, 'um evento não reabre uma Conta Descartada'
);
select throws_ok(
  $$select private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000001', (select id from contas where k = 'a2'), 'quase', 'sinal')$$,
  '22023', 'unknown prospecting stage', 'evento com estágio fora da lista é recusado'
);
select throws_ok(
  $$select private.advance_prospecting_stage('f2000000-0000-0000-0000-000000000002', (select id from contas where k = 'a2'), 'fit', 'sinal')$$,
  'P0002', 'target account not found', 'a Conta é do Workspace do evento'
);

select * from finish();
rollback;
