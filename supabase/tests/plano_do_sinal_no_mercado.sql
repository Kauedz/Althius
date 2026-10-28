begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- Sinal descrito em texto no mercado endereçável (Trilha C, 5a): o Plano com escopo {"tipo":"mercado"} grava um Monitoramento
-- de mercado em rascunho sem Contas, só para Abertura de vagas; o Plano não troca o escopo de um Monitoramento existente.
-- Ana: Administradora do Norte.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('f8600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@mercado.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f8610000-0000-4000-8000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f8610000-0000-4000-8000-000000000001', 'f8600000-0000-4000-8000-000000000001', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('f8620000-0000-4000-8000-000000000001', 'f8610000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.mercado.test',
   'alfa.mercado.test', 'f8600000-0000-4000-8000-000000000001');

update private.signal_actors set state = 'testing';
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'nova_lideranca');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;
create temporary table base (p jsonb) on commit drop;
grant select on base to authenticated;
insert into base values (jsonb_build_object(
  'versao', 1, 'origem', 'briefing',
  'escopo', jsonb_build_object('tipo', 'mercado'),
  'sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin', 'criterios',
    '{"funcoes":["RevOps e GTM"],"senioridade":"Qualquer","localizacao":["Brasil"],"periodo":"Últimos 30 dias"}'::jsonb)),
  'explicacao', 'Acompanha vagas de RevOps no mercado do seu ICP.',
  'maxEmpresasPorRodada', 25));

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f8600000-0000-4000-8000-000000000001', true);

-- 1. Salva no mercado, sem Contas.
select lives_ok($$
  insert into r select 'mercado', public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Vagas de RevOps no mercado',
    'Quero saber quem abre vaga de RevOps.', (select p from base))
$$, 'o Plano no mercado é salvo sem Contas');

-- 2. Só Abertura de vagas roda no mercado, e o escopo mercado não leva outras chaves.
select throws_ok($$
  select public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Liderança no mercado', null,
    jsonb_set((select p from base), '{sinais,0}', '{"tipo":"nova_lideranca","criterios":{}}'))
$$, '22023', 'invalid signal plan', 'outro tipo no mercado é recusado');
select throws_ok($$
  select public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Mercado com Contas', null,
    jsonb_set((select p from base), '{escopo}', '{"tipo":"mercado","contaIds":["f8620000-0000-4000-8000-000000000001"]}'))
$$, '22023', 'invalid signal plan', 'o escopo mercado não aceita Contas');

-- 3. Um Plano de Contas continua salvando como antes.
select lives_ok($$
  insert into r select 'contas', public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Vagas na Alfa', null,
    jsonb_set((select p from base), '{escopo}', '{"tipo":"contas","contaIds":["f8620000-0000-4000-8000-000000000001"]}'))
$$, 'o Plano nas Contas segue salvando');

-- 4. O Plano não troca o escopo de um Monitoramento existente; a nova versão no mesmo escopo grava.
select throws_ok($$
  select public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Vagas de RevOps no mercado', null,
    jsonb_set((select p from base), '{escopo}', '{"tipo":"contas","contaIds":["f8620000-0000-4000-8000-000000000001"]}'),
    (select id from r where k = 'mercado'))
$$, '22023', 'invalid signal plan', 'mercado não vira Contas pelo Plano');
select throws_ok($$
  select public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Vagas na Alfa', null, (select p from base),
    (select id from r where k = 'contas'))
$$, '22023', 'invalid signal plan', 'Contas não vira mercado pelo Plano');
select lives_ok($$
  select public.save_signal_plan('f8610000-0000-4000-8000-000000000001', 'Vagas de RevOps no mercado v2', null, (select p from base),
    (select id from r where k = 'mercado'))
$$, 'uma nova versão no mercado grava');

reset role;

-- 5. O Monitoramento de mercado: público de mercado, sem Contas, em rascunho, na versão 2.
select is((select audience from private.signal_monitors where id = (select id from r where k = 'mercado')),
  '{"escopo":"mercado","accountIds":[]}'::jsonb, 'o público é o mercado, sem Contas');
select is((select state || ' v' || plan_version from private.signal_monitors where id = (select id from r where k = 'mercado')),
  'rascunho v2', 'segue em rascunho, na versão 2');
select is((select audience from private.signal_monitors where id = (select id from r where k = 'contas')),
  '{"accountIds":["f8620000-0000-4000-8000-000000000001"]}'::jsonb, 'o público das Contas não muda');

select * from finish();
rollback;
