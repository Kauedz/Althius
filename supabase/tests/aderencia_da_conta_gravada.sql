begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(38);

-- A Aderência da Conta-alvo gravada (kanban-de-prospeccao 08). Norte: Bia (Membro, Vendedora responsável pelas Contas),
-- Ana (Administradora, não é responsável) e Caio (Membro, pede ao Scopus numa Conversa dele). Sul: Davi.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5f000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5f000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'davi@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('ff000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('ff000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'member', true),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000002', 'admin', true),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000003', 'member', true),
  ('ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000004', 'admin', true);

insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cf000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000003', 'coordenada'),
  ('cf000000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000004', 'coordenada');
-- r1: pedido do Caio no Norte; r2: pedido do Davi no Sul.
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('af000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001',
   '5f000000-0000-0000-0000-000000000003', gen_random_uuid(), 'Avalie as Contas', 'running', now()),
  ('af000000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000002',
   '5f000000-0000-0000-0000-000000000004', gen_random_uuid(), 'Avalie as Contas', 'running', now());

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.agente(p_workspace uuid, p_especialidade text) returns uuid language sql as $$
  select id from private.agents where workspace_id = p_workspace and specialty = p_especialidade and kind = 'padrao'
$$;
create temporary table ids (k text primary key, id uuid) on commit drop;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids where k = p $$;
create function pg_temp.estagio(p uuid) returns text language sql as $$
  select coalesce((select stage from private.prospecting_stages where target_account_id = p), 'descoberta')
$$;
create function pg_temp.aderencia(p uuid) returns text language sql as $$
  select fit from private.account_fit where target_account_id = p
$$;
create function pg_temp.propor(p_run text, p_agente uuid, p_conta uuid, p_fit text, p_motivo text)
returns table (approval_id uuid, outcome text, account_name text) language sql as $$
  select * from public.agent_propose_account_fit(p_run::uuid, p_agente, p_conta, p_fit, p_motivo)
$$;

-- As Contas da Bia (ela é a Vendedora responsável por quem cria a Conta). A Gama fica sem responsável; a Delta é do Sul.
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000001');
insert into ids select 'alfa', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test');
insert into ids select 'beta', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
insert into ids select 'epsilon', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Epsilon', 'https://epsilon.test');
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('df000000-0000-0000-0000-000000000003', 'ff000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test',
   '5f000000-0000-0000-0000-000000000001');
insert into ids values ('gama', 'df000000-0000-0000-0000-000000000003');
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000004');
insert into ids select 'delta', id from public.save_target_account('ff000000-0000-0000-0000-000000000002', 'Delta', 'https://delta.test');

-- 1. As tabelas não se leem por fora; a pessoa grava e lê pelo app; o Scopus propõe só pelo servidor.
select ok(
  not has_table_privilege('authenticated', 'private.account_fit', 'select')
    and not has_table_privilege('service_role', 'private.account_fit_history', 'select')
    and has_function_privilege('authenticated', 'public.set_account_fit(uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.set_account_fit(uuid, uuid, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.list_account_fits(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_propose_account_fit(uuid, uuid, uuid, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.agent_propose_account_fit(uuid, uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'private.apply_account_fit(uuid, uuid, text, text, text, uuid, uuid, uuid)', 'execute'),
  'as permissões: tabelas fechadas, a pessoa pelo app, o Scopus só pelo servidor'
);

-- 2. Conta sem linha está sem avaliação.
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.list_account_fits('ff000000-0000-0000-0000-000000000001')), 0,
  'nenhuma Conta avaliada: todas sem avaliação');

-- 3. A Bia grava Fit na Alfa: a Conta vai para Fit, com o evento no histórico do estágio.
select is(public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'fit', 'Setor e porte do ICP'),
  true, 'a Vendedora responsável grava Fit');
select is(pg_temp.estagio(pg_temp.id('alfa')), 'fit', 'gravar Fit leva o cartão a Fit');
select is(
  (select event from private.prospecting_stage_history where target_account_id = pg_temp.id('alfa') and to_stage = 'fit'),
  'fit', 'o histórico do estágio registra o evento fit'
);
select results_eq(
  $$select fit, reason, decided_by_kind, decided_by_user, decided_by_agent
    from public.list_account_fits('ff000000-0000-0000-0000-000000000001')$$,
  $$values ('fit'::text, 'Setor e porte do ICP'::text, 'pessoa'::text, '5f000000-0000-0000-0000-000000000001'::uuid, null::uuid)$$,
  'a leitura traz a Aderência, o motivo e quem avaliou'
);
select is(public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'fit', 'Setor e porte do ICP'),
  false, 'gravar a mesma Aderência com o mesmo motivo não muda nada');

-- 4. As recusas: valor fora de Fit/Não fit, Não fit sem motivo, quem não é o Vendedor responsável, outro Workspace.
select throws_ok(
  $$select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'talvez', 'x')$$,
  '22023', 'fit: unknown fit', 'valor fora de Fit/Não fit é recusado'
);
select throws_ok(
  $$select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'nao_fit', '  ')$$,
  '22023', 'fit: a reason is required for nao_fit', 'Não fit sem motivo é recusado'
);
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('beta'), 'fit', '')$$,
  '42501', 'only the responsible seller can set the fit of this target account',
  'a Administradora que não é a responsável não grava'
);
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000004');
select throws_ok(
  $$select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('beta'), 'fit', '')$$,
  '42501', null, 'quem é de outro Workspace não alcança a Conta'
);
select throws_ok(
  $$select public.set_account_fit('ff000000-0000-0000-0000-000000000002', pg_temp.id('beta'), 'fit', '')$$,
  'P0002', 'target account not found', 'a Conta não existe no Workspace de quem grava'
);
select throws_ok(
  $$select * from public.list_account_fits('ff000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'quem é de outro Workspace não lê a Aderência'
);

-- 5. Não fit leva a Descartada; voltar para Fit não tira de lá (Descartada só sai à mão). O histórico guarda cada mudança.
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000001');
select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'nao_fit', 'Só atende o setor público');
select is(pg_temp.estagio(pg_temp.id('alfa')), 'descartada', 'gravar Não fit leva o cartão a Descartada');
select is(
  (select event from private.prospecting_stage_history where target_account_id = pg_temp.id('alfa') and to_stage = 'descartada'),
  'nao_fit', 'o histórico do estágio registra o evento nao_fit'
);
select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('alfa'), 'fit', 'Abriu operação privada');
select is(pg_temp.estagio(pg_temp.id('alfa')), 'descartada', 'mudar de Não fit para Fit não tira da Descartada');
select results_eq(
  $$select from_fit, to_fit, reason, decided_by_kind from private.account_fit_history
    where target_account_id = pg_temp.id('alfa') order by created_at, id$$,
  $$values (null::text, 'fit'::text, 'Setor e porte do ICP'::text, 'pessoa'::text),
           ('fit', 'nao_fit', 'Só atende o setor público', 'pessoa'),
           ('nao_fit', 'fit', 'Abriu operação privada', 'pessoa')$$,
  'o histórico da Aderência guarda cada mudança, com o motivo e quem avaliou'
);
select is(
  (select count(*)::integer from private.account_fit_history
   where target_account_id = pg_temp.id('alfa') and decided_by_user = '5f000000-0000-0000-0000-000000000001' and created_at is not null),
  3, 'e guarda quem e quando'
);

-- 6. Fit não volta um cartão adiantado; mudar só o motivo não move o cartão.
select private.record_prospecting_event('ff000000-0000-0000-0000-000000000001', pg_temp.id('beta'), 'primeiro_envio');
select public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('beta'), 'fit', '');
select is(pg_temp.estagio(pg_temp.id('beta')), 'em_abordagem', 'Fit não volta um cartão que já passou de Fit');
select is(public.set_account_fit('ff000000-0000-0000-0000-000000000001', pg_temp.id('beta'), 'fit', 'Contratando vendas'),
  true, 'mudar o motivo grava');
select is(
  (select count(*)::integer from private.prospecting_stage_history where target_account_id = pg_temp.id('beta')),
  1, 'mudar só o motivo não move o cartão'
);

-- 7. O Scopus propõe: as recusas.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from pg_temp.propor('af000000-0000-0000-0000-000000000001',
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor'), pg_temp.id('epsilon'), 'fit', '')$$,
  '42501', 'fit: only the ICP specialist proposes the fit', 'só o Scopus propõe a Aderência'
);
select throws_ok(
  $$select * from pg_temp.propor('af000000-0000-0000-0000-000000000001',
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('epsilon'), 'nao_fit', '')$$,
  '22023', 'fit: a reason is required for nao_fit', 'o Scopus também precisa do motivo para Não fit'
);
select throws_ok(
  $$select * from pg_temp.propor('af000000-0000-0000-0000-000000000001',
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('gama'), 'fit', '')$$,
  '55000', 'fit: the target account has no responsible seller', 'Conta sem Vendedor responsável: ninguém decidiria'
);
select throws_ok(
  $$select * from pg_temp.propor('af000000-0000-0000-0000-000000000001',
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('alfa'), 'fit', '')$$,
  '22023', 'fit: the target account already has this fit', 'a Conta já tem essa Aderência'
);
select throws_ok(
  $$select * from pg_temp.propor('af000000-0000-0000-0000-000000000002',
    pg_temp.agente('ff000000-0000-0000-0000-000000000002', 'scopus'), pg_temp.id('alfa'), 'nao_fit', 'Fora do ICP')$$,
  'P0002', 'target account not found', 'o Scopus do Sul não alcança a Conta do Norte'
);

-- 8. O Scopus propõe Fit para a Epsilon: nasce a Aprovação pendente e nada é gravado ainda.
insert into ids select 'p1', approval_id from pg_temp.propor('af000000-0000-0000-0000-000000000001',
  pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('epsilon'), 'fit', 'Contrata vendedores');
select results_eq(
  $$select state, category, payload ->> 'aderencia', payload ->> 'motivo', requested_by from private.approvals where id = pg_temp.id('p1')$$,
  $$values ('pendente'::text, 'aderencia'::text, 'fit'::text, 'Contrata vendedores'::text, '5f000000-0000-0000-0000-000000000003'::uuid)$$,
  'a proposta vira uma Aprovação pendente da categoria aderencia'
);
select ok(pg_temp.aderencia(pg_temp.id('epsilon')) is null and pg_temp.estagio(pg_temp.id('epsilon')) = 'descoberta',
  'antes da decisão, nada é gravado nem movido');
select is(
  (select outcome from pg_temp.propor('af000000-0000-0000-0000-000000000001',
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('epsilon'), 'fit', 'Contrata vendedores')),
  'existente', 'a mesma proposta na mesma Execução devolve a Aprovação que já existe'
);

-- 9. Todo Participante lê a proposta na fila; só a Vendedora responsável decide.
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000003');
select results_eq(
  $$select category, payload ->> 'aderencia', responsible_seller from public.list_approvals('ff000000-0000-0000-0000-000000000001')
    where id = pg_temp.id('p1')$$,
  $$values ('aderencia'::text, 'fit'::text, false)$$,
  'o Caio lê a proposta na fila, sem ser quem decide'
);
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, pg_temp.id('p1')),
  '42501', 'only the responsible seller of the target account decides this fit',
  'a Administradora que não é a responsável não decide a Aderência'
);

-- 10. A Bia aprova: a Aderência é gravada (o Scopus avaliou, a Bia aprovou) e o cartão vai para Fit.
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000001');
select is(public.decide_approval(pg_temp.id('p1'), 'aprovar', 'conversa'), 'aprovada', 'a Vendedora responsável aprova');
select results_eq(
  $$select fit, reason, decided_by_kind, decided_by_user, decided_by_agent, approval_id from private.account_fit
    where target_account_id = pg_temp.id('epsilon')$$,
  format($$values ('fit'::text, 'Contrata vendedores'::text, 'agente'::text, '5f000000-0000-0000-0000-000000000001'::uuid, %L::uuid, %L::uuid)$$,
    pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('p1')),
  'aprovar grava a Aderência com o Scopus como quem avaliou e a Aprovação'
);
select is(pg_temp.estagio(pg_temp.id('epsilon')), 'fit', 'e leva o cartão a Fit');
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select public.cancel_approval(%L)$$, pg_temp.id('p1')),
  '55000', 'the approval can no longer be cancelled', 'aprovada, a proposta de Aderência não se cancela nem por quem pediu'
);

-- 11. Recusar não grava nada.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into ids select 'p2', approval_id from pg_temp.propor('af000000-0000-0000-0000-000000000001',
  pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'), pg_temp.id('epsilon'), 'nao_fit', 'Só setor público');
select pg_temp.entrar_como('5f000000-0000-0000-0000-000000000001');
select is(public.decide_approval(pg_temp.id('p2'), 'recusar'), 'recusada', 'a Vendedora responsável recusa');
select ok(pg_temp.aderencia(pg_temp.id('epsilon')) = 'fit' and pg_temp.estagio(pg_temp.id('epsilon')) = 'fit',
  'recusar não muda a Aderência nem o cartão');

-- 12. Uma Aprovação de Aderência sem a Aderência no payload não existe.
reset role;
select throws_ok(
  $$insert into private.approvals (workspace_id, agent_id, action, payload, payload_hash, target_account_id, category)
    values ('ff000000-0000-0000-0000-000000000001', pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'scopus'),
      'x', '{}', 'x', pg_temp.id('beta'), 'aderencia')$$,
  '23514', null, 'a Aprovação de Aderência exige Fit ou Não fit no payload'
);

select * from finish();
rollback;
