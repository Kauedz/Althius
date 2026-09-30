begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

-- Ana (Admin) do Norte, com a Conta Alfa; o Sul tem a própria Conta.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('da000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '5a000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'Alfa Sul', 'https://alfasul.test', 'alfasul.test', '5a000000-0000-0000-0000-000000000002');

create function pg_temp.gravar(p_ws text, p_conta text, p_tipo text, p_chave text) returns boolean language sql as $$
  select public.record_signal(p_ws::uuid, p_conta::uuid, null, p_tipo, p_chave, 'Abriu vaga de Engenheiro de Dados',
    now() - interval '2 days', 'LinkedIn Vagas', null)
$$;

-- 1. A vaga do LinkedIn é um Sinal novo; a mesma vaga no Indeed é reencontro: não conta de novo.
select ok(pg_temp.gravar('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'vaga_linkedin',
  'vaga|alfa|engenheiro de dados|2026-09'), 'a vaga do LinkedIn é um Sinal novo');
select ok(not pg_temp.gravar('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'vaga_indeed',
  'vaga|alfa|engenheiro de dados|2026-09'), 'a mesma vaga no Indeed não é Sinal novo');
select is(
  (select count(*)::integer from private.signals where target_account_id = 'da000000-0000-0000-0000-000000000001'), 1,
  'a Conta tem um Sinal só para a vaga que apareceu nas duas fontes'
);
select ok(
  (select seen_again_at is not null from private.signals where target_account_id = 'da000000-0000-0000-0000-000000000001'),
  'e o reencontro fica registrado no Sinal que já existia'
);

-- 2. Outra vaga no Indeed conta; e a mesma chave noutra Conta (de outro Workspace) é outro acontecimento.
select ok(pg_temp.gravar('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'vaga_indeed',
  'vaga|alfa|analista de dados|2026-09'), 'uma vaga diferente no Indeed é Sinal novo');
select ok(pg_temp.gravar('fa000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000002', 'vaga_indeed',
  'vaga|alfa|engenheiro de dados|2026-09'), 'a mesma chave noutra Conta e noutro Workspace não é reencontro');

-- 3. Só a família de vagas se junta: a mesma chave num Sinal de outro tipo segue a regra do próprio tipo.
select ok(pg_temp.gravar('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'nova_lideranca',
  'vaga|alfa|engenheiro de dados|2026-09'), 'um Sinal que não é de vaga não é reencontro de uma vaga');

select * from finish();
rollback;
