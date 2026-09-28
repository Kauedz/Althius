begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(46);

-- Workspace Norte: Ana (Administradora), Beto (Membro), Dora (Participação removida) e Caio (Membro), nessa ordem de
-- entrada. Eva participa só do Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dora@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'caio@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('61000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('61000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active, created_at) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'admin', true, '2026-09-01T10:00:00Z'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'member', true, '2026-09-02T10:00:00Z'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'member', false, '2026-09-03T10:00:00Z'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', 'member', true, '2026-09-04T10:00:00Z'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005', 'admin', true, '2026-09-01T10:00:00Z');

-- A recomendação chega pelo runtime dos Agentes, com a chave de serviço.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table rec1 on commit drop as
  select * from public.recommend_target_account(
    '61000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.com.br', p_segment => 'Varejo');

select results_eq(
  $$select created, responsible_user_id from rec1$$,
  $$values (true, '60000000-0000-0000-0000-000000000001'::uuid)$$,
  'a recomendação de uma URL nova cria a Conta e a atribui ao primeiro participante ativo da roleta');
select results_eq(
  $$select origin, created_by, segment from public.target_accounts where id = (select target_account_id from rec1)$$,
  $$values ('recomendacao'::text, null::uuid, 'Varejo'::text)$$,
  'a Conta recomendada registra a origem, sem um usuário criador');
select is(
  (select owner_user_id from public.sales_responsibilities where target_account_id = (select target_account_id::text from rec1)),
  '60000000-0000-0000-0000-000000000001'::uuid, 'a responsabilidade fica gravada para a Conta recomendada');

-- A roleta segue a ordem de entrada e pula a Participação removida da Dora; do fim, volta ao começo.
create temporary table rodada on commit drop as
  select n, r.* from (values (2, 'beta.com.br'), (3, 'gama.com.br'), (4, 'delta.com.br')) v(n, url)
  cross join lateral public.recommend_target_account('61000000-0000-0000-0000-000000000001', 'Empresa ' || n, url) r;
select results_eq(
  $$select responsible_user_id from rodada order by n$$,
  $$values ('60000000-0000-0000-0000-000000000002'::uuid), ('60000000-0000-0000-0000-000000000004'::uuid),
           ('60000000-0000-0000-0000-000000000001'::uuid)$$,
  'a distribuição é rotativa entre os participantes ativos e nunca cai na Participação inativa');

-- A mesma empresa de novo, com a URL escrita de outro jeito: atualiza, sem nova atribuição e sem avançar a roleta.
create temporary table repetida on commit drop as
  select * from public.recommend_target_account(
    '61000000-0000-0000-0000-000000000001', 'Alfa Outra', 'http://www.ALFA.com.br/', p_linkedin_url => 'https://linkedin.com/company/alfa',
    p_segment => 'Indústria');
select results_eq(
  $$select target_account_id, created, responsible_user_id from repetida$$,
  $$select target_account_id, false, '60000000-0000-0000-0000-000000000001'::uuid from rec1$$,
  'a recomendação de uma URL já existente devolve a Conta existente e o responsável dela');
select results_eq(
  $$select name, segment, linkedin_url from public.target_accounts where id = (select target_account_id from rec1)$$,
  $$values ('Alfa'::text, 'Varejo'::text, 'https://linkedin.com/company/alfa'::text)$$,
  'a recomendação só preenche o que a Conta ainda não tem');
select is((select count(*)::int from public.target_accounts where workspace_id = '61000000-0000-0000-0000-000000000001'), 4,
  'a URL existente não cria outra Conta');
-- A auditoria e o cursor ficam no schema privado; o teste os lê como dono do banco.
reset role;
select is(
  (select count(*)::int from private.account_assignment_events where target_account_id = (select target_account_id::text from rec1)), 1,
  'a URL existente não cria outra atribuição');
select results_eq(
  $$select last_user_id, assignments from private.account_roulette_cursors where workspace_id = '61000000-0000-0000-0000-000000000001'$$,
  $$values ('60000000-0000-0000-0000-000000000001'::uuid, 4::bigint)$$,
  'o cursor persistido não avança com a URL existente');
set local role service_role;
select is(
  (select responsible_user_id from public.recommend_target_account('61000000-0000-0000-0000-000000000001', 'Épsilon', 'epsilon.com.br')),
  '60000000-0000-0000-0000-000000000002'::uuid, 'a roleta continua de onde parou');

-- A auditoria da recomendação: origem, elegíveis na ordem da roleta, cursor antes e depois, responsável.
reset role;
select results_eq(
  $$select origin, eligible_user_ids, cursor_before, cursor_after, assigned_user_id, actor_user_id
    from private.account_assignment_events
    where target_account_id = (select target_account_id::text from rodada where n = 3)$$,
  $$values ('recomendacao'::text,
    array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002',
          '60000000-0000-0000-0000-000000000004']::uuid[],
    '60000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000004'::uuid,
    '60000000-0000-0000-0000-000000000004'::uuid, null::uuid)$$,
  'a auditoria registra origem, participantes elegíveis, cursor anterior e novo e o responsável');

-- O Workspace Sul tem a própria roleta: a Eva recebe.
set local role service_role;
select is(
  (select responsible_user_id from public.recommend_target_account('61000000-0000-0000-0000-000000000002', 'Alfa', 'alfa.com.br')),
  '60000000-0000-0000-0000-000000000005'::uuid, 'cada Workspace tem a própria roleta, e a mesma URL em outro Workspace é outra Conta');

select throws_ok(
  $$select * from public.recommend_target_account('61000000-0000-0000-0000-000000000009', 'Fantasma', 'fantasma.com.br')$$,
  'P0002', 'workspace not found', 'a recomendação para um Workspace inexistente é recusada');
select throws_ok(
  $$select * from public.recommend_target_account('61000000-0000-0000-0000-000000000001', 'Sem site', 'não é uma url')$$,
  '22023', 'invalid company url', 'a recomendação com URL inválida é recusada');

-- Identificadores das Contas usadas daqui em diante, legíveis por todos os papéis do teste.
reset role;
create temporary table ids (nome text primary key, id uuid not null);
grant select on ids to authenticated, service_role;
insert into ids values ('alfa', (select target_account_id from rec1));

-- Cadastro manual (CRM-04): quem cria é o responsável, e a atribuição também fica auditada.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000004', true);
create temporary table manual on commit drop as
  select id from public.save_target_account('61000000-0000-0000-0000-000000000001', 'Manual do Caio', 'manual.com.br');
reset role;
insert into ids values ('manual', (select id from manual));
select results_eq(
  $$select a.origin, r.owner_user_id, e.origin, e.eligible_user_ids, e.actor_user_id
    from public.target_accounts a
    join public.sales_responsibilities r on r.target_account_id = a.id::text
    join private.account_assignment_events e on e.target_account_id = a.id::text
    where a.id = (select id from ids where nome = 'manual')$$,
  $$values ('manual'::text, '60000000-0000-0000-0000-000000000004'::uuid, 'manual'::text,
    array['60000000-0000-0000-0000-000000000004']::uuid[], '60000000-0000-0000-0000-000000000004'::uuid)$$,
  'a criação manual atribui ao criador e registra a origem manual na auditoria');

-- Nenhuma escrita atribui responsabilidade a uma Participação inativa, nem por fora das RPCs.
select throws_ok(
  $$insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
    values ('61000000-0000-0000-0000-000000000001', 'conta-legada', '60000000-0000-0000-0000-000000000003')$$,
  '42501', 'the responsible seller must be an active participant',
  'a responsabilidade não é atribuída a uma Participação inativa');

-- Importação (primitiva que o CRM-07 chama): o importador é o responsável inicial.
create temporary table importadas on commit drop as
  select n, r.* from (values (1, 'imp1.com.br'), (2, 'imp2.com.br'), (3, 'imp3.com.br')) v(n, url)
  cross join lateral private.create_imported_target_account(
    '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Importada ' || n, url,
    p_import_batch_id => '6a000000-0000-0000-0000-000000000001') r;
insert into ids select 'imp' || n, target_account_id from importadas;
select results_eq(
  $$select a.origin, a.created_by, r.owner_user_id, e.origin, e.eligible_user_ids, e.actor_user_id, e.import_batch_id
    from public.target_accounts a
    join public.sales_responsibilities r on r.target_account_id = a.id::text
    join private.account_assignment_events e on e.target_account_id = a.id::text
    where a.id = (select id from ids where nome = 'imp1')$$,
  $$values ('importacao'::text, '60000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000002'::uuid,
    'importacao'::text, array['60000000-0000-0000-0000-000000000002']::uuid[], '60000000-0000-0000-0000-000000000002'::uuid,
    '6a000000-0000-0000-0000-000000000001'::uuid)$$,
  'a importação atribui ao importador e registra origem, lote e responsável');
select results_eq(
  $$select target_account_id, created from private.create_imported_target_account(
      '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Alfa Importada', 'https://alfa.com.br')$$,
  $$select id, false from ids where nome = 'alfa'$$,
  'importar uma URL existente devolve a Conta existente sem criar outra');
select results_eq(
  $$select r.owner_user_id, a.name, (select count(*)::int from private.account_assignment_events e where e.target_account_id = a.id::text)
    from public.target_accounts a join public.sales_responsibilities r on r.target_account_id = a.id::text
    where a.id = (select id from ids where nome = 'alfa')$$,
  $$values ('60000000-0000-0000-0000-000000000001'::uuid, 'Alfa'::text, 1)$$,
  'a importação de uma URL existente não muda a Conta, o responsável nem a auditoria');
select throws_ok(
  $$select * from private.create_imported_target_account(
      '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'Da Dora', 'dora.com.br')$$,
  '42501', 'the importer must be an active participant', 'quem não participa mais não importa');
select results_eq(
  $$select assignments from private.account_roulette_cursors where workspace_id = '61000000-0000-0000-0000-000000000001'$$,
  $$values (5::bigint)$$, 'a criação manual e a importação não consomem a roleta');

-- Distribuição das linhas importadas: só Administrador, só para participante ativo, uma vez por Conta importada.
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'imp1')], array['60000000-0000-0000-0000-000000000004'::uuid])$$,
  '42501', 'only administrators can distribute imported target accounts', 'um Membro não distribui linhas importadas');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'imp1')], array['60000000-0000-0000-0000-000000000005'::uuid])$$,
  '42501', 'active workspace membership required', 'o Administrador de outro Workspace não distribui');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'imp3')], array['60000000-0000-0000-0000-000000000003'::uuid])$$,
  '42501', 'the new responsible seller must be an active participant', 'a distribuição não vai para Participação inativa');
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'manual')], array['60000000-0000-0000-0000-000000000001'::uuid])$$,
  '42501', 'only imported target accounts can be distributed', 'uma Conta manual não é redistribuída');
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'imp1')], array[]::uuid[])$$,
  '22023', 'each target account needs one responsible seller', 'cada Conta precisa de exatamente um responsável');
select is(
  public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
    array[(select id from ids where nome = 'imp1'), (select id from ids where nome = 'imp2')],
    array['60000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001']::uuid[]),
  2, 'o Administrador distribui linhas importadas entre participantes ativos');
select results_eq(
  $$select target_account_id::uuid, owner_user_id from public.sales_responsibilities
    where target_account_id in (select id::text from ids where nome in ('imp1', 'imp2', 'imp3')) order by 1$$,
  $$select i.id, v.dono from ids i join (values ('imp1', '60000000-0000-0000-0000-000000000004'::uuid),
      ('imp2', '60000000-0000-0000-0000-000000000001'::uuid), ('imp3', '60000000-0000-0000-0000-000000000002'::uuid)) v(nome, dono)
      on v.nome = i.nome order by 1$$,
  'as Contas distribuídas mudam de responsável, e a não distribuída continua com o importador');
select throws_ok(
  $$select public.distribute_imported_target_accounts('61000000-0000-0000-0000-000000000001',
      array[(select id from ids where nome = 'imp3'), (select id from ids where nome = 'imp1')],
      array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', 'imported target account was already distributed', 'uma Conta já distribuída não é redistribuída');
select is(
  (select owner_user_id from public.sales_responsibilities where target_account_id = (select id::text from ids where nome = 'imp3')),
  '60000000-0000-0000-0000-000000000002'::uuid, 'a distribuição recusada não muda nenhuma das Contas do pedido');

reset role;
select results_eq(
  $$select origin, previous_user_id, assigned_user_id, actor_user_id, eligible_user_ids
    from private.account_assignment_events where target_account_id = (select id::text from ids where nome = 'imp1') order by id$$,
  $$values ('importacao'::text, null::uuid, '60000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000002'::uuid,
      array['60000000-0000-0000-0000-000000000002']::uuid[]),
    ('distribuicao_importacao', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000004',
      '60000000-0000-0000-0000-000000000001',
      array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002',
            '60000000-0000-0000-0000-000000000004']::uuid[])$$,
  'a auditoria registra a distribuição: responsável anterior, novo, quem distribuiu e os elegíveis');
select throws_ok(
  $$update public.sales_responsibilities set owner_user_id = '60000000-0000-0000-0000-000000000001'
    where target_account_id = (select id::text from ids where nome = 'imp3')$$,
  'P0001', 'sales responsibility is permanent', 'fora da distribuição e da transferência, a responsabilidade não muda');

-- Transferência excepcional: só depois da saída do responsável, por Administrador, para participante ativo, com motivo.
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000001', 'Quero assumir')$$,
  '42501', 'the responsible seller is still an active participant', 'enquanto o responsável participa, não há transferência');

select public.remove_participant('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000002', 'Caio saiu')$$,
  '42501', 'only administrators can transfer responsibility', 'um Membro não transfere a responsabilidade');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000005', 'Caio saiu')$$,
  'P0002', 'target account not found', 'o Administrador de outro Workspace não enxerga a Conta');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000003', 'Caio saiu')$$,
  '42501', 'the new responsible seller must be an active participant', 'a transferência não vai para Participação inativa');
select throws_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000002', '  ')$$,
  '22023', 'a reason is required to transfer responsibility', 'a transferência exige o motivo');
select lives_ok(
  $$select public.transfer_target_account_responsibility((select id from ids where nome = 'manual'),
      '60000000-0000-0000-0000-000000000002', 'Caio saiu da empresa')$$,
  'depois da saída do responsável, o Administrador transfere a Conta a um participante ativo');
select is(
  (select owner_user_id from public.sales_responsibilities where target_account_id = (select id::text from ids where nome = 'manual')),
  '60000000-0000-0000-0000-000000000002'::uuid, 'o novo responsável fica gravado');

-- Todo participante ativo consulta o histórico de atribuições da Conta.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select origin, previous_user_id, assigned_user_id, actor_user_id, eligible_user_ids, reason
    from public.list_account_assignment_events((select id from ids where nome = 'manual'))$$,
  $$values ('manual'::text, null::uuid, '60000000-0000-0000-0000-000000000004'::uuid, '60000000-0000-0000-0000-000000000004'::uuid,
      array['60000000-0000-0000-0000-000000000004']::uuid[], null::text),
    ('transferencia', '60000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000002',
      '60000000-0000-0000-0000-000000000001',
      array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002']::uuid[], 'Caio saiu da empresa')$$,
  'a transferência fica auditada com o responsável anterior, o novo, quem transferiu, os elegíveis e o motivo');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.list_account_assignment_events((select id from ids where nome = 'manual'))$$,
  'P0002', 'target account not found', 'quem não participa do Workspace não lê a auditoria');

-- Depois da saída do Caio, a roleta o pula: o cursor está na vez dele e passa à Ana.
set local role service_role;
select is(
  (select responsible_user_id from public.recommend_target_account('61000000-0000-0000-0000-000000000001', 'Zeta', 'zeta.com.br')),
  '60000000-0000-0000-0000-000000000001'::uuid, 'a roleta pula quem deixou o Workspace');

-- Só o runtime dos Agentes, com a chave de serviço, recomenda; as demais ações exigem uma sessão.
reset role;
select ok(not has_function_privilege('anon', 'public.recommend_target_account(uuid, text, text, text, text, text)', 'execute'),
  'anon não recomenda Contas');
select ok(not has_function_privilege('authenticated', 'public.recommend_target_account(uuid, text, text, text, text, text)', 'execute'),
  'um participante autenticado não recomenda Contas pela roleta');
select ok(not has_function_privilege('anon', 'public.distribute_imported_target_accounts(uuid, uuid[], uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.transfer_target_account_responsibility(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.list_account_assignment_events(uuid)', 'execute'),
  'anon não distribui, não transfere e não lê a auditoria');
select ok(not has_function_privilege('authenticated', 'private.create_imported_target_account(uuid, uuid, text, text, text, text, text, uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.create_imported_target_account(uuid, uuid, text, text, text, text, text, uuid)', 'execute'),
  'a primitiva da importação só é chamada por outra função do banco');

select * from finish();
rollback;
