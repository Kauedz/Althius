begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

-- Ana (Admin e dona da Sequência) e Bruno (Membro) do Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('57000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('57000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('57000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f7000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f7000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', 'admin', true),
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000002', 'member', true),
  ('f7000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000003', 'admin', true);

-- Duas Contas da Ana no Norte: Alfa (segmento Construtoras) e Beta (sem segmento), cada uma com uma Sequência.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by, segment) values
  ('d7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '57000000-0000-0000-0000-000000000001', 'Construtoras'),
  ('d7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '57000000-0000-0000-0000-000000000001', null);
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001'),
  ('f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000001');
insert into public.contacts (id, workspace_id, name, created_by) values
  ('c7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'Sara', '57000000-0000-0000-0000-000000000001');
insert into public.sequences (id, workspace_id, target_account_id, owner_user_id) values
  ('e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000001');
insert into private.sender_accounts (id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status) values
  ('b7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', 'email', 'unipile-ana', 'GOOGLE', 'ready');

-- Quatro Envios da Alfa (um por passo) e dois da Beta; um da Alfa ainda só confirmado.
insert into private.sequence_step_sends (id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, sent_at) values
  ('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'p1', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now()),
  ('a7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'p2', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now()),
  ('a7000000-0000-0000-0000-000000000003', 'e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'p3', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now()),
  ('a7000000-0000-0000-0000-000000000004', 'e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'p4', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'sent', now()),
  ('a7000000-0000-0000-0000-000000000005', 'e7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'p5', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'confirmed', null),
  ('a7000000-0000-0000-0000-000000000006', 'e7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'p1', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@beta.test', 'sent', now()),
  ('a7000000-0000-0000-0000-000000000007', 'e7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'p2', '57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'email', 'sara@beta.test', 'sent', now());

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.desfecho(p uuid) returns text language sql as $$
  select outcome from private.send_outcomes where send_id = p
$$;

-- Desfechos já classificados: dois na Alfa, nenhum na Beta.
insert into private.send_outcomes (send_id, workspace_id, outcome, classified_by_kind, classified_by_user) values
  ('a7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'resposta_positiva', 'pessoa', '57000000-0000-0000-0000-000000000001'),
  ('a7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'resposta_negativa', 'pessoa', '57000000-0000-0000-0000-000000000001');

-- 1. A dona da Sequência lê os desfechos dela; a Sequência sem desfecho devolve nada.
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000001');
select is(
  (select array_agg(row(send_id, outcome, classified_by_kind)::text order by send_id) from public.list_send_outcomes('e7000000-0000-0000-0000-000000000001')),
  array['(a7000000-0000-0000-0000-000000000001,resposta_positiva,pessoa)', '(a7000000-0000-0000-0000-000000000002,resposta_negativa,pessoa)'],
  'a dona lê os desfechos dos Envios da Sequência dela'
);
select is(
  (select count(*)::integer from public.list_send_outcomes('e7000000-0000-0000-0000-000000000002')), 0,
  'a Sequência sem desfecho devolve nada'
);

-- 2. Quem não é dona é recusado; a leitura é do app, não do anônimo.
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select * from public.list_send_outcomes('e7000000-0000-0000-0000-000000000001')$$,
  '42501', 'sequence not found or not owned by active user', 'quem não é dona não lê os desfechos'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.list_send_outcomes(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.list_send_outcomes(uuid)', 'execute'),
  'a leitura é do app, não do anônimo'
);

select * from finish();
rollback;
