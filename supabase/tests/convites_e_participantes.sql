begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(81);

-- Workspace da empresa Norte: Ana é Administradora e Bruno é Membro. Carla será convidada; Diego tem o mesmo domínio
-- da empresa, mas nenhum convite; Eva, Gil e Hugo recebem convites que não chegam ao aceite; Fabio é convidado ao
-- Workspace pessoal da Ana; Iara nunca participou de nada.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Bruno Reis"}', false, false),
  ('40000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Carla Dias"}', false, false),
  ('40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'fabio@gmail.com', '', now(), now(), now(), '{}', '{"name":"Fabio"}', false, false),
  ('40000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'gil@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'hugo@norte.com.br', '', null, now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'iara@outra.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'admin', true),
  ('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'member', true);

-- Registros comerciais do Workspace Norte: uma Conta-alvo sob responsabilidade do Bruno e a Conta remetente privada da Ana.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.com.br', 'alfa.com.br', '40000000-0000-0000-0000-000000000002');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');
insert into private.sender_accounts (workspace_id, owner_user_id, channel, unipile_account_id, provider, status) values
  ('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'email', 'unipile-da-ana', 'GOOGLE', 'ready');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Convite pela Administradora.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
create temporary table convite_da_carla on commit drop as
  select * from public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', '  Carla@Norte.com.br ', 'member');

select is((select email from convite_da_carla), 'carla@norte.com.br', 'o convite guarda o e-mail normalizado');
select is((select status from convite_da_carla), 'pendente', 'o convite nasce pendente');
select ok((select length(token) >= 64 from convite_da_carla), 'o convite tem um token longo e aleatório para o link');
select ok((select expires_at > now() from convite_da_carla), 'o convite tem prazo de validade');
select is(
  (select status from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'carla@norte.com.br'),
  'pendente', 'o Administrador vê o convite pendente');
select is(
  (select token from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'carla@norte.com.br'),
  (select token from convite_da_carla), 'o Administrador obtém de novo o link do convite');

select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'carla@norte.com.br', 'admin')$$,
  '23505', 'a pending invitation already exists for this email',
  'não há dois convites pendentes para o mesmo e-mail');
select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'BRUNO@norte.com.br', 'admin')$$,
  '23505', 'this email already participates in the workspace',
  'quem já participa não é convidado');
select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'nova@norte.com.br', 'owner')$$,
  '22023', 'invalid role',
  'só existem os papéis Administrador e Membro');
select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'sem-arroba', 'member')$$,
  '22023', 'invalid email',
  'o convite exige um e-mail válido');
select throws_ok(
  $$select count(*) from private.workspace_invitations$$,
  '42501', 'permission denied for schema private',
  'os convites só são lidos pelas funções, nunca direto pela API');

-- Membro: consulta, mas não altera participantes nem convites.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001')), 1,
  'o Membro consulta os convites do Workspace');
select is(
  (select token from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'carla@norte.com.br'),
  null, 'o Membro não recebe o link do convite');
select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'nova@norte.com.br', 'member')$$,
  '42501', 'only administrators can manage participants',
  'o Membro não convida');
select throws_ok(
  format($$select public.revoke_workspace_invitation(%L)$$, (select id from convite_da_carla)),
  '42501', 'only administrators can manage participants',
  'o Membro não revoga convite');
select throws_ok(
  $$select public.revoke_workspace_invitation('00000000-0000-0000-0000-000000000000')$$,
  '42501', 'only administrators can manage participants',
  'um convite que não existe dá ao Membro a mesma recusa: a revogação não revela quais convites existem');
select throws_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'admin')$$,
  '42501', 'only administrators can manage participants',
  'o Membro não altera papel, nem o próprio');
select throws_ok(
  $$select public.remove_participant('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
  '42501', 'only administrators can manage participants',
  'o Membro não remove Participação');
select is(
  (select array_agg(email || ':' || role || ':' || coalesce(name, '') order by email)
     from public.list_workspace_participants('cccccccc-0000-0000-0000-000000000001')),
  array['ana@norte.com.br:admin:Ana Lima', 'bruno@norte.com.br:member:Bruno Reis'],
  'todos os participantes ativos consultam quem participa, com nome e papel');

-- Quem não participa do Workspace não consulta nada dele.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$select * from public.list_workspace_participants('cccccccc-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required',
  'quem não participa não lista os participantes');
select throws_ok(
  $$select * from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required',
  'quem não participa não lista os convites');
select throws_ok(
  format($$select public.revoke_workspace_invitation(%L)$$, (select id from convite_da_carla)),
  '42501', 'only administrators can manage participants',
  'quem não participa recebe a mesma recusa ao revogar um convite existente');

-- A prévia do convite, antes do login, só mostra para quem ele é e de qual Workspace.
select set_config('teste.token_da_carla', (select token from convite_da_carla), true);
reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select email || ' · ' || workspace_name || ' · ' || status
     from public.workspace_invitation_preview(current_setting('teste.token_da_carla'))),
  'carla@norte.com.br · Norte · pendente', 'o link do convite mostra o e-mail convidado e o Workspace, sem login');
select is(
  (select count(*)::int from public.workspace_invitation_preview('token-que-nao-existe')), 0,
  'um token desconhecido não revela nada');
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, current_setting('teste.token_da_carla')),
  '42501', null,
  'aceitar exige autenticação');
select throws_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'nova@norte.com.br', 'member')$$,
  '42501', null, 'sem login, ninguém convida');
select throws_ok(
  $$select * from public.list_workspace_participants('cccccccc-0000-0000-0000-000000000001')$$,
  '42501', null, 'sem login, ninguém lista os participantes');
select throws_ok(
  $$select * from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001')$$,
  '42501', null, 'sem login, ninguém lista os convites');
select throws_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'admin')$$,
  '42501', null, 'sem login, ninguém muda papel');
select throws_ok(
  $$select public.remove_participant('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'sem login, ninguém remove Participação');
select throws_ok(
  $$select public.revoke_workspace_invitation('00000000-0000-0000-0000-000000000000')$$,
  '42501', null, 'sem login, ninguém revoga convite');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Mesmo domínio não basta: só o e-mail convidado aceita.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_da_carla)),
  '42501', 'invitation is for another email',
  'outra Conta de usuário do mesmo domínio não aceita o convite');
select is(
  (select count(*)::int from public.target_accounts where workspace_id = 'cccccccc-0000-0000-0000-000000000001'), 0,
  'sem Participação, a pessoa do mesmo domínio não vê os dados comerciais');
select throws_ok(
  $$select public.accept_workspace_invitation('token-que-nao-existe')$$,
  'P0002', 'invitation not found',
  'um token desconhecido é recusado');

-- Carla vem pelo convite, já com o Workspace pessoal que existia, e entra no Workspace do convite.
-- A Carla já tinha o Workspace pessoal, criado antes do fechamento do acesso (o bootstrap não cria mais).
reset role;
insert into public.workspaces (kind, name, owner_user_id) values ('pessoal', 'Workspace pessoal', '40000000-0000-0000-0000-000000000003');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select id, '40000000-0000-0000-0000-000000000003', 'admin', true from public.workspaces where kind = 'pessoal' and owner_user_id = '40000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.bootstrap_personal_workspace('2026-09-25')$$, 'quem vem pelo convite também passa pelo bootstrap, que só grava o aceite');
select is(
  (select id from public.accept_workspace_invitation((select token from convite_da_carla))),
  'cccccccc-0000-0000-0000-000000000001'::uuid, 'o aceite devolve o Workspace do convite');
select is(
  (select role from public.workspace_memberships
    where workspace_id = 'cccccccc-0000-0000-0000-000000000001' and user_id = '40000000-0000-0000-0000-000000000003' and active),
  'member', 'o aceite cria a Participação com o papel do convite');
select is(
  (select count(*)::int from public.workspaces where kind = 'pessoal' and owner_user_id = '40000000-0000-0000-0000-000000000003'), 1,
  'quem entrou pelo convite mantém o próprio Workspace pessoal');
select is(
  (select id from public.accept_workspace_invitation((select token from convite_da_carla))),
  'cccccccc-0000-0000-0000-000000000001'::uuid, 'abrir o link de novo depois do aceite não falha nem duplica');
select is(
  (select count(*)::int from public.workspace_memberships where user_id = '40000000-0000-0000-0000-000000000003'), 2,
  'a Carla tem só a Participação no pessoal e a do convite');
select is(
  (select count(*)::int from public.target_accounts where workspace_id = 'cccccccc-0000-0000-0000-000000000001'), 1,
  'o participante que entrou consulta os dados comerciais compartilhados');
select is(
  (select count(*)::int from public.list_owned_sender_accounts('cccccccc-0000-0000-0000-000000000001')), 0,
  'a Conta remetente privada da Ana continua fora do alcance da Carla');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'carla@norte.com.br'),
  'aceito', 'o convite passa a aceito');
select is(
  (select token from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'carla@norte.com.br'),
  null, 'o link de um convite aceito não é mais entregue, nem ao Administrador');

-- Revogado.
create temporary table convite_da_eva on commit drop as
  select * from public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'eva@norte.com.br', 'member');
select lives_ok(format($$select public.revoke_workspace_invitation(%L)$$, (select id from convite_da_eva)),
  'o Administrador revoga um convite pendente');
select is(
  (select status from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'eva@norte.com.br'),
  'revogado', 'o convite passa a revogado');
select throws_ok(
  format($$select public.revoke_workspace_invitation(%L)$$, (select id from convite_da_carla)),
  '22023', 'only pending invitations can be revoked',
  'um convite aceito não é revogado');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000005', true);
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_da_eva)),
  '22023', 'invitation revoked',
  'um convite revogado não é aceito');

-- Expirado.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
create temporary table convite_do_gil on commit drop as
  select * from public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'gil@norte.com.br', 'member');
reset role;
update private.workspace_invitations set expires_at = now() - interval '1 minute' where id = (select id from convite_do_gil);
set local role authenticated;
select is(
  (select status from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where id = (select id from convite_do_gil)),
  'expirado', 'um convite vencido aparece como expirado');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000007', true);
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_do_gil)),
  '22023', 'invitation expired',
  'um convite expirado não é aceito');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'gil@norte.com.br', 'admin')$$,
  'depois de expirar, o Administrador convida de novo');
select is(
  (select array_agg(status order by created_at, status) from public.list_workspace_invitations('cccccccc-0000-0000-0000-000000000001') where email = 'gil@norte.com.br'),
  array['expirado', 'pendente'], 'o convite antigo continua registrado como expirado');

-- E-mail não verificado não aceita.
create temporary table convite_do_hugo on commit drop as
  select * from public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'hugo@norte.com.br', 'member');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000008', true);
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_do_hugo)),
  '42501', 'email not verified',
  'o aceite exige o e-mail verificado');

-- Papéis.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'member')$$,
  '42501', 'the last administrator cannot be removed or demoted',
  'o último Administrador não se rebaixa');
select throws_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'owner')$$,
  '22023', 'invalid role',
  'não há outro papel além de Administrador e Membro');
select lives_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'admin')$$,
  'o Administrador promove um Membro');
select is(
  (select role from public.list_workspace_participants('cccccccc-0000-0000-0000-000000000001') where user_id = '40000000-0000-0000-0000-000000000003'),
  'admin', 'a Carla agora é Administradora');
select throws_ok(
  $$select public.change_participant_role('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009', 'admin')$$,
  'P0002', 'participant not found',
  'não se muda o papel de quem não participa');

-- Remoção: encerra só a Participação.
select throws_ok(
  $$select public.remove_participant('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
  '42501', 'you cannot remove yourself',
  'ninguém remove a si mesmo por aqui');
-- O Bruno já tinha o Workspace pessoal, criado antes do fechamento do acesso (o bootstrap não cria mais).
reset role;
insert into public.workspaces (kind, name, owner_user_id) values ('pessoal', 'Workspace pessoal', '40000000-0000-0000-0000-000000000002');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select id, '40000000-0000-0000-0000-000000000002', 'admin', true from public.workspaces where kind = 'pessoal' and owner_user_id = '40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.bootstrap_personal_workspace('2026-09-25')$$, 'o Bruno tem o próprio Workspace pessoal');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.remove_participant('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')$$,
  'o Administrador remove um Membro');
select is(
  (select count(*)::int from public.list_workspace_participants('cccccccc-0000-0000-0000-000000000001') where user_id = '40000000-0000-0000-0000-000000000002'), 0,
  'quem foi removido sai da lista de participantes');
select is(
  (select count(*)::int from public.target_accounts where created_by = '40000000-0000-0000-0000-000000000002'), 1,
  'os registros comerciais do Workspace continuam depois da remoção');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.target_accounts where workspace_id = 'cccccccc-0000-0000-0000-000000000001'), 0,
  'quem foi removido perde o acesso aos dados comerciais do Workspace');
select is(
  (select count(*)::int from public.workspaces where kind = 'pessoal' and owner_user_id = '40000000-0000-0000-0000-000000000002'), 1,
  'quem foi removido mantém o próprio Workspace pessoal');

-- Workspace pessoal: um Administrador convidado não remove nem rebaixa o Titular.
-- A Ana já tinha o Workspace pessoal, criado antes do fechamento do acesso (o bootstrap não cria mais).
reset role;
insert into public.workspaces (kind, name, owner_user_id) values ('pessoal', 'Workspace pessoal', '40000000-0000-0000-0000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select id, '40000000-0000-0000-0000-000000000001', 'admin', true from public.workspaces where kind = 'pessoal' and owner_user_id = '40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
create temporary table pessoal_da_ana on commit drop as
  select * from public.bootstrap_personal_workspace('2026-09-25');
create temporary table convite_do_fabio on commit drop as
  select * from public.invite_to_workspace((select id from pessoal_da_ana), 'fabio@gmail.com', 'admin');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
select is(
  (select id from public.accept_workspace_invitation((select token from convite_do_fabio))),
  (select id from pessoal_da_ana), 'o Workspace pessoal também recebe convidados');
select throws_ok(
  format($$select public.change_participant_role(%L, '40000000-0000-0000-0000-000000000001', 'member')$$, (select id from pessoal_da_ana)),
  '42501', 'the owner of a personal workspace cannot be removed or demoted',
  'o Administrador convidado não rebaixa o Titular');
select throws_ok(
  format($$select public.remove_participant(%L, '40000000-0000-0000-0000-000000000001')$$, (select id from pessoal_da_ana)),
  '42501', 'the owner of a personal workspace cannot be removed or demoted',
  'o Administrador convidado não remove o Titular');
select is(
  (select bool_or(is_owner) filter (where user_id = '40000000-0000-0000-0000-000000000001')
     from public.list_workspace_participants((select id from pessoal_da_ana))),
  true, 'a lista de participantes marca o Titular do Workspace pessoal');

-- Link antigo depois de removido não devolve a Participação.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format($$select public.remove_participant(%L, '40000000-0000-0000-0000-000000000006')$$, (select id from pessoal_da_ana)),
  'o Titular remove o Administrador convidado');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
select throws_ok(
  format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_do_fabio)),
  '22023', 'invitation already used',
  'reabrir um convite aceito não devolve a Participação removida');

-- As regras valem também para quem opera o banco com privilégios, e o histórico fica auditável.
reset role;
select throws_ok(
  $$update public.workspace_memberships set role = 'member'
    where workspace_id = 'cccccccc-0000-0000-0000-000000000001' and role = 'admin' and active$$,
  '42501', 'the last administrator cannot be removed or demoted',
  'nenhuma escrita deixa o Workspace sem Administrador ativo');
select is(
  (select array_agg(event order by id) from private.workspace_participation_events
    where workspace_id = 'cccccccc-0000-0000-0000-000000000001' and subject_email in ('carla@norte.com.br', 'bruno@norte.com.br')),
  array['convite_criado', 'convite_aceito', 'papel_alterado', 'participacao_removida'],
  'convites, aceites, mudanças de papel e remoções ficam registrados');
insert into public.workspaces (id, kind, name) values ('cccccccc-0000-0000-0000-000000000002', 'empresa', 'Descartável');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
  values ('cccccccc-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000009', 'admin', true);
select throws_ok(
  $$update public.workspace_memberships set user_id = '40000000-0000-0000-0000-000000000004'
    where workspace_id = 'cccccccc-0000-0000-0000-000000000002'$$,
  '42501', 'the last administrator cannot be removed or demoted',
  'passar a Participação do último Administrador para outra Conta de usuário também é recusado');
select lives_ok(
  $$delete from public.workspaces where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'excluir o Workspace inteiro não esbarra na proteção do último Administrador');

-- Quem já participa e aceita um convite pendente continua com o papel que tem; o histórico registra esse papel.
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
create temporary table convite_da_iara on commit drop as
  select * from public.invite_to_workspace('cccccccc-0000-0000-0000-000000000001', 'iara@outra.com.br', 'member');
reset role;
insert into public.workspace_memberships (workspace_id, user_id, role, active)
  values ('cccccccc-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009', 'admin', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000009', true);
select lives_ok(format($$select public.accept_workspace_invitation(%L)$$, (select token from convite_da_iara)),
  'quem já participa aceita o convite pendente sem erro');
reset role;
select is(
  (select role from public.workspace_memberships
    where workspace_id = 'cccccccc-0000-0000-0000-000000000001' and user_id = '40000000-0000-0000-0000-000000000009'),
  'admin', 'o aceite não muda o papel de quem já participa');
select is(
  (select coalesce(old_role, '-') || '→' || new_role from private.workspace_participation_events
    where event = 'convite_aceito' and invitation_id = (select id from convite_da_iara)),
  'admin→admin', 'o histórico do aceite registra o papel que a pessoa realmente tem, sem alegar a mudança do convite');

-- Antes do login, o link de um convite que já não está pendente só mostra o estado: nem e-mail, nem Workspace.
select set_config('teste.token_aceito', (select token from convite_da_carla), true);
select set_config('teste.token_revogado', (select token from convite_da_eva), true);
select set_config('teste.token_expirado', (select token from convite_do_gil), true);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select coalesce(email, '-') || ' · ' || coalesce(workspace_name, '-') || ' · ' || coalesce(role, '-') || ' · ' || status
     from public.workspace_invitation_preview(current_setting('teste.token_aceito'))),
  '- · - · - · aceito', 'a prévia de um convite aceito só mostra o estado');
select is(
  (select coalesce(email, '-') || ' · ' || coalesce(workspace_name, '-') || ' · ' || status
     from public.workspace_invitation_preview(current_setting('teste.token_revogado'))),
  '- · - · revogado', 'a prévia de um convite revogado só mostra o estado');
select is(
  (select coalesce(email, '-') || ' · ' || coalesce(workspace_name, '-') || ' · ' || status
     from public.workspace_invitation_preview(current_setting('teste.token_expirado'))),
  '- · - · expirado', 'a prévia de um convite expirado só mostra o estado');
reset role;

select * from finish();
rollback;
