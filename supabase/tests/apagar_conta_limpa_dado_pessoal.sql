-- B4: apagar a Conta ou o Contato leva o dado pessoal que sobrava (Receita, propostas e Sinal com LinkedIn).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(41);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c4100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@b4-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('c4100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@b4-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('c4100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'eva@b4-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c4200000-0000-0000-0000-000000000001', 'empresa', 'Norte B4'),
  ('c4200000-0000-0000-0000-000000000002', 'empresa', 'Sul B4');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c4200000-0000-0000-0000-000000000001', 'c4100000-0000-0000-0000-000000000001', 'member', true),
  ('c4200000-0000-0000-0000-000000000001', 'c4100000-0000-0000-0000-000000000002', 'admin', true),
  ('c4200000-0000-0000-0000-000000000002', 'c4100000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- Ana é a Vendedora responsável. Carla administra o Norte. Eva administra o Sul.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000001', true);
insert into ids select 'alfa', id::text from public.save_target_account(
  'c4200000-0000-0000-0000-000000000001', 'Alfa Distribuidora', 'https://alfa-b4.test',
  '12.345.678/0001-90', 'https://www.linkedin.com/company/alfa-b4', 'Atacado');
insert into ids select 'beta', id::text from public.save_target_account(
  'c4200000-0000-0000-0000-000000000001', 'Beta Industrial', 'https://beta-b4.test',
  null, 'https://www.linkedin.com/company/beta-b4', 'Industria');
insert into ids select 'gama', id::text from public.save_target_account(
  'c4200000-0000-0000-0000-000000000001', 'Gama Logistica', 'https://gama-b4.test');
insert into ids select 'lia', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'beta'), 'Lia Nunes', 'Gerente',
  'lia.nunes@beta-b4.test', null, 'https://www.linkedin.com/in/lia-nunes');
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000003', true);
insert into ids select 'sul', id::text from public.save_target_account(
  'c4200000-0000-0000-0000-000000000002', 'Sul S.A.', 'https://sul-b4.test');
reset role;

update public.target_accounts set receita_data = '{"razaoSocial":"Alfa Ltda","email":"socio@alfa-b4.test","telefone":"+5511988880000","socios":[{"nome":"Socio Alfa"}]}'::jsonb
where id = (select valor::uuid from ids where chave = 'alfa');
update public.target_accounts set receita_data = '{"razaoSocial":"Beta Industrial","email":"fiscal@beta-b4.test"}'::jsonb
where id = (select valor::uuid from ids where chave = 'beta');
update public.target_accounts set receita_data = '{"razaoSocial":"Sul S.A.","email":"fiscal@sul-b4.test"}'::jsonb
where id = (select valor::uuid from ids where chave = 'sul');

insert into private.proposed_contacts (workspace_id, target_account_id, name, linkedin_url, photo_url, source_data) values
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'alfa'),
    'Proposta Alfa Pessoa', 'https://www.linkedin.com/in/proposta-alfa', 'https://foto-proposta-alfa.test/p.jpg',
    '{"email":"proposta@alfa-b4.test","telefone":"+5511999990000"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
    'Proposta ligada', 'https://www.linkedin.com/in/proposta-pelo-id', null, '{"email":"lia.oculta@beta-b4.test"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'gama'),
    'Proposta na Gama sem vinculo', 'https://www.linkedin.com/in/lia-nunes', null, '{"email":"lia.gama@b4.test"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
    'Proposta so pelo linkedin', 'HTTPS://www.LinkedIn.com/in/lia-nunes?trk=public', 'https://foto-lia.test/p.jpg',
    '{"email":"lia.variante@beta-b4.test"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
    'Otavio Lima', 'https://www.linkedin.com/in/otavio-lima', null, '{"email":"otavio@beta-b4.test"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
    'Lia Nunes', 'https://www.linkedin.com/in/lia-homonima', null, '{"email":"lia.homonima@beta-b4.test"}'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
    'Lia Extra', 'https://www.linkedin.com/in/lia-nunes-extra', null, '{"email":"lia.extra@beta-b4.test"}'),
  ('c4200000-0000-0000-0000-000000000002', (select valor::uuid from ids where chave = 'sul'),
    'Lia do Sul', 'https://www.linkedin.com/in/lia-nunes', null, '{"email":"lia@sul-b4.test"}');
update private.proposed_contacts set contact_id = (select valor::uuid from ids where chave = 'lia')
where name = 'Proposta ligada';

insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at, source, evidence) values
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'alfa'), 'nova_lideranca',
    'lideranca|alfa-b4|proposta-alfa|diretor|2026-09', 'Nova lideranca: Proposta Alfa Pessoa chegou como Diretor',
    now(), 'LinkedIn', 'Proposta Alfa Pessoa — Diretor em Alfa, desde set/2026 (LinkedIn). https://www.linkedin.com/in/proposta-alfa'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'alfa'), 'vaga_linkedin',
    'vaga|alfa|analista|2026', 'Vaga de analista na Alfa', now(), 'LinkedIn', 'Empresa abrindo vaga de analista.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'mudanca_de_emprego',
    'mov|lia-nunes|beta|gerente|2026-09', 'Promocao: Lia Nunes agora e Gerente', now(), 'LinkedIn',
    'Lia Nunes — Gerente em Beta, desde set/2026.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'nova_lideranca',
    'lideranca|beta|sem-perfil|cargo|2026-09', 'Nova lideranca: Lia Nunes chegou como Diretora', now(), 'LinkedIn',
    'Lia Nunes — Diretora em Beta, desde set/2026 (LinkedIn). https://www.linkedin.com/in/lia-nunes'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'vaga_linkedin',
    'vaga|beta|analista|2026', 'Vaga de analista na Beta', now(), 'LinkedIn', 'Empresa abrindo vaga de analista.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'vaga_linkedin',
    'vaga|beta|lia-nunes|2026', 'Vaga de lia-nunes na Beta', now(), 'LinkedIn', 'Empresa abrindo a vaga lia-nunes.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'nova_lideranca',
    'lideranca|lia-nunes|outra-pessoa|cargo|2026-09', 'Nova lideranca na pagina lia-nunes', now(), 'LinkedIn',
    'Outra Pessoa — cargo em Beta.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'entradas_e_saidas',
    'entrada|beta|lia-nunes|2026-09', 'Entrada: Lia Nunes chegou', now(), 'LinkedIn',
    'Lia Nunes chegou em Beta.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'anuncio_de_movimentacao',
    'post|lia-nunes', 'Anuncio da empresa', now(), 'LinkedIn', 'A empresa publicou uma nota.'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'mudanca_de_emprego',
    'mov|lia-homonima|beta|cargo|2026-08', 'Promocao: Lia Nunes agora e Analista', now(), 'LinkedIn',
    'Lia Nunes — Analista em Outra, desde ago/2026 (LinkedIn). https://www.linkedin.com/in/lia-homonima'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'), 'mudanca_de_emprego',
    'mov|lia-nunes-extra|beta|cargo|2026-07', 'Chegada: Lia Extra entrou como Analista', now(), 'LinkedIn',
    'Lia Extra — Analista em Beta (LinkedIn). https://www.linkedin.com/in/lia-nunes-extra'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'gama'), 'mudanca_de_emprego',
    'mov|lia-nunes|gama|analista|2026-09', 'Mudanca de empresa: Lia Nunes saiu', now(), 'LinkedIn',
    'Lia Nunes saiu de Gama. https://www.linkedin.com/in/lia-nunes'),
  ('c4200000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'gama'), 'vaga_linkedin',
    'vaga|gama|analista|2026', 'Vaga de analista na Gama', now(), 'LinkedIn', 'Empresa abrindo vaga de analista.'),
  ('c4200000-0000-0000-0000-000000000002', (select valor::uuid from ids where chave = 'sul'), 'mudanca_de_emprego',
    'mov|lia-nunes|sul|cfo|2026-09', 'Promocao: Lia Nunes agora e CFO', now(), 'LinkedIn',
    'Lia Nunes — CFO em Sul (LinkedIn). https://www.linkedin.com/in/lia-nunes');

-- Quem não administra, outro Workspace e a confirmação errada não apagam nada.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  '42501', 'only administrators can permanently delete a target account',
  'participante que não é Administrador não apaga a Conta');
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  'P0002', 'target account not found',
  'administrador de outro Workspace não encontra a Conta');
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa')$$,
  '22023', 'the confirmation does not match the target account name',
  'a confirmação pelo nome continua obrigatória');
reset role;
select is(
  (select receita_data->>'email' from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  'socio@alfa-b4.test', 'a confirmação recusada deixa a Receita no lugar');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000002', true);
select is(
  (public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), ' ALFA distribuidora ') ->> 'result'),
  'erased', 'a Administradora apaga a Conta');
reset role;

select is(
  (select receita_data is null from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  true, 'apagar a Conta grava receita_data nulo no marcador');
select is(
  (select name || '|' || canonical_url || '|' || domain || '|' || coalesce(legal_identifier, '-') || '|'
      || coalesce(linkedin_url, '-') || '|' || coalesce(segment, '-') || '|' || (deleted_at is not null)::text
    from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  'Conta apagada|https://conta-apagada.invalid/' || (select valor from ids where chave = 'alfa')
    || '|conta-apagada.invalid|-|-|-|true',
  'o marcador segue sem nome, URL, domínio, identificador legal, LinkedIn e segmento');
select is(
  (select count(*)::int from private.proposed_contacts where target_account_id = (select valor::uuid from ids where chave = 'alfa')),
  0, 'apagar a Conta apaga as propostas, inclusive source_data, nome, foto e LinkedIn');
select is(
  (select count(*)::int from private.proposed_contacts where source_data::text like '%proposta@alfa-b4.test%'
      or photo_url = 'https://foto-proposta-alfa.test/p.jpg' or linkedin_url like '%/in/proposta-alfa'),
  0, 'não sobra proposta com o dado da pessoa da Conta apagada');
select is(
  (select count(*)::int from private.signals where target_account_id = (select valor::uuid from ids where chave = 'alfa')),
  0, 'apagar a Conta continua apagando os Sinais dela');
select is(
  (select count(*)::int from private.signals
    where workspace_id = 'c4200000-0000-0000-0000-000000000001'
      and (event_key like '%proposta-alfa%' or evidence like '%linkedin.com/in/proposta-alfa%'
        or phrase like '%Proposta Alfa Pessoa%')),
  0, 'não resta Sinal com nome ou URL de LinkedIn de terceiro da Conta apagada');
select is(
  (select count(*)::int from private.proposed_contacts where target_account_id = (select valor::uuid from ids where chave = 'beta')),
  5, 'as propostas das outras Contas do Workspace ficam');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-nunes|beta|gerente|2026-09'),
  1, 'o Sinal de outra Conta fica até o Contato ser apagado');
select is(
  (select receita_data->>'email' from public.target_accounts where id = (select valor::uuid from ids where chave = 'sul')),
  'fiscal@sul-b4.test', 'a Receita do outro Workspace fica');
select is(
  (select count(*)::int from private.proposed_contacts where workspace_id = 'c4200000-0000-0000-0000-000000000002'),
  1, 'a proposta do outro Workspace fica');
select is(
  (select count(*)::int from private.signals where workspace_id = 'c4200000-0000-0000-0000-000000000002'),
  1, 'o Sinal do outro Workspace fica');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::int from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  0, 'outro Workspace não vê o que foi apagado');
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::int from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  0, 'no próprio Workspace o marcador também não aparece');

-- Apagar o Contato: propostas ligadas a ele e Sinais com o LinkedIn dele. O da empresa fica.
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'lia'), 'Lia Nunes')$$,
  '42501', 'only administrators can permanently delete a contact',
  'participante que não é Administrador não apaga o Contato');
select set_config('request.jwt.claim.sub', 'c4100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'lia'), 'Lia')$$,
  '22023', 'the confirmation does not match the contact name',
  'a confirmação pelo nome do Contato continua obrigatória');
select is(
  (public.erase_contact((select valor::uuid from ids where chave = 'lia'), ' lia NUNES ') ->> 'result'),
  'erased', 'a Administradora apaga o Contato');
reset role;

select is(
  (select count(*)::int from private.proposed_contacts where name = 'Proposta ligada'),
  0, 'apagar o Contato apaga a proposta ligada pelo contact_id, mesmo com outro LinkedIn');
select is(
  (select count(*)::int from private.proposed_contacts where name = 'Proposta so pelo linkedin'),
  0, 'apagar o Contato apaga a proposta do mesmo LinkedIn na Conta, sem contact_id');
select is(
  (select count(*)::int from private.proposed_contacts where name = 'Proposta na Gama sem vinculo'),
  1, 'o mesmo LinkedIn numa Conta sem vínculo com o Contato fica');
select is(
  (select count(*)::int from private.proposed_contacts where name = 'Otavio Lima'),
  1, 'a proposta de outra pessoa na mesma Conta fica');
select is(
  (select count(*)::int from private.proposed_contacts where linkedin_url = 'https://www.linkedin.com/in/lia-homonima'),
  1, 'o mesmo nome com outro LinkedIn não casa e a proposta fica');
select is(
  (select count(*)::int from private.proposed_contacts where linkedin_url = 'https://www.linkedin.com/in/lia-nunes-extra'),
  1, 'um LinkedIn que só começa igual não casa');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-nunes|beta|gerente|2026-09'),
  0, 'apagar o Contato apaga o Sinal com o perfil na chave');
select is(
  (select count(*)::int from private.signals where event_key = 'lideranca|beta|sem-perfil|cargo|2026-09'),
  0, 'apagar o Contato apaga o Sinal com a URL do LinkedIn na evidência');
select is(
  (select count(*)::int from private.signals where event_key = 'vaga|beta|analista|2026'),
  1, 'o Sinal que só fala da empresa permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'vaga|beta|lia-nunes|2026'),
  1, 'uma vaga cujo cargo é o texto do perfil permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'lideranca|lia-nunes|outra-pessoa|cargo|2026-09'),
  1, 'uma liderança cuja empresa é o texto do perfil, e a pessoa é outra, permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'entrada|beta|lia-nunes|2026-09'),
  0, 'apagar o Contato apaga a entrada que traz o perfil na chave');
select is(
  (select count(*)::int from private.signals where event_key = 'post|lia-nunes'),
  1, 'um anúncio da empresa cujo id é o texto do perfil permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-homonima|beta|cargo|2026-08'),
  1, 'o Sinal com o mesmo nome e outro LinkedIn permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-nunes-extra|beta|cargo|2026-07'),
  1, 'o Sinal de um perfil que só começa igual permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-nunes|gama|analista|2026-09'),
  0, 'o Sinal de outra Conta do Workspace que carrega o mesmo LinkedIn sai');
select is(
  (select count(*)::int from private.signals where event_key = 'vaga|gama|analista|2026'),
  1, 'o Sinal da empresa na outra Conta permanece');
select is(
  (select count(*)::int from private.signals where event_key = 'mov|lia-nunes|sul|cfo|2026-09'),
  1, 'o Sinal igual no outro Workspace permanece');
select is(
  (select count(*)::int from private.proposed_contacts where name = 'Lia do Sul'),
  1, 'a proposta igual no outro Workspace permanece');
select is(
  (select name || '|' || (receita_data->>'email') from public.target_accounts where id = (select valor::uuid from ids where chave = 'beta')),
  'Beta Industrial|fiscal@beta-b4.test', 'apagar o Contato deixa a Conta e a Receita dela');

select * from finish();
rollback;
