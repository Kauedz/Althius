begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a2100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a2100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a2100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'equipe@althius.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b2100000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('b2100000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 'member', true),
  ('b2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000002', 'member', true),
  ('b2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000003', 'member', true);
insert into private.althius_staff (user_id) values ('a2100000-0000-0000-0000-000000000003');

select ok(
  has_function_privilege('authenticated', 'public.request_signal(uuid, text, text, text, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.request_signal(uuid, text, text, text, text, jsonb)', 'execute'),
  'membro pede Sinal; anon não'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.request_signal(
      'b2100000-0000-0000-0000-000000000001',
      'Empresa que abre filial',
      'Indústria no Sul',
      null,
      'este_mes',
      '{"nome":"Ana","email":"ana@norte.test","whatsapp":"11999999999"}'::jsonb
    )$$,
  'o membro grava o pedido'
);
select is(
  (select status from public.list_signal_requests('b2100000-0000-0000-0000-000000000001')),
  'novo',
  'o pedido nasce novo'
);
select throws_ok(
  $$select public.request_signal(
      'b2100000-0000-0000-0000-000000000002', 'x', 'y', null, 'este_mes', '{"nome":"Ana","email":"ana@norte.test"}'::jsonb)$$,
  '42501', 'not a member of this workspace',
  'não pede Sinal em Workspace de que não participa'
);
select throws_ok(
  $$select public.request_signal(
      'b2100000-0000-0000-0000-000000000001', '  ', 'y', null, 'este_mes', '{"nome":"Ana","email":"ana@norte.test"}'::jsonb)$$,
  '22023', 'invalid signal request',
  'evento vazio não entra'
);
select throws_ok(
  $$select public.review_signal_request((select id from public.list_signal_requests('b2100000-0000-0000-0000-000000000001')), 'em_analise')$$,
  '42501', 'only the Althius team updates a signal request',
  'membro não muda o status'
);

create temporary table aviso on commit drop as
  select * from public.claim_signal_request_notice(
    'b2100000-0000-0000-0000-000000000001',
    (select id from public.list_signal_requests('b2100000-0000-0000-0000-000000000001'))
  );
select is((select evento from aviso), 'Empresa que abre filial', 'o aviso leva o evento para o e-mail');
select is(
  (select count(*)::integer from public.claim_signal_request_notice(
    'b2100000-0000-0000-0000-000000000001',
    (select id from public.list_signal_requests('b2100000-0000-0000-0000-000000000001'))
  )),
  0,
  'o mesmo pedido não gera segundo aviso'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.list_signal_requests('b2100000-0000-0000-0000-000000000001')$$,
  '42501', 'not a member of this workspace',
  'outro Workspace não lê o pedido'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000003', true);
select is(
  public.review_signal_request(
    (select id from public.signal_requests where workspace_id = 'b2100000-0000-0000-0000-000000000001'),
    'em_analise'
  ),
  'em_analise',
  'a equipe marca o pedido como em análise'
);
reset role;

select is(
  (select status from public.signal_requests where workspace_id = 'b2100000-0000-0000-0000-000000000001'),
  'em_analise',
  'o status ficou em análise'
);

select * from finish();
rollback;
