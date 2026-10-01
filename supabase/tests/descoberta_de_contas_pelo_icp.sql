begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(71);

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
      {"name":"Nova Software Ltda","website":"https://www.nova.test/","cnpj":"47960950000121","linkedinUrl":"https://www.linkedin.com/company/nova-software/","uf":"sp","sector":"Software","sizeLabel":"51-200","employeeCount":120,"technologies":["AWS","Node"],"score":80,"level":"alto","reasons":[{"criterio":"Setor","atende":true,"texto":"Setor bate: Software"}],"signals":[{"texto":"Aberta em 2026","fonte":"Receita Federal"}],"sourceRef":"nova-software"},
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
  (select row(l.signals -> 0 ->> 'fonte', l.technologies)::text from public.list_discovered_accounts('f9000000-0000-0000-0000-000000000001') l where l.name = 'Nova Software Ltda'),
  '("Receita Federal","{AWS,Node}")', 'a lista traz os indícios de Sinal e as tecnologias'
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

select * from finish();
rollback;
