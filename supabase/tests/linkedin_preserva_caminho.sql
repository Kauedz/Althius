begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

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


select is(private.normalize_linkedin('HTTP://BR.LINKEDIN.COM/in/ACwAAABpLK4BOMswYS36naRm32ho6uhmAYmPWoY/?trk=foo'), 'https://www.linkedin.com/in/ACwAAABpLK4BOMswYS36naRm32ho6uhmAYmPWoY', 'esquema e host normalizam sem destruir o caminho');
select is(private.normalize_linkedin('https://www.linkedin.com/in/Slug/#foo'), 'https://www.linkedin.com/in/Slug', 'remove barra final e fragmento');
select is(private.linkedin_person_key('https://www.linkedin.com/in/ACwAA'), 'acwaa', 'chave de apagamento continua sem caixa');
select ok(private.signal_carries_person('mov|acwaa|cargo', null, private.linkedin_person_key('https://www.linkedin.com/in/ACwAA')), 'apagamento ainda encontra Sinal do perfil misto');
select is(private.normalize_linkedin(''), null::text, 'valor vazio continua nulo');
create temporary table proposta_a as select id from public.record_proposed_contact('62000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001',null,'CFO',null,null,'https://www.linkedin.com/in/ACwAA');
create temporary table proposta_b as select id from public.record_proposed_contact('62000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001',null,'CFO',null,null,'https://www.linkedin.com/in/acwaa');
grant select on proposta_a, proposta_b to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
create temporary table aceito as select * from public.accept_proposed_contact((select id from proposta_a));
select is((select linkedin from aceito), 'https://www.linkedin.com/in/ACwAA', 'aceite guarda o caminho original');
select is((select id from public.accept_proposed_contact((select id from proposta_b))), (select id from aceito), 'propostas com caixas diferentes devolvem o mesmo Contato');
reset role;
select throws_ok($sql$insert into public.contacts(workspace_id,name,linkedin,created_by) values('62000000-0000-0000-0000-000000000001','Duplicado','https://www.linkedin.com/in/acwaa','61000000-0000-0000-0000-000000000001')$sql$, '23505', null, 'índice impede duplicata sem caixa');
update public.contacts set linkedin = lower(linkedin) where id = (select id from aceito);
-- Executa a mesma reparação chamada pela migration com dado semeado.
select private.restore_accepted_contact_linkedin();
select is((select linkedin from public.contacts where id = (select id from aceito)), 'https://www.linkedin.com/in/ACwAA', 'reparação recupera caminho de proposta aceita');
select is((select count(*) from public.contacts where workspace_id = '62000000-0000-0000-0000-000000000001'), 1::bigint, 'reparação não cria Contatos');
select * from finish();
rollback;
