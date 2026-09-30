begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('55000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('55000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('55000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@fora.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('f5000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f5000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f5000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'admin', true),
  ('f5000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'member', true),
  ('f5000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000003', 'admin', true);
insert into private.agents (workspace_id, specialty, kind)
select 'f5000000-0000-0000-0000-000000000001', 'scopus', 'padrao'
where not exists (select 1 from private.agents where workspace_id = 'f5000000-0000-0000-0000-000000000001' and specialty = 'scopus');

-- 1. Nada nas tabelas é acessível direto; o consumo do teto é só do servidor.
select ok(
  not has_table_privilege('authenticated', 'private.automation_settings', 'select')
    and not has_table_privilege('authenticated', 'private.workspace_notices', 'select'),
  'as tabelas não são lidas direto'
);
select ok(
  not has_function_privilege('authenticated', 'public.consume_automation_cap(uuid, text, numeric)', 'execute')
    and has_function_privilege('service_role', 'public.consume_automation_cap(uuid, text, numeric)', 'execute'),
  'consumir o teto é só do servidor'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '55000000-0000-0000-0000-000000000002', true);

-- 2. A página traz os três tipos de ação, os Agentes e as Integrações, tudo em "confirmar".
select is(
  (select array_agg(scope order by scope) from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where kind = 'acao'),
  array['acao:agentes', 'acao:enriquecimento', 'acao:varredura'], 'os três tipos de ação'
);
select ok(
  (select count(*) from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where kind = 'agente') >= 1
    and (select count(*) from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where scope = 'integracao:hubspot') = 1,
  'cada Agente e cada Integração têm o seu interruptor'
);
select is(
  (select count(*)::integer from public.list_automation_settings('f5000000-0000-0000-0000-000000000001')
   where mode <> 'confirmar' or blocked_reason <> 'confirmar'),
  0, 'tudo começa em confirmar'
);

-- 3. Só o Administrador grava.
select throws_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 10)$$,
  '42501', 'only administrators can change automation', 'o Membro não liga o automático'
);
select set_config('request.jwt.claim.sub', '55000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', null)$$,
  '22023', 'automatic mode requires an approved monthly cap', 'automático sem teto é recusado'
);
select throws_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:outra', 'automatico', 10)$$,
  '22023', 'unknown automation scope', 'escopo fora da lista é recusado'
);
select throws_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 0)$$,
  '22023', 'invalid monthly cap', 'teto zero é recusado'
);
select lives_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 10)$$,
  'o Administrador liga o automático com teto 10'
);
select is(
  (select row(mode, monthly_cap, month_spent, blocked_reason)::text from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where scope = 'acao:varredura'),
  '(automatico,10.00,0,)', 'automático com teto roda'
);
select throws_ok(
  $$select public.save_automation_setting('f5000000-0000-0000-0000-000000000002', 'acao:varredura', 'automatico', 10)$$,
  '42501', 'active workspace membership required', 'Administrador de outro Workspace não grava'
);

-- 4. O servidor consome o teto.
reset role;
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:enriquecimento', 1), 'confirmar', 'em confirmar, o automático não roda');
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 4), 'ok', 'dentro do teto, roda');
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 7), 'teto_atingido', 'passaria do teto: não roda');
select is(
  (select spent from private.automation_spend where scope = 'acao:varredura'), 4.00::numeric, 'o que não rodou não conta'
);
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 1), 'teto_atingido', 'depois de passar, o escopo fica pausado');
select is(
  (select count(*)::integer from private.workspace_notices where workspace_id = 'f5000000-0000-0000-0000-000000000001'), 1,
  'e um Aviso do Workspace sai uma vez'
);

-- 5. A tela diz por quê; subir o teto tira a pausa.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select blocked_reason from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where scope = 'acao:varredura'),
  'teto_atingido', 'a página mostra o motivo'
);
select is(
  (select title from public.list_workspace_notices('f5000000-0000-0000-0000-000000000001')),
  'Teto mensal atingido: Varredura de Sinais', 'o Administrador vê o Aviso'
);
select public.save_automation_setting('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 20);
select is(
  (select blocked_reason from public.list_automation_settings('f5000000-0000-0000-0000-000000000001') where scope = 'acao:varredura'),
  null, 'subir o teto acima do gasto tira a pausa'
);
reset role;
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 16), 'ok', 'chegar exatamente no teto roda');
select is(public.consume_automation_cap('f5000000-0000-0000-0000-000000000001', 'acao:varredura', 0), 'teto_atingido', 'e pausa ao chegar nele');

-- 6. O Membro não vê os Avisos dos Administradores.
set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.list_workspace_notices('f5000000-0000-0000-0000-000000000001')), 0,
  'o Membro não recebe o Aviso do teto'
);

select * from finish();
rollback;
