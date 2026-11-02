begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

select is((select p.prosrc like '%specialty = ''rhetor''%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'agent_can_propose_sequence'
    and pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_agent_id uuid'), true,
  'a guarda da Sequência exige a Especialidade Rhetor');
select has_function('public', 'agent_propose_sequence', array['uuid', 'uuid', 'uuid', 'uuid[]', 'jsonb', 'text'],
  'a RPC de proposta continua publicada');
select has_function('public', 'agent_suggest_althius_sequence_template', array['uuid', 'uuid', 'uuid'],
  'a RPC de template da Althius continua publicada');

select * from finish();
rollback;
