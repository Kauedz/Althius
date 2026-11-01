begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(35);

-- Sinais first 11: Sequência sem exigir o Rhetor. As quatro RPCs da Sequência (ler Contatos, propor, sugerir modelo da
-- Althius, sugerir modelo próprio) aceitam qualquer Agente com Propor (ou Executar) no passo interno `sequencia` e
-- recusam quem não tem, seja qual for a Especialidade. Norte: Bia (Membro, Vendedora responsável). Sul: outro Workspace,
-- com o Rui, para o isolamento.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b1100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@onze.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rui@onze.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('b1110000-0000-0000-0000-000000000001', 'empresa', 'Norte Onze'),
  ('b1110000-0000-0000-0000-000000000002', 'empresa', 'Sul Onze');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b1110000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'member', true),
  ('b1110000-0000-0000-0000-000000000002', 'b1100000-0000-0000-0000-000000000002', 'member', true);
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('b1120000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'coordenada'),
  ('b1120000-0000-0000-0000-000000000002', 'b1110000-0000-0000-0000-000000000002', 'b1100000-0000-0000-0000-000000000002', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('b1130000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000001', 'b1120000-0000-0000-0000-000000000001',
   'b1100000-0000-0000-0000-000000000001', gen_random_uuid(), 'Monte uma Sequência para a Alfa', 'running', now()),
  ('b1130000-0000-0000-0000-000000000002', 'b1110000-0000-0000-0000-000000000002', 'b1120000-0000-0000-0000-000000000002',
   'b1100000-0000-0000-0000-000000000002', gen_random_uuid(), 'Monte uma Sequência', 'running', now());

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.agente(p_workspace text, p_especialidade text) returns uuid language sql as $$
  select id from private.agents
  where workspace_id = p_workspace::uuid and specialty = p_especialidade and kind = 'padrao'
$$;
create function pg_temp.norte(p_especialidade text) returns uuid language sql as $$
  select pg_temp.agente('b1110000-0000-0000-0000-000000000001', p_especialidade)
$$;
create temporary table ids (k text primary key, id uuid) on commit drop;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where k = p $$;
create function pg_temp.passos() returns jsonb language sql as $$
  select '[{"esperaEmDias": 0, "assunto": "Oi {{primeiro_nome}}", "corpo": "Vi a {{empresa}} contratando."}]'::jsonb
$$;
-- As quatro chamadas, na Execução da Bia no Norte (r1), com o Agente e a Conta dados.
create function pg_temp.ler(p_agente uuid, p_conta uuid, p_run text default 'b1130000-0000-0000-0000-000000000001')
returns jsonb language sql as $$
  select public.agent_read_sequence_contacts(p_run::uuid, p_agente, p_conta)
$$;
create function pg_temp.propor(p_agente uuid, p_conta uuid, p_contato uuid, p_run text default 'b1130000-0000-0000-0000-000000000001')
returns table (approval_id uuid, outcome text, account_name text) language sql as $$
  select * from public.agent_propose_sequence(p_run::uuid, p_agente, p_conta, array[p_contato], pg_temp.passos(), 'Sinal da Alfa')
$$;
create function pg_temp.modelo_althius(p_agente uuid, p_conta uuid, p_run text default 'b1130000-0000-0000-0000-000000000001')
returns text language sql as $$
  select coalesce(template_id, '(nenhum)') || '|' || outcome
  from public.agent_suggest_althius_sequence_template(p_run::uuid, p_agente, p_conta)
$$;
create function pg_temp.modelo_proprio(p_agente uuid, p_conta uuid, p_run text default 'b1130000-0000-0000-0000-000000000001')
returns text language sql as $$
  select coalesce(template_id::text, '(nenhum)') || '|' || outcome
  from public.agent_suggest_own_sequence_template(p_run::uuid, p_agente, p_conta)
$$;

-- As Contas e os Contatos da Bia (quem cria a Conta é a Vendedora responsável).
select pg_temp.entrar_como('b1100000-0000-0000-0000-000000000001');
insert into ids select 'alfa', id from public.save_target_account('b1110000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.onze.test');
insert into ids select 'beta', id from public.save_target_account('b1110000-0000-0000-0000-000000000001', 'Beta', 'https://beta.onze.test');
insert into ids select 'maria', id from public.create_contact(pg_temp.id('alfa'), 'Maria Souza', 'Diretora', 'maria@alfa.onze.test');
insert into ids select 'pedro', id from public.create_contact(pg_temp.id('beta'), 'Pedro Beta', 'CTO', 'pedro@beta.onze.test');
insert into ids select 'rhetor-sul', pg_temp.agente('b1110000-0000-0000-0000-000000000002', 'rhetor');

-- 1. Quem pode ler e chamar.
select ok(
  not has_table_privilege('authenticated', 'private.agent_step_permissions', 'select')
    and not has_table_privilege('anon', 'private.agent_step_permissions', 'select')
    and not has_table_privilege('service_role', 'private.agent_step_permissions', 'select'),
  'a Permissão de passo interno não é lida pelo Cliente nem pela API'
);
select ok(
  not has_function_privilege('authenticated', 'private.agent_can_propose_sequence(uuid, uuid)', 'execute')
    and not has_function_privilege('service_role', 'private.agent_can_propose_sequence(uuid, uuid)', 'execute'),
  'a checagem da Permissão é interna'
);
select ok(
  has_function_privilege('service_role', 'public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text)', 'execute')
    and has_function_privilege('service_role', 'public.agent_read_sequence_contacts(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_read_sequence_contacts(uuid, uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.agent_suggest_own_sequence_template(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_suggest_own_sequence_template(uuid, uuid, uuid)', 'execute'),
  'as quatro RPCs continuam só do servidor'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('agent_read_sequence_contacts', 'agent_propose_sequence',
     'agent_suggest_althius_sequence_template', 'agent_suggest_own_sequence_template')
     and p.prosrc like '%agent_can_propose_sequence%' and p.prosrc not like '%specialty%'),
  4,
  'nenhuma das quatro RPCs olha a Especialidade; todas checam a Permissão de Propor em Sequência'
);

-- 2. Quem já é Rhetor continua com Propor em Sequência; as outras Especialidades começam sem.
select is(
  (select array_agg(a.specialty || ':' || coalesce(p.permission, '-') order by a.specialty)
   from private.agents a
   left join private.agent_step_permissions p on p.agent_id = a.id and p.step = 'sequencia'
   where a.workspace_id = 'b1110000-0000-0000-0000-000000000001' and a.kind = 'padrao'),
  array['ethos:-', 'oraculum:-', 'rhetor:propor', 'scopus:-'],
  'o Rhetor semeado num Workspace novo tem Propor em Sequência; os outros Agentes, nada'
);
insert into private.agents (workspace_id, specialty, kind, name, complement) values
  ('b1110000-0000-0000-0000-000000000001', 'rhetor', 'criado', 'Rhetor · Onze', 'Onze'),
  ('b1110000-0000-0000-0000-000000000001', 'scopus', 'criado', 'Scopus · Onze', 'Onze');
select is(
  (select array_agg(a.specialty || ':' || coalesce(p.permission, '-') order by a.specialty)
   from private.agents a
   left join private.agent_step_permissions p on p.agent_id = a.id and p.step = 'sequencia'
   where a.workspace_id = 'b1110000-0000-0000-0000-000000000001' and a.kind = 'criado'),
  array['rhetor:propor', 'scopus:-'],
  'um Rhetor criado também recebe Propor em Sequência; um Scopus criado, não'
);

-- 3. Sem a Permissão, as quatro recusam com a mesma mensagem, que não cita Especialidade.
select throws_ok(format($$select pg_temp.ler(%L, %L)$$, pg_temp.norte('scopus'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'ler Contatos: sem Permissão, recusado');
select throws_ok(format($$select * from pg_temp.propor(%L, %L, %L)$$, pg_temp.norte('scopus'), pg_temp.id('alfa'), pg_temp.id('maria')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'propor: sem Permissão, recusado');
select throws_ok(format($$select pg_temp.modelo_althius(%L, %L)$$, pg_temp.norte('scopus'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'modelo da Althius: sem Permissão, recusado');
select throws_ok(format($$select pg_temp.modelo_proprio(%L, %L)$$, pg_temp.norte('scopus'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'modelo próprio: sem Permissão, recusado');

-- 4. Só Ler no passo também é recusado (inclusive para o Rhetor).
update private.agent_step_permissions set permission = 'ler' where agent_id = pg_temp.norte('rhetor') and step = 'sequencia';
select throws_ok(format($$select pg_temp.ler(%L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'ler Contatos: Rhetor só com Ler é recusado');
select throws_ok(format($$select * from pg_temp.propor(%L, %L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('alfa'), pg_temp.id('maria')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'propor: Rhetor só com Ler é recusado');
select throws_ok(format($$select pg_temp.modelo_althius(%L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'modelo da Althius: Rhetor só com Ler é recusado');
select throws_ok(format($$select pg_temp.modelo_proprio(%L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'modelo próprio: Rhetor só com Ler é recusado');
update private.agent_step_permissions set permission = 'propor' where agent_id = pg_temp.norte('rhetor') and step = 'sequencia';
select is((select count(*)::integer from private.approvals where workspace_id = 'b1110000-0000-0000-0000-000000000001'), 0,
  'nenhuma recusa criou Aprovação');

-- 5. Um Agente que não é Rhetor, com Propor em Sequência, faz as quatro coisas: a trava não é mais a Especialidade.
insert into private.agent_step_permissions (agent_id, workspace_id, step, permission)
values (pg_temp.norte('ethos'), 'b1110000-0000-0000-0000-000000000001', 'sequencia', 'propor');
select is(
  (select jsonb_agg(c ->> 'nome') from jsonb_array_elements(pg_temp.ler(pg_temp.norte('ethos'), pg_temp.id('alfa')) -> 'contatos') c),
  '["Maria Souza"]'::jsonb,
  'ler Contatos: o Ethos com Propor em Sequência lê os Contatos da Conta'
);
select lives_ok(format($$select pg_temp.modelo_althius(%L, %L)$$, pg_temp.norte('ethos'), pg_temp.id('alfa')),
  'modelo da Althius: o Ethos com Propor em Sequência recebe a sugestão');
select is(pg_temp.modelo_althius(pg_temp.norte('ethos'), pg_temp.id('alfa')), pg_temp.modelo_althius(pg_temp.norte('rhetor'), pg_temp.id('alfa')),
  'modelo da Althius: a mesma sugestão que o Rhetor recebe');
select lives_ok(format($$select pg_temp.modelo_proprio(%L, %L)$$, pg_temp.norte('ethos'), pg_temp.id('alfa')),
  'modelo próprio: o Ethos com Propor em Sequência recebe a sugestão');
select is(pg_temp.modelo_proprio(pg_temp.norte('ethos'), pg_temp.id('alfa')), pg_temp.modelo_proprio(pg_temp.norte('rhetor'), pg_temp.id('alfa')),
  'modelo próprio: a mesma sugestão que o Rhetor recebe');
insert into ids select 'p-ethos', approval_id from pg_temp.propor(pg_temp.norte('ethos'), pg_temp.id('alfa'), pg_temp.id('maria'));
select is(
  (select row(state, category, agent_id, target_account_id)::text from private.approvals where id = pg_temp.id('p-ethos')),
  row('pendente', 'sequencia', pg_temp.norte('ethos'), pg_temp.id('alfa'))::text,
  'propor: a proposta do Ethos com Propor em Sequência nasce pendente, como a do Rhetor'
);
-- Executar no passo também autoriza, e a proposta continua pendente (a Sequência sempre espera a decisão).
update private.agent_step_permissions set permission = 'executar' where agent_id = pg_temp.norte('ethos') and step = 'sequencia';
select lives_ok(format($$select pg_temp.ler(%L, %L)$$, pg_temp.norte('ethos'), pg_temp.id('beta')),
  'Executar no passo também autoriza');

-- 6. Quem usa o Rhetor hoje não regride: ele propõe e sugere como antes.
select is(
  (select jsonb_agg(c ->> 'nome') from jsonb_array_elements(pg_temp.ler(pg_temp.norte('rhetor'), pg_temp.id('beta')) -> 'contatos') c),
  '["Pedro Beta"]'::jsonb,
  'o Rhetor continua lendo os Contatos'
);
insert into ids select 'p-rhetor', approval_id from pg_temp.propor(pg_temp.norte('rhetor'), pg_temp.id('beta'), pg_temp.id('pedro'));
select is(
  (select row(state, category, agent_id)::text from private.approvals where id = pg_temp.id('p-rhetor')),
  row('pendente', 'sequencia', pg_temp.norte('rhetor'))::text,
  'o Rhetor continua propondo Sequência'
);
select lives_ok(format($$select pg_temp.modelo_althius(%L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('beta')),
  'o Rhetor continua recebendo sugestão de modelo da Althius');
select lives_ok(format($$select pg_temp.modelo_proprio(%L, %L)$$, pg_temp.norte('rhetor'), pg_temp.id('beta')),
  'o Rhetor continua recebendo sugestão de modelo próprio');

-- 7. Isolamento por Workspace: a Permissão de um Agente do Sul não vale numa Execução do Norte.
select ok(
  exists (select 1 from private.agent_step_permissions where agent_id = pg_temp.id('rhetor-sul') and permission = 'propor'),
  'o Rhetor do Sul tem Propor em Sequência no Sul'
);
select throws_ok(format($$select pg_temp.ler(%L, %L)$$, pg_temp.id('rhetor-sul'), pg_temp.id('alfa')),
  'P0002', 'agent not found', 'ler Contatos: Agente de outro Workspace não age no Norte');
select throws_ok(format($$select * from pg_temp.propor(%L, %L, %L)$$, pg_temp.id('rhetor-sul'), pg_temp.id('alfa'), pg_temp.id('maria')),
  'P0002', 'agent not found', 'propor: Agente de outro Workspace não age no Norte');
select throws_ok(format($$select pg_temp.modelo_althius(%L, %L)$$, pg_temp.id('rhetor-sul'), pg_temp.id('alfa')),
  'P0002', 'agent not found', 'modelo da Althius: Agente de outro Workspace não age no Norte');
select throws_ok(format($$select pg_temp.modelo_proprio(%L, %L)$$, pg_temp.id('rhetor-sul'), pg_temp.id('alfa')),
  'P0002', 'agent not found', 'modelo próprio: Agente de outro Workspace não age no Norte');
-- A Conta do Norte não é lida a partir de uma Execução do Sul, nem com o Agente do Sul autorizado.
select throws_ok(format($$select pg_temp.ler(%L, %L, 'b1130000-0000-0000-0000-000000000002')$$, pg_temp.id('rhetor-sul'), pg_temp.id('alfa')),
  'P0002', 'target account not found', 'a Execução do Sul não lê a Conta do Norte');
-- Uma Permissão não pode apontar o Agente de um Workspace com o id de outro.
select throws_ok(format($$insert into private.agent_step_permissions (agent_id, workspace_id, step, permission)
    values (%L, 'b1110000-0000-0000-0000-000000000002', 'sequencia', 'propor')$$, pg_temp.norte('scopus')),
  '23503', null, 'a Permissão de passo é sempre do Workspace do próprio Agente');
select is(
  (select count(*)::integer from private.approvals where workspace_id = 'b1110000-0000-0000-0000-000000000002'), 0,
  'nada nasceu no Sul'
);
select throws_ok($$insert into private.agent_step_permissions (agent_id, workspace_id, step, permission)
    select id, workspace_id, 'envio', 'propor' from private.agents where workspace_id = 'b1110000-0000-0000-0000-000000000001' limit 1$$,
  '23514', null, 'só o passo sequencia existe');

select * from finish();
rollback;
