begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dep-seller@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('d1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dep-other@example.test', '', now(), now(), now(), '{}', '{}', false, false)
on conflict (id) do nothing;

insert into public.workspaces(id, kind, name) values
  ('d1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'empresa', 'Workspace deps')
on conflict do nothing;

insert into public.workspace_memberships(workspace_id, user_id, role, active) values
  ('d1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001', 'member', true),
  ('d1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000002', 'member', true)
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);

create temporary table conta_dep on commit drop as
  select id from public.save_target_account('d1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Deps Co', 'deps.example.test');

-- 1. Documento legado serial (sem liberacao) continua válido
select lives_ok(
  $$select public.create_sequence(
    'd1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id::text from conta_dep),
    '{"participantesIds":["c-1"],"steps":[
      {"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"A","corpo":"oi"},
      {"id":"s2","ordem":2,"canal":"email","contatoId":"c-1","delayDiasUteis":2,"titulo":"B","corpo":"oi"}
    ]}'::jsonb,
    '{"status":"ativa"}'::jsonb
  )$$,
  'legacy serial document without liberacao is accepted'
);

-- 2. Documento com liberação explícita e um predecessor válido
select lives_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"participantesIds":["c-1","c-2"],"steps":[
      {"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"A","corpo":"oi","liberacao":"ativacao"},
      {"id":"s2","ordem":2,"canal":"email","contatoId":"c-2","delayDiasUteis":1,"titulo":"B","corpo":"oi","liberacao":"predecessor","predecessorId":"s1"},
      {"id":"s3","ordem":3,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"C","corpo":"oi","liberacao":"manual"}
    ]}'::jsonb,
    null, null
  )$$,
  'explicit liberacao with one predecessor is accepted'
);

-- 3. Persistência: predecessor e liberacao voltam no documento do dono
select is(
  (select (public.get_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep))
  )).public_summary -> '_document' -> 'steps' -> 1 ->> 'predecessorId'),
  's1',
  'owner reopens predecessorId from private document'
);

select is(
  (select (public.get_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep))
  )).public_summary -> '_document' -> 'steps' -> 2 ->> 'liberacao'),
  'manual',
  'owner reopens manual liberacao'
);

-- 4. Autorreferência
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"steps":[{"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"predecessor","predecessorId":"s1"}]}'::jsonb,
    null, null
  )$$,
  '22023', 'passo nao pode depender de si mesmo',
  'rejects self-reference'
);

-- 5. Predecessor ausente
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"steps":[
      {"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"ativacao"},
      {"id":"s2","ordem":2,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"predecessor","predecessorId":"fantasma"}
    ]}'::jsonb,
    null, null
  )$$,
  '22023', 'predecessor inexistente na sequencia',
  'rejects missing predecessor'
);

-- 6. Ciclo
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"steps":[
      {"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"predecessor","predecessorId":"s2"},
      {"id":"s2","ordem":2,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"predecessor","predecessorId":"s1"}
    ]}'::jsonb,
    null, null
  )$$,
  '22023', 'dependencia circular entre passos',
  'rejects dependency cycle'
);

-- 7. predecessorId com liberacao ativacao
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"steps":[
      {"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"ativacao"},
      {"id":"s2","ordem":2,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"ativacao","predecessorId":"s1"}
    ]}'::jsonb,
    null, null
  )$$,
  '22023', 'predecessorId so e permitido com liberacao predecessor',
  'rejects predecessorId without predecessor liberacao'
);

-- 8. Reordenação visual (só ordem) não exige reescrever predecessor: grava e reabre iguais
select lives_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"participantesIds":["c-1","c-2"],"steps":[
      {"id":"s2","ordem":1,"canal":"email","contatoId":"c-2","delayDiasUteis":1,"titulo":"B","corpo":"oi","liberacao":"predecessor","predecessorId":"s1"},
      {"id":"s1","ordem":2,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"A","corpo":"oi","liberacao":"ativacao"},
      {"id":"s3","ordem":3,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"titulo":"C","corpo":"oi","liberacao":"manual"}
    ]}'::jsonb,
    null, null
  )$$,
  'reordered visual list keeps explicit predecessor'
);

select is(
  (select (public.get_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep))
  )).public_summary -> '_document' -> 'steps' -> 0 ->> 'predecessorId'),
  's1',
  'after visual reorder predecessorId is unchanged'
);

-- A assinatura vigente (anexos + canal) continua, e a dependência entra nela.
-- update_owned_sequence já revoga a autorização quando pending_steps_signature muda.
reset role;
select is(
  (private.step_signature('{}'::jsonb, '{"id":"s2","canal":"email","liberacao":"predecessor","predecessorId":"s1"}'::jsonb) ->> 'predecessorId'),
  's1',
  'pending step signature includes predecessorId'
);
select ok(
  private.step_signature('{}'::jsonb, '{"id":"s2","canal":"email","liberacao":"predecessor","predecessorId":"s1"}'::jsonb)
    is distinct from
  private.step_signature('{}'::jsonb, '{"id":"s2","canal":"email","liberacao":"ativacao"}'::jsonb),
  'changing the dependency changes the signature that revokes authorization'
);
select is(
  (private.step_signature('{}'::jsonb, '{"id":"s2","canal":"linkedin","subtipoLinkedIn":"mensagem","anexos":[{"id":"anexo-1"}]}'::jsonb) ->> 'subtipoLinkedIn'),
  'mensagem',
  'signature still carries linkedin subtype from the previous definition'
);
select is(
  (private.step_signature('{}'::jsonb, '{"id":"s2","canal":"linkedin","anexos":[{"id":"anexo-1"}]}'::jsonb) -> 'anexos' ->> 0),
  'anexo-1',
  'signature still carries attachment ids from the previous definition'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.update_owned_sequence(
    (select id from public.sequences where target_account_id = (select id::text from conta_dep)),
    '{"steps":[{"id":"s1","ordem":1,"canal":"email","contatoId":"c-1","delayDiasUteis":0,"liberacao":"ativacao"}]}'::jsonb,
    null, null
  )$$,
  '42501', 'sequence not found or not owned by active user',
  'non-owner cannot update dependencies'
);

select * from finish();
rollback;
