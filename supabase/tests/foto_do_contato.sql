begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(43);

-- Workspace Norte: Ana (Administradora), Beto (Membro responsável pela Alfa) e Dora (Participação removida).
-- Caio é Administrador do Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('a2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('a2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'admin', true),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'member', true),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'member', false),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (nome text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
insert into ids select 'alfa', id from public.save_target_account('a2000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Maria Souza', 'CFO', 'maria@alfa.com.br', null,
  'https://www.linkedin.com/in/maria-souza/?trk=x');
insert into ids select 'rui', id from public.create_contact((select id from ids where nome = 'alfa'), 'Rui Lima');
insert into ids select 'empresa', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Página', null, null, null, 'https://www.linkedin.com/company/alfa');
insert into ids select 'vera', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Vera Dias', null, null, null, 'linkedin.com/in/vera-dias');
insert into ids select 'lia', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Lia Prado', null, null, null, 'linkedin.com/in/lia-prado');
insert into ids select 'manual', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Manoel', null, null, null, 'linkedin.com/in/manoel');

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
insert into ids select 'zeta', id from public.save_target_account('a2000000-0000-0000-0000-000000000002', 'Zeta', 'zeta.com.br');
insert into ids select 'zico', id from public.create_contact(
  (select id from ids where nome = 'zeta'), 'Zico', null, null, null, 'linkedin.com/in/zico');

create function pg_temp.contato(p_nome text) returns uuid language sql as $f$
  select id from ids where nome = p_nome;
$f$;
grant execute on function pg_temp.contato(text) to authenticated, service_role;

-- 1. Qualquer Participação ativa reserva a consulta, não só o Vendedor responsável: Ana é Administradora, mas a Alfa
-- é do Beto, e o Beto é Membro.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
create temporary table reserva_maria on commit drop as
  select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'));
grant select on reserva_maria to authenticated, service_role;
select is((select linkedin_url from reserva_maria), 'https://www.linkedin.com/in/maria-souza',
  'o Membro reserva a consulta e recebe o perfil LinkedIn normalizado do Contato');
select is((select workspace_id from reserva_maria), 'a2000000-0000-0000-0000-000000000001'::uuid,
  'a reserva devolve o Workspace do Contato');
select results_eq(
  $$select status, photo_url, origin from public.contact_photo_status where contact_id = pg_temp.contato('maria')$$,
  $$values ('pending', null::text, 'apify')$$,
  'o estado fica pending, sem foto, com a origem Apify');

-- 2. Isolamento por Workspace e Participação ativa.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.contact_photo_status), 1,
  'outra Participação ativa do Workspace vê o estado da foto');
select is((select count(*)::int from public.contact_photos), 1, 'e a linha do estado');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.contact_photo_status), 0, 'o outro Workspace não vê o estado');
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  'P0002', 'contact not found', 'o outro Workspace não reserva consulta de um Contato que não é dele');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  'P0002', 'contact not found', 'quem teve a Participação removida não reserva');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  '28000', 'authentication required', 'sem sessão, nada é reservado');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(gen_random_uuid())$$,
  'P0002', 'contact not found', 'um Contato inexistente não é encontrado');

-- 3. Só um perfil /in/ é consultado.
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('rui'))$$,
  '22023', 'contact has no linkedin profile url', 'um Contato sem LinkedIn não é consultado');
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('empresa'))$$,
  '22023', 'contact has no linkedin profile url', 'nem um LinkedIn que não é perfil de pessoa');

-- 4. Uma consulta em andamento por Contato.
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  '55006', 'photo lookup in flight', 'com a consulta em andamento, outra não começa');

-- 5. O navegador não escreve o estado nem escolhe a URL da foto.
select throws_ok(
  $$select public.finish_contact_photo_lookup((select lookup_id from reserva_maria), 'found', 'https://cdn.exemplo/x.jpg')$$,
  '42501', null, 'quem tem sessão de usuário não grava o resultado');
select throws_ok(
  $$update public.contact_photos set photo_url = 'https://cdn.exemplo/x.jpg'$$,
  '42501', null, 'nem altera a tabela do estado');
select throws_ok($$select count(*) from private.contact_photo_lookups$$, '42501', null,
  'e a trilha das consultas é fechada');

-- 6. A Edge Function grava o resultado com a chave de serviço.
reset role;
set local role service_role;
select throws_ok(
  $$select public.finish_contact_photo_lookup((select lookup_id from reserva_maria), 'found', 'http://cdn.exemplo/x.jpg')$$,
  '22023', 'a found photo needs an https url', 'uma foto encontrada exige uma URL https');
select is(
  public.finish_contact_photo_lookup((select lookup_id from reserva_maria), 'found',
    'https://media.licdn.com/dms/image/maria.jpg?e=4102444800', '2100-01-01T00:00:00Z',
    'harvestapi~linkedin-profile-scraper', 'run-1'),
  true, 'a resposta com a foto é gravada');
select is(
  public.finish_contact_photo_lookup((select lookup_id from reserva_maria), 'not_found'),
  false, 'a mesma reserva não grava duas vezes');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select status, photo_url, actor_id, run_id, (observed_at is not null) from public.contact_photo_status
    where contact_id = pg_temp.contato('maria')$$,
  $$values ('found', 'https://media.licdn.com/dms/image/maria.jpg?e=4102444800', 'harvestapi~linkedin-profile-scraper',
    'run-1', true)$$,
  'a tela lê a foto, o Actor, a execução e a data de observação');

-- 7. Retry e custo: um minuto entre consultas, três por dia para o Contato.
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  '54000', 'contact photo lookup limit reached', 'o mesmo Contato não é consultado duas vezes no mesmo minuto');
reset role;
update private.contact_photo_lookups set requested_at = now() - interval '2 hours';
set local role authenticated;
create temporary table reserva_maria_2 on commit drop as
  select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'));
grant select on reserva_maria_2 to authenticated, service_role;
select is((select photo_url from public.contact_photo_status where contact_id = pg_temp.contato('maria')),
  'https://media.licdn.com/dms/image/maria.jpg?e=4102444800',
  'passado um minuto, a nova consulta começa e a foto anterior continua valendo até a resposta');

reset role;
set local role service_role;
select public.finish_contact_photo_lookup((select lookup_id from reserva_maria_2), 'failed', null, null,
  'harvestapi~linkedin-profile-scraper', null, 'timeout');
reset role;
set local role authenticated;
select results_eq(
  $$select status, photo_url is not null, error_code from public.contact_photo_status where contact_id = pg_temp.contato('maria')$$,
  $$values ('failed', true, 'timeout')$$,
  'a falha do Actor registra o erro e mantém a foto anterior');

reset role;
update private.contact_photo_lookups set requested_at = now() - interval '2 hours';
set local role authenticated;
create temporary table reserva_maria_3 on commit drop as
  select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'));
grant select on reserva_maria_3 to authenticated, service_role;
reset role;
set local role service_role;
select public.finish_contact_photo_lookup((select lookup_id from reserva_maria_3), 'not_found', null, null,
  'harvestapi~linkedin-profile-scraper', 'run-3');
reset role;
set local role authenticated;
select results_eq(
  $$select status, photo_url from public.contact_photo_status where contact_id = pg_temp.contato('maria')$$,
  $$values ('not_found', null::text)$$,
  'um perfil sem foto pública vira not_found e apaga a foto anterior');

reset role;
update private.contact_photo_lookups set requested_at = now() - interval '2 hours';
set local role authenticated;
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('maria'))$$,
  '54000', 'contact photo lookup limit reached', 'a partir de três consultas em um dia, o Contato espera');
select is((select count(*)::int from public.contact_photo_status where contact_id = pg_temp.contato('maria')), 1,
  'a recusa não mexe no estado do Contato');

-- 8. O limite diário do Workspace: cinquenta reservas contam, com ou sem foto.
reset role;
insert into private.contact_photo_lookups (workspace_id, contact_id, requested_by)
select 'a2000000-0000-0000-0000-000000000001', pg_temp.contato('rui'), 'a1000000-0000-0000-0000-000000000001'
from generate_series(1, 47);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('vera'))$$,
  '54000', 'workspace photo lookup limit reached', 'acima de cinquenta consultas no dia, o Workspace espera');
reset role;
update private.contact_photo_lookups set requested_at = now() - interval '2 days'
where contact_id = pg_temp.contato('rui');
set local role authenticated;
select lives_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('vera'))$$,
  'no dia seguinte, a consulta volta a ser aceita');
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('zico'))$$,
  'o limite de um Workspace não vale para o outro');

-- 9. Uma consulta parada há mais de 3 minutos não segura o Contato, e a resposta atrasada dela não vale.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
create temporary table reserva_vera_1 on commit drop as
  select lookup_id from public.contact_photos where contact_id = pg_temp.contato('vera');
grant select on reserva_vera_1 to service_role;
reset role;
update private.contact_photo_lookups set requested_at = now() - interval '10 minutes'
where contact_id = pg_temp.contato('vera');
update public.contact_photos set updated_at = now() - interval '4 minutes' where contact_id = pg_temp.contato('vera');
set local role authenticated;
create temporary table reserva_vera_2 on commit drop as
  select * from public.begin_contact_photo_lookup(pg_temp.contato('vera'));
grant select on reserva_vera_2 to service_role;
select isnt((select lookup_id from reserva_vera_2), (select lookup_id from reserva_vera_1),
  'a consulta parada é substituída por uma nova');
reset role;
set local role service_role;
select is(
  public.finish_contact_photo_lookup((select lookup_id from reserva_vera_1), 'found', 'https://cdn.exemplo/velha.jpg'),
  false, 'a resposta atrasada da consulta substituída não grava');
reset role;
select is((select status from public.contact_photos where contact_id = pg_temp.contato('vera')), 'pending',
  'e o estado continua o da consulta nova');

-- 10. A foto deixa de valer sem apagar o Contato: URL vencida, observação com mais de 30 dias e outro LinkedIn.
set local role service_role;
select public.finish_contact_photo_lookup((select lookup_id from reserva_vera_2), 'found',
  'https://media.licdn.com/dms/image/vera.jpg?e=1', '2001-01-01T00:00:00Z');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select status, photo_url from public.contact_photo_status where contact_id = pg_temp.contato('vera')$$,
  $$values ('found', null::text)$$,
  'uma URL vencida não aparece: a tela mostra as iniciais');
reset role;
update public.contact_photos set photo_url_expires_at = null, observed_at = now() - interval '31 days'
where contact_id = pg_temp.contato('vera');
set local role authenticated;
select is((select photo_url from public.contact_photo_status where contact_id = pg_temp.contato('vera')), null,
  'nem uma foto observada há mais de 30 dias');
reset role;
update public.contact_photos set observed_at = now() where contact_id = pg_temp.contato('vera');
set local role authenticated;
select is((select photo_url from public.contact_photo_status where contact_id = pg_temp.contato('vera')),
  'https://media.licdn.com/dms/image/vera.jpg?e=1', 'dentro do prazo e sem validade vencida, a foto aparece');
select public.update_contact(pg_temp.contato('vera'), null, null, null, null, 'https://www.linkedin.com/in/outra-vera');
select is((select photo_url from public.contact_photo_status where contact_id = pg_temp.contato('vera')), null,
  'quem troca o LinkedIn do Contato deixa a foto do perfil antigo de lado');

-- 11. A limpeza diária apaga a URL vencida e mantém o registro.
reset role;
update public.contact_photos set observed_at = now() - interval '31 days' where contact_id = pg_temp.contato('vera');
select is(private.purge_contact_photos(), 1, 'a limpeza apaga a URL de uma foto com mais de 30 dias');
select results_eq(
  $$select photo_url, status, actor_id is null, observed_at is not null from public.contact_photos
    where contact_id = pg_temp.contato('vera')$$,
  $$values (null::text, 'found', true, true)$$,
  'e conserva o estado e a data de observação');

-- 12. Uma foto manual não é substituída pela consulta, e a consulta só mexe na foto.
insert into public.contact_photos (contact_id, workspace_id, origin, status, photo_url, linkedin_url, observed_at)
values (pg_temp.contato('manual'), 'a2000000-0000-0000-0000-000000000001', 'manual', 'found',
  'https://cdn.exemplo/manual.jpg', 'https://www.linkedin.com/in/manoel', now());
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.begin_contact_photo_lookup(pg_temp.contato('manual'))$$,
  '55000', 'manual photo needs confirmation to be replaced', 'a consulta não substitui a foto manual sem confirmação');
select is((select photo_url from public.contact_photo_status where contact_id = pg_temp.contato('manual')),
  'https://cdn.exemplo/manual.jpg', 'a foto manual segue como estava');
reset role;
select is(purge_check.n, 0, 'a limpeza também não apaga a foto manual')
from (select private.purge_contact_photos() as n) purge_check;
select results_eq(
  $$select name, role, email, linkedin from public.contacts where id = pg_temp.contato('maria')$$,
  $$values ('Maria Souza', 'CFO', 'maria@alfa.com.br', 'https://www.linkedin.com/in/maria-souza')$$,
  'nome, cargo e canais do Contato ficam como estavam: a consulta só trata da foto');

-- 13. Apagar o Contato apaga o estado da foto e a trilha dela.
delete from public.contacts where id = pg_temp.contato('manual');
select is((select count(*)::int from public.contact_photos where contact_id = pg_temp.contato('manual')), 0,
  'apagar o Contato apaga o estado da foto');

select * from finish();
rollback;
