begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(36);

-- Workspace da empresa com Ana (Administradora), Beto (Membro), Eva (Membro sem Contas) e Dora (Participação removida).
-- Caio é Administrador de outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('51000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('51000000-0000-0000-0000-000000000002', 'empresa', 'Outro');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'admin', true),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'member', true),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'member', false),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'member', true),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (nome text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Beto responde pela Alfa e pela Beta; Ana, pela Gama; Caio, pela Zeta, no outro Workspace.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
insert into ids select 'alfa', id from public.save_target_account('51000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
insert into ids select 'beta', id from public.save_target_account('51000000-0000-0000-0000-000000000001', 'Beta', 'beta.com.br');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'gama', id from public.save_target_account('51000000-0000-0000-0000-000000000001', 'Gama', 'gama.com.br');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
insert into ids select 'zeta', id from public.save_target_account('51000000-0000-0000-0000-000000000002', 'Zeta', 'zeta.com.br');

-- Beto cadastra a Maria na Alfa, com e-mail, telefone e LinkedIn.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Maria Souza', 'CFO',
  ' Maria@Alfa.com.br ', '(11) 98888-7777', 'https://www.linkedin.com/in/maria-souza/?trk=x');

select is(pg_typeof((select id from ids where nome = 'maria'))::text, 'uuid', 'o Contato tem identidade UUID');
select is((select workspace_id from public.contacts where id = (select id from ids where nome = 'maria')),
  '51000000-0000-0000-0000-000000000001'::uuid, 'o Contato pertence ao Workspace da Conta');
select results_eq(
  $$select email, phone, linkedin from public.contacts where id = (select id from ids where nome = 'maria')$$,
  $$values ('maria@alfa.com.br', '+5511988887777', 'https://www.linkedin.com/in/maria-souza')$$,
  'e-mail, telefone e LinkedIn ficam na forma normalizada');
select is((select count(*)::int from public.contact_account_links
  where contact_id = (select id from ids where nome = 'maria') and ended_at is null
    and target_account_id = (select id from ids where nome = 'alfa')), 1,
  'o cadastro abre o Vínculo do Contato com a Conta');

-- Outra pessoa com o mesmo nome, sem e-mail, telefone nem LinkedIn.
insert into ids select 'homonima', id from public.create_contact((select id from ids where nome = 'alfa'), 'Maria Souza');
select isnt((select id from ids where nome = 'homonima'), (select id from ids where nome = 'maria'),
  'o nome sozinho não mescla Contatos');
select results_eq(
  $$select email, phone, linkedin from public.target_contacts where id = (select id from ids where nome = 'homonima')$$,
  $$values (null::text, null::text, null::text)$$,
  'o Contato sem canais continua consultável');

select throws_ok(
  $$select public.create_contact((select id from ids where nome = 'beta'), 'Outra Maria', null, 'maria@alfa.com.br')$$,
  '23505', null, 'o mesmo e-mail não cria um segundo Contato no Workspace');
select throws_ok(
  $$select public.create_contact((select id from ids where nome = 'beta'), 'Outra Maria', null, null, '+55 11 98888-7777')$$,
  '23505', null, 'o mesmo telefone não cria um segundo Contato no Workspace');
select throws_ok(
  $$select public.create_contact((select id from ids where nome = 'beta'), 'Outra Maria', null, null, null, 'linkedin.com/in/Maria-Souza')$$,
  '23505', null, 'o mesmo LinkedIn não cria um segundo Contato no Workspace');
select throws_ok(
  $$select public.create_contact((select id from ids where nome = 'alfa'), '  ')$$,
  '22023', 'contact name is required', 'o nome do Contato é obrigatório');

-- A Maria também atua na Beta: dois Vínculos ativos ao mesmo tempo.
select lives_ok(
  $$select public.link_contact((select id from ids where nome = 'maria'), (select id from ids where nome = 'beta'))$$,
  'o responsável vincula o Contato a outra Conta');
select lives_ok(
  $$select public.link_contact((select id from ids where nome = 'maria'), (select id from ids where nome = 'beta'))$$,
  'vincular de novo não duplica o Vínculo');
select is((select count(*)::int from public.target_contacts where id = (select id from ids where nome = 'maria')), 2,
  'o Contato aparece nas duas Contas onde atua');

-- Interação com a Maria na Alfa.
select lives_ok(
  $$select public.register_account_interaction((select id from ids where nome = 'alfa'), 'reuniao', null,
    (select id from ids where nome = 'maria'))$$,
  'o responsável registra uma Interação com o Contato na Conta');
select throws_ok(
  $$select public.register_account_interaction((select id from ids where nome = 'beta'), 'ligacao', null,
    (select id from ids where nome = 'homonima'))$$,
  '22023', 'contact has no active link with this target account',
  'a Interação exige Vínculo ativo do Contato com a Conta');
select is((select last_interaction_at is not null from public.target_contacts
  where id = (select id from ids where nome = 'maria') and target_account_id = (select id from ids where nome = 'alfa')),
  true, 'o Contato mostra a data da Interação mais recente na Conta');

-- A Maria sai da Alfa: o Vínculo é encerrado e a Interação fica na Alfa.
select lives_ok(
  $$select public.end_contact_link((select id from ids where nome = 'maria'), (select id from ids where nome = 'alfa'))$$,
  'o responsável encerra o Vínculo do Contato');
select is((select count(*)::int from public.target_contacts
  where id = (select id from ids where nome = 'maria') and target_account_id = (select id from ids where nome = 'alfa')), 0,
  'o Contato sai da Conta cujo Vínculo foi encerrado');
select is((select count(*)::int from public.account_interactions
  where contact_id = (select id from ids where nome = 'maria') and target_account_id = (select id from ids where nome = 'alfa')), 1,
  'a Interação anterior continua na Conta onde aconteceu');
select throws_ok(
  $$select public.register_account_interaction((select id from ids where nome = 'alfa'), 'ligacao', null,
    (select id from ids where nome = 'maria'))$$,
  '22023', 'contact has no active link with this target account',
  'o Vínculo encerrado não recebe Interação nova');
select is((select count(*)::int from public.contact_account_links
  where contact_id = (select id from ids where nome = 'maria') and ended_at is not null), 1,
  'o Vínculo encerrado fica no histórico');

-- Edição pelo responsável de uma Conta com Vínculo ativo.
select lives_ok(
  $$select public.update_contact((select id from ids where nome = 'maria'), p_email => 'maria@beta.com.br')$$,
  'o responsável edita o Contato de uma Conta sob sua responsabilidade');
select results_eq(
  $$select name, email, phone from public.contacts where id = (select id from ids where nome = 'maria')$$,
  $$values ('Maria Souza', 'maria@beta.com.br', '+5511988887777')$$,
  'editar sem um campo não apaga o que já existia');

-- Eva é Membro sem Conta sob sua responsabilidade.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.target_contacts), 2, 'todo participante ativo consulta os Contatos do Workspace');
select throws_ok(
  $$select public.create_contact((select id from ids where nome = 'alfa'), 'Joana')$$,
  '42501', 'only the responsible seller or an admin can manage contacts of this target account',
  'o Membro não cria Contato em Conta fora da sua responsabilidade');
select throws_ok(
  $$select public.update_contact((select id from ids where nome = 'maria'), p_name => 'Outra')$$,
  '42501', 'only the responsible seller or an admin can edit this contact',
  'o Membro não edita Contato de Conta fora da sua responsabilidade');
select throws_ok(
  $$insert into public.contacts (workspace_id, name, created_by)
    values ('51000000-0000-0000-0000-000000000001', 'Direto', '50000000-0000-0000-0000-000000000005')$$,
  '42501', null, 'o cliente não grava Contatos por fora do backend');

-- Beto não edita o Contato que só atua na Gama, da Ana; a Ana, Administradora, gerencia Contatos de qualquer Conta.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'lia', id from public.create_contact((select id from ids where nome = 'gama'), 'Lia');
select lives_ok(
  $$select public.create_contact((select id from ids where nome = 'alfa'), 'Rui')$$,
  'a Administradora cria Contato em Conta de outro responsável');
select lives_ok(
  $$select public.update_contact((select id from ids where nome = 'maria'), p_role => 'CEO')$$,
  'a Administradora edita qualquer Contato do Workspace');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.update_contact((select id from ids where nome = 'lia'), p_name => 'Lia Alves')$$,
  '42501', 'only the responsible seller or an admin can edit this contact',
  'o Membro não edita Contato que só atua em Conta de outro responsável');

-- Isolamento por Workspace.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.contacts) + (select count(*)::int from public.contact_account_links), 0,
  'outro Workspace não enxerga Contatos nem Vínculos');
select throws_ok(
  $$select public.link_contact((select id from ids where nome = 'maria'), (select id from ids where nome = 'zeta'))$$,
  'P0002', 'contact not found', 'um Contato de outro Workspace não é vinculado');
select lives_ok(
  $$select public.create_contact((select id from ids where nome = 'zeta'), 'Maria Souza', null, 'maria@beta.com.br')$$,
  'a identidade do Contato é única por Workspace, não entre Workspaces');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.contacts), 0, 'Participação removida não consulta Contatos');

-- O banco garante o Workspace e o Vínculo ativo único mesmo com gravações concorrentes.
reset role;
select throws_ok(
  $$insert into public.contact_account_links (workspace_id, contact_id, target_account_id)
    values ('51000000-0000-0000-0000-000000000001', (select id from ids where nome = 'maria'), (select id from ids where nome = 'zeta'))$$,
  '23503', null, 'um Vínculo nunca liga Contato e Conta de Workspaces diferentes');
select throws_ok(
  $$insert into public.contact_account_links (workspace_id, contact_id, target_account_id)
    values ('51000000-0000-0000-0000-000000000001', (select id from ids where nome = 'maria'), (select id from ids where nome = 'beta'))$$,
  '23505', null, 'só existe um Vínculo ativo por Contato e Conta');

select * from finish();
rollback;
