-- Revelar telefone custa 5 créditos (decisão do Kauê, 28/10/2026; migration 20261218020000). Substitui a recusa do B5.
-- A checagem de sessão, Contato e Participação continua antes do canal. O preço vem do catálogo. Só cobra quando grava
-- um telefone novo achado pela Althius; nada achado, valor inválido, telefone de outro Contato ou achado pela conexão do
-- Cliente não cobram. E-mail segue igual.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(25);

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
insert into ids select 'apollo', id from public.create_contact(
  'b5300000-0000-0000-0000-000000000001', 'Rui Pelo Apollo', 'Diretor', null, null, 'https://www.linkedin.com/in/rui-b5');

create function pg_temp.id(p_chave text) returns uuid language sql as $f$
  select valor from ids where chave = p_chave
$f$;

create function pg_temp.disponivel() returns numeric language sql as $f$
  select booked - reserved from private.credit_totals('b5200000-0000-0000-0000-000000000001')
$f$;

create function pg_temp.revelar(p_chave text, p_valor text, p_fonte text default 'apify:teste')
returns table (resultado text, reserva uuid) language plpgsql as $f$
declare
  v_reserva uuid;
begin
  select b.reservation_id into v_reserva
  from public.begin_reveal_contact('b5200000-0000-0000-0000-000000000001', pg_temp.id(p_chave), 'telefone') b;
  return query
    select f.success::text || ':' || f.debited_credits, v_reserva
    from public.finish_reveal_contact(v_reserva, pg_temp.id(p_chave), 'telefone', p_valor, p_fonte) f;
end
$f$;

-- 1. Sem sessão, Contato inexistente e quem não é da Participação continuam barrados antes do canal.
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('sem_telefone')),
  '28000', null, 'quote_reveal_contact sem sessão continua 28000'
);
select throws_ok(
  format($$ select * from public.begin_reveal_contact(%L, %L, 'telefone') $$,
    'b5200000-0000-0000-0000-000000000001', pg_temp.id('sem_telefone')),
  '28000', null, 'begin_reveal_contact sem sessão continua 28000'
);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000001', true);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, gen_random_uuid()),
  'P0002', null, 'quote_reveal_contact de Contato inexistente continua P0002'
);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000002', true);
select throws_ok(
  format($$ select * from public.quote_reveal_contact(%L, 'telefone') $$, pg_temp.id('sem_telefone')),
  '42501', null, 'quote_reveal_contact de quem não é da Participação continua 42501'
);
select set_config('request.jwt.claim.sub', 'b5100000-0000-0000-0000-000000000001', true);

-- 2. A cotação: 5 créditos sem telefone; 0 e já encontrado com telefone; o preço vem do catálogo.
select is((select row(q.credits, q.can_reveal, q.already_known)::text
           from public.quote_reveal_contact(pg_temp.id('sem_telefone'), 'telefone') q),
  '(5,t,f)', 'telefone cota 5 créditos');
select is((select row(q.credits, q.can_reveal, q.already_known)::text
           from public.quote_reveal_contact(pg_temp.id('com_telefone'), 'telefone') q),
  '(0,t,t)', 'telefone que o Contato já tem cota 0 e já encontrado');
update private.credit_action_prices set credits = 7 where action = 'phone_revealed';
select is((select credits from public.quote_reveal_contact(pg_temp.id('sem_telefone'), 'telefone')), 7,
  'a cotação segue o catálogo, não um número fixo');
update private.credit_action_prices set credits = 5 where action = 'phone_revealed';

-- 3. Achou um telefone novo pela Althius: grava como celular sem WhatsApp confirmado e debita 5.
create temporary table saldo_inicial as select pg_temp.disponivel() as valor;
create temporary table t_achou as select * from pg_temp.revelar('sem_telefone', '(11) 91234-5678');
select is((select resultado from t_achou), 'true:5', 'telefone novo debita 5 créditos');
select is((select status from private.credit_reservations where id = (select reserva from t_achou)), 'settled',
  'a reserva do telefone é liquidada');
select is((select row(c.phone, c.phone_kind, c.phone_whatsapp)::text from public.contacts c where c.id = pg_temp.id('sem_telefone')),
  '(+5511912345678,celular,f)', 'o telefone vira o principal, celular, sem a marca de WhatsApp');
select is((select s.origin || ':' || coalesce(s.provider, '') from private.contact_field_sources s
           where s.contact_id = pg_temp.id('sem_telefone') and s.field = 'phone'),
  'automatico:apify:teste', 'a procedência do telefone guarda a coleta e o provedor');
select is(pg_temp.disponivel(), (select valor from saldo_inicial) - 5, 'o saldo cai 5 créditos');
select is((select row(q.credits, q.already_known)::text from public.quote_reveal_contact(pg_temp.id('sem_telefone'), 'telefone') q),
  '(0,t)', 'depois de revelado, a cotação é 0');

-- 4. O telefone já é de outro Contato do Workspace: não grava, não cobra, libera a reserva.
create temporary table t_de_outro as select * from pg_temp.revelar('apollo', '+55 11 91234-5678');
select is((select resultado from t_de_outro), 'false:0', 'telefone de outro Contato debita 0');
select is((select status from private.credit_reservations where id = (select reserva from t_de_outro)), 'released',
  'telefone de outro Contato libera a reserva');

-- 5. Nada achado e texto que não é telefone: zero, sem erro.
select is((select resultado from pg_temp.revelar('apollo', null)), 'false:0', 'nada achado debita 0');
select is((select resultado from pg_temp.revelar('apollo', 'sem telefone')), 'false:0', 'texto que não é telefone debita 0');

-- 6. Achado pela conexão do Cliente (Apollo): grava com a origem e não cobra Créditos Althius.
select is((select resultado from pg_temp.revelar('apollo', '+55 21 98888-1111', 'apollo')), 'true:0',
  'telefone achado pelo Apollo do Cliente grava e não cobra');
select is((select phone from public.contacts where id = pg_temp.id('apollo')), '+5521988881111', 'o telefone do Apollo foi gravado');

-- 7. Contato que já tem um telefone: o novo entra como adicional (posição 2), com o provedor.
select is((select resultado from pg_temp.revelar('com_telefone', '+55 11 97777-2222')), 'true:5',
  'segundo telefone novo também debita 5');
select is((select p.ordinal || ':' || p.phone || ':' || p.whatsapp || ':' || p.provider from private.contact_phones p
           where p.contact_id = pg_temp.id('com_telefone')),
  '2:+5511977772222:false:apify:teste', 'o segundo telefone vai para a posição 2 com o provedor');

select is(pg_temp.disponivel(), (select valor from saldo_inicial) - 10, 'só os dois telefones novos da Althius cobraram');

-- 8. E-mail segue igual, e canal desconhecido segue 22023.
select is((select credits from public.quote_reveal_contact(pg_temp.id('sem_telefone'), 'email')), 2,
  'e-mail continua cotando 2 créditos');
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
