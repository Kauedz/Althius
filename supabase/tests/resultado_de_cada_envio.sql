begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

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

-- 1. As tabelas não se leem por fora; classificar como Agente é só do servidor; a pessoa e a leitura são de quem entrou.
select ok(
  not has_table_privilege('authenticated', 'private.send_outcomes', 'select')
    and not has_table_privilege('service_role', 'private.send_outcomes', 'select')
    and not has_function_privilege('authenticated', 'public.classify_send_outcome(uuid, text, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.classify_send_outcome(uuid, text, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.set_send_outcome(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.send_outcome_rates(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.record_send_outcome(uuid, text, text, uuid, uuid)', 'execute'),
  'as permissões: tabela fechada, Agente só pelo servidor, pessoa e leitura pelo app'
);

-- 2. Um Envio sem nada acontecido não tem linha: é "sem resposta".
select is((select count(*)::integer from private.send_outcomes), 0, 'Envio sem resposta não tem linha de desfecho');

-- 3. Uma resposta recebida registra "resposta" sozinha, pelo sistema.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, recorded_by) values
  ('a7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'email-recebido', '57000000-0000-0000-0000-000000000001');
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id,
                                     sender_account_id, provider_email_id, received_at) values
  ('a7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001',
   'e7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001',
   'b7000000-0000-0000-0000-000000000001', 'email-1', now());
select is(pg_temp.desfecho('a7000000-0000-0000-0000-000000000001'), 'resposta', 'a resposta recebida registra "resposta"');
select is(
  (select classified_by_kind from private.send_outcomes where send_id = 'a7000000-0000-0000-0000-000000000001'), 'sistema',
  'e quem classificou foi o sistema'
);

-- 4. A pessoa dona da Sequência classifica; fica quem e quando.
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-000000000001', 'resposta_positiva')$$,
  'a dona da Sequência diz que a resposta foi positiva'
);
select is(
  (select row(outcome, classified_by_kind, classified_by_user)::text from private.send_outcomes where send_id = 'a7000000-0000-0000-0000-000000000001'),
  '(resposta_positiva,pessoa,57000000-0000-0000-0000-000000000001)', 'o desfecho guarda a pessoa que classificou'
);
select is(
  (select classified_at is not null from private.send_outcomes where send_id = 'a7000000-0000-0000-0000-000000000001'), true,
  'e quando'
);

-- 5. Uma segunda resposta automática não rebaixa o que a pessoa classificou.
reset role;
insert into public.account_interactions (id, workspace_id, target_account_id, kind, recorded_by) values
  ('a7100000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'email-recebido', '57000000-0000-0000-0000-000000000001');
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id,
                                     sender_account_id, provider_email_id, received_at) values
  ('a7100000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001',
   'e7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001',
   'b7000000-0000-0000-0000-000000000001', 'email-2', now());
select is(pg_temp.desfecho('a7000000-0000-0000-0000-000000000001'), 'resposta_positiva', 'outra resposta automática não rebaixa o desfecho classificado');

-- 6. Recusas: quem não é dono, desfecho desconhecido, Envio inexistente, Envio que não saiu.
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-000000000002', 'resposta')$$,
  '42501', 'only the sequence owner can classify its sends', 'quem não é dono da Sequência não classifica (nem um Membro do mesmo Workspace)'
);
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-000000000002', 'resposta')$$,
  '42501', 'only the sequence owner can classify its sends', 'e nem quem é de outro Workspace'
);
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-000000000002', 'ganhou')$$,
  '22023', 'unknown send outcome', 'desfecho desconhecido é recusado'
);
select throws_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-0000000000ff', 'resposta')$$,
  'P0002', 'send not found', 'o Envio tem de existir'
);
select throws_ok(
  $$select public.set_send_outcome('a7000000-0000-0000-0000-000000000005', 'resposta')$$,
  '55000', 'only a sent step has an outcome', 'um Envio que não saiu não tem desfecho'
);

-- 7. O Agente classifica pelo servidor, com o id dele; um Agente de outro Workspace é recusado.
reset role;
select lives_ok(
  format($$select public.classify_send_outcome('a7000000-0000-0000-0000-000000000002', 'resposta_negativa', %L)$$,
    (select id from private.agents where workspace_id = 'f7000000-0000-0000-0000-000000000001' and specialty = 'ethos')),
  'um Agente do Workspace classifica um Envio'
);
select is(
  (select classified_by_kind from private.send_outcomes where send_id = 'a7000000-0000-0000-0000-000000000002'), 'agente',
  'e fica registrado como Agente'
);
select throws_ok(
  format($$select public.classify_send_outcome('a7000000-0000-0000-0000-000000000003', 'resposta', %L)$$,
    (select id from private.agents where workspace_id = 'f7000000-0000-0000-0000-000000000002' and specialty = 'ethos')),
  'P0002', 'agent not found', 'um Agente de outro Workspace é recusado'
);

-- 8. As taxas: reunião e oportunidade na Alfa, uma negativa que não conta como sucesso e a Beta sem segmento.
select public.classify_send_outcome('a7000000-0000-0000-0000-000000000003', 'reuniao_marcada',
  (select id from private.agents where workspace_id = 'f7000000-0000-0000-0000-000000000001' and specialty = 'ethos'));
select public.classify_send_outcome('a7000000-0000-0000-0000-000000000004', 'oportunidade',
  (select id from private.agents where workspace_id = 'f7000000-0000-0000-0000-000000000001' and specialty = 'ethos'));
select pg_temp.entrar_como('57000000-0000-0000-0000-000000000002');
select is(
  (select array_agg(row(channel, segment, sent, replied, positive, meetings, opportunities)::text order by segment) from public.send_outcome_rates('f7000000-0000-0000-0000-000000000001')),
  array['(email,Construtoras,4,4,3,2,1)', '(email,"Sem segmento",2,0,0,0,0)'],
  'as taxas por canal e segmento: a negativa é resposta e não é sucesso; Envio que não saiu não conta; sem segmento tem nome'
);
select throws_ok(
  $$select * from public.send_outcome_rates('f7000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'o Workspace de outro não se lê'
);
reset role;
select is(
  (select count(*)::integer from private.send_outcomes where workspace_id = 'f7000000-0000-0000-0000-000000000002'), 0,
  'nada do Norte foi parar no Sul'
);

select * from finish();
rollback;
