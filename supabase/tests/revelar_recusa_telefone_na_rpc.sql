-- B5: enquanto o preço da revelação de telefone não for decidido (FILA 2.11), quote_reveal_contact e
-- begin_reveal_contact recusam 'telefone' com erro próprio (0A000), sem ler saldo, sem reservar crédito e sem
-- tocar no Contato. A checagem de sessão, Contato e Participação continua antes da recusa. E-mail segue igual.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b5100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@b5.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b5100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'eva@b5-fora.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b5200000-0000-0000-0000-000000000001', 'empresa', 'Workspace B5');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
  select w.id, 'escala', date_trunc('month', now()) from public.workspaces w
  where w.id = 'b5200000-0000-0000-0000-000000000001'
  on conflict (workspace_id) do nothing;

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b5200000-0000-0000-0000-000000000001', 'b5100000-0000-0000-0000-000000000001', 'admin', true);

select public.grant_credits('b5200000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial do B5');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('b5300000-0000-0000-0000-000000000001', 'b5200000-0000-0000-0000-000000000001', 'Acme B5', 'https://acme-b5.test', 'acme-b5.test', 'b5100000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000001', true);

create temporary table ids (chave text primary key, valor uuid not null);
grant select on ids to authenticated;
insert into ids select 'sem_telefone', id from public.create_contact(
  'b5300000-0000-0000-0000-000000000001', 'Caio Sem Telefone', 'Analista', null, null, 'https://www.linkedin.com/in/caio-b5');
insert into ids select 'com_telefone', id from public.create_contact(
  'b5300000-0000-0000-0000-000000000001', 'Duda Com Telefone', 'Gerente', 'duda@acme-b5.test', '+55 11 90000-0001', 'https://www.linkedin.com/in/duda-b5');

create function pg_temp.id(p_chave text) returns uuid language sql as $f$
  select valor from ids where chave = p_chave
$f$;

create function pg_temp.reservado() returns numeric language sql as $f$
  select reserved from private.credit_totals('b5200000-0000-0000-0000-000000000001')
$f$;

-- 1. Sem sessão, a checagem de autenticação vem antes da recusa do canal.
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('sem_telefone')),
  '28000', null, 'quote_reveal_contact sem sessão continua 28000, antes de checar o canal'
);
select throws_ok(
  format($$ select * from public.begin_reveal_contact(%L, %L, 'telefone') $$,
    'b5200000-0000-0000-0000-000000000001', pg_temp.id('sem_telefone')),
  '28000', null, 'begin_reveal_contact sem sessão continua 28000, antes de checar o canal'
);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000001', true);

-- 2. Contato inexistente continua P0002, antes da recusa do canal.
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, gen_random_uuid()),
  'P0002', null, 'quote_reveal_contact de Contato inexistente continua P0002'
);

-- 3. Membro de outro Workspace continua 42501, antes da recusa do canal.
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000002', true);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('sem_telefone')),
  '42501', null, 'quote_reveal_contact de quem não é da Participação continua 42501'
);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000001', true);

-- 4. Telefone é recusado na cotação, com e sem telefone já gravado.
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('sem_telefone')),
  '0A000', 'phone reveal unavailable', 'quote_reveal_contact recusa telefone sem telefone gravado'
);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('com_telefone')),
  '0A000', 'phone reveal unavailable', 'quote_reveal_contact recusa telefone mesmo já gravado (sem already_known)'
);

-- 5. Telefone é recusado em begin_reveal_contact, antes de reservar: nenhuma linha nova, saldo reservado igual.
create temporary table t_reservado_antes as select pg_temp.reservado() as valor;
select throws_ok(
  format($$ select * from public.begin_reveal_contact(%L, %L, 'telefone') $$,
    'b5200000-0000-0000-0000-000000000001', pg_temp.id('sem_telefone')),
  '0A000', 'phone reveal unavailable', 'begin_reveal_contact recusa telefone antes de reservar'
);
select is(
  (select count(*) from private.credit_reservations where workspace_id = 'b5200000-0000-0000-0000-000000000001' and action = 'phone_revealed'),
  0::bigint,
  'nenhuma reserva de phone_revealed foi criada'
);
select is(pg_temp.reservado(), (select valor from t_reservado_antes), 'o saldo reservado não muda com a recusa');

-- 6. E-mail segue igual: cota 2 créditos e reserva email_revealed normalmente.
select is(
  (select credits from public.quote_reveal_contact(pg_temp.id('sem_telefone'), 'email')),
  2, 'e-mail continua cotando 2 créditos'
);

create temporary table t_res_email as
  select * from public.begin_reveal_contact(
    'b5200000-0000-0000-0000-000000000001', pg_temp.id('sem_telefone'), 'email');
select is(
  (select count(*) from private.credit_reservations
   where id = (select reservation_id from t_res_email) and action = 'email_revealed' and status = 'reserved'),
  1::bigint,
  'begin_reveal_contact ainda reserva email_revealed'
);

-- 7. Canal desconhecido segue com o erro de antes (22023), nas duas RPCs.
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'fax') $$, pg_temp.id('sem_telefone')),
  '22023', 'invalid channel for reveal', 'quote_reveal_contact: canal desconhecido segue 22023'
);
select throws_ok(
  format($$ select * from public.begin_reveal_contact(%L, %L, 'fax') $$,
    'b5200000-0000-0000-0000-000000000001', pg_temp.id('sem_telefone')),
  '22023', 'invalid channel for reveal', 'begin_reveal_contact: canal desconhecido segue 22023'
);

select * from finish();
rollback;
