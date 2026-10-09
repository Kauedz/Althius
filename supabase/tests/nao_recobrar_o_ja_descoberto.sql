-- Nunca cobrar de novo o que já foi descoberto (decisão do Renan, 09/10/2026).
-- Comitê: a pessoa já descoberta para a Conta (proposta em qualquer estado, ou Contato com Vínculo, pelo LinkedIn sem
-- caixa e normalizado) não é nova, e a busca liquida a reserva só pelas novas. Revelar: o Contato que já tem o dado cota
-- 0 e a conferência do servidor devolve o que existe. Nada disso lê outro Workspace.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(45);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@recobrar-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'eva@recobrar-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c2000000-0000-0000-0000-000000000001', 'empresa', 'Norte Recobrar'),
  ('c2000000-0000-0000-0000-000000000002', 'empresa', 'Sul Recobrar');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'admin', true),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'admin', true);

select public.grant_credits('c2000000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial do Norte');
select public.grant_credits('c2000000-0000-0000-0000-000000000002', 100, 'plano', 'Saldo inicial do Sul');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'TOTVS', 'https://totvs-recobrar.test', 'totvs-recobrar.test', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Outra Conta', 'https://outra-recobrar.test', 'outra-recobrar.test', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000002', 'TOTVS no Sul', 'https://totvs-sul.test', 'totvs-sul.test', 'c1000000-0000-0000-0000-000000000002');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002');

create temporary table ids (chave text primary key, valor uuid not null);
grant select, insert on ids to authenticated;

create function pg_temp.id(p_chave text) returns uuid language sql as $f$
  select valor from ids where chave = p_chave
$f$;

create function pg_temp.sessao(p_usuario uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claim.sub', p_usuario::text, true);
$f$;

create function pg_temp.disponivel() returns numeric language sql as $f$
  select available from public.get_credit_balance('c2000000-0000-0000-0000-000000000001')
$f$;

-- Busca do comitê na TOTVS, como a sessão da Ana a abre.
create function pg_temp.comecar(p_chave text, p_limite integer, p_conta uuid default 'c3000000-0000-0000-0000-000000000001')
returns void language plpgsql as $f$
begin
  insert into ids select p_chave, b.run_id from public.begin_committee_discovery(
    'c2000000-0000-0000-0000-000000000001', p_conta, p_chave, p_limite) b;
end
$f$;

-- O que record_proposed_contact devolve, como o servidor grava: "created" e se a linha devolvida é a da chave dada.
create function pg_temp.propor(
  p_busca text, p_nome text, p_linkedin text, p_conta uuid default 'c3000000-0000-0000-0000-000000000001'
) returns table (created boolean, id uuid) language sql as $f$
  select r.created, r.id from public.record_proposed_contact(
    'c2000000-0000-0000-0000-000000000001', p_conta, pg_temp.id(p_busca), p_nome, null, null, p_linkedin) r
$f$;

create function pg_temp.busca(p_chave text) returns text language sql as $f$
  select r.state || ' ' || r.found || '/' || r.added || '/' || r.duplicates
  from private.discovery_runs r where r.id = pg_temp.id(p_chave)
$f$;

create function pg_temp.reserva(p_chave text) returns text language sql as $f$
  select c.status || ':' || coalesce(c.settled_quantity, 0)
  from private.discovery_runs r join private.credit_reservations c on c.id = r.reservation_id
  where r.id = pg_temp.id(p_chave)
$f$;

select pg_temp.sessao('c1000000-0000-0000-0000-000000000001');
create temporary table saldo (momento text primary key, valor numeric);
grant select on saldo to authenticated;
insert into saldo values ('inicio', pg_temp.disponivel());

-- 1. Primeira busca: duas pessoas novas, 2 créditos.
select pg_temp.comecar('busca1', 5);
insert into ids select 'fernando', id from pg_temp.propor('busca1', 'Fernando Sollak', 'https://www.linkedin.com/in/Fernando-Sollak');
select is((select created from pg_temp.propor('busca1', 'Gilsomar Maia', 'https://www.linkedin.com/in/gilsomar-maia')), true,
  'pessoa nova para a Conta é criada como nova');
select public.finish_committee_discovery(pg_temp.id('busca1'), true, 2, 0.026, null, 'apify-1');
select is(pg_temp.busca('busca1'), 'concluida 2/2/0', 'a primeira busca registra 2 devolvidas e 2 novas');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'inicio') - 2, 'duas pessoas novas debitam 2 créditos');

-- 2. A repetição de 09/10: limite 1, devolveu Fernando, que já era proposta. Outra caixa, outro host, barra no fim.
insert into saldo values ('antes_da_repeticao', pg_temp.disponivel());
select pg_temp.comecar('busca2', 1);
create temporary table repetida as
  select * from pg_temp.propor('busca2', 'Fernando Sollak', 'http://br.linkedin.com/in/fernando-sollak/?trk=x');
select is((select created from repetida), false, 'a mesma pessoa, sem caixa e com a URL normalizada, não é nova');
select is((select id from repetida), pg_temp.id('fernando'), 'devolve a proposta que já existia');
select is((select count(*)::integer from private.proposed_contacts where target_account_id = 'c3000000-0000-0000-0000-000000000001'), 2,
  'a repetição não cria linha');
select public.finish_committee_discovery(pg_temp.id('busca2'), true, 1, 0.023, null, 'bIuIxWUJtmn72cKeb');
select is(pg_temp.busca('busca2'), 'concluida 1/0/1', 'found = devolvidas, added = 0 e duplicates = 1');
select is(pg_temp.reserva('busca2'), 'released:0', 'a reserva da repetição é liberada');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'antes_da_repeticao'),
  'só pessoas repetidas debitam 0');
select is((select apify_run_id from private.discovery_runs where id = pg_temp.id('busca2')), 'bIuIxWUJtmn72cKeb',
  'o custo e o id do Apify continuam gravados');
select is((select actual_cost_usd from private.discovery_runs where id = pg_temp.id('busca2')), 0.023::numeric,
  'o dólar da execução continua gravado');

-- 3. Proposta descartada ou aceita também já foi descoberta.
set local role authenticated;
select public.discard_proposed_contact(
  (select p.id from public.list_proposed_contacts('c3000000-0000-0000-0000-000000000001', null) p where p.name = 'Gilsomar Maia'),
  'não é o perfil');
reset role;
insert into saldo values ('antes_da_busca3', pg_temp.disponivel());
select pg_temp.comecar('busca3', 3);
select is((select created from pg_temp.propor('busca3', 'Gilsomar Maia', 'https://www.linkedin.com/in/GILSOMAR-MAIA')), false,
  'proposta descartada não volta como nova');
set local role authenticated;
select public.accept_proposed_contact(pg_temp.id('fernando'));
reset role;
select is((select created from pg_temp.propor('busca3', 'Fernando Sollak', 'https://linkedin.com/in/fernando-sollak')), false,
  'proposta aceita não volta como nova');

-- 4. Contato com Vínculo com a Conta e ainda sem proposta: ganha a proposta (o aceite copia a Persona), sem custo.
set local role authenticated;
insert into ids select 'caio', id from public.create_contact(
  'c3000000-0000-0000-0000-000000000001', 'Caio Contato', 'Analista', null, null, 'https://www.linkedin.com/in/Caio-Contato');
reset role;
create temporary table caio as
  select * from pg_temp.propor('busca3', 'Caio Contato', 'https://www.linkedin.com/in/caio-contato');
select is((select created from caio), false, 'Contato da Conta com o mesmo LinkedIn não é novo');
select is((select new_to_account from private.proposed_contacts where id = (select id from caio)), false,
  'a proposta do Contato existente fica marcada como não nova');
select is((select created from pg_temp.propor('busca3', 'Nina Nova', 'https://www.linkedin.com/in/nina-nova')), true,
  'quem a Conta não conhecia continua novo');
select public.finish_committee_discovery(pg_temp.id('busca3'), true, 4, 0.032, null, 'apify-3');
select is(pg_temp.busca('busca3'), 'concluida 4/1/3', 'quatro examinadas, uma nova, três já encontradas');
select is(pg_temp.reserva('busca3'), 'settled:1', 'a reserva de 3 é liquidada só pela nova; o resto volta');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'antes_da_busca3') - 1, 'debita só a nova');

-- 5. Outra Conta do mesmo Workspace: a mesma pessoa é nova para ela.
select pg_temp.comecar('busca4', 1, 'c3000000-0000-0000-0000-000000000002');
select is((select created from pg_temp.propor('busca4', 'Fernando Sollak', 'https://www.linkedin.com/in/fernando-sollak',
  'c3000000-0000-0000-0000-000000000002')), true, 'a mesma pessoa é nova para outra Conta');
select public.finish_committee_discovery(pg_temp.id('busca4'), true, 1);
select is(pg_temp.reserva('busca4'), 'settled:1', 'e custa 1 crédito nela');

-- 6. O banco nunca liquida além do reservado, mesmo que a busca grave mais novas do que o limite.
select pg_temp.comecar('busca5', 1);
select pg_temp.propor('busca5', 'Olga Nova', 'https://www.linkedin.com/in/olga-nova');
select pg_temp.propor('busca5', 'Paulo Novo', 'https://www.linkedin.com/in/paulo-novo');
select public.finish_committee_discovery(pg_temp.id('busca5'), true, 2);
select is(pg_temp.reserva('busca5'), 'settled:1', 'liquida no máximo o tamanho da reserva');

-- 7. Quantas pessoas a Conta já conhece: propostas em qualquer estado e Contatos com Vínculo, sem repetir.
select is(public.count_known_committee_people('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001'), 6,
  'Fernando, Gilsomar, Caio, Nina, Olga e Paulo, cada um uma vez');
select is(public.count_known_committee_people('c2000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000001'), 0,
  'a contagem não atravessa Workspaces');
select ok(not has_function_privilege('authenticated', 'public.count_known_committee_people(uuid,uuid)', 'EXECUTE'),
  'a contagem é só do servidor');
select ok(has_function_privilege('service_role', 'public.count_known_committee_people(uuid,uuid)', 'EXECUTE'),
  'service_role conta');

-- 8. Revelar: o Contato que já tem o dado cota 0 e a conferência do servidor devolve o que existe.
set local role authenticated;
insert into ids select 'com_email', id from public.create_contact(
  'c3000000-0000-0000-0000-000000000001', 'Gilsomar Maia', 'CFO', 'gilsomar@totvs-recobrar.test', '+55 11 98888-7777',
  'https://www.linkedin.com/in/gilsomar-maia');
insert into ids select 'sem_email', id from public.create_contact(
  'c3000000-0000-0000-0000-000000000001', 'Sara Sem Email', 'Diretora', null, null, 'https://www.linkedin.com/in/sara-sem-email');

select is((select row(q.credits, q.can_reveal, q.already_known)::text from public.quote_reveal_contact(pg_temp.id('com_email'), 'email') q),
  '(0,t,t)', 'e-mail que já existe cota 0 crédito e já encontrado');
select is((select row(q.credits, q.already_known)::text from public.quote_reveal_contact(pg_temp.id('sem_email'), 'email') q),
  '(2,f)', 'sem e-mail, a cotação continua 2 créditos');
select is((select row(q.credits, q.already_known)::text from public.quote_reveal_contact(pg_temp.id('com_email'), 'telefone') q),
  '(0,t)', 'telefone que já existe também cota 0');
select is((select e.value from public.existing_reveal_value('c2000000-0000-0000-0000-000000000001', pg_temp.id('com_email'), 'email') e),
  'gilsomar@totvs-recobrar.test', 'o servidor lê com a sessão o e-mail que o Contato já tem');
select is((select count(*)::integer from public.existing_reveal_value('c2000000-0000-0000-0000-000000000001', pg_temp.id('sem_email'), 'email')),
  0, 'sem e-mail, a conferência não devolve nada e a revelação segue');
reset role;

-- Um e-mail revelado antes (com o provedor gravado) é o que volta depois, sem custo.
create temporary table revelacao as select b.reservation_id from public.begin_reveal_contact(
  'c2000000-0000-0000-0000-000000000001', pg_temp.id('sem_email'), 'email') b;
select is((select f.success::text || ':' || f.debited_credits from public.finish_reveal_contact(
  (select reservation_id from revelacao), pg_temp.id('sem_email'), 'email', 'sara@totvs-recobrar.test',
  'apify:harvestapi~linkedin-profile-scraper') f), 'true:2', 'a primeira revelação cobra 2');
insert into saldo values ('depois_de_revelar', pg_temp.disponivel());
set local role authenticated;
select is((select row(e.value, e.provider)::text from public.existing_reveal_value(
  'c2000000-0000-0000-0000-000000000001', pg_temp.id('sem_email'), 'email') e),
  '(sara@totvs-recobrar.test,apify:harvestapi~linkedin-profile-scraper)', 'depois de revelado, volta com o provedor de origem');
select is((select q.credits from public.quote_reveal_contact(pg_temp.id('sem_email'), 'email') q), 0,
  'e a cotação passa a 0 crédito');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'depois_de_revelar'),
  'cotar e conferir não reservam nem debitam');

-- 9. Isolamento: o mesmo LinkedIn com e-mail no Sul não vira e-mail no Norte.
select pg_temp.sessao('c1000000-0000-0000-0000-000000000002');
insert into ids select 'sul', id from public.create_contact(
  'c3000000-0000-0000-0000-000000000003', 'Tito Sul', 'CEO', 'tito@sul.test', null, 'https://www.linkedin.com/in/tito-mesmo');
select pg_temp.sessao('c1000000-0000-0000-0000-000000000001');
insert into ids select 'norte', id from public.create_contact(
  'c3000000-0000-0000-0000-000000000001', 'Tito Norte', 'CEO', null, null, 'https://www.linkedin.com/in/Tito-Mesmo');
select is((select row(q.credits, q.already_known)::text from public.quote_reveal_contact(pg_temp.id('norte'), 'email') q),
  '(2,f)', 'o e-mail do mesmo LinkedIn em outro Workspace não é reaproveitado');
select is((select count(*)::integer from public.existing_reveal_value('c2000000-0000-0000-0000-000000000001', pg_temp.id('norte'), 'email')),
  0, 'a conferência do Norte não enxerga o Sul');

select pg_temp.sessao('c1000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select * from public.existing_reveal_value('c2000000-0000-0000-0000-000000000001', pg_temp.id('com_email'), 'email')$$,
  '42501', null, 'quem não participa do Workspace não lê o e-mail');
select throws_ok(
  $$select * from public.existing_reveal_value('c2000000-0000-0000-0000-000000000002', pg_temp.id('com_email'), 'email')$$,
  'P0002', null, 'o Contato de outro Workspace não existe para a sessão');
select throws_ok(
  $$select * from public.quote_reveal_contact(pg_temp.id('com_email'), 'email')$$,
  '42501', null, 'nem cota o Contato de outro Workspace');

-- 10. Dentro do Workspace, a pessoa é um Contato só: "outro Contato com o mesmo LinkedIn" é o próprio Contato.
select pg_temp.sessao('c1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_contact('c3000000-0000-0000-0000-000000000002', 'Gilsomar de novo', null, null, null,
    'https://www.linkedin.com/in/GILSOMAR-MAIA')$$,
  '23505', null, 'o mesmo LinkedIn não vira um segundo Contato no Workspace');
reset role;

select ok(has_function_privilege('authenticated', 'public.existing_reveal_value(uuid,uuid,text)', 'EXECUTE'),
  'a sessão confere o dado existente');
select ok(not has_function_privilege('anon', 'public.existing_reveal_value(uuid,uuid,text)', 'EXECUTE'),
  'anon não confere');
select ok(has_function_privilege('authenticated', 'public.quote_reveal_contact(uuid,text)', 'EXECUTE'),
  'a cotação continua da sessão');
select ok(not has_function_privilege('authenticated', 'public.record_proposed_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb)', 'EXECUTE'),
  'gravar proposta continua só do servidor');

select * from finish();
rollback;
