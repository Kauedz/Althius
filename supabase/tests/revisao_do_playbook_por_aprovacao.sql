begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(57);

-- A Revisão do Playbook por Aprovação (CRM-09, ADR-0010). Norte: Ana (Admin), Bruno (Membro, pede aos Agentes) e Dora
-- (ex-Administradora). Sul: Carla (Admin).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('59000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f9000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f9000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'admin', true),
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'member', true),
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000004', 'admin', false),
  ('f9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000003', 'admin', true);

-- Duas Conversas do Bruno, cada uma com uma Execução rodando, e uma Execução já terminada.
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('c9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'coordenada'),
  ('c9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('a9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   '59000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Ajuste o ICP e as Personas', 'running', now()),
  ('a9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000002',
   '59000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Outra ideia de ICP', 'running', now());
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status,
                                started_at, finished_at) values
  ('a9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   '59000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Pedido antigo', 'succeeded', now() - interval '1 hour', now());

create function pg_temp.agente(p_workspace text, p_especialidade text) returns uuid language sql as $$
  select id from private.agents where workspace_id = p_workspace::uuid and specialty = p_especialidade and kind = 'padrao'
$$;
create function pg_temp.norte(p_especialidade text) returns uuid language sql as $$
  select pg_temp.agente('f9000000-0000-0000-0000-000000000001', p_especialidade)
$$;
create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.propor(p_run text, p_agente uuid, p_secao text, p_conteudo jsonb)
returns table (approval_id uuid, outcome text, section_name text, base_version integer) language sql as $$
  select * from public.agent_propose_playbook_revision(p_run::uuid, p_agente, p_secao, p_conteudo,
    'Os três últimos fechamentos foram em indústrias de 200 a 500 pessoas')
$$;
create function pg_temp.r1(p_agente uuid, p_secao text, p_conteudo jsonb)
returns table (approval_id uuid, outcome text, section_name text, base_version integer) language sql as $$
  select * from pg_temp.propor('a9000000-0000-0000-0000-000000000001', p_agente, p_secao, p_conteudo)
$$;
create function pg_temp.estado(p uuid) returns text language sql as $$ select state from private.approvals where id = p $$;
create function pg_temp.versoes(p_workspace text, p_secao text) returns integer language sql as $$
  select count(*)::integer from private.playbook_section_versions where workspace_id = p_workspace::uuid and section = p_secao
$$;
create temporary table ap (k text primary key, id uuid) on commit drop;

-- 1. Propor é só do servidor; ler e decidir são do app, nunca de quem não entrou.
select ok(
  has_function_privilege('service_role', 'public.agent_propose_playbook_revision(uuid, uuid, text, jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_propose_playbook_revision(uuid, uuid, text, jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.agent_propose_playbook_revision(uuid, uuid, text, jsonb, text)', 'execute')
    and has_function_privilege('authenticated', 'public.decide_approval(uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.decide_approval(uuid, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.list_approvals(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_approvals(uuid)', 'execute'),
  'propor pelo servidor; ler e decidir pelo app, e o anônimo não decide nem lê'
);

-- 2. O Scopus propõe o ICP, que ainda não tem versão: nasce uma revisão pendente, sem Integração.
insert into ap select 'icp1', approval_id from pg_temp.r1(pg_temp.norte('scopus'), 'icp',
  '{"texto": "Indústrias de 200 a 500 pessoas no Sul e no Sudeste"}');
select is(
  (select row(state, category, integration_id, playbook_section, base_version, requested_by, run_id)::text
   from private.approvals where id = (select id from ap where k = 'icp1')),
  '(pendente,revisao,,icp,0,59000000-0000-0000-0000-000000000002,a9000000-0000-0000-0000-000000000001)',
  'a revisão nasce pendente, sem Integração, com a seção, a versão de partida, quem pediu e a Execução'
);
select is(
  (select agent_id from private.approvals where id = (select id from ap where k = 'icp1')), pg_temp.norte('scopus'),
  'e guarda qual Agente propôs'
);
select is(
  (select proposed_content from private.approvals where id = (select id from ap where k = 'icp1')),
  '{"texto": "Indústrias de 200 a 500 pessoas no Sul e no Sudeste", "linhas": []}'::jsonb,
  'o conteúdo proposto fica guardado, com as duas chaves'
);
select is(pg_temp.versoes('f9000000-0000-0000-0000-000000000001', 'icp'), 0, 'propor não muda o Playbook');
select is(
  (select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
   from private.approvals where id = (select id from ap where k = 'icp1')),
  true, 'e vence em 7 dias, como as outras Aprovações'
);

-- 3. A mesma proposta na mesma Execução não duplica.
select is(
  (select row(approval_id, outcome)::text from pg_temp.r1(pg_temp.norte('scopus'), 'icp',
    '{"linhas": [], "texto": "Indústrias de 200 a 500 pessoas no Sul e no Sudeste"}')),
  row((select id from ap where k = 'icp1'), 'existente')::text,
  'repetir a proposta devolve a mesma Aprovação (existente)'
);
select is(
  (select count(*)::integer from private.approvals where category = 'revisao'), 1, 'e não cria outra'
);

-- 4. Só o Scopus e o Ethos, e só nas seções da Especialidade.
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('rhetor'), 'icp', '{"texto": "x"}')$$,
  '42501', 'the agent specialty does not propose this playbook section', 'o Rhetor não propõe o ICP'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('oraculum'), 'icp', '{"texto": "x"}')$$,
  '42501', 'the agent specialty does not propose this playbook section', 'o Oraculum lê o ICP, mas não o propõe'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('scopus'), 'personas', '{"texto": "x"}')$$,
  '42501', 'the agent specialty does not propose this playbook section', 'o Scopus não propõe as Personas'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('ethos'), 'empresa', '{"texto": "x"}')$$,
  '42501', 'the agent specialty does not propose this playbook section', 'a Empresa não é de nenhuma Especialidade'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('scopus'), 'nao_existe', '{"texto": "x"}')$$,
  '22023', 'unknown playbook section', 'uma seção que não existe é recusada'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('scopus'), 'mercado', '{"html": "<b>x</b>"}')$$,
  '22023', 'invalid playbook content', 'um conteúdo fora do formato do Playbook é recusado'
);
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.agente('f9000000-0000-0000-0000-000000000002', 'scopus'), 'icp', '{"texto": "x"}')$$,
  'P0002', 'agent not found', 'o Agente de outro Workspace não propõe aqui'
);
select throws_ok(
  $$select * from pg_temp.propor('a9000000-0000-0000-0000-000000000003', pg_temp.norte('scopus'), 'icp', '{"texto": "x"}')$$,
  '55000', 'run is not running', 'uma Execução que já terminou não propõe'
);
update public.workspace_memberships set active = false
where workspace_id = 'f9000000-0000-0000-0000-000000000001' and user_id = '59000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('scopus'), 'mercado', '{"texto": "TAM de 4 mil indústrias"}')$$,
  '42501', 'active workspace membership required', 'quem pediu e saiu do Workspace não faz o Agente propor'
);
update public.workspace_memberships set active = true
where workspace_id = 'f9000000-0000-0000-0000-000000000001' and user_id = '59000000-0000-0000-0000-000000000002';

-- 5. A revisão sempre pede um Administrador, mesmo com a Permissão Executar numa Integração.
update private.agent_permissions set permission = 'executar'
where agent_id = pg_temp.norte('scopus') and integration_id = 'hubspot';
insert into ap select 'mercado', approval_id from pg_temp.r1(pg_temp.norte('scopus'), 'mercado',
  '{"texto": "TAM de 4 mil indústrias", "linhas": [{"segmento": "Indústria", "tam": "4000"}]}');
select is(pg_temp.estado((select id from ap where k = 'mercado')), 'pendente', 'com Executar, a revisão nasce pendente');

-- 6. Todo Participante ativo vê a revisão na fila, com a seção e o conteúdo enquanto pendente.
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000002');
select is(
  (select row(category, playbook_section, base_version, integration_id, proposed_content ->> 'texto')::text
   from public.list_approvals('f9000000-0000-0000-0000-000000000001') where id = (select id from ap where k = 'icp1')),
  '(revisao,icp,0,,"Indústrias de 200 a 500 pessoas no Sul e no Sudeste")',
  'o Membro vê a revisão pendente: categoria, seção, versão de partida e o conteúdo proposto'
);

-- 7. Só um Administrador ativo decide a revisão.
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'icp1')),
  '42501', 'only administrators can decide approvals', 'o Membro não decide a revisão'
);
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000004');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'icp1')),
  '42501', 'active workspace membership required', 'quem já foi Administrador e saiu não decide'
);
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'icp1')),
  '42501', 'active workspace membership required', 'a Administradora de outro Workspace não decide'
);
select is(pg_temp.estado((select id from ap where k = 'icp1')), 'pendente', 'e nada disso decidiu a revisão');

-- 8. A Ana aprova: o ICP ganha exatamente uma versão, com o conteúdo, e ela é a autora.
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'icp1'), 'aprovar', 'fila'), 'aprovada', 'a Administradora aprova');
select is(pg_temp.versoes('f9000000-0000-0000-0000-000000000001', 'icp'), 1, 'o ICP ganha exatamente uma versão');
select is(
  (select row(version, content ->> 'texto', created_by)::text from private.playbook_section_versions
   where workspace_id = 'f9000000-0000-0000-0000-000000000001' and section = 'icp'),
  '(1,"Indústrias de 200 a 500 pessoas no Sul e no Sudeste",59000000-0000-0000-0000-000000000001)',
  'a versão nova tem o conteúdo aprovado e a Administradora como autora'
);
select is(
  (select row(applied_version, decided_by, decided_where, agent_id = pg_temp.norte('scopus'), run_id)::text
   from private.approvals where id = (select id from ap where k = 'icp1')),
  '(1,59000000-0000-0000-0000-000000000001,fila,t,a9000000-0000-0000-0000-000000000001)',
  'a Aprovação guarda a versão gravada, quem decidiu, onde, e qual Agente e Execução propuseram'
);
select is(
  (select proposed_content from private.approvals where id = (select id from ap where k = 'icp1')), null,
  'decidida, a revisão esquece o conteúdo proposto (fica só o registro)'
);
select is(
  (select proposed_content from public.list_approvals('f9000000-0000-0000-0000-000000000001')
   where id = (select id from ap where k = 'icp1')), null,
  'e a fila não devolve conteúdo de revisão decidida'
);
select is(
  (select array_agg(row(e.to_state, e.actor_user_id, e.note)::text order by e.n)
   from public.list_approval_events((select id from ap where k = 'icp1')) with ordinality e(from_state, to_state, actor_user_id, note, created_at, n)),
  array['(pendente,,"proposta do Scopus")', '(aprovada,59000000-0000-0000-0000-000000000001,"versão 1 gravada")'],
  'o histórico guarda cada estado, o autor e a versão gravada'
);
select throws_ok(
  format($$select public.decide_approval(%L, 'recusar')$$, (select id from ap where k = 'icp1')),
  '55000', 'the approval was already decided', 'uma revisão decidida não se decide de novo'
);
select throws_ok(
  format($$select public.cancel_approval(%L)$$, (select id from ap where k = 'icp1')),
  '55000', 'the approval can no longer be cancelled', 'nem se cancela depois de gravar a versão'
);

-- 9. A versão aprovada é a do Workspace: os Agentes e todo participante leem a mesma, e outro Workspace não a vê.
reset role;
select is(
  (select s -> 'content' ->> 'texto' from jsonb_array_elements(public.playbook_for_specialty(
    'f9000000-0000-0000-0000-000000000001', 'scopus')) s where s ->> 'section' = 'icp'),
  'Indústrias de 200 a 500 pessoas no Sul e no Sudeste', 'o Scopus passa a ler o ICP aprovado'
);
select is(
  (select s -> 'content' ->> 'texto' from jsonb_array_elements(public.playbook_for_specialty(
    'f9000000-0000-0000-0000-000000000001', 'oraculum')) s where s ->> 'section' = 'icp'),
  'Indústrias de 200 a 500 pessoas no Sul e no Sudeste', 'e o Oraculum, que também lê o ICP, lê o mesmo'
);
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000002');
select is(
  (public.get_playbook_section('f9000000-0000-0000-0000-000000000001', 'icp') ->> 'version')::integer, 1,
  'o Membro lê a mesma versão: o ICP é do Workspace, não uma cópia por participante'
);
reset role;
select is(pg_temp.versoes('f9000000-0000-0000-0000-000000000002', 'icp'), 0, 'e o ICP do Sul continua vazio');

-- 10. Recusar só registra: o Playbook não muda.
insert into ap select 'personas', approval_id from pg_temp.r1(pg_temp.norte('ethos'), 'personas',
  '{"texto": "Comitê de três papéis", "linhas": [{"papel": "Decisor", "cargo": "Diretor industrial"}]}');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'personas'), 'recusar', 'conversa'), 'recusada',
  'a Administradora recusa as Personas na Conversa');
reset role;
select is(pg_temp.versoes('f9000000-0000-0000-0000-000000000001', 'personas'), 0, 'recusar não muda o Playbook');
select is(
  (select row(decided_by, decided_where, applied_version, proposed_content)::text from private.approvals
   where id = (select id from ap where k = 'personas')),
  '(59000000-0000-0000-0000-000000000001,conversa,,)', 'e guarda quem recusou e onde, sem o conteúdo'
);

-- 11. Uma proposta igual à versão vigente não muda nada e é recusada.
select throws_ok(
  $$select * from pg_temp.r1(pg_temp.norte('scopus'), 'icp', '{"texto": "Indústrias de 200 a 500 pessoas no Sul e no Sudeste"}')$$,
  '22023', 'the revision does not change the playbook section', 'propor o que já vale é recusado'
);

-- 12. Duas propostas do mesmo ICP: aprovar uma deixa a outra desatualizada, e ela não sobrescreve nada depois.
insert into ap select 'icp-a', approval_id from pg_temp.r1(pg_temp.norte('scopus'), 'icp', '{"texto": "ICP A"}');
insert into ap select 'icp-b', approval_id from pg_temp.propor('a9000000-0000-0000-0000-000000000002',
  pg_temp.norte('scopus'), 'icp', '{"texto": "ICP B"}');
select is(
  (select array_agg(base_version order by k) from private.approvals join ap using (id) where k in ('icp-a', 'icp-b')),
  array[1, 1], 'as duas partem da versão 1'
);
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'icp-a'), 'aprovar'), 'aprovada', 'a Ana aprova a proposta A');
reset role;
select is(
  (select row(state, proposed_content)::text from private.approvals where id = (select id from ap where k = 'icp-b')),
  '(desatualizada,)', 'a proposta B fica desatualizada e esquece o conteúdo'
);
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'icp-b')),
  '55000', 'the approval was already decided', 'e não se aprova mais'
);
reset role;
select is(
  (select content ->> 'texto' from private.playbook_section_versions
   where workspace_id = 'f9000000-0000-0000-0000-000000000001' and section = 'icp' order by version desc limit 1),
  'ICP A', 'o ICP vigente é o aprovado, nunca o desatualizado'
);

-- 13. O Administrador salvou a seção direto: a revisão pendente dela fica desatualizada.
insert into ap select 'icp-c', approval_id from pg_temp.r1(pg_temp.norte('scopus'), 'icp', '{"texto": "ICP C"}');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select public.save_playbook_section('f9000000-0000-0000-0000-000000000001', 'icp', '{"texto": "ICP escrito pela Ana"}');
reset role;
select is(
  (select array_agg(row(to_state, actor_user_id)::text order by id)
   from private.approval_events where approval_id = (select id from ap where k = 'icp-c')),
  array['(pendente,)', '(desatualizada,59000000-0000-0000-0000-000000000001)'],
  'salvar a seção deixa a revisão pendente desatualizada, com quem salvou no histórico'
);

-- 14. Mesmo sem o aviso da versão nova, a aprovação confere a versão de partida e não sobrescreve.
insert into ap select 'icp-d', approval_id from pg_temp.r1(pg_temp.norte('scopus'), 'icp', '{"texto": "ICP D"}');
alter table private.playbook_section_versions disable trigger playbook_version_outdates_revisions;
select private.write_playbook_version('f9000000-0000-0000-0000-000000000001', 'icp', '{"texto": "Gravado por fora"}');
alter table private.playbook_section_versions enable trigger playbook_version_outdates_revisions;
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'icp-d'), 'aprovar'), 'desatualizada',
  'a base mudou: aprovar devolve desatualizada');
reset role;
select is(
  (select content ->> 'texto' from private.playbook_section_versions
   where workspace_id = 'f9000000-0000-0000-0000-000000000001' and section = 'icp' order by version desc limit 1),
  'Gravado por fora', 'e a versão vigente não é sobrescrita'
);

-- 15. A revisão pendente vencida expira e esquece o conteúdo.
insert into ap select 'objecoes', approval_id from pg_temp.r1(pg_temp.norte('ethos'), 'objecoes', '{"texto": "Preço alto"}');
update private.approvals set expires_at = now() - interval '1 minute' where id = (select id from ap where k = 'objecoes');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000002');
select is(
  (select row(state, proposed_content)::text from public.list_approvals('f9000000-0000-0000-0000-000000000001')
   where id = (select id from ap where k = 'objecoes')),
  '(expirada,)', 'depois de 7 dias, a revisão expira sem conteúdo'
);

-- 16. Quem pediu cancela a revisão pendente.
reset role;
insert into ap select 'processo', approval_id from pg_temp.r1(pg_temp.norte('ethos'), 'processo_de_compra',
  '{"texto": "Três etapas"}');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.cancel_approval(%L)$$, (select id from ap where k = 'processo')),
  'quem pediu cancela a revisão pendente');
reset role;
select is(pg_temp.estado((select id from ap where k = 'processo')), 'cancelada', 'e ela fica cancelada');

-- 17. As Aprovações de ação continuam como eram: exigem a Integração e não ficam desatualizadas.
select throws_ok(
  $$insert into private.approvals (workspace_id, agent_id, action, payload_hash)
    values ('f9000000-0000-0000-0000-000000000001', pg_temp.norte('scopus'), 'Sem Integração', 'x')$$,
  '23514', null, 'uma Aprovação de ação sem Integração é recusada'
);
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('f9000000-0000-0000-0000-000000000001', 'hubspot', '59000000-0000-0000-0000-000000000001');
insert into ap select 'acao', approval_id from public.propose_agent_action('a9000000-0000-0000-0000-000000000001',
  pg_temp.norte('ethos'), 'hubspot', 'Criar a empresa Alfa no HubSpot', '{"name": "Alfa"}');
select is(
  (select row(category, integration_id, state)::text from private.approvals where id = (select id from ap where k = 'acao')),
  '(acao,hubspot,pendente)', 'propor uma ação segue igual, na categoria ação'
);

-- 18. Excluir um Agente criado leva as revisões dele.
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
insert into ap select 'criado', public.create_agent('f9000000-0000-0000-0000-000000000001', 'ethos', 'Indústria');
reset role;
insert into ap select 'do-criado', approval_id from pg_temp.r1((select id from ap where k = 'criado'), 'dor_e_percepcao',
  '{"texto": "Paradas de linha"}');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select lives_ok(format($$select public.delete_agent(%L)$$, (select id from ap where k = 'criado')),
  'a Administradora exclui o Agente criado com revisão pendente');
reset role;
select is((select count(*)::integer from private.approvals where id = (select id from ap where k = 'do-criado')), 0,
  'e a revisão dele vai junto');

-- 19. Apagar um Contato cancela a revisão pendente que o cita, e ela esquece o conteúdo.
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
insert into ap select 'conta', id from public.save_target_account('f9000000-0000-0000-0000-000000000001',
  'Fundição Alvorada', 'https://fundicao-alvorada.test');
insert into ap select 'contato', id from public.create_contact((select id from ap where k = 'conta'),
  'Mariana Quintela Prado', 'Diretora industrial', 'mariana.prado@fundicao-alvorada.test');
reset role;
insert into ap select 'cita', approval_id from pg_temp.r1(pg_temp.norte('ethos'), 'personas',
  '{"linhas": [{"papel": "Decisor", "cargo": "Diretora industrial, como Mariana Quintela Prado"}]}');
insert into ap select 'nao-cita', approval_id from pg_temp.r1(pg_temp.norte('ethos'), 'objecoes', '{"texto": "Prazo de implantação"}');
select pg_temp.entrar_como('59000000-0000-0000-0000-000000000001');
select public.erase_contact((select id from ap where k = 'contato'), 'Mariana Quintela Prado');
reset role;
select is(
  (select row(state, proposed_content)::text from private.approvals where id = (select id from ap where k = 'cita')),
  '(cancelada,)', 'a revisão que citava o Contato apagado é cancelada sem o conteúdo'
);
select is(pg_temp.estado((select id from ap where k = 'nao-cita')), 'pendente', 'e a que não o cita continua pendente');

select * from finish();
rollback;
