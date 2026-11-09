begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

-- contexto-da-empresa 07: nenhuma função ativa que alimenta Agentes, Mercado, Aderência ou o rascunho de resposta lê
-- o Playbook; o rascunho de resposta lê o Contexto da empresa. O Playbook e o mini-ICP ficam no banco, sem apagar nada.
-- O conteúdo devolvido por reply_proposal_context é conferido em propostas_de_resposta.sql, que monta o trabalho.

select ok(
  has_function_privilege('service_role', 'public.reply_proposal_context(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.reply_proposal_context(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.reply_proposal_context(uuid, uuid)', 'execute'),
  'o contexto do rascunho de resposta continua só do servidor');

select ok(
  pg_get_functiondef('public.reply_proposal_context(uuid, uuid)'::regprocedure) not ilike '%playbook%'
    and pg_get_functiondef('public.reply_proposal_context(uuid, uuid)'::regprocedure) ilike '%current_company_context%',
  'o rascunho de resposta lê o Contexto da empresa, não as seções do Playbook');

select ok(
  pg_get_functiondef('private.compute_agent_prompt_suggestions(uuid, text, uuid)'::regprocedure) not ilike '%playbook%'
    and pg_get_functiondef('public.get_discovered_account_fit_explanation(uuid)'::regprocedure) not ilike '%playbook%'
    and pg_get_functiondef('public.get_discovered_account_fit_explanation(uuid)'::regprocedure) not ilike '%o_que_vende%',
  'as sugestões dos Agentes e a explicação da Aderência não leem o Playbook nem o mini-ICP');

set local role service_role;
select throws_ok(
  $$select public.reply_proposal_context(gen_random_uuid(), gen_random_uuid())$$,
  '55000', null, 'sem um trabalho reservado não há contexto, como antes');
reset role;

select ok(
  to_regclass('private.playbook_section_versions') is not null
    and to_regclass('private.playbook_section_catalog') is not null,
  'as versões do Playbook continuam guardadas: nada é apagado');

select has_column('public', 'day0_companies', 'mini_icp', 'o mini-ICP do onboarding continua guardado');

select ok(
  to_regprocedure('public.get_playbook_section(uuid, text)') is not null
    and to_regprocedure('public.agent_run_playbook(uuid, text)') is not null,
  'as funções antigas do Playbook ficam no banco, sem uso pela tela nem pelas Edge Functions');

select * from finish();
rollback;
