begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

-- Fatia 1 dos Sinais em cascata: os dados que já estavam gravados com o nome do fornecedor ou o termo "actor" passam a
-- palavras do produto, e nenhum RPC que a tela lê devolve a origem técnica.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@marca.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('a2000000-0000-0000-0000-000000000001', 'empresa', 'Marca');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by, receita_data) values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'TOTVS', 'https://totvs.test', 'totvs.test',
   'a1000000-0000-0000-0000-000000000001', '{"razaoSocial": "TOTVS S.A.", "fonte": "apify"}'),
  ('a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'Outra', 'https://outra.test', 'outra.test',
   'a1000000-0000-0000-0000-000000000001', '{"razaoSocial": "OUTRA", "fonte": "brasilapi"}');
insert into private.proposed_contacts (workspace_id, target_account_id, name, source_provider) values
  ('a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Fernando', 'apify:harvestapi~linkedin-company-employees');
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, last_error) values
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'vaga_linkedin', 'Vagas', 'pausado',
   'O actor deste Sinal não está disponível.');
insert into private.discovery_runs (id, workspace_id, max_results, state, last_error) values
  ('a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 10, 'falhou', 'A conta do Apify da Althius está sem crédito.'),
  ('a5000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 10, 'falhou', 'O Apify não respondeu a tempo.'),
  ('a5000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 10, 'falhou', 'Não foi possível guardar as empresas encontradas.');

select has_function('private', 'neutralizar_marca_nos_dados', array[]::text[], 'a função que neutraliza os dados gravados existe');

select private.neutralizar_marca_nos_dados();

select is(
  (select receita_data ->> 'fonte' from public.target_accounts where id = 'a3000000-0000-0000-0000-000000000001'),
  'receita', 'a Receita gravada com o fornecedor passa a "receita"');
select is(
  (select receita_data ->> 'fonte' from public.target_accounts where id = 'a3000000-0000-0000-0000-000000000002'),
  'brasilapi', 'a origem que não é o fornecedor fica como está');
select is(
  (select source_provider from private.proposed_contacts where name = 'Fernando'),
  'linkedin_publico', 'o contato proposto deixa de carregar "apify:..."');
select is(
  (select last_error from private.signal_monitors where id = 'a4000000-0000-0000-0000-000000000001'),
  'A fonte pública está indisponível agora.', 'o motivo do Monitoramento perde a palavra actor');
select is(
  (select last_error from private.discovery_runs where id = 'a5000000-0000-0000-0000-000000000001'),
  'Sem saldo na fonte de dados; avisamos a equipe.', 'sem crédito vira a mensagem de saldo da fonte');
select is(
  (select last_error from private.discovery_runs where id = 'a5000000-0000-0000-0000-000000000002'),
  'Nossa busca não respondeu a tempo.', 'o prazo vira a mensagem do prazo');
select is(
  (select last_error from private.discovery_runs where id = 'a5000000-0000-0000-0000-000000000003'),
  'Não foi possível guardar as empresas encontradas.', 'a mensagem sem a marca não é tocada');
select is(
  (select (private.neutralizar_marca_nos_dados() ->> 'total')::int), 0, 'rodar de novo não muda nada (idempotente)');

-- O que a tela lê não devolve a origem técnica.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is(
  (select source_provider from public.list_proposed_contacts('a3000000-0000-0000-0000-000000000001'::uuid, 'nova') limit 1),
  'linkedin_publico', 'list_proposed_contacts só devolve o rótulo público');
reset role;
select is(
  (select pg_get_function_result('public.list_signal_actors()'::regprocedure)),
  'TABLE(signal_type text, state text)', 'o catálogo de Sinais da tela só devolve o tipo e o estado, nunca o actor nem o preço');

select * from finish();
rollback;
