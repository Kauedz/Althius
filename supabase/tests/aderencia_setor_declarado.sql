begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

insert into public.workspaces (id, kind, name) values ('6a000000-0000-0000-0000-000000000001', 'empresa', 'Aderência 6a');
insert into private.workspace_icp_versions (workspace_id, version, sector) values ('6a000000-0000-0000-0000-000000000001', 1, 'Logística');
insert into private.discovered_accounts (id, workspace_id, origin, name, name_key, source_actor, sector, description) values
 ('6a000000-0000-0000-0000-000000000011', '6a000000-0000-0000-0000-000000000001', 'sinal', 'Logistica Total', 'logistica total', 'sinal:mercado', 'IT Services and IT Consulting', 'Portal de logística'),
 ('6a000000-0000-0000-0000-000000000012', '6a000000-0000-0000-0000-000000000001', 'sinal', 'Logística em tudo', 'logistica em tudo', 'sinal:mercado', 'Truck Transportation', null),
 ('6a000000-0000-0000-0000-000000000013', '6a000000-0000-0000-0000-000000000001', 'sinal', 'Rodo Sul', 'rodo sul', 'sinal:mercado', 'Transporte rodoviário de carga, exceto produtos perigosos', null),
 ('6a000000-0000-0000-0000-000000000014', '6a000000-0000-0000-0000-000000000001', 'sinal', 'Logistica Talks', 'logistica talks', 'sinal:mercado', 'Professional Training and Coaching', 'Logística e supply chain');

select is(private.score_market_discovery_icp('6a000000-0000-0000-0000-000000000011'), 0, 'IT Services com Logística no nome e na descrição não bate');
select is(private.score_market_discovery_icp('6a000000-0000-0000-0000-000000000014'), 0, 'Professional Training com Logística no nome não bate');
select is(private.score_market_discovery_icp('6a000000-0000-0000-0000-000000000012'), 100, 'Truck Transportation bate com Logística');
select is(private.score_market_discovery_icp('6a000000-0000-0000-0000-000000000013'), 100, 'o CNAE de transporte de carga bate com Logística');

insert into private.workspace_icp_versions (workspace_id, version, sector) values ('6a000000-0000-0000-0000-000000000001', 2, 'Corretoras de seguros');
update private.discovered_accounts set sector = 'Insurance Agencies and Brokerages' where id = '6a000000-0000-0000-0000-000000000011';
select is(private.score_market_discovery_icp('6a000000-0000-0000-0000-000000000011'), 100, 'Insurance Agencies and Brokerages bate com Corretoras de seguros');

select ok(private.icp_sector_matches('Logística e transporte', 'logistica'), 'o próprio termo bate sem acento');
select ok(not private.icp_sector_matches('Tecnologia', 'logistica'), 'setor diferente não bate');
select ok(not private.icp_sector_matches(null, 'Logística'), 'sem setor declarado não bate');
select * from finish();
rollback;
