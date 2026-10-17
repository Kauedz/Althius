begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

select has_function('public', 'enqueue_reply_proposal_llm_request', array['uuid', 'uuid', 'text', 'text', 'integer'],
  'the reply proposal runner enqueues by the reserved job');
select has_column('private', 'signal_llm_requests', 'purpose', 'the queue marks what the request is for');
select ok(not has_function_privilege('authenticated', 'public.enqueue_reply_proposal_llm_request(uuid, uuid, text, text, integer)', 'execute'),
  'only the service role enqueues');
select throws_ok(
  $$select public.enqueue_reply_proposal_llm_request(gen_random_uuid(), gen_random_uuid(), 's', 'u', 10)$$,
  null, null, 'an unknown or unreserved job cannot enqueue');

select * from finish();
rollback;
