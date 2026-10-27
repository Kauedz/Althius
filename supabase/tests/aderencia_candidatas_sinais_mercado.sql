begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(5);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('ab000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'membro@mercado.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('ac000000-0000-0000-0000-000000000001', 'empresa', 'Mercado A'),
  ('ac000000-0000-0000-0000-000000000002', 'empresa', 'Mercado B');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ac000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'admin', true);
insert into private.workspace_icp_versions (workspace_id, version, sector, company_size, geography)
values ('ac000000-0000-0000-0000-000000000001', 1, 'tecnologia', 'médio', 'Brasil');
insert into private.discovered_accounts (id, workspace_id, origin, name, name_key, source_actor, sector, size_label, country, fit_score, fit_level)
values
  ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'sinal', 'Compatível', 'compativel', 'sinal:mercado', 'Tecnologia', 'Médio', 'Brasil', 100, 'alto'),
  ('ad000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000001', 'sinal', 'Divergente', 'divergente', 'sinal:mercado', 'Varejo', 'Grande', 'Argentina', 0, 'baixo'),
  ('ad000000-0000-0000-0000-000000000003', 'ac000000-0000-0000-0000-000000000002', 'sinal', 'Outro workspace', 'outro workspace', 'sinal:mercado', 'Tecnologia', 'Médio', 'Brasil', 100, 'alto');
insert into private.market_signals (id, workspace_id, signal_type, event_key, phrase, fired_at)
values ('ae000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'vaga_comex', 'mercado-aderencia', 'Sinal de mercado', now());
insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at, market_signal_id)
values
  ('ac000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', 'vaga_comex', 'mercado-aderencia', 'Sinal de mercado', now(), 'ae000000-0000-0000-0000-000000000001'),
  ('ac000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002', 'vaga_comex', 'mercado-aderencia', 'Sinal de mercado', now(), 'ae000000-0000-0000-0000-000000000001');

select is(private.score_market_discovery_icp('ad000000-0000-0000-0000-000000000001'), 100, 'a avaliação estruturada coincidente é 100');
select is(private.score_market_discovery_icp('ad000000-0000-0000-0000-000000000002'), 0, 'a avaliação divergente é 0 sem depender da ordem');
select is(private.score_market_discovery_icp('ad000000-0000-0000-0000-000000000003'), null, 'candidata sem ICP no Workspace fica sem dado');
insert into private.workspace_icp_versions (workspace_id, version, sector, company_size, geography)
values ('ac000000-0000-0000-0000-000000000001', 2, 'varejo', 'médio', 'Brasil');
select is((select fit_score::integer from private.discovered_accounts where id = 'ad000000-0000-0000-0000-000000000001'), 67,
  'publicar uma nova versão do ICP recalcula o score da candidata');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', true);
select is((select array_agg(name || ':' || fit_level order by name)::text
  from public.list_discovered_accounts('ac000000-0000-0000-0000-000000000001')),
  '{Compatível:medio,Divergente:baixo}', 'a tela recebe só os níveis calculados das candidatas do Workspace');
reset role;
select * from finish();
rollback;
