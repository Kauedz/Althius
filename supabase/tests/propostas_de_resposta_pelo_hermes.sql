begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

select has_function('public', 'enqueue_reply_proposal_llm_request', array['uuid', 'uuid', 'text', 'text', 'integer'],
  'the reply proposal runner enqueues by the reserved job');
select has_column('private', 'signal_llm_requests', 'purpose', 'the queue marks what the request is for');
select ok(not has_function_privilege('authenticated', 'public.enqueue_reply_proposal_llm_request(uuid, uuid, text, text, integer)', 'execute'),
  'only the service role enqueues');
select throws_ok(
  $$select public.enqueue_reply_proposal_llm_request(gen_random_uuid(), gen_random_uuid(), 's', 'u', 10)$$,
  null, null, 'an unknown or unreserved job cannot enqueue');

-- O sistema da Proposta (Playbook de até 24.000 caracteres mais as instruções) cabe na fila; acima do teto, não.
insert into public.workspaces (id, kind, name) values ('52000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
select lives_ok(
  $$select public.enqueue_signal_llm_request('52000000-0000-0000-0000-000000000001', repeat('p', 30000), 'u', 10)$$,
  'a system prompt with a full Playbook fits the queue');
select throws_ok(
  $$select public.enqueue_signal_llm_request('52000000-0000-0000-0000-000000000001', repeat('p', 40001), 'u', 10)$$,
  '23514', null, 'a system prompt above the cap is a check violation, not a transient failure');

select * from finish();
rollback;
