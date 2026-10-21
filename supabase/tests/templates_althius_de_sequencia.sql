begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

-- Templates da Althius (ticket 07). Bia é a Vendedora responsável. Ana é Administradora e não é responsável.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@tpl.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ana@tpl.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b7000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'fora@tpl.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b7100000-0000-0000-0000-000000000001', 'empresa', 'Norte Templates');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b7100000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'member', true),
  ('b7100000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000002', 'admin', true);

insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('b7200000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at)
values
  ('b7300000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001',
   'b7000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Sugira um template', 'running', now());

create function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.rhetor() returns uuid language sql as $$
  select id from private.agents
  where workspace_id = 'b7100000-0000-0000-0000-000000000001' and specialty = 'rhetor' and kind = 'padrao'
$$;

select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');
create temporary table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;
insert into ids select 'alfa', id from public.save_target_account(
  'b7100000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.tpl.test');
insert into ids select 'beta', id from public.save_target_account(
  'b7100000-0000-0000-0000-000000000001', 'Beta', 'https://beta.tpl.test');
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where k = 'alfa'), 'Maria Souza', 'Diretora', 'maria@alfa.tpl.test');

insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at)
values (
  'b7100000-0000-0000-0000-000000000001',
  (select id from ids where k = 'alfa'),
  'vaga_linkedin',
  'vagas-alfa',
  'Abriu 12 vagas de vendas',
  now()
);

-- 1. Quem pode chamar.
select ok(
  has_function_privilege('authenticated', 'public.list_althius_sequence_templates()', 'execute')
    and not has_function_privilege('anon', 'public.list_althius_sequence_templates()', 'execute')
    and has_function_privilege('authenticated', 'public.suggest_althius_sequence_template(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.suggest_althius_sequence_template(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)', 'execute'),
  'o Cliente lê e pede sugestão; só o servidor sugere pelo Rhetor'
);

-- 2. O catálogo não traz Contato nem destino.
set local role authenticated;
select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');
select is(
  (select array_agg(id order by id) from public.list_althius_sequence_templates()),
  array['abertura-por-sinal', 'retomada-curta'],
  'os dois templates da Althius estão acessíveis'
);
select ok(
  not exists (
    select 1 from public.list_althius_sequence_templates() t, jsonb_array_elements(t.passos) p
    where p ? 'contatoId' or p ? 'destino' or p ? 'metricas' or p ? 'historico'
  ),
  'nenhum passo do catálogo tem Contato, destino, métrica ou histórico'
);

-- 3. Sem participação, não lê.
select pg_temp.entrar('b7000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.list_althius_sequence_templates()$$,
  '42501', null, 'quem não participa de um Workspace não lê o catálogo'
);

-- 4. O Cliente não edita o original.
select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');
select throws_ok(
  $$update public.althius_sequence_templates set nome = 'Hackeado' where id = 'abertura-por-sinal'$$,
  '42501', null, 'o Cliente não altera o template original'
);
select throws_ok(
  $$insert into public.althius_sequence_templates (id, nome, resumo, passos) values ('meu', 'Meu', 'Pessoal', '[]'::jsonb)$$,
  '42501', null, 'o Cliente não cria template no catálogo da Althius'
);
select throws_ok(
  $$delete from public.althius_sequence_templates where id = 'retomada-curta'$$,
  '42501', null, 'o Cliente não apaga o template original'
);

-- 5. Sugestão com Sinal real: só o template existente, sem envio.
select is(
  (select template_id from public.suggest_althius_sequence_template(
    'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))),
  'abertura-por-sinal',
  'a sugestão devolve o template existente'
);
reset role;
select ok(
  (select justification from public.suggest_althius_sequence_template(
    'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
    like '%Abriu 12 vagas de vendas%'
    and (select justification from public.suggest_althius_sequence_template(
      'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
      not like '%comprovad%'
    and (select justification from public.suggest_althius_sequence_template(
      'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
      !~* 'aumenta|convers[aã]o|[0-9]+ *%',
  'a justificativa cita o Sinal real e não alega eficácia'
);
select is(
  (select count(*)::integer from public.sequences where workspace_id = 'b7100000-0000-0000-0000-000000000001')
    + (select count(*)::integer from private.sequence_authorizations a
       join public.sequences s on s.id = a.sequence_id
       where s.workspace_id = 'b7100000-0000-0000-0000-000000000001')
    + (select count(*)::integer from private.sequence_step_sends where workspace_id = 'b7100000-0000-0000-0000-000000000001'),
  0,
  'sugerir não cria Sequência, autorização nem envio'
);
set local role authenticated;
select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');

-- 6. Sem Sinal, não escolhe.
select is(
  (select outcome from public.suggest_althius_sequence_template(
    'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'beta'))),
  'sem_contexto',
  'sem Sinal recente a sugestão não escolhe template'
);
select is(
  (select template_id from public.suggest_althius_sequence_template(
    'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'beta'))),
  null,
  'sem contexto o id fica vazio'
);

-- 7. Administrador que não é o responsável não sugere.
select pg_temp.entrar('b7000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.suggest_althius_sequence_template('b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))$$,
  '42501', null, 'Administrador sem responsabilidade não sugere template da Conta'
);

-- 8. Teto atingido barra e não gasta de novo.
reset role;
insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
values ('b7100000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 1);
insert into private.automation_spend (workspace_id, scope, month, spent)
values ('b7100000-0000-0000-0000-000000000001', 'acao:agentes', date_trunc('month', now())::date, 1);
set local role authenticated;
select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');
select is(
  (select outcome from public.suggest_althius_sequence_template(
    'b7100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))),
  'teto_atingido',
  'o teto de Execuções de Agentes barra a sugestão'
);
reset role;
select is(
  (select spent from private.automation_spend
   where workspace_id = 'b7100000-0000-0000-0000-000000000001' and scope = 'acao:agentes'),
  1::numeric,
  'a sugestão barrada não soma gasto no teto'
);

-- 9. Editar o original não muda a Sequência já copiada.
select pg_temp.entrar('b7000000-0000-0000-0000-000000000001');
insert into ids select 'seq', id from public.create_sequence(
  'b7100000-0000-0000-0000-000000000001',
  (select id from ids where k = 'alfa')::text,
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select id from ids where k = 'maria')),
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'copia-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select id from ids where k = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura com o Sinal', 'assunto', 'Oi', 'corpo', 'Oi'
    ))
  ),
  '{"totalSteps": 1}'::jsonb
);
reset role;
update public.althius_sequence_templates
set passos = jsonb_build_array(jsonb_build_object('id', 'outro', 'ordem', 1, 'canal', 'email', 'titulo', 'Texto do original mudou'))
where id = 'abertura-por-sinal';
select is(
  (select document -> 'steps' -> 0 ->> 'titulo' from private.sequence_documents
   where sequence_id = (select id from ids where k = 'seq')),
  'Abertura com o Sinal',
  'editar o template original não propaga para a Sequência já criada'
);

-- 10. O Rhetor recebe a sugestão pelo servidor; o Ethos não. Nada é enviado.
-- Os ids dos Agentes saem de private antes da troca de papel: o service_role não lê o schema private.
insert into ids select 'rhetor', pg_temp.rhetor();
insert into ids select 'ethos', id from private.agents
  where workspace_id = 'b7100000-0000-0000-0000-000000000001' and specialty = 'ethos' and kind = 'padrao';
set local role service_role;
select is(
  (select template_id from public.agent_suggest_althius_sequence_template(
    'b7300000-0000-0000-0000-000000000001', (select id from ids where k = 'rhetor'), (select id from ids where k = 'beta'))),
  null,
  'o Rhetor, sem Sinal, também não inventa template'
);
select throws_ok(
  $$select public.agent_suggest_althius_sequence_template(
    'b7300000-0000-0000-0000-000000000001',
    (select id from ids where k = 'ethos'),
    (select id from ids where k = 'alfa'))$$,
  '42501', 'sequence: only the cadence specialist proposes sequences', 'só o Rhetor sugere template'
);
reset role;
select is(
  (select count(*)::integer from private.sequence_step_sends
   where workspace_id = 'b7100000-0000-0000-0000-000000000001'),
  0,
  'a sugestão do Rhetor não grava envio'
);

select * from finish();
rollback;
