begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

-- O histórico da Conversa leva ao Agente o desfecho das Aprovações que ele propôs (cadencia-pela-ia 01, US 6): a Bia
-- (Membro, Vendedora responsável) recusa a Sequência do Rhetor e pede ajuste na mesma Conversa.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fb000000-0000-0000-0000-000000000001', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'member', true);
-- c1: a Alfa (pendente, depois recusada pela Bia); c2: a Beta (recusada pelo sistema); c3: a Gama (aprovada).
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'coordenada'),
  ('cb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'coordenada'),
  ('cb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'coordenada');

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.rhetor() returns uuid language sql as $$
  select id from private.agents
  where workspace_id = 'fb000000-0000-0000-0000-000000000001' and specialty = 'rhetor' and kind = 'padrao'
$$;
create temporary table ids (k text primary key, id uuid) on commit drop;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where k = p $$;
-- Uma Execução da Bia na Conversa, criada há `p_minutos` minutos.
create function pg_temp.execucao(p_id text, p_conversa text, p_pedido text, p_status text, p_minutos integer)
returns void language sql as $$
  insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status,
                                  started_at, created_at)
  values (p_id::uuid, 'fb000000-0000-0000-0000-000000000001', p_conversa::uuid, '5b000000-0000-0000-0000-000000000001',
    gen_random_uuid(), p_pedido, p_status, case when p_status = 'running' then now() end,
    now() - make_interval(mins => p_minutos))
$$;
create function pg_temp.terminar(p_id text) returns void language sql as $$
  update private.agent_runs set status = 'succeeded', finished_at = now() where id = p_id::uuid
$$;
create function pg_temp.propor(p_run text, p_conta uuid, p_contatos uuid[]) returns uuid language sql as $$
  select approval_id from public.agent_propose_sequence(p_run::uuid, pg_temp.rhetor(), p_conta, p_contatos,
    jsonb_build_array(jsonb_build_object('esperaEmDias', 0, 'assunto', 'Oi {{primeiro_nome}}', 'corpo', 'Oi {{nome}}.')),
    'A conta abriu vagas')
$$;
create function pg_temp.decidir(p_aprovacao uuid, p_decisao text) returns text language plpgsql as $$
declare
  v text;
begin
  perform pg_temp.entrar_como('5b000000-0000-0000-0000-000000000001');
  set local role authenticated;
  v := public.decide_approval(p_aprovacao, p_decisao, 'conversa');
  reset role;
  return v;
end;
$$;
-- A resposta que o Agente recebe no histórico para o pedido `p_pedido`, ao reservar a Execução `p_run`.
create function pg_temp.resposta(p_run text, p_pedido text) returns text language sql as $$
  select h ->> 'answer'
  from public.claim_agent_run(p_run::uuid) c, jsonb_array_elements(c -> 'history') h
  where h ->> 'request' = p_pedido
$$;

select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000001');
insert into ids select 'alfa', id from public.save_target_account('fb000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test');
insert into ids select 'beta', id from public.save_target_account('fb000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
insert into ids select 'gama', id from public.save_target_account('fb000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test');
insert into ids select 'maria', id from public.create_contact(pg_temp.id('alfa'), 'Maria Souza', 'Diretora', 'maria@alfa.test');
insert into ids select 'pedro', id from public.create_contact(pg_temp.id('beta'), 'Pedro Beta', 'CTO', 'pedro@beta.test');
insert into ids select 'gil', id from public.create_contact(pg_temp.id('gama'), 'Gil Gama', 'CEO', 'gil@gama.test');
update private.agent_permissions set permission = 'propor' where agent_id = pg_temp.rhetor();

-- 1. A Alfa: o Rhetor propõe e responde; enquanto ninguém decide, o histórico diz que está pendente.
select pg_temp.execucao('ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001',
  'Monte uma Sequência para a Alfa', 'running', 30);
insert into ids values ('p-alfa', pg_temp.propor('ab000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), array[pg_temp.id('maria')]));
select private.append_run_event('ab000000-0000-0000-0000-000000000001', 'texto', pg_temp.rhetor(), 'Rhetor',
  '{"texto": "Propus a Sequência para a Alfa."}');
select pg_temp.terminar('ab000000-0000-0000-0000-000000000001');
select pg_temp.execucao('ab000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001',
  'Já decidiram?', 'queued', 20);
select is(
  pg_temp.resposta('ab000000-0000-0000-0000-000000000002', 'Monte uma Sequência para a Alfa'),
  E'Rhetor: Propus a Sequência para a Alfa.\n\nAprovação "Sequência de E-mail para Alfa": pendente, ninguém decidiu ainda.',
  'o histórico traz a resposta e a Aprovação proposta naquela Execução, pendente'
);
select pg_temp.terminar('ab000000-0000-0000-0000-000000000002');

-- 2. A Bia recusa na Conversa e pede ajuste: o Rhetor recebe a recusa no histórico.
select is(pg_temp.decidir(pg_temp.id('p-alfa'), 'recusar'), 'recusada', 'a Bia recusa a proposta');
select pg_temp.execucao('ab000000-0000-0000-0000-000000000003', 'cb000000-0000-0000-0000-000000000001',
  'Recusei: troque o primeiro e-mail', 'queued', 10);
select is(
  pg_temp.resposta('ab000000-0000-0000-0000-000000000003', 'Monte uma Sequência para a Alfa'),
  E'Rhetor: Propus a Sequência para a Alfa.\n\nAprovação "Sequência de E-mail para Alfa": recusada por quem decide. Nada foi feito.',
  'depois da recusa, o pedido seguinte recebe a Aprovação recusada por quem decide'
);
select is((select count(*)::integer from public.sequences where target_account_id = pg_temp.id('alfa')::text), 0,
  'e a recusa não criou Sequência');

-- 3. A Beta: o Pedro se descadastra antes da decisão; aprovar vira recusa do sistema, com o motivo.
select pg_temp.execucao('ab000000-0000-0000-0000-000000000004', 'cb000000-0000-0000-0000-000000000002',
  'Monte uma Sequência para a Beta', 'running', 30);
insert into ids values ('p-beta', pg_temp.propor('ab000000-0000-0000-0000-000000000004', pg_temp.id('beta'), array[pg_temp.id('pedro')]));
select pg_temp.terminar('ab000000-0000-0000-0000-000000000004');
insert into public.contact_suppressions (workspace_id, kind, value, reason)
values ('fb000000-0000-0000-0000-000000000001', 'email', 'pedro@beta.test', 'manual');
select pg_temp.decidir(pg_temp.id('p-beta'), 'aprovar');
select pg_temp.execucao('ab000000-0000-0000-0000-000000000005', 'cb000000-0000-0000-0000-000000000002',
  'E agora?', 'queued', 10);
select is(
  pg_temp.resposta('ab000000-0000-0000-0000-000000000005', 'Monte uma Sequência para a Beta'),
  'Aprovação "Sequência de E-mail para Beta": recusada pelo sistema: um Contato se descadastrou. Nada foi feito.',
  'a recusa do sistema chega com o motivo, mesmo sem resposta em texto naquela Execução'
);

-- 4. A Gama: aprovada.
select pg_temp.execucao('ab000000-0000-0000-0000-000000000006', 'cb000000-0000-0000-0000-000000000003',
  'Monte uma Sequência para a Gama', 'running', 30);
insert into ids values ('p-gama', pg_temp.propor('ab000000-0000-0000-0000-000000000006', pg_temp.id('gama'), array[pg_temp.id('gil')]));
select pg_temp.terminar('ab000000-0000-0000-0000-000000000006');
select pg_temp.decidir(pg_temp.id('p-gama'), 'aprovar');
select pg_temp.execucao('ab000000-0000-0000-0000-000000000007', 'cb000000-0000-0000-0000-000000000003',
  'Pode ativar?', 'queued', 10);
select is(
  pg_temp.resposta('ab000000-0000-0000-0000-000000000007', 'Monte uma Sequência para a Gama'),
  'Aprovação "Sequência de E-mail para Gama": aprovada.',
  'a Aprovação aprovada chega como aprovada'
);

select * from finish();
rollback;
