begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(61);
create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;


-- A Sequência proposta pelo Rhetor (cadencia-pela-ia 01). Norte: Bia (Membro, Vendedora responsável pelas Contas e quem
-- pede ao Rhetor), Ana (Administradora, não é responsável) e Caio (Membro, pede numa Conversa dele).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'member', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'member', true);

insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('ca000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'coordenada'),
  ('ca000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'coordenada'),
  ('ca000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'coordenada');
-- r1 e r3: pedidos da Bia, cada um na sua Conversa (uma Conversa tem no máximo uma Execução aberta); r2: pedido do Caio;
-- r4: da Bia, já terminado.
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('aa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
   '5a000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Monte uma Sequência para a Alfa', 'running', now()),
  ('aa000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002',
   '5a000000-0000-0000-0000-000000000003', gen_random_uuid(), 'Monte uma Sequência para a Alfa', 'running', now()),
  ('aa000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000003',
   '5a000000-0000-0000-0000-000000000001', gen_random_uuid(), 'E para as outras Contas', 'running', now());
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status,
                                started_at, finished_at) values
  ('aa000000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
   '5a000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Pedido antigo', 'succeeded', now() - interval '1 hour', now());

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.agente(p_especialidade text) returns uuid language sql as $$
  select id from private.agents
  where workspace_id = 'fa000000-0000-0000-0000-000000000001' and specialty = p_especialidade and kind = 'padrao'
$$;
create temporary table ids (k text primary key, id uuid) on commit drop;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where k = p $$;
create function pg_temp.estado(p uuid) returns text language sql as $$ select state from private.approvals where id = p $$;
create function pg_temp.sequencias(p_conta uuid) returns integer language sql as $$
  select count(*)::integer from public.sequences where target_account_id = p_conta::text
$$;
-- Três passos de E-mail com variáveis (dia 0, 3 e 7).
create function pg_temp.passos(p_extra text default '') returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('esperaEmDias', 0, 'assunto', '{{primeiro_nome}}, vi a contratação na {{empresa}}' || p_extra,
      'corpo', 'Oi {{primeiro_nome}}, a {{empresa}} abriu 12 vagas de vendas. Faz sentido conversar?'),
    jsonb_build_object('esperaEmDias', 3, 'assunto', 'Re: {{empresa}}', 'corpo', 'Retomando, {{nome}}.'),
    jsonb_build_object('esperaEmDias', 4, 'assunto', 'Última ideia', 'corpo', 'Fico à disposição. {{remetente.nome}}')
  )
$$;
create function pg_temp.propor(p_run text, p_agente uuid, p_conta uuid, p_contatos uuid[], p_passos jsonb)
returns table (approval_id uuid, outcome text, account_name text) language sql as $$
  select * from public.agent_propose_sequence(p_run::uuid, p_agente, p_conta, p_contatos, p_passos,
    'A Alfa abriu vagas de vendas')
$$;
create function pg_temp.r1(p_conta uuid, p_contatos uuid[], p_passos jsonb)
returns table (approval_id uuid, outcome text, account_name text) language sql as $$
  select * from pg_temp.propor('aa000000-0000-0000-0000-000000000001', pg_temp.agente('rhetor'), p_conta, p_contatos, p_passos)
$$;

-- As Contas e os Contatos da Bia (ela é a Vendedora responsável por quem cria a Conta).
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
insert into ids select 'alfa', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test');
insert into ids select 'beta', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
insert into ids select 'gama', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test');
insert into ids select 'delta', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test');
insert into ids select 'eps', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Epsilon', 'https://epsilon.test');
insert into ids select 'maria', id from public.create_contact(pg_temp.id('alfa'), 'Maria Souza', 'Diretora', 'maria@alfa.test');
insert into ids select 'joao', id from public.create_contact(pg_temp.id('alfa'), 'João Lima', 'Gerente', 'joao@alfa.test');
insert into ids select 'sem-email', id from public.create_contact(pg_temp.id('alfa'), 'Rui Sem', 'Analista', null);
insert into ids select 'saiu', id from public.create_contact(pg_temp.id('alfa'), 'Sara Saiu', 'CEO', 'sara@alfa.test');
insert into ids select 'lia', id from public.create_contact(pg_temp.id('alfa'), 'Lia Dupla', 'CFO', 'lia@alfa.test');
insert into ids select 'pedro', id from public.create_contact(pg_temp.id('beta'), 'Pedro Beta', 'CTO', 'pedro@beta.test');
insert into ids select 'gil', id from public.create_contact(pg_temp.id('gama'), 'Gil Gama', 'CEO', 'gil@gama.test');
insert into ids select 'davi', id from public.create_contact(pg_temp.id('delta'), 'Davi Delta', 'CEO', 'davi@delta.test');
insert into ids select 'eva', id from public.create_contact(pg_temp.id('eps'), 'Eva Epsilon', 'CEO', 'eva@epsilon.test');
-- A Zeta foi arquivada: os Contatos dela não aparecem para o Rhetor.
insert into ids select 'zeta', id from public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Zeta', 'https://zeta.test');
insert into ids select 'zeca', id from public.create_contact(pg_temp.id('zeta'), 'Zeca Zeta', 'CEO', 'zeca@zeta.test');
update public.target_accounts set archived_at = now() where id = pg_temp.id('zeta');
insert into public.contact_suppressions (workspace_id, kind, value, reason)
values ('fa000000-0000-0000-0000-000000000001', 'email', 'sara@alfa.test', 'manual');
-- A Beta já tem Sequência em andamento, com o Pedro e a Lia (que também é da Alfa).
insert into ids select 'seq-beta', id from public.create_sequence('fa000000-0000-0000-0000-000000000001', pg_temp.id('beta')::text,
  jsonb_build_object('participantesIds', jsonb_build_array(pg_temp.id('pedro'), pg_temp.id('lia')),
    'steps', jsonb_build_array(jsonb_build_object('id', 'b1', 'ordem', 1, 'canal', 'email', 'contatoId', pg_temp.id('pedro'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Oi'))),
  '{"totalSteps": 1}'::jsonb);
update private.agent_permissions set permission = 'propor' where agent_id = pg_temp.agente('rhetor');

-- 1. Propor é só do servidor.
select ok(
  has_function_privilege('service_role', 'public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text)', 'execute')
    and has_function_privilege('service_role', 'public.agent_read_sequence_contacts(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_read_sequence_contacts(uuid, uuid, uuid)', 'execute'),
  'só o servidor propõe a Sequência pelo Rhetor e lê os Contatos para ela'
);

-- O Rhetor lê os Contatos da Conta com o id e se cada um pode entrar, sem o e-mail.
select is(
  (select jsonb_agg(jsonb_build_array(c ->> 'nome', c -> 'pode_entrar', c -> 'motivo', c ? 'email') order by c ->> 'nome')
   from jsonb_array_elements(public.agent_read_sequence_contacts('aa000000-0000-0000-0000-000000000001', pg_temp.agente('rhetor'), pg_temp.id('alfa')) -> 'contatos') c),
  '[["João Lima", true, null, false], ["Lia Dupla", false, "in_other_sequence", false], ["Maria Souza", true, null, false],
    ["Rui Sem", false, "no_email", false], ["Sara Saiu", false, "suppressed", false]]'::jsonb,
  'cada Contato da Conta vem com se pode entrar na Sequência, ou por que não'
);
select is(
  (select jsonb_build_array(a -> 'contatos' -> 0 ->> 'id', a -> 'responsavel_e_quem_pediu', a -> 'sequencia_em_andamento',
     b -> 'sequencia_em_andamento')
   from public.agent_read_sequence_contacts('aa000000-0000-0000-0000-000000000001', pg_temp.agente('rhetor'), pg_temp.id('alfa')) a,
     public.agent_read_sequence_contacts('aa000000-0000-0000-0000-000000000002', pg_temp.agente('rhetor'), pg_temp.id('beta')) b),
  jsonb_build_array(pg_temp.id('joao'), true, false, true),
  'com o id para propor, quem é o responsável e se a Conta já tem Sequência em andamento'
);
select throws_ok(
  format($$select public.agent_read_sequence_contacts('aa000000-0000-0000-0000-000000000001', %L, %L)$$,
    pg_temp.agente('scopus'), pg_temp.id('alfa')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'sem Permissão de Propor em Sequência não lê os Contatos'
);
select throws_ok(
  format($$select public.agent_read_sequence_contacts('aa000000-0000-0000-0000-000000000001', pg_temp.agente('rhetor'), %L)$$,
    pg_temp.id('zeta')),
  'P0002', 'target account not found', 'os Contatos de uma Conta arquivada não são listados'
);

-- 2. A proposta válida nasce pendente, sem Integração, com a Conta-alvo, e não cria Sequência.
insert into ids select 'p-alfa', approval_id from pg_temp.r1(pg_temp.id('alfa'), array[pg_temp.id('maria'), pg_temp.id('joao')], pg_temp.passos());
select is(
  (select row(state, category, integration_id, target_account_id, requested_by, run_id, decided_by_kind)::text
   from private.approvals where id = pg_temp.id('p-alfa')),
  row('pendente', 'sequencia', null::text, pg_temp.id('alfa'), '5a000000-0000-0000-0000-000000000001'::uuid,
    'aa000000-0000-0000-0000-000000000001'::uuid, null::text)::text,
  'a proposta nasce pendente, sem Integração, com a Conta-alvo, quem pediu e a Execução'
);
select is(
  (select jsonb_build_array(jsonb_array_length(proposed_content -> 'contatos'), proposed_content -> 'contatos' -> 0 ->> 'nome',
     jsonb_array_length(proposed_content -> 'passos'), proposed_content -> 'passos' -> 1 ->> 'esperaEmDias')
   from private.approvals where id = pg_temp.id('p-alfa')),
  '[2, "Maria Souza", 3, "3"]'::jsonb,
  'guarda os Contatos e os passos propostos'
);
select is(
  (select payload from private.approvals where id = pg_temp.id('p-alfa')),
  '{"tipo": "sequencia", "conta": "Alfa", "total_contatos": 2, "total_passos": 3}'::jsonb,
  'o payload que todos leem tem só a Conta e as quantidades, sem assunto nem corpo'
);
select is(pg_temp.sequencias(pg_temp.id('alfa')), 0, 'propor não cria Sequência');
select is(
  (select row(approval_id, outcome, account_name)::text
   from pg_temp.r1(pg_temp.id('alfa'), array[pg_temp.id('maria'), pg_temp.id('joao')], pg_temp.passos())),
  row(pg_temp.id('p-alfa'), 'existente', 'Alfa')::text,
  'a mesma proposta na mesma Execução devolve a Aprovação que já existe'
);
select is((select count(*)::integer from private.approvals where category = 'sequencia'), 1, 'e não cria outra');

-- 3. As recusas.
select throws_ok(
  format($$select * from pg_temp.propor('aa000000-0000-0000-0000-000000000001', %L, %L, array[%L]::uuid[], pg_temp.passos())$$,
    pg_temp.agente('scopus'), pg_temp.id('alfa'), pg_temp.id('maria')),
  '42501', 'sequence: the agent has no permission to propose sequences', 'sem Permissão de Propor em Sequência não propõe Sequência'
);
select throws_ok(
  format($$select * from pg_temp.propor('aa000000-0000-0000-0000-000000000002', pg_temp.agente('rhetor'), %L, array[%L]::uuid[], pg_temp.passos())$$,
    pg_temp.id('alfa'), pg_temp.id('maria')),
  '42501', 'sequence: the requester is not the responsible seller of the target account',
  'quem pediu precisa ser o Vendedor responsável pela Conta-alvo (ADR-0009)'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos())$$, pg_temp.id('beta'), pg_temp.id('pedro')),
  '23505', 'sequence: the target account already has a sequence in progress', 'a Conta com Sequência em andamento é recusada'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos())$$, pg_temp.id('alfa'), pg_temp.id('pedro')),
  '22023', 'sequence: contact is not linked to the target account', 'o Contato de outra Conta é recusado'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos())$$, pg_temp.id('alfa'), pg_temp.id('sem-email')),
  '22023', 'sequence: contact has no e-mail', 'o Contato sem e-mail é recusado'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos())$$, pg_temp.id('alfa'), pg_temp.id('saiu')),
  '22023', 'sequence: contact is suppressed', 'o Contato descadastrado é recusado'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos())$$, pg_temp.id('alfa'), pg_temp.id('lia')),
  '22023', 'sequence: contact is in another active sequence', 'o Contato que está noutra Sequência ativa é recusado'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], pg_temp.passos(' {{conta.sinal}}'))$$, pg_temp.id('alfa'), pg_temp.id('maria')),
  '22023', 'sequence: unknown variable: conta.sinal', 'a variável que não existe no envio é recusada, com o nome'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], %L::jsonb)$$, pg_temp.id('alfa'), pg_temp.id('maria'),
    '[{"canal": "linkedin", "esperaEmDias": 0, "assunto": "Oi", "corpo": "Oi"}]'),
  '22023', 'sequence: only e-mail steps', 'só passos de E-mail'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], '[]'::jsonb)$$, pg_temp.id('alfa'), pg_temp.id('maria')),
  '22023', 'sequence: between 1 and 8 steps', 'sem passos é recusada'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], (select jsonb_agg(p) from generate_series(1, 9) g,
    lateral (select jsonb_build_object('esperaEmDias', 1, 'assunto', 'Oi', 'corpo', 'Oi') p) x))$$, pg_temp.id('alfa'), pg_temp.id('maria')),
  '22023', 'sequence: between 1 and 8 steps', 'mais de 8 passos é recusada'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], %L::jsonb)$$, pg_temp.id('alfa'), pg_temp.id('maria'),
    '[{"esperaEmDias": -1, "assunto": "Oi", "corpo": "Oi"}]'),
  '22023', 'sequence: invalid step wait', 'a espera negativa é recusada'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, array[%L]::uuid[], %L::jsonb)$$, pg_temp.id('alfa'), pg_temp.id('maria'),
    '[{"esperaEmDias": 0, "assunto": "Oi", "corpo": "  "}]'),
  '22023', 'sequence: invalid step text', 'o passo sem corpo é recusado'
);
select throws_ok(
  format($$select * from pg_temp.r1(%L, '{}'::uuid[], pg_temp.passos())$$, pg_temp.id('alfa')),
  '22023', 'sequence: between 1 and 5 contacts', 'sem Contatos é recusada'
);
select throws_ok(
  format($$select * from pg_temp.propor('aa000000-0000-0000-0000-000000000004', pg_temp.agente('rhetor'), %L, array[%L]::uuid[], pg_temp.passos())$$,
    pg_temp.id('alfa'), pg_temp.id('maria')),
  '55000', 'run is not running', 'uma Execução terminada não propõe'
);
select is((select count(*)::integer from private.approvals where category = 'sequencia'), 1, 'nenhuma recusa criou Aprovação');

-- 4. Com a Permissão Executar, a proposta nasce pendente do mesmo jeito.
update private.agent_permissions set permission = 'executar' where agent_id = pg_temp.agente('rhetor');
insert into ids select 'p-gama', approval_id from pg_temp.propor('aa000000-0000-0000-0000-000000000003', pg_temp.agente('rhetor'),
  pg_temp.id('gama'), array[pg_temp.id('gil')], pg_temp.passos());
select is(
  (select row(state, decided_by_kind)::text from private.approvals where id = pg_temp.id('p-gama')),
  '(pendente,)', 'com Executar, a Sequência proposta continua esperando a decisão'
);
update private.agent_permissions set permission = 'propor' where agent_id = pg_temp.agente('rhetor');
insert into ids select 'p-delta', approval_id from pg_temp.propor('aa000000-0000-0000-0000-000000000003', pg_temp.agente('rhetor'),
  pg_temp.id('delta'), array[pg_temp.id('davi')], pg_temp.passos());
insert into ids select 'p-eps', approval_id from pg_temp.propor('aa000000-0000-0000-0000-000000000003', pg_temp.agente('rhetor'),
  pg_temp.id('eps'), array[pg_temp.id('eva')], pg_temp.passos());

-- 5. Só o Vendedor responsável lê o assunto e o corpo; os outros leem a Conta e as quantidades.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select is(
  (select row(responsible_seller, proposed_content -> 'passos' -> 0 ->> 'assunto')::text
   from public.list_approvals('fa000000-0000-0000-0000-000000000001') where id = pg_temp.id('p-alfa')),
  '(t,"{{primeiro_nome}}, vi a contratação na {{empresa}}")', 'a Vendedora responsável lê a proposta inteira'
);
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select is(
  (select row(responsible_seller, proposed_content is null, payload ->> 'total_passos', target_account_id)::text
   from public.list_approvals('fa000000-0000-0000-0000-000000000001') where id = pg_temp.id('p-alfa')),
  row(false, true, '3', pg_temp.id('alfa'))::text, 'a Administradora que não é responsável não lê o assunto nem o corpo'
);
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000003');
select is(
  (select row(responsible_seller, proposed_content is null)::text
   from public.list_approvals('fa000000-0000-0000-0000-000000000001') where id = pg_temp.id('p-alfa')),
  '(f,t)', 'nem outro Membro'
);
select is(
  (select count(*)::integer from public.list_approvals('fa000000-0000-0000-0000-000000000001')
   where category = 'sequencia' and proposed_content is not null),
  0, 'nenhuma proposta de Sequência mostra o conteúdo a quem não é responsável'
);

-- 6. Só a Vendedora responsável decide; a Administradora não.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, pg_temp.id('p-alfa')),
  '42501', 'only the responsible seller of the target account decides this sequence', 'a Administradora não decide'
);
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select public.decide_approval(%L, 'recusar', 'conversa')$$, pg_temp.id('p-alfa')),
  '42501', 'only the responsible seller of the target account decides this sequence', 'nem outro Membro'
);
select is(pg_temp.estado(pg_temp.id('p-alfa')), 'pendente', 'e a proposta segue pendente');

-- 7. Aprovar cria a Sequência sem Versão autorizada e sem Envio na fila.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select is(public.decide_approval(pg_temp.id('p-alfa'), 'aprovar', 'conversa'), 'aprovada', 'a Vendedora responsável aprova');
insert into ids select 'seq-alfa', created_sequence_id from private.approvals where id = pg_temp.id('p-alfa');
select is(
  (select row(s.workspace_id, s.owner_user_id, s.status)::text from public.sequences s
   where s.id = pg_temp.id('seq-alfa') and s.target_account_id = pg_temp.id('alfa')::text),
  row('fa000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid, 'ativa')::text,
  'a Sequência criada é da Conta-alvo e da Vendedora responsável'
);
select is(pg_temp.sequencias(pg_temp.id('alfa')), 1, 'uma Sequência só');
select is((select count(*)::integer from private.sequence_authorizations where sequence_id = pg_temp.id('seq-alfa')), 0,
  'sem Versão autorizada: os envios não estão ativados');
select is((select count(*)::integer from private.sequence_step_sends where sequence_id = pg_temp.id('seq-alfa')), 0,
  'e nenhum Envio na fila do Executor');
select is(
  (select jsonb_build_array(d.document -> 'participantesIds', jsonb_array_length(d.document -> 'steps'))
   from private.sequence_documents d where d.sequence_id = pg_temp.id('seq-alfa')),
  jsonb_build_array(jsonb_build_array(pg_temp.id('maria'), pg_temp.id('joao')), 6),
  'o documento tem os dois Contatos e cada passo para cada um'
);
select is(
  (select jsonb_build_array(s -> 'canal', s -> 'contatoId', s -> 'delayDiasUteis', s -> 'assunto')
   from private.sequence_documents d, jsonb_array_elements(d.document -> 'steps') s
   where d.sequence_id = pg_temp.id('seq-alfa') and (s ->> 'ordem')::int = 3),
  jsonb_build_array('email', pg_temp.id('maria'), 3, 'Re: {{empresa}}'),
  'o segundo passo vai primeiro à Maria, depois da espera de 3 dias, com as variáveis'
);
select is(
  (select row(state, proposed_content is null, decided_where, decided_by)::text from private.approvals where id = pg_temp.id('p-alfa')),
  '(aprovada,t,conversa,5a000000-0000-0000-0000-000000000001)', 'decidida, a Aprovação esquece o conteúdo proposto'
);
select is(
  (select note from private.approval_events where approval_id = pg_temp.id('p-alfa') and to_state = 'aprovada'),
  'Sequência criada, envios não ativados', 'o histórico diz que a Sequência foi criada sem ativar os envios'
);
select is(
  (select created_sequence_id from public.list_approvals('fa000000-0000-0000-0000-000000000001') where id = pg_temp.id('p-alfa')),
  pg_temp.id('seq-alfa'), 'a fila devolve a Sequência criada'
);
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, pg_temp.id('p-alfa')),
  '55000', 'the approval was already decided', 'decidir de novo não cria outra'
);
select throws_ok(
  format($$select public.cancel_approval(%L)$$, pg_temp.id('p-alfa')),
  '55000', 'the approval can no longer be cancelled', 'aprovada, ela não se cancela'
);

-- 8. Recusar não cria nada.
select is(public.decide_approval(pg_temp.id('p-gama'), 'recusar', 'conversa'), 'recusada', 'a Vendedora recusa');
select is(pg_temp.sequencias(pg_temp.id('gama')), 0, 'recusar não cria Sequência');
select is(
  (select row(proposed_content is null, created_sequence_id is null)::text from private.approvals where id = pg_temp.id('p-gama')),
  '(t,t)', 'e esquece o conteúdo'
);

-- 9. Corrida: a Conta ganhou Sequência entre a proposta e a decisão. O sistema recusa, com o motivo, e nada é criado.
select public.create_sequence('fa000000-0000-0000-0000-000000000001', pg_temp.id('delta')::text,
  jsonb_build_object('participantesIds', jsonb_build_array(pg_temp.id('davi')), 'steps', '[]'::jsonb), '{}'::jsonb);
select is(public.decide_approval(pg_temp.id('p-delta'), 'aprovar'), 'recusada', 'aprovar depois da corrida dá recusada');
select is(
  (select row(state, failure, decided_by_kind, created_sequence_id, proposed_content is null)::text
   from private.approvals where id = pg_temp.id('p-delta')),
  '(recusada,"a Conta-alvo já tem uma Sequência em andamento",,,t)', 'recusada pelo sistema, com o motivo'
);
select is(pg_temp.sequencias(pg_temp.id('delta')), 1, 'e só a Sequência de antes existe');
select is(
  (select note from private.approval_events where approval_id = pg_temp.id('p-delta') and to_state = 'recusada'),
  'recusada pelo sistema: a Conta-alvo já tem uma Sequência em andamento', 'o histórico guarda o motivo'
);

-- 10. O Contato se descadastrou depois da proposta: recusada pelo sistema.
insert into public.contact_suppressions (workspace_id, kind, value, reason)
values ('fa000000-0000-0000-0000-000000000001', 'domain', 'epsilon.test', 'manual');
select is(public.decide_approval(pg_temp.id('p-eps'), 'aprovar'), 'recusada', 'o Contato suprimido no meio recusa a proposta');
select is(
  (select failure from private.approvals where id = pg_temp.id('p-eps')) || ' / ' || pg_temp.sequencias(pg_temp.id('eps')),
  'um Contato se descadastrou / 0', 'com o motivo, e nada é criado'
);

-- 11. Cancelar e vencer não têm efeito colateral.
delete from public.contact_suppressions where value = 'epsilon.test';
insert into ids select 'p-eps-2', approval_id from pg_temp.propor('aa000000-0000-0000-0000-000000000003', pg_temp.agente('rhetor'),
  pg_temp.id('eps'), array[pg_temp.id('eva')], pg_temp.passos(' 2'));
select lives_ok(format($$select public.cancel_approval(%L)$$, pg_temp.id('p-eps-2')), 'quem pediu cancela a pendente');
select is(
  (select row(state, proposed_content is null)::text from private.approvals where id = pg_temp.id('p-eps-2')),
  '(cancelada,t)', 'cancelada, ela esquece o conteúdo'
);
insert into ids select 'p-eps-3', approval_id from pg_temp.propor('aa000000-0000-0000-0000-000000000003', pg_temp.agente('rhetor'),
  pg_temp.id('eps'), array[pg_temp.id('eva')], pg_temp.passos(' 3'));
update private.approvals set expires_at = now() - interval '1 minute' where id = pg_temp.id('p-eps-3');
select private.expire_approvals();
select is(
  (select row(state, proposed_content is null)::text from private.approvals where id = pg_temp.id('p-eps-3'))
    || ' / ' || pg_temp.sequencias(pg_temp.id('eps')),
  '(expirada,t) / 0', 'vencida, ela esquece o conteúdo e não cria nada'
);

-- 12. O formato da categoria: a Sequência proposta não tem Integração e sempre tem a Conta-alvo.
select throws_ok(
  format($$insert into private.approvals (workspace_id, agent_id, integration_id, action, payload_hash, target_account_id, category)
    values ('fa000000-0000-0000-0000-000000000001', %L, 'hubspot', 'x', 'x', %L, 'sequencia')$$,
    pg_temp.agente('rhetor'), pg_temp.id('alfa')),
  '23514', null, 'a Sequência proposta não passa por Integração'
);
select throws_ok(
  format($$insert into private.approvals (workspace_id, agent_id, action, payload_hash, category)
    values ('fa000000-0000-0000-0000-000000000001', %L, 'x', 'x', 'sequencia')$$, pg_temp.agente('rhetor')),
  '23514', null, 'e sempre tem a Conta-alvo'
);

select * from finish();
rollback;
