begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- contexto-da-empresa 05: a explicação da Aderência lê o contexto que a busca usou, nunca o ICP antigo do Day0; as
-- explicações escritas antes deixam de valer sem que nada seja reescrito.
insert into auth.users (id, email, email_confirmed_at) values
 ('e0530000-0000-0000-0000-000000000001', 'aderencia-contexto@example.test', now());
insert into public.workspaces (id, kind, name) values
 ('e0530000-0000-0000-0000-000000000010', 'empresa', 'Aderência pelo contexto');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0530000-0000-0000-0000-000000000010', 'e0530000-0000-0000-0000-000000000001', 'admin');
insert into public.day0_companies (workspace_id, o_que_vende) values
 ('e0530000-0000-0000-0000-000000000010', 'ICP antigo do Day0');

insert into private.discovery_runs (id, workspace_id, requested_by, state, criteria, max_results, actor_id) values
 ('e0530000-0000-0000-0000-0000000000c1', 'e0530000-0000-0000-0000-000000000010', 'e0530000-0000-0000-0000-000000000001',
  'concluida', '{"origem":"contexto_da_empresa","contexto":{"versao":4},"fonte":"linkedin","perfis":[{"nome":"Corretoras","criterios":{"fonte":"linkedin","setores":["seguros"]},"aplicados":[{"conceito":"setor","valor":"Seguros","trecho":"corretoras de seguros"}],"pendentes":[{"conceito":"faturamento","valor":"acima de R$ 10 mi","trecho":"faturamento acima de R$ 10 milhões","motivo":"sem_suporte_na_fonte"}]}]}',
  50, 'harvestapi~linkedin-company-search'),
 ('e0530000-0000-0000-0000-0000000000c2', 'e0530000-0000-0000-0000-000000000010', 'e0530000-0000-0000-0000-000000000001',
  'concluida', '{"setores":["software"]}', 50, 'harvestapi~linkedin-company-search');

insert into private.discovered_accounts (id, workspace_id, run_id, name, name_key, source_actor, sector, fit_score, fit_level, reasons) values
 ('e0530000-0000-0000-0000-0000000000a1', 'e0530000-0000-0000-0000-000000000010', 'e0530000-0000-0000-0000-0000000000c1',
  'Corretora Sul', 'corretora sul', 'teste', 'Insurance', 100, 'alto',
  '[{"criterio":"setor","atende":true,"texto":"Setor: atua em Insurance, que combina com \"seguros\"."},{"criterio":"perfil","atende":null,"texto":"Perfil: Corretoras."},{"criterio":"pendente","atende":null,"texto":"A verificar na qualificação: Faturamento acima de R$ 10 mi (a fonte não traz esse dado)."}]'),
 ('e0530000-0000-0000-0000-0000000000a2', 'e0530000-0000-0000-0000-000000000010', 'e0530000-0000-0000-0000-0000000000c2',
  'Software Sul', 'software sul', 'teste', 'Software', 100, 'alto',
  '[{"criterio":"setor","atende":true,"texto":"Setor: atua em Software, que combina com \"software\"."}]');

-- Uma explicação guardada antes deste ticket, com a impressão digital antiga.
update private.discovered_accounts
   set fit_explanation = 'Vende o que o ICP antigo pede.', fit_explanation_source = 'ia', fit_explanation_at = now(),
       fit_explanation_fingerprint = md5(fit_level || '|' || reasons::text)
 where id = 'e0530000-0000-0000-0000-0000000000a1';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0530000-0000-0000-0000-000000000001', true);

select is((public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') -> 'contexto' ->> 'versao')::integer, 4,
  'a explicação traz a versão do contexto que a busca usou');
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') -> 'contexto' -> 'perfis' -> 0 ->> 'nome',
  'Corretoras', 'com o perfil da busca');
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') -> 'contexto' -> 'perfis' -> 0 -> 'aplicados' -> 0 ->> 'trecho',
  'corretoras de seguros', 'os critérios aplicados levam o trecho do Perfil de cliente ideal');
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') -> 'contexto' -> 'perfis' -> 0 -> 'pendentes' -> 0 ->> 'motivo',
  'sem_suporte_na_fonte', 'os pendentes levam o motivo');
select ok(not (public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') ? 'icp'),
  'o ICP antigo do Day0 não vai junto');
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a2') -> 'contexto', 'null'::jsonb,
  'busca com filtros avulsos: sem contexto, e sem ICP de apoio');
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') -> 'explanation', 'null'::jsonb,
  'a explicação escrita antes deixa de valer');

reset role;
select is((select fit_explanation from private.discovered_accounts where id = 'e0530000-0000-0000-0000-0000000000a1'),
  'Vende o que o ICP antigo pede.', 'nada é reescrito em massa: o texto antigo fica guardado até alguém pedir outro');

set local role service_role;
select lives_ok($$select public.save_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1', 'Atua em seguros; o faturamento ainda precisa ser verificado.', 'ia')$$,
  'a nova explicação é guardada');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0530000-0000-0000-0000-000000000001', true);
select is(public.get_discovered_account_fit_explanation('e0530000-0000-0000-0000-0000000000a1') ->> 'explanation',
  'Atua em seguros; o faturamento ainda precisa ser verificado.', 'a explicação nova volta enquanto a nota é a mesma');

select * from finish();
rollback;
