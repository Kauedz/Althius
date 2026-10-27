begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(20);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'recorte@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e9100000-0000-4000-8000-000000000001', 'empresa', 'Norte');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit)
values ('e9100000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000);
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('e9100000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'admin', true);
select public.grant_credits('e9100000-0000-4000-8000-000000000001', 1000, 'plano', 'teste de recorte obrigatório');
select private.seed_contract_automation('e9100000-0000-4000-8000-000000000001');
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type = 'vaga_linkedin';

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated, service_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e9000000-0000-4000-8000-000000000001', true);

select throws_ok($$select public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Sem chave', 'ativo',
  '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"]}', 24)$$,
  '22023', 'a market monitor needs at least one niche', 'ativar sem chave de recorte falha com erro próprio');
select throws_ok($$select public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Qualquer', 'ativo',
  '{"escopo":"mercado"}', '{"nicho":"qualquer","funcoes":["SDR"],"localizacao":["Brasil"]}', 24)$$,
  '22023', 'a market monitor needs at least one niche', 'Qualquer não conta como recorte');
select throws_ok($$select public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Vazio', 'ativo',
  '{"escopo":"mercado"}', '{"nichos":[],"nichosCustom":["  "],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24)$$,
  '22023', 'a market monitor needs at least one niche', 'listas sem item não contam como recorte');
insert into r select 'rascunho', public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Rascunho sem recorte', 'rascunho', '{"escopo":"mercado"}', '{"nichos":[],"nichosCustom":[],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from r where k = 'rascunho'), 'rascunho sem recorte pode ser salvo');

insert into r select 'novo_pronto', public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Novo pronto', 'ativo',
  '{"escopo":"mercado"}', '{"nichos":["logistica-e-transporte"],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from r where k = 'novo_pronto'), 'nicho pronto novo permite ativação');
insert into r select 'novo_custom', public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Novo escrito', 'ativo',
  '{"escopo":"mercado"}', '{"nichosCustom":["Seguros"],"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from r where k = 'novo_custom'), 'setor escrito novo permite ativação');
insert into r select 'legado_pronto', public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Legado pronto', 'ativo',
  '{"escopo":"mercado"}', '{"nicho":"industria-fornecedores-b2b","funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from r where k = 'legado_pronto'), 'nicho pronto legado permite ativação');
insert into r select 'legado_custom', public.save_signal_monitor('e9100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Legado escrito', 'ativo',
  '{"escopo":"mercado"}', '{"nicho":"custom","nichoCustom":"Naval","funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id is not null from r where k = 'legado_custom'), 'setor escrito legado permite ativação');

select throws_ok(format('select public.set_signal_monitor_state(%L, ''ativo'')', (select id from r where k = 'rascunho')),
  '22023', 'a market monitor needs at least one niche', 'ativação por estado também exige recorte');
select lives_ok(format('select public.save_signal_monitor(%L, %L, ''vaga_linkedin'', ''Rascunho com recorte'', ''rascunho'',
  ''{"escopo":"mercado"}'', ''{"nichos":["logistica-e-transporte"],"funcoes":["SDR"],"localizacao":["Brasil"]}'', 24)',
  'e9100000-0000-4000-8000-000000000001', (select id from r where k = 'rascunho')), 'rascunho pode receber recorte');
select lives_ok(format('select public.set_signal_monitor_state(%L, ''ativo'')', (select id from r where k = 'rascunho')),
  'ativação por estado funciona depois de incluir recorte');

reset role;
update private.signal_monitors set criteria = criteria - 'nichos', next_run_at = now(), current_run_id = null, claimed_until = null
where id = (select id from r where k = 'rascunho');
insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits)
values ('e9100000-0000-4000-8000-000000000001', (select id from r where k = 'rascunho'), 'e9000000-0000-4000-8000-000000000001', 4);
set local role service_role;
select is((select count(*)::int from public.claim_due_signal_monitors(20) where monitor_id = (select id from r where k = 'rascunho')), 0,
  'claim agendado não entrega registro legado sem recorte');
select is((select count(*)::int from public.claim_signal_run_requests(5) where monitor_id = (select id from r where k = 'rascunho')), 0,
  'claim manual não entrega registro legado sem recorte');
reset role;
select is((select state from private.signal_run_requests where monitor_id = (select id from r where k = 'rascunho')), 'falhou',
  'pedido manual termina sem abrir Rodada nem debitar Crédito');
select is((select last_error from private.signal_monitors where id = (select id from r where k = 'rascunho')),
  'Escolha ao menos um nicho ou setor para buscar as vagas.', 'pedido manual guarda a frase do produto');
insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits, state, claimed_until)
values ('e9100000-0000-4000-8000-000000000001', (select id from r where k = 'rascunho'),
  'e9000000-0000-4000-8000-000000000001', 4, 'rodando', now() - interval '1 minute');
set local role service_role;
select is((select count(*)::int from public.claim_signal_run_requests(5) where monitor_id = (select id from r where k = 'rascunho')), 0,
  'claim expirado de pedido manual legado também não chega ao runner');
reset role;
select is((select state from private.signal_run_requests where monitor_id = (select id from r where k = 'rascunho')
  order by requested_at desc limit 1), 'falhou', 'pedido manual que perdeu o claim termina com falha amigável');
update private.signal_monitors set criteria = criteria - 'nichos' - 'nichosCustom', claimed_until = null
where id = (select id from r where k = 'novo_custom');
insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits)
values ('e9100000-0000-4000-8000-000000000001', (select id from r where k = 'novo_custom'),
  'e9000000-0000-4000-8000-000000000001', 4);
create temporary table pedido_com_rodada on commit drop as
select id as request_id, public.open_signal_run((select id from r where k = 'novo_custom'), now(), id) as run_id
from private.signal_run_requests where monitor_id = (select id from r where k = 'novo_custom')
order by requested_at desc limit 1;
set local role service_role;
select is((select count(*)::int from public.claim_signal_run_requests(5) where monitor_id = (select id from r where k = 'novo_custom')), 0,
  'continuação manual com rodada vinculada e sem recorte também não chega ao runner');
reset role;
select is((select state from private.signal_run_requests where id = (select request_id from pedido_com_rodada)), 'falhou',
  'continuação manual inválida termina em falha');
select is((select state from private.signal_monitor_runs where id = (select run_id from pedido_com_rodada)), 'falhou',
  'a rodada manual vinculada termina em falha amigável');

select * from finish();
rollback;
