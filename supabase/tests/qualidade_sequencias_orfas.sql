begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

-- Simula exclusivamente nesta transação linhas legadas anteriores às FKs e aos gatilhos.
set local session_replication_role = replica;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('aa000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
  'orfas-' || n || '@example.test', '', now(), now(), now(), '{}', '{}', false, false from generate_series(1,2) n;
insert into public.workspaces(id, kind, name) values ('ab000000-0000-0000-0000-000000000001', 'empresa', 'Órfãs');
insert into public.workspace_memberships(workspace_id, user_id, role, active)
select 'ab000000-0000-0000-0000-000000000001', ('aa000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'admin', true from generate_series(1,2) n;
insert into public.target_accounts(id, workspace_id, name, canonical_url, domain, created_by, archived_at, deleted_at)
select ('ac000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'ab000000-0000-0000-0000-000000000001',
  'Conta ' || n, 'https://conta-' || n || '.example.test', 'conta-' || n || '.example.test',
  'aa000000-0000-0000-0000-000000000001', case when n in (3,8) then now() end, case when n=4 then now() end
from generate_series(3,8) n;
insert into public.sales_responsibilities(workspace_id, target_account_id, owner_user_id)
select 'ab000000-0000-0000-0000-000000000001', case when n=1 then 'teste-real-legado' else 'ac000000-0000-0000-0000-' || lpad(n::text,12,'0') end,
  case when n=5 then 'aa000000-0000-0000-0000-000000000002'::uuid else 'aa000000-0000-0000-0000-000000000001'::uuid end
from generate_series(1,8) n;
insert into public.sequences(id, workspace_id, target_account_id, owner_user_id)
select ('ad000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'ab000000-0000-0000-0000-000000000001',
  case when n=1 then 'teste-real-legado' else 'ac000000-0000-0000-0000-' || lpad(n::text,12,'0') end,
  'aa000000-0000-0000-0000-000000000001' from generate_series(1,7) n;
insert into private.sequence_authorizations(sequence_id,version,document,authorized_by)
values ('ad000000-0000-0000-0000-000000000006',1,'{"steps":[]}','aa000000-0000-0000-0000-000000000001');
set local session_replication_role = origin;

select results_eq(
  $$select reason from private.diagnose_sequence_orphans() where workspace_id='ab000000-0000-0000-0000-000000000001' order by sequence_id$$,
  $$values ('invalid_account_id'::text), ('account_missing'), ('account_archived'), ('account_deleted'), ('owner_not_responsible'), ('authorization_without_steps')$$,
  'diagnóstico lista cada motivo real, sem classificar rascunho saudável sem passos como órfão');
select is((select count(*) from private.diagnose_sequence_orphans() where sequence_id='ad000000-0000-0000-0000-000000000007'),0::bigint,'rascunho sem autorização não é órfão');
select throws_ok($$insert into public.sequences(workspace_id,target_account_id,owner_user_id) values ('ab000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000008','aa000000-0000-0000-0000-000000000001')$$,
  '55006','the target account is archived','escrita direta não cria Sequência ativa em Conta arquivada');
select is(private.pause_orphan_sequence('ad000000-0000-0000-0000-000000000001')->>'action','requires_account_repair','FK inválida exige reparo explícito, sem enfraquecer integridade');
select lives_ok($$select private.pause_orphan_sequence('ad000000-0000-0000-0000-000000000003')$$,'limpeza pausa legado com Conta real sem apagar');
select is((select status from public.sequences where id='ad000000-0000-0000-0000-000000000003'),'pausada','legado permanece como histórico pausado');
select is((select count(*) from private.sequence_orphan_cleanup_events where sequence_id='ad000000-0000-0000-0000-000000000001'),1::bigint,'limpeza registra ação');
select lives_ok($$select private.pause_orphan_sequence('ad000000-0000-0000-0000-000000000006')$$,'pausa autorização sem passos');
select is((select count(*) from private.sequence_authorizations where sequence_id='ad000000-0000-0000-0000-000000000006' and revoked_at is null),0::bigint,'limpeza revoga autorização sem passos');
select * from finish();
rollback;
