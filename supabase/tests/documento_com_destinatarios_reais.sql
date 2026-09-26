begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- 1. Setup mock users and memberships
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'seller@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other-seller@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', '', now(), now(), now(), '{}', '{}', false, false)
on conflict (id) do nothing;

insert into public.workspaces(id, kind, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'empresa', 'Workspace da empresa')
on conflict do nothing;

insert into public.workspace_memberships(workspace_id, user_id, role, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', 'admin', true)
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Seller creates initial sequence and responsibility for target-real
select lives_ok(
  $$select public.create_sequence(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'target-real',
    '{"participantesIds":["c-1"],"janelaPadrao":{"de":"09:00","ate":"17:00"},"steps":[{"ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"Email 1","corpo":"Ola","objetivo":"Abertura"}]}'::jsonb,
    '{"status":"ativa"}'::jsonb
  )$$,
  'responsible seller creates sequence with valid email step'
);

-- Os Contatos são canônicos (CRM-05): o destinatário fica numa Conta-alvo real sob a responsabilidade do Vendedor.
create temporary table conta_real on commit drop as
  select id from public.save_target_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OpenAI', 'openai.test');

-- Test 2: Seller registers real contact with email, normalized WhatsApp, and LinkedIn
select lives_ok(
  $$select public.upsert_target_contact(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id::text from conta_real),
    null,
    'Sarah Chen',
    'Head of Evaluation',
    'sarah.chen@openai.test',
    '(11) 99999-8888',
    'sarah-chen-ai'
  )$$,
  'responsible seller registers real contact with unformatted phone'
);

-- Test 3: WhatsApp number was normalized to E.164 (+5511999998888)
select is(
  (select whatsapp from public.target_contacts where name = 'Sarah Chen'),
  '+5511999998888',
  'whatsapp number was normalized to E.164'
);

-- Test 4: Email was validated and normalized (lowercase)
select is(
  (select email from public.target_contacts where name = 'Sarah Chen'),
  'sarah.chen@openai.test',
  'email was validated and saved'
);

-- Test 5: Rejects invalid email
select throws_ok(
  $$select public.upsert_target_contact(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id::text from conta_real),
    null,
    'Elena Rostova',
    'Product Lead',
    'not-an-email',
    '+5511988887777',
    'elena-rostova'
  )$$,
  '22023', 'invalid email address format',
  'rejects invalid email address'
);

-- Test 6: Rejects invalid whatsapp phone
select throws_ok(
  $$select public.upsert_target_contact(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id::text from conta_real),
    null,
    'Elena Rostova',
    'Product Lead',
    'elena@openai.test',
    '123',
    'elena-rostova'
  )$$,
  '22023', 'invalid whatsapp number: must have 8 to 15 digits',
  'rejects invalid whatsapp phone'
);

-- Test 7: Non-responsible member cannot register contacts on target-real
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.upsert_target_contact(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id::text from conta_real),
    null,
    'Marcus Thorne',
    'Staff Engineer',
    'marcus@openai.test',
    '+5511977776666',
    'marcus-thorne'
  )$$,
  '42501', 'only the responsible seller can register or update target contacts',
  'non-responsible seller cannot register target contact'
);

-- Test 8: Non-responsible member can consult public contacts of the target
select is(
  (select name from public.target_contacts where name = 'Sarah Chen'),
  'Sarah Chen',
  'workspace member can consult target contact name'
);

-- Back to responsible seller
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Test 9: Backend rejects steps with SMS
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = 'target-real'),
    '{"steps":[{"ordem":1,"canal":"sms","contatoId":"c-1","delayDiasUteis":0}]}'::jsonb,
    null, null
  )$$,
  '22023', 'canal fora do escopo: apenas email, linkedin e whatsapp sao permitidos',
  'backend rejects SMS channel in sequence steps'
);

-- Test 10: Backend rejects steps with ligacao
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = 'target-real'),
    '{"steps":[{"ordem":1,"canal":"ligacao","contatoId":"c-1","delayDiasUteis":0}]}'::jsonb,
    null, null
  )$$,
  '22023', 'canal fora do escopo: apenas email, linkedin e whatsapp sao permitidos',
  'backend rejects ligacao channel in sequence steps'
);

-- Test 11: Backend rejects steps with tarefa
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = 'target-real'),
    '{"steps":[{"ordem":1,"canal":"tarefa","contatoId":"c-1","delayDiasUteis":0}]}'::jsonb,
    null, null
  )$$,
  '22023', 'canal fora do escopo: apenas email, linkedin e whatsapp sao permitidos',
  'backend rejects tarefa channel in sequence steps'
);

-- Test 12: Backend accepts steps with LinkedIn and WhatsApp
select lives_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = 'target-real'),
    '{"steps":[{"ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"Email","corpo":"C1","objetivo":"O1"},{"ordem":2,"canal":"linkedin","contatoId":"c-1","delayDiasUteis":1,"subtipoLinkedIn":"convite","titulo":"Convite","corpo":"C2","objetivo":"O2"},{"ordem":3,"canal":"whatsapp","contatoId":"c-1","delayDiasUteis":2,"titulo":"Zap","corpo":"C3","objetivo":"O3"}]}'::jsonb,
    null, null
  )$$,
  'backend accepts email, linkedin, and whatsapp steps'
);

-- Test 13: Sequence document persists ordered steps, content, objective, delay, and channels
-- Nenhum papel da API lê o schema private; a conferência do documento gravado roda como dono do banco.
reset role;
select is(
  (select jsonb_array_length(document -> 'steps') from private.sequence_documents where sequence_id = (select id from public.sequences where target_account_id = 'target-real')),
  3,
  'persisted sequence document contains all 3 steps'
);
set local role authenticated;

-- Test 14: Seller reads private document via get_owned_sequence
select is(
  (select (public.get_owned_sequence((select id from public.sequences where target_account_id = 'target-real'))).public_summary -> '_document' -> 'steps' -> 1 ->> 'canal'),
  'linkedin',
  'seller receives private document with step details'
);

-- Test 15: Another member cannot read private document
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.get_owned_sequence((select id from public.sequences where target_account_id = 'target-real'))$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot get private sequence document'
);

-- Test 16: Guard against mock/demo data authorizing real execution
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = 'target-real'),
    '{"is_demo":true,"autorizar_execucao_real":true,"steps":[{"ordem":1,"canal":"email","contatoId":"c-1"}]}'::jsonb,
    null, null
  )$$,
  '22023', 'dados ficticios e metricas de demonstracao nao podem autorizar execucao real',
  'demo data cannot authorize real execution'
);

select * from finish();
rollback;
