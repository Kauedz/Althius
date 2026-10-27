begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('e9200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'recortes@teste.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e9300000-0000-4000-8000-000000000001', 'empresa', 'Recortes');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit)
values ('e9300000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000);
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('e9300000-0000-4000-8000-000000000001', 'e9200000-0000-4000-8000-000000000001', 'admin', true);
select public.grant_credits('e9300000-0000-4000-8000-000000000001', 1000, 'plano', 'teste de recortes');
select private.seed_contract_automation('e9300000-0000-4000-8000-000000000001');
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type = 'vaga_linkedin';

create temporary table salvos (estado text, id uuid) on commit drop;
grant all on salvos to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e9200000-0000-4000-8000-000000000001', true);

insert into salvos select 'rascunho', public.save_signal_monitor('e9300000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Transporte e seguros', 'rascunho', '{"escopo":"mercado","accountIds":[]}',
  '{"nichos":["logistica-e-transporte"],"nichosCustom":["Seguros"],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from salvos where estado = 'rascunho'), 'save_signal_monitor aceita os dois recortes no rascunho');
insert into salvos select 'ativo', public.save_signal_monitor('e9300000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Transporte e seguros ativo', 'ativo', '{"escopo":"mercado","accountIds":[]}',
  '{"nichos":["logistica-e-transporte"],"nichosCustom":["Seguros"],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from salvos where estado = 'ativo'), 'save_signal_monitor aceita os dois recortes ativo');
reset role;

select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichos":["desconhecido"]}')$$,
  '22023', 'market monitor limits exceeded', 'slug de nicho desconhecido é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichos":[2]}')$$,
  '22023', 'market monitor limits exceeded', 'item de nicho que não é texto é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichos":["agro-b2b","agro-b2b"]}')$$,
  '22023', 'market monitor limits exceeded', 'nicho pronto repetido é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichosCustom":[""]}')$$,
  '22023', 'market monitor limits exceeded', 'setor vazio é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', jsonb_build_object('nichosCustom', jsonb_build_array(repeat('x', 61))))$$,
  '22023', 'market monitor limits exceeded', 'setor acima de 60 caracteres é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichosCustom":["Seguros","seguros"]}')$$,
  '22023', 'market monitor limits exceeded', 'setores repetidos sem considerar caixa são recusados');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichosCustom":[1]}')$$,
  '22023', 'market monitor limits exceeded', 'setor que não é texto é recusado');
select throws_ok($$select private.validate_market_criteria('rascunho', '{"nichosCustom":["A","B","C","D","E","F"]}')$$,
  '22023', 'market monitor limits exceeded', 'mais de cinco setores escritos são recusados');
select lives_ok($$select private.validate_market_criteria('rascunho', '{"nicho":"logistica-e-transporte"}')$$,
  'critério antigo de nicho pronto continua aceito');
select lives_ok($$select private.validate_market_criteria('rascunho', '{"nicho":"custom","nichoCustom":"Seguros"}')$$,
  'critério antigo Custom continua aceito');

select is(private.signal_plan_criteria_keys('vaga_linkedin') @> array['nichos','nichosCustom'], true,
  'Plano LinkedIn inclui as chaves dos recortes');
select is(private.signal_plan_criteria_keys('vaga_indeed') @> array['nichos','nichosCustom'], true,
  'Plano Indeed inclui as chaves dos recortes');
select lives_ok($$select private.validate_signal_plan_criteria('vaga_linkedin', '{"nichos":["logistica-e-transporte"],"nichosCustom":["Seguros"]}')$$,
  'Plano de vagas LinkedIn aceita os recortes');
select lives_ok($$select private.validate_signal_plan_criteria('vaga_indeed', '{"nichos":["agro-b2b"],"nichosCustom":["Naval"]}')$$,
  'Plano de vagas Indeed aceita os recortes');
select throws_ok($$select private.validate_signal_plan_criteria('vaga_linkedin', '{"nichos":["desconhecido"]}')$$,
  '22023', 'invalid signal plan', 'Plano recusa slug desconhecido');
select throws_ok($$select private.validate_signal_plan_criteria('vaga_linkedin', '{"nichosCustom":["Seguros"," seguros "]}')$$,
  '22023', 'invalid signal plan', 'Plano recusa setor repetido normalizado');
select throws_ok($$select private.validate_signal_plan_criteria('vaga_linkedin', '{"nichosCustom":["A","B","C","D","E","F"]}')$$,
  '22023', 'invalid signal plan', 'Plano recusa mais de cinco setores');
select * from finish();
rollback;
