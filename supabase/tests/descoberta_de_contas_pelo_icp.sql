begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(115);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é do Sul, de fora do Norte.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('59000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f9000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f9000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'admin', true),
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'member', true),
  ('f9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated;

-- 1. As chaves de comparação.
select is(private.company_name_key('Acme S.A.'), 'acme', 'o nome perde a forma jurídica do fim: S.A.');
select is(private.company_name_key('ACME Ltda ME'), 'acme', 'e várias formas seguidas: Ltda ME');
select is(private.company_name_key('Casa & Vídeo'), 'casa video', 'sem acento nem pontuação');
select is(private.company_name_key('Banco do Brasil S/A'), 'banco do brasil', 'S/A também sai');
select is(private.company_name_key('Ltda'), 'ltda', 'um nome que seria só a forma jurídica fica como está');
select is(private.company_name_key('  '), '', 'sem nome, a chave é vazia');

select is(private.cnpj_key('47.960.950/0001-21'), '47960950000121', 'o CNPJ com máscara vira 14 caracteres');
select is(private.cnpj_key('00000000000191'), '00000000000191', 'o CNPJ do Banco do Brasil fecha');
select is(private.cnpj_key('47960950000122'), null, 'um dígito verificador errado não vale');
select is(private.cnpj_key('11111111111111'), null, 'o CNPJ de um dígito só não vale');
select is(private.cnpj_key('12ABC34501DE35'), '12ABC34501DE35', 'o CNPJ alfanumérico do exemplo oficial fecha');
select is(private.cnpj_key('12abc34501de35'), '12ABC34501DE35', 'e as letras minúsculas são normalizadas');
select is(private.cnpj_key('1234'), null, 'curto demais');
select is(private.format_cnpj('47960950000121'), '47.960.950/0001-21', 'a máscara volta');

select is(private.domain_of('https://www.Acme.com.br/sobre?x=1'), 'acme.com.br', 'o domínio sai sem www, caminho nem consulta');
select is(private.domain_of('acme.com.br'), 'acme.com.br', 'e aceita o domínio puro');
select is(private.domain_of('sem dominio'), null, 'texto que não é domínio dá nulo');
select is(private.linkedin_company_key('https://br.linkedin.com/company/Acme-Brasil/?trk=x'), 'acme-brasil', 'a página da empresa no LinkedIn, em minúsculas');
select is(private.linkedin_company_key('https://www.linkedin.com/in/alguem'), null, 'um perfil de pessoa não é página de empresa');

-- 2. A deduplicação e a gravação das candidatas. Contas que o Norte já tem:
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, created_by) values
  ('d9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'Alfa Tecnologia Ltda', 'https://alfa.test', 'alfa.test', null, null, '59000000-0000-0000-0000-000000000001'),
  ('d9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', 'Beta Soluções', 'https://beta.test', 'beta.test', '11.222.333/0001-81', null, '59000000-0000-0000-0000-000000000001'),
  ('d9000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000001', 'Gama Dados', 'https://gama.test', 'gama.test', null, 'https://www.linkedin.com/company/gama-dados/', '59000000-0000-0000-0000-000000000001'),
  ('d9000000-0000-0000-0000-000000000004', 'f9000000-0000-0000-0000-000000000001', 'Delta Sistemas', 'https://delta.test', 'delta.test', null, null, '59000000-0000-0000-0000-000000000001'),
  ('d9000000-0000-0000-0000-000000000009', 'f9000000-0000-0000-0000-000000000002', 'Norte Rival', 'https://rival.test', 'rival.test', null, null, '59000000-0000-0000-0000-000000000003');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('f9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001'),
  ('f9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001'),
  ('f9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000003', '59000000-0000-0000-0000-000000000001'),
  ('f9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000004', '59000000-0000-0000-0000-000000000001');

insert into private.discovery_runs (id, workspace_id, requested_by, state, criteria, max_results, actor_id, apify_run_id)
values ('a9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002',
  'em_andamento', '{"setores":["software"]}', 50, 'harvestapi~linkedin-company-search', 'run-apify-1');

select is(
  (select row(r.added, r.duplicates, r.ignored)::text from public.record_discovered_accounts(
    'a9000000-0000-0000-0000-000000000001',
    $json$[
      {"name":"Nova Software Ltda","website":"https://www.nova.test/","cnpj":"47960950000121","linkedinUrl":"https://www.linkedin.com/company/nova-software/","uf":"sp","sector":"Software","sizeLabel":"51-200","employeeCount":120,"tags":["AWS","Node"],"score":80,"level":"alto","reasons":[{"criterio":"Setor","atende":true,"texto":"Setor bate: Software"}],"signals":[{"texto":"Aberta em 2026","fonte":"Receita Federal"}],"sourceRef":"nova-software"},
      {"name":"Alfa Tec","website":"https://alfa.test/produtos"},
      {"name":"Outra Beta","cnpj":"11.222.333/0001-81"},
      {"name":"Gama Dados Brasil","linkedinUrl":"https://br.linkedin.com/company/Gama-Dados"},
      {"name":"Delta Sistemas S.A.","website":"https://delta.com.br","uf":"RJ","score":40,"level":"medio"},
      {"name":"Nova Software","website":"https://nova.test"},
      {"name":"   "},
      "texto solto"
    ]$json$) r),
  '(2,4,2)', 'entram a nova e a Delta de outro site; repetem a Conta por domínio, CNPJ, LinkedIn, e a repetição na mesma busca; duas são ignoradas'
);
select is(
  (select found || '/' || added || '/' || duplicates from private.discovery_runs where id = 'a9000000-0000-0000-0000-000000000001'),
  '6/2/4', 'a busca soma o que achou, o que entrou e o que repetia'
);
select is(
  (select row(domain, cnpj, uf, name_key, fit_level, fit_score, source_actor, source_run_id, jsonb_array_length(reasons))::text
   from private.discovered_accounts where name = 'Nova Software Ltda'),
  '(nova.test,47960950000121,SP,"nova software",alto,80,harvestapi~linkedin-company-search,run-apify-1,1)',
  'a candidata guarda domínio, CNPJ, estado, chave do nome, encaixe, Actor e execução'
);
select is(
  (select count(*)::integer from private.discovered_accounts where workspace_id = 'f9000000-0000-0000-0000-000000000001' and name = 'Delta Sistemas S.A.'),
  1, 'a mesma empresa de nome parecido mas outro site e outro estado é outra empresa'
);
select is(
  (select count(*)::integer from private.discovered_accounts where workspace_id = 'f9000000-0000-0000-0000-000000000002'),
  0, 'nada vai para o outro Workspace'
);

-- Uma Conta apagada é só marcador e não impede a mesma empresa de ser proposta.
update public.target_accounts set name = 'Conta apagada', canonical_url = 'https://conta-apagada.invalid/x', domain = 'conta-apagada.invalid', deleted_at = now()
where id = 'd9000000-0000-0000-0000-000000000004';
select is(
  (select row(r.added, r.duplicates)::text from public.record_discovered_accounts('a9000000-0000-0000-0000-000000000001',
    '[{"name":"Epsilon","website":"https://epsilon.test"}]'::jsonb) r),
  '(1,0)', 'uma candidata nova entra normalmente'
);
select throws_ok(
  $$select * from public.record_discovered_accounts('a9000000-0000-0000-0000-0000000000ff', '[]'::jsonb)$$,
  'P0002', 'discovery run not found', 'uma busca que não existe é recusada'
);
select throws_ok(
  $$select * from public.record_discovered_accounts('a9000000-0000-0000-0000-000000000001', '{"a":1}'::jsonb)$$,
  '22023', 'invalid candidates', 'candidatas que não são uma lista são recusadas'
);

-- 3. Quem lê: todo participante ativo do Workspace, e só dele.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select is(
  (select array_agg(l.name order by l.fit_level) from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001') l),
  array['Nova Software Ltda', 'Delta Sistemas S.A.', 'Epsilon']::text[], 'o Membro lê as novas, da mais encaixada à menos'
);
select is(
  (select row(l.signals -> 0 ->> 'fonte', l.tags)::text from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001') l where l.name = 'Nova Software Ltda'),
  '("Receita Federal","{AWS,Node}")', 'a lista traz os indícios de Sinal e as especialidades'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não lê a Caixa'
);
select is(
  (select count(*)::integer from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000002')), 0,
  'e a Caixa do Sul está vazia para a Carla'
);
select throws_ok(
  $$select * from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000002', 'qualquer')$$,
  '22023', 'invalid state', 'um estado que não existe é recusado'
);
select throws_ok(
  $$select * from public.record_discovered_accounts('a9000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', 'permission denied for function record_discovered_accounts', 'o navegador não grava candidatas: só o servidor'
);
select is(
  (select count(*)::integer from public.list_discovery_runs('f9000000-0000-0000-0000-000000000002')), 0,
  'as buscas do Norte não aparecem para a Carla'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select is(
  (select row(r.state, r.found, r.added, r.duplicates)::text from public.list_discovery_runs('f9000000-0000-0000-0000-000000000001') r),
  '(em_andamento,7,3,4)', 'o Membro vê a busca do Workspace dele, com os números'
);

-- 4. Aceitar: a Conta nasce por save_target_account, como a pessoa, e quem aceita é o Vendedor responsável.
reset role;
insert into ids select 'nova', id::text from private.discovered_accounts where name = 'Nova Software Ltda';
insert into ids select 'epsilon', id::text from private.discovered_accounts where name = 'Epsilon';
insert into ids select 'delta', id::text from private.discovered_accounts where name = 'Delta Sistemas S.A.';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.accept_discovered_account((select valor::uuid from ids where chave = 'nova'))$$,
  'P0002', 'discovered account not found', 'quem é de fora não aceita, e nem sabe que existe'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
insert into ids select 'aceite', (select a.target_account_id::text || ':' || a.created::text from public.accept_discovered_account((select valor::uuid from ids where chave = 'nova')) a);
select is(
  (select split_part(valor, ':', 2) from ids where chave = 'aceite'), 'true', 'aceitar cria a Conta'
);
reset role;
select is(
  (select row(a.name, a.canonical_url, a.legal_identifier, a.origin, a.created_by = '59000000-0000-0000-0000-000000000002', a.segment)::text
   from public.target_accounts a where a.id = (select split_part(valor, ':', 1)::uuid from ids where chave = 'aceite')),
  '("Nova Software Ltda",https://nova.test,47.960.950/0001-21,recomendacao,t,Software)',
  'a Conta leva nome, site, CNPJ com máscara e setor; é recomendada e criada por quem aceitou'
);
select is(
  (select owner_user_id::text from public.sales_responsibilities
   where target_account_id = (select split_part(valor, ':', 1) from ids where chave = 'aceite')),
  '59000000-0000-0000-0000-000000000002', 'quem aceitou é o Vendedor responsável'
);
select is(
  (select array_agg(s.field || '=' || s.origin order by s.field) from private.account_field_sources s
   where s.target_account_id = (select split_part(valor, ':', 1)::uuid from ids where chave = 'aceite')),
  array['legal_identifier=automatico', 'linkedin_url=automatico', 'name=automatico', 'segment=automatico']::text[],
  'os campos que vieram da fonte ficam com a origem "automático"'
);
select is(
  (select row(d.state, d.decided_by = '59000000-0000-0000-0000-000000000002', d.target_account_id::text = (select split_part(valor, ':', 1) from ids where chave = 'aceite'))::text
   from private.discovered_accounts d where d.id = (select valor::uuid from ids where chave = 'nova')),
  '(aceita,t,t)', 'a candidata fica aceita, com quem decidiu e a Conta criada'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select is(
  (select a.target_account_id::text || ':' || a.created::text from public.accept_discovered_account((select valor::uuid from ids where chave = 'nova')) a),
  (select split_part(valor, ':', 1) || ':false' from ids where chave = 'aceite'),
  'aceitar de novo (por qualquer participante) devolve a mesma Conta, sem criar outra'
);
reset role;
select is(
  (select count(*)::integer from public.target_accounts where workspace_id = 'f9000000-0000-0000-0000-000000000001' and canonical_url = 'https://nova.test'),
  1, 'a Conta existe uma vez só'
);

-- Sem site, a candidata pede um endereço; com ele, a Conta nasce. Um endereço inválido é recusado.
update private.discovered_accounts set website = null, domain = null, domain_key = null where id = (select valor::uuid from ids where chave = 'epsilon');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.accept_discovered_account((select valor::uuid from ids where chave = 'epsilon'))$$,
  '22023', 'a website is required to accept this account', 'sem site, aceitar pede o endereço'
);
select throws_ok(
  $$select * from public.accept_discovered_account((select valor::uuid from ids where chave = 'epsilon'), 'isso não é um site')$$,
  '22023', 'invalid company url', 'um endereço inválido é recusado'
);
select is(
  (select a.created from public.accept_discovered_account((select valor::uuid from ids where chave = 'epsilon'), 'https://www.epsilon.test') a),
  true, 'com o endereço informado, a Conta nasce'
);
select is(
  (select canonical_url from public.target_accounts where workspace_id = 'f9000000-0000-0000-0000-000000000001' and name = 'Epsilon'),
  'https://epsilon.test', 'a URL fica na forma canônica'
);

-- Se a URL já é de uma Conta do Workspace, a candidata se liga a ela sem mexer nos dados de outra pessoa.
reset role;
update private.discovered_accounts set website = 'https://alfa.test', domain = 'alfa.test', domain_key = null where id = (select valor::uuid from ids where chave = 'delta');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select is(
  (select a.target_account_id::text || ':' || a.created::text from public.accept_discovered_account((select valor::uuid from ids where chave = 'delta')) a),
  'd9000000-0000-0000-0000-000000000001:false', 'a URL que já é de uma Conta liga a candidata a ela'
);
reset role;
select is(
  (select row(name, legal_identifier)::text from public.target_accounts where id = 'd9000000-0000-0000-0000-000000000001'),
  '("Alfa Tecnologia Ltda",)', 'e a Conta da outra pessoa não é alterada'
);
select is(
  (select owner_user_id::text from public.sales_responsibilities where target_account_id = 'd9000000-0000-0000-0000-000000000001'),
  '59000000-0000-0000-0000-000000000001', 'nem a responsabilidade dela'
);

-- 5. Descartar: sai da lista, não volta numa busca futura, e dá para desfazer.
insert into private.discovery_runs (id, workspace_id, requested_by, state, criteria, max_results, actor_id)
values ('a9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002',
  'concluida', '{}', 50, 'harvestapi~linkedin-company-search');
update private.discovery_runs set state = 'concluida', finished_at = now() where id = 'a9000000-0000-0000-0000-000000000001';
select * from public.record_discovered_accounts('a9000000-0000-0000-0000-000000000002',
  '[{"name":"Zeta Logística","website":"https://zeta.test","uf":"MG"}]'::jsonb);
insert into ids select 'zeta', id::text from private.discovered_accounts where name = 'Zeta Logística';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.discard_discovered_account((select valor::uuid from ids where chave = 'zeta'), '  Não atendemos logística  ')$$,
  'um participante descarta a candidata'
);
select is(
  (select row(d.state, d.discard_reason, d.decided_by = '59000000-0000-0000-0000-000000000002')::text
   from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001', 'descartada') d),
  '(descartada,"Não atendemos logística",t)', 'fica descartada, com o motivo e quem decidiu'
);
select is(
  (select count(*)::integer from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001') d where d.name = 'Zeta Logística'),
  0, 'e some da lista de novas'
);
select lives_ok(
  $$select public.discard_discovered_account((select valor::uuid from ids where chave = 'zeta'))$$,
  'descartar de novo não faz nada'
);
select throws_ok(
  $$select * from public.accept_discovered_account((select valor::uuid from ids where chave = 'zeta'))$$,
  '55000', 'discovered account was discarded', 'a descartada não é aceita sem desfazer o descarte'
);
select throws_ok(
  $$select public.discard_discovered_account((select valor::uuid from ids where chave = 'nova'))$$,
  '55000', 'discovered account was already accepted', 'a aceita não é descartada'
);
reset role;
select is(
  (select row(r.added, r.duplicates)::text from public.record_discovered_accounts('a9000000-0000-0000-0000-000000000002',
    '[{"name":"Zeta Logística Ltda","website":"https://www.zeta.test"}]'::jsonb) r),
  '(0,1)', 'a descartada não volta numa busca futura: a Caixa lembra dela'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.discard_discovered_account((select valor::uuid from ids where chave = 'zeta'))$$,
  'P0002', 'discovered account not found', 'quem é de fora não descarta'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.restore_discovered_account((select valor::uuid from ids where chave = 'zeta'))$$,
  'desfazer o descarte devolve a candidata'
);
select is(
  (select d.state from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001', null) d where d.name = 'Zeta Logística'),
  'nova', 'ela volta a ser nova'
);
select throws_ok(
  $$select public.restore_discovered_account((select valor::uuid from ids where chave = 'nova'))$$,
  '55000', 'discovered account was already accepted', 'a aceita não se desfaz'
);

-- 6. O registro dos Actors de descoberta: nasce tudo em teste; só o servidor muda o estado.
select is(
  (select count(*)::integer from public.list_discovery_actors() where state = 'testing'), 5,
  'os cinco Actors nascem "em teste": nenhum foi rodado de verdade'
);
select throws_ok(
  $$select * from public.discovery_actors_for('buscar_contas')$$,
  '42501', 'permission denied for function discovery_actors_for', 'o navegador não lê o teto de cobrança'
);
select throws_ok(
  $$select public.set_discovery_actor_state('buscar_contas', 'harvestapi~linkedin-company-search', 'available')$$,
  '42501', 'permission denied for function set_discovery_actor_state', 'e não muda o estado de um Actor'
);
reset role;
select is(
  (select array_agg(a.actor_id order by a.max_cost_usd) from public.discovery_actors_for('buscar_contas') a),
  array['johnatan029~cnpj-empresas-brasil-scraper', 'harvestapi~linkedin-company-search']::text[],
  'os Actors de um fim saem com o teto de cobrança de cada um'
);
select public.set_discovery_actor_state('buscar_contas', 'harvestapi~linkedin-company-search', 'available', '0.0.21');
select is(
  (select row(state, version)::text from private.discovery_actors where purpose = 'buscar_contas' and actor_id = 'harvestapi~linkedin-company-search'),
  '(available,0.0.21)', 'o servidor passa o Actor a disponível depois do teste'
);
select throws_ok(
  $$select public.set_discovery_actor_state('buscar_contas', 'harvestapi~linkedin-company-search', 'quase')$$,
  '22023', 'invalid state', 'um estado que não existe é recusado'
);
select throws_ok(
  $$select public.set_discovery_actor_state('buscar_contas', 'ninguem~nada', 'out')$$,
  'P0002', 'actor not found', 'um Actor fora do registro não existe'
);

-- 7. Apagar a Conta definitivamente leva junto o que a Caixa sabia dela.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.erase_target_account((select split_part(valor, ':', 1)::uuid from ids where chave = 'aceite'), 'Nova Software Ltda')$$,
  'o Administrador apaga a Conta aceita'
);
reset role;
select is(
  (select count(*)::integer from private.discovered_accounts where name = 'Nova Software Ltda'), 0,
  'a candidata aceita, com o CNPJ e o site, some junto'
);
select is(
  (select count(*)::integer from private.discovered_accounts where name in ('Epsilon', 'Zeta Logística')), 2,
  'as outras candidatas ficam'
);

-- 8. A busca: o custo antes do clique, a reserva do saldo, uma busca por vez, o modo de teste e a cobrança só se trouxe empresa.
reset role;
select public.grant_credits('f9000000-0000-0000-0000-000000000001', 20, 'plano');
update private.discovery_runs set state = 'concluida', finished_at = now() where state = 'em_andamento';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select is(
  (select row(q.credits, q.available, q.in_progress, q.actor_state, q.can_test)::text
   from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001', 50) q),
  '(5.00,20.00,f,available,f)', 'o Membro vê 5 créditos, o saldo, nenhuma busca em andamento, o Actor disponível e sem modo de teste'
);
select is(
  (select q.credits from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001', 100) q),
  10.00::numeric, 'pedir 100 empresas custa dois blocos'
);
select is(
  (select q.credits from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001', 20) q),
  5.00::numeric, 'e menos de 50 custa um bloco'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select is(
  (select q.can_test from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001') q),
  true, 'o Administrador pode rodar em modo de teste'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de fora não vê o custo do Workspace'
);

select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
insert into ids select 'busca1', (select b.run_id::text || ':' || b.outcome from public.begin_account_discovery(
  'f9000000-0000-0000-0000-000000000001', 'clique-1', '{"fonte":"linkedin","setores":["software"]}'::jsonb, 50,
  'harvestapi~linkedin-company-search', 3) b);
select is(
  (select split_part(valor, ':', 2) from ids where chave = 'busca1'), 'go', 'a busca começa'
);
reset role;
select is(
  (select row(r.state, r.kind, r.requested_by = '59000000-0000-0000-0000-000000000002', r.estimated_credits, r.estimated_cost_usd,
     r.max_results, r.actor_id, r.actor_version, r.icp_version, r.request_key, r.started_at is not null)::text
   from private.discovery_runs r where r.id = (select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1')),
  '(em_andamento,contas,t,5.00,0.4500,50,harvestapi~linkedin-company-search,0.0.21,3,clique-1,t)',
  'a busca guarda quem pediu, o custo estimado, o teto do Apify, o Actor, a versão do ICP e a chave do clique'
);
select is(
  (select row(c.status, c.amount, c.action, c.user_id = '59000000-0000-0000-0000-000000000002')::text
   from private.credit_reservations c where c.action_key = 'discovery:' || (select split_part(valor, ':', 1) from ids where chave = 'busca1')),
  '(reserved,5.00,account_discovery,t)', 'o saldo fica reservado no nome de quem pediu, pela chave da busca'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select is(
  (select b.run_id::text || ':' || b.outcome from public.begin_account_discovery(
    'f9000000-0000-0000-0000-000000000001', 'clique-1', '{"fonte":"linkedin"}'::jsonb, 50, 'harvestapi~linkedin-company-search') b),
  (select split_part(valor, ':', 1) || ':existing' from ids where chave = 'busca1'),
  'repetir o clique (mesma chave) devolve a mesma busca, sem rodar nem cobrar de novo'
);
select is(
  (select q.available from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001') q),
  15.00::numeric, 'e o saldo disponível já desconta a reserva'
);
select is(
  (select q.in_progress from public.quote_account_discovery('f9000000-0000-0000-0000-000000000001') q),
  true, 'a tela vê que há uma busca em andamento'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'clique-2', '{}'::jsonb, 50, 'harvestapi~linkedin-company-search')$$,
  '55006', 'a discovery is already running', 'só uma busca de cada vez por Workspace'
);

-- O servidor grava as candidatas e fecha: veio empresa, o crédito é debitado; os números e o custo real ficam na busca.
reset role;
select * from public.record_discovered_accounts((select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1'),
  '[{"name":"Eta Energia","website":"https://eta.test","sourceRunId":"apify-run-1","sourceActor":"harvestapi~linkedin-company-search"}]'::jsonb);
select is(
  (select source_run_id from private.discovered_accounts where name = 'Eta Energia'), 'apify-run-1',
  'cada candidata guarda a execução do Apify de onde veio'
);
select public.finish_account_discovery((select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1'), true, 'apify-run-1', 0.2021, null);
select is(
  (select row(r.state, r.found, r.added, r.apify_run_id, r.actual_cost_usd, r.finished_at is not null, r.last_error)::text
   from private.discovery_runs r where r.id = (select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1')),
  '(concluida,1,1,apify-run-1,0.202100,t,)', 'a busca fecha concluída, com os números e o custo real'
);
select is(
  (select row(c.status, c.settled_quantity)::text from private.credit_reservations c
   where c.action_key = 'discovery:' || (select split_part(valor, ':', 1) from ids where chave = 'busca1')),
  '(settled,1)', 'o crédito foi debitado'
);
select is(
  (select e.amount from private.credit_entries e join private.credit_reservations c on c.id = e.reservation_id
   where c.action_key = 'discovery:' || (select split_part(valor, ':', 1) from ids where chave = 'busca1')),
  -5.00::numeric, 'no extrato, 5 créditos a menos'
);
select lives_ok(
  $$select public.finish_account_discovery((select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1'), false, null, null, 'tarde demais')$$,
  'fechar de novo não muda nada'
);
select is(
  (select r.state from private.discovery_runs r where r.id = (select split_part(valor, ':', 1)::uuid from ids where chave = 'busca1')),
  'concluida', 'a busca concluída continua concluída'
);

-- O Apify não achou nada: o saldo volta, nada é cobrado. O Actor falhou: idem, com o motivo.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
insert into ids select 'busca2', (select b.run_id::text from public.begin_account_discovery(
  'f9000000-0000-0000-0000-000000000001', 'clique-2', '{}'::jsonb, 100, 'harvestapi~linkedin-company-search') b);
reset role;
select is(
  (select c.amount from private.credit_reservations c where c.action_key = 'discovery:' || (select valor from ids where chave = 'busca2')),
  10.00::numeric, 'pedir 100 empresas reserva dois blocos'
);
select public.finish_account_discovery((select valor::uuid from ids where chave = 'busca2'), true, 'apify-run-2', 0.0005, null);
select is(
  (select c.status || ':' || coalesce(c.settled_quantity::text, '-') from private.credit_reservations c
   where c.action_key = 'discovery:' || (select valor from ids where chave = 'busca2')),
  'released:-', 'sem empresa nenhuma, a reserva é solta e nada é cobrado'
);
select is(
  (select r.state from private.discovery_runs r where r.id = (select valor::uuid from ids where chave = 'busca2')),
  'concluida', 'a busca vazia termina concluída'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
insert into ids select 'busca3', (select b.run_id::text from public.begin_account_discovery(
  'f9000000-0000-0000-0000-000000000001', 'clique-3', '{}'::jsonb, 50, 'harvestapi~linkedin-company-search') b);
reset role;
select public.finish_account_discovery((select valor::uuid from ids where chave = 'busca3'), false, null, null, 'O Apify respondeu HTTP 402');
select is(
  (select row(r.state, r.last_error)::text from private.discovery_runs r where r.id = (select valor::uuid from ids where chave = 'busca3')),
  '(falhou,"O Apify respondeu HTTP 402")', 'a falha fica na busca, com o motivo'
);
select is(
  (select t.booked - t.reserved from private.credit_totals('f9000000-0000-0000-0000-000000000001') t),
  15.00::numeric, 'e só as 5 da busca que achou empresa foram cobradas'
);

-- O modo de teste: um Actor "em teste" só roda para um Administrador que o pede.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'teste-1', '{}'::jsonb, 50, 'johnatan029~cnpj-empresas-brasil-scraper')$$,
  '55000', 'discovery actor is still in testing', 'o Actor em teste não roda para o Membro'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'teste-2', '{}'::jsonb, 50, 'johnatan029~cnpj-empresas-brasil-scraper', null, true)$$,
  '55000', 'discovery actor is still in testing', 'nem o Membro que pede o modo de teste'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'teste-3', '{}'::jsonb, 50, 'johnatan029~cnpj-empresas-brasil-scraper')$$,
  '55000', 'discovery actor is still in testing', 'nem o Administrador sem pedir o modo de teste'
);
insert into ids select 'busca4', (select b.run_id::text || ':' || b.outcome from public.begin_account_discovery(
  'f9000000-0000-0000-0000-000000000001', 'teste-4', '{}'::jsonb, 20, 'johnatan029~cnpj-empresas-brasil-scraper', null, true) b);
select is(
  (select split_part(valor, ':', 2) from ids where chave = 'busca4'), 'go', 'o Administrador roda o Actor em teste quando pede o modo de teste'
);
reset role;
select public.finish_account_discovery((select split_part(valor, ':', 1)::uuid from ids where chave = 'busca4'), false, null, null, 'teste');
select public.set_discovery_actor_state('buscar_contas', 'johnatan029~cnpj-empresas-brasil-scraper', 'out');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'fora-1', '{}'::jsonb, 50, 'johnatan029~cnpj-empresas-brasil-scraper', null, true)$$,
  '55000', 'discovery actor is out', 'o Actor fora do ar nunca roda'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'fora-2', '{}'::jsonb, 50, 'ninguem~nada')$$,
  'P0002', 'discovery actor not found', 'o Actor fora do registro nunca roda'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'fora-3', '{}'::jsonb, 50, 'harvestapi~linkedin-profile-search')$$,
  'P0002', 'discovery actor not found', 'nem um Actor do registro de Sinais'
);

-- Filtros inválidos, quem é de fora, saldo e limite mensal.
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'inv-1', '[]'::jsonb, 50, 'harvestapi~linkedin-company-search')$$,
  '22023', 'invalid discovery criteria', 'filtros que não são um objeto são recusados'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'inv-2', '{}'::jsonb, 101, 'harvestapi~linkedin-company-search')$$,
  '22023', 'invalid discovery criteria', 'mais de 100 empresas é recusado'
);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'inv-3', '{}'::jsonb, 0, 'harvestapi~linkedin-company-search')$$,
  '22023', 'invalid discovery criteria', 'e zero também'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'fora-4', '{}'::jsonb, 50, 'harvestapi~linkedin-company-search')$$,
  '42501', 'active workspace membership required', 'quem é de fora não abre busca no Workspace'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select public.set_member_credit_limit('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 3);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'lim-1', '{}'::jsonb, 50, 'harvestapi~linkedin-company-search')$$,
  'P0001', 'monthly credit limit reached', 'o limite mensal da pessoa vale para a busca'
);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select public.set_member_credit_limit('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', null);
reset role;
select public.reserve_credits('f9000000-0000-0000-0000-000000000001', null, 'person_collected', 'segura-o-saldo', 13);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.begin_account_discovery('f9000000-0000-0000-0000-000000000001', 'sem-saldo', '{}'::jsonb, 50, 'harvestapi~linkedin-company-search')$$,
  'P0001', 'insufficient credits', 'sem saldo, a busca não começa'
);
reset role;
select is(
  (select count(*)::integer from private.discovery_runs where request_key = 'sem-saldo'), 0,
  'e não deixa busca para trás'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', true);

-- O servidor e o navegador: cada um com o que lhe cabe.
select throws_ok(
  $$select public.finish_account_discovery(gen_random_uuid(), true, null, null, null)$$,
  '42501', 'permission denied for function finish_account_discovery', 'o navegador não fecha a busca'
);
select throws_ok(
  $$select public.record_discovery_cost('f9000000-0000-0000-0000-000000000001', 'harvestapi~linkedin-company-search', 'x', 1, 0.1)$$,
  '42501', 'permission denied for function record_discovery_cost', 'nem grava custo'
);
reset role;
select public.record_discovery_cost('f9000000-0000-0000-0000-000000000001', 'harvestapi~linkedin-company-search', 'apify-run-1', 50, 0.2021);
select public.record_discovery_cost('f9000000-0000-0000-0000-000000000001', 'harvestapi~linkedin-company-search', 'apify-run-1', 50, 0.2021);
select is(
  (select row(count(*), max(c.cost_usd), max(c.input_units))::text from private.action_costs c where c.source_ref = 'apify-run-1'),
  '(1,0.202100,50)', 'o custo real de uma execução entra no relatório uma vez só'
);
select throws_ok(
  $$select public.record_discovery_cost('f9000000-0000-0000-0000-000000000001', 'ninguem~nada', 'y', 1, 0.1)$$,
  'P0002', 'actor not found', 'custo de um Actor fora do registro é recusado'
);

-- Uma busca que ninguém fechou vence: falha sem cobrar e solta o saldo.
select public.release_credits((select id from private.credit_reservations where action_key = 'segura-o-saldo'));
insert into private.discovery_runs (id, workspace_id, requested_by, state, criteria, max_results, actor_id, started_at)
values ('a9000000-0000-0000-0000-0000000000a1', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002',
  'em_andamento', '{}', 50, 'harvestapi~linkedin-company-search', now() - interval '20 minutes');
select public.reserve_credits('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'account_discovery', 'discovery:presa', 1);
update private.discovery_runs set reservation_id = (select id from private.credit_reservations where action_key = 'discovery:presa')
where id = 'a9000000-0000-0000-0000-0000000000a1';
select is(private.expire_stale_discovery_runs(), 1, 'a busca esquecida vence');
select is(
  (select row(r.state, r.last_error)::text from private.discovery_runs r where r.id = 'a9000000-0000-0000-0000-0000000000a1'),
  '(falhou,"A busca não terminou a tempo. Nada foi cobrado.")', 'falha com o motivo'
);
select is(
  (select c.status from private.credit_reservations c where c.action_key = 'discovery:presa'), 'released',
  'e o saldo reservado volta'
);

select * from finish();
rollback;
