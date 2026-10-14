begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);

-- Usuários e Workspaces de teste
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@enriquecimento.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@enriquecimento.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'externo@outro.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('62000000-0000-0000-0000-000000000001', 'empresa', 'Workspace Enriquecimento'),
  ('62000000-0000-0000-0000-000000000002', 'empresa', 'Workspace Outro');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'admin', true),
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'member', true),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', 'admin', true);

-- Saldo inicial de 100 créditos para o Workspace
select public.grant_credits('62000000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial de teste');

-- Cria Conta-alvo para os testes de enriquecimento
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'LogiFlow Brasil S.A.', 'https://logiflow.test', 'logiflow.test', '61000000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001');

-- 1. Testes de dados da Receita Federal
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);

-- Grava dados da Receita Federal na Conta
select lives_ok(
  $$ select public.save_account_receita_enrichment(
       '62000000-0000-0000-0000-000000000001'::uuid,
       '63000000-0000-0000-0000-000000000001'::uuid,
       '07.526.557/0001-00',
       '{"razaoSocial": "LOGIFLOW BRASIL S.A.", "cnae": "4930202", "capitalSocial": 5000000}'::jsonb
     ) $$,
  'membro ativo consegue salvar enriquecimento da Receita Federal'
);

select is(
  (select legal_identifier from public.target_accounts where id = '63000000-0000-0000-0000-000000000001'::uuid),
  '07.526.557/0001-00',
  'legal_identifier foi atualizado com o CNPJ formatado'
);

select is(
  (select receita_data->>'razaoSocial' from public.target_accounts where id = '63000000-0000-0000-0000-000000000001'::uuid),
  'LOGIFLOW BRASIL S.A.',
  'receita_data armazena os dados cadastrais da Receita Federal'
);

-- Membro de outro workspace não pode salvar enriquecimento
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.save_account_receita_enrichment(
       '62000000-0000-0000-0000-000000000001'::uuid,
       '63000000-0000-0000-0000-000000000001'::uuid,
       '07.526.557/0001-00',
       '{}'::jsonb
     ) $$,
  '42501',
  null,
  'membro de outro workspace é recusado'
);

-- 2. Testes de início e finalização da busca do Comitê de Compra
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);

create temporary table t_comite as
  select * from public.begin_committee_discovery(
    '62000000-0000-0000-0000-000000000001'::uuid,
    '63000000-0000-0000-0000-000000000001'::uuid,
    'comite-req-1',
    5,
    'harvestapi~linkedin-company-employees',
    true
  );

select is(
  (select count(*) from t_comite),
  1::bigint,
  'begin_committee_discovery retorna uma linha'
);

select is(
  (select state from t_comite),
  'em_andamento',
  'estado inicial é em_andamento'
);

-- Segunda busca simultânea para a mesma conta é impedida
select throws_ok(
  $$ select * from public.begin_committee_discovery(
       '62000000-0000-0000-0000-000000000001'::uuid,
       '63000000-0000-0000-0000-000000000001'::uuid,
       'comite-req-2',
       5
     ) $$,
  '55006',
  null,
  'duas buscas de comitê em andamento para a mesma conta são bloqueadas'
);

-- Gravação de contatos propostos via service_role
reset role;

select lives_ok(
  $$ select * from public.record_proposed_contact(
       '62000000-0000-0000-0000-000000000001'::uuid,
       '63000000-0000-0000-0000-000000000001'::uuid,
       (select run_id from t_comite),
       'Carlos Alberto Silva',
       'Chief Executive Officer',
       'CEO na LogiFlow',
       'https://linkedin.com/in/carlos-silva-logiflow',
       'Curitiba, PR',
       null,
       'Decisor'
     ) $$,
  'service_role grava primeiro contato proposto (Decisor)'
);

select lives_ok(
  $$ select * from public.record_proposed_contact(
       '62000000-0000-0000-0000-000000000001'::uuid,
       '63000000-0000-0000-0000-000000000001'::uuid,
       (select run_id from t_comite),
       'Mariana Santos',
       'Gerente de Operações',
       'Operations Manager',
       'https://linkedin.com/in/mariana-santos-logiflow',
       'Curitiba, PR',
       null,
       'Influenciador'
     ) $$,
  'service_role grava segundo contato proposto (Influenciador)'
);

-- Finaliza a busca do comitê liquidando os 2 contatos encontrados (2 créditos)
select lives_ok(
  $$ select public.finish_committee_discovery(
       (select run_id from t_comite),
       true,
       2
     ) $$,
  'finish_committee_discovery liquida os créditos dos contatos encontrados'
);

-- 3. Listagem e decisão de contatos propostos
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'nova')),
  2::bigint,
  'list_proposed_contacts lista os 2 contatos propostos'
);

-- Decisor aparece primeiro na ordenação de personas
select is(
  (select persona from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'nova') limit 1),
  'Decisor',
  'Decisor aparece no topo da lista ordenada do comitê'
);

-- Aceitar contato proposto cria o contato na Conta-alvo via create_contact
create temporary table t_contato_aceito as
  select * from public.accept_proposed_contact(
    (select id from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'nova') where name = 'Carlos Alberto Silva')
  );

select is(
  (select count(*) from t_contato_aceito),
  1::bigint,
  'accept_proposed_contact retornou o contato criado'
);

select is(
  (select name from t_contato_aceito),
  'Carlos Alberto Silva',
  'nome do contato criado confere'
);

select is(
  (select count(*) from public.contacts where name = 'Carlos Alberto Silva'),
  1::bigint,
  'contato foi gravado na tabela public.contacts'
);

select is(
  (select count(*) from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'aceita') where name = 'Carlos Alberto Silva'),
  1::bigint,
  'proposta foi marcada como aceita'
);

-- Descartar contato proposto
select lives_ok(
  $$ select public.discard_proposed_contact(
       (select id from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'nova') where name = 'Mariana Santos'),
       'Não prioritário para abordagem inicial'
     ) $$,
  'descartar contato proposto funciona com motivo'
);

select is(
  (select count(*) from public.list_proposed_contacts('63000000-0000-0000-0000-000000000001'::uuid, 'descartada') where name = 'Mariana Santos'),
  1::bigint,
  'proposta foi marcada como descartada'
);

-- 4. Revelação de dados (E-mail e Telefone)
-- Cotação prévia
select is(
  (select credits from public.quote_reveal_contact((select id from t_contato_aceito), 'email')),
  2,
  'cotação de e-mail é de 2 créditos'
);

select is(
  (select credits from public.quote_reveal_contact((select id from t_contato_aceito), 'telefone')),
  5,
  'cotação de telefone é de 5 créditos'
);

-- Início de revelação de e-mail (reserva 2 créditos)
create temporary table t_res_email as
  select * from public.begin_reveal_contact(
    '62000000-0000-0000-0000-000000000001'::uuid,
    (select id from t_contato_aceito),
    'email'
  );

select is(
  (select count(*) from t_res_email),
  1::bigint,
  'begin_reveal_contact cria a reserva de crédito'
);

-- Finalização quando o e-mail é encontrado (debita 2 créditos)
reset role;

create temporary table t_fin_email as
  select * from public.finish_reveal_contact(
    (select reservation_id from t_res_email),
    (select id from t_contato_aceito),
    'email',
    'carlos.silva@logiflow.com.br',
    'apify'
  );

select is(
  (select success from t_fin_email),
  true,
  'finish_reveal_contact teve sucesso ao encontrar e-mail'
);

select is(
  (select debited_credits from t_fin_email),
  2,
  'exatamente 2 créditos foram debitados pelo e-mail encontrado'
);

select is(
  (select email from public.contacts where id = (select id from t_contato_aceito)),
  'carlos.silva@logiflow.com.br',
  'e-mail foi registrado no contato'
);

-- Finalização quando o dado NÃO é encontrado: NENHUM crédito debitado!
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);

create temporary table t_res_tel as
  select * from public.begin_reveal_contact(
    '62000000-0000-0000-0000-000000000001'::uuid,
    (select id from t_contato_aceito),
    'telefone'
  );

reset role;

create temporary table t_fin_tel as
  select * from public.finish_reveal_contact(
    (select reservation_id from t_res_tel),
    (select id from t_contato_aceito),
    'telefone',
    null, -- Telefone não encontrado!
    'apify'
  );

select is(
  (select success from t_fin_tel),
  false,
  'finish_reveal_contact indicou que telefone não foi encontrado'
);

select is(
  (select debited_credits from t_fin_tel),
  0,
  'ZERO créditos foram debitados quando o dado não foi encontrado'
);

-- 5. Imutabilidade e integridade das funções protegidas
select ok(
  exists (select 1 from pg_proc where proname = 'save_target_account'),
  'save_target_account permanece intacta no banco'
);

select ok(
  exists (select 1 from pg_proc where proname = 'create_contact'),
  'create_contact permanece intacta no banco'
);

select ok(
  exists (select 1 from pg_proc where proname = 'link_contact'),
  'link_contact permanece intacta no banco'
);

select * from finish();
rollback;
