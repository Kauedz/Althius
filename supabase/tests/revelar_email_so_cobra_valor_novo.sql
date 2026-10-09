-- B3: revelar o e-mail cobra 2 créditos só quando grava um e-mail que o Contato ainda não tinha, no primeiro lugar livre
-- (principal ou adicional em contact_emails, até três). Repetido, de outro Contato, sem lugar, inválido ou telefone: zero
-- e a reserva liberada. A origem fica automatico e o provedor fica gravado. Outro Workspace não lê o e-mail.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b3100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@b3-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b3100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'eva@b3-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b3200000-0000-0000-0000-000000000001', 'empresa', 'Norte B3'),
  ('b3200000-0000-0000-0000-000000000002', 'empresa', 'Sul B3');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b3200000-0000-0000-0000-000000000001', 'b3100000-0000-0000-0000-000000000001', 'admin', true),
  ('b3200000-0000-0000-0000-000000000002', 'b3100000-0000-0000-0000-000000000002', 'admin', true);

select public.grant_credits('b3200000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial do B3');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('b3300000-0000-0000-0000-000000000001', 'b3200000-0000-0000-0000-000000000001', 'Acme B3', 'https://acme-b3.test', 'acme-b3.test', 'b3100000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('b3200000-0000-0000-0000-000000000001', 'b3300000-0000-0000-0000-000000000001', 'b3100000-0000-0000-0000-000000000001');

-- A sessão é a da Ana durante todo o teste, inclusive quando o servidor finaliza: assim auth.uid() não é nulo e o
-- gatilho de origem marcaria manual se a função não gravasse a própria origem.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b3100000-0000-0000-0000-000000000001', true);

create temporary table ids (chave text primary key, valor uuid not null);
grant select on ids to authenticated;
insert into ids select 'sem_email', id from public.create_contact(
  'b3300000-0000-0000-0000-000000000001', 'Sara Sem Email', 'Diretora', null, null, 'https://www.linkedin.com/in/sara-b3');
insert into ids select 'um_email', id from public.create_contact(
  'b3300000-0000-0000-0000-000000000001', 'Ugo Um Email', 'Gerente', 'ugo@acme-b3.test', null, 'https://www.linkedin.com/in/ugo-b3');
insert into ids select 'tres_emails', id from public.create_contact(
  'b3300000-0000-0000-0000-000000000001', 'Tito Tres', 'Analista', 'tito1@acme-b3.test', null, 'https://www.linkedin.com/in/tito-b3');
insert into ids select 'outro', id from public.create_contact(
  'b3300000-0000-0000-0000-000000000001', 'Otto Outro', 'Analista', 'otto@acme-b3.test', null, 'https://www.linkedin.com/in/otto-b3');
select count(*) from public.set_contact_channels(
  (select valor from ids where chave = 'tres_emails'),
  '[{"value": "tito1@acme-b3.test"}, {"value": "tito2@acme-b3.test"}, {"value": "tito3@acme-b3.test"}]'::jsonb,
  null);

create function pg_temp.id(p_chave text) returns uuid language sql as $f$
  select valor from ids where chave = p_chave
$f$;

create function pg_temp.disponivel() returns numeric language sql as $f$
  select available from public.get_credit_balance('b3200000-0000-0000-0000-000000000001')
$f$;

-- A reserva (begin_reveal_contact, da sessão) e a finalização (finish_reveal_contact, do servidor) de uma revelação.
create function pg_temp.revelar(p_chave text, p_valor text, p_canal text default 'email')
returns table (resultado text, reserva uuid) language plpgsql as $f$
declare
  v_reserva uuid;
begin
  select b.reservation_id into v_reserva
  from public.begin_reveal_contact('b3200000-0000-0000-0000-000000000001', pg_temp.id(p_chave), p_canal) b;
  return query
    select f.success::text || ':' || f.debited_credits, v_reserva
    from public.finish_reveal_contact(v_reserva, pg_temp.id(p_chave), p_canal, p_valor,
      'apify:harvestapi~linkedin-profile-scraper') f;
end
$f$;

create function pg_temp.estado_da_reserva(p_reserva uuid) returns text language sql as $f$
  select status from private.credit_reservations where id = p_reserva
$f$;

-- "valor:origem:provedor" da procedência do e-mail principal.
create function pg_temp.procedencia(p_chave text) returns text language sql as $f$
  select c.email || ':' || s.origin || ':' || coalesce(s.provider, '')
  from public.contacts c
  join private.contact_field_sources s on s.contact_id = c.id and s.field = 'email'
  where c.id = pg_temp.id(p_chave)
$f$;

-- Os e-mails do Contato na ordem, "posição:valor" separados por espaço.
create function pg_temp.emails(p_chave text) returns text language sql as $f$
  select coalesce(string_agg(ordinal || ':' || value, ' ' order by ordinal), '')
  from private.contact_channels(array[pg_temp.id(p_chave)]) where channel = 'email'
$f$;

create temporary table saldo_inicial as select pg_temp.disponivel() as valor;

-- 1. Permissão: só o servidor finaliza.
select ok(
  has_function_privilege('service_role', 'public.finish_reveal_contact(uuid, uuid, text, text, text)', 'execute'),
  'o servidor (service_role) finaliza a revelação'
);
select ok(
  not has_function_privilege('authenticated', 'public.finish_reveal_contact(uuid, uuid, text, text, text)', 'execute'),
  'a sessão do app não finaliza a revelação'
);

-- 2. Contato sem e-mail: o achado vira o principal e debita 2.
create temporary table t_principal as select * from pg_temp.revelar('sem_email', ' Novo@Acme-B3.test ');
select is((select resultado from t_principal), 'true:2', 'e-mail novo no Contato sem e-mail debita 2');
select is((select email from public.contacts where id = pg_temp.id('sem_email')), 'novo@acme-b3.test',
  'o e-mail novo vira o principal, normalizado');
select is(pg_temp.procedencia('sem_email'), 'novo@acme-b3.test:automatico:apify:harvestapi~linkedin-profile-scraper',
  'a origem do e-mail revelado é automatico mesmo com sessão, e o provedor de p_source fica gravado');
select is(pg_temp.estado_da_reserva((select reserva from t_principal)), 'settled', 'a reserva do e-mail novo é liquidada');
select is(pg_temp.disponivel(), (select valor from saldo_inicial) - 2, 'o saldo cai 2');

-- 3. Contato com um e-mail: o achado entra como adicional na posição 2; o principal fica como estava.
create temporary table t_adicional as select * from pg_temp.revelar('um_email', 'segundo@acme-b3.test');
select is((select resultado from t_adicional), 'true:2', 'e-mail novo no Contato que já tem um debita 2');
select is(pg_temp.emails('um_email'), '1:ugo@acme-b3.test 2:segundo@acme-b3.test',
  'o e-mail novo entra no primeiro lugar livre (posição 2) e o principal permanece');
select is(
  (select e.label || ':' || coalesce(e.provider, '') from private.contact_emails e where e.contact_id = pg_temp.id('um_email')),
  'trabalho:apify:harvestapi~linkedin-profile-scraper',
  'o adicional revelado guarda o provedor junto do e-mail'
);
select is(pg_temp.procedencia('um_email'), 'ugo@acme-b3.test:manual:',
  'a procedência do principal digitado não muda quando o revelado vai para adicional');

-- 4. Repetido, como adicional ou como principal, sem diferença de maiúsculas: zero, nada regravado, reserva liberada.
create temporary table t_repetido as select * from pg_temp.revelar('um_email', 'Segundo@ACME-b3.test');
select is((select resultado from t_repetido), 'false:0', 'e-mail igual a um adicional do Contato debita 0');
select is(pg_temp.estado_da_reserva((select reserva from t_repetido)), 'released', 'o repetido libera a reserva');
select is((select resultado from pg_temp.revelar('um_email', 'UGO@acme-b3.test')), 'false:0',
  'e-mail igual ao principal do Contato debita 0');
select is(pg_temp.emails('um_email'), '1:ugo@acme-b3.test 2:segundo@acme-b3.test', 'o repetido não regrava nada');

-- 5. Os três lugares ocupados: zero e nenhum e-mail apagado.
select is((select resultado from pg_temp.revelar('tres_emails', 'quarto@acme-b3.test')), 'false:0',
  'com os três lugares ocupados, o e-mail novo debita 0');
select is(pg_temp.emails('tres_emails'), '1:tito1@acme-b3.test 2:tito2@acme-b3.test 3:tito3@acme-b3.test',
  'com os três lugares ocupados, nenhum e-mail é apagado nem trocado');

-- 6. E-mail que já é de outro Contato do Workspace: não grava, não debita e libera a reserva, sem erro.
create temporary table t_de_outro as select * from pg_temp.revelar('sem_email', 'otto@acme-b3.test');
select is((select resultado from t_de_outro), 'false:0', 'e-mail de outro Contato debita 0 sem erro');
select is(pg_temp.estado_da_reserva((select reserva from t_de_outro)), 'released', 'e-mail de outro Contato libera a reserva');
select is(pg_temp.emails('sem_email'), '1:novo@acme-b3.test', 'e-mail de outro Contato não é gravado neste');

-- 7. Texto que não é e-mail e telefone: zero, sem erro.
select is((select resultado from pg_temp.revelar('sem_email', 'nao-e-um-email')), 'false:0',
  'texto que não é e-mail debita 0 sem erro');
select is((select resultado from pg_temp.revelar('outro', '+55 11 99999-0000', 'telefone')), 'false:0',
  'telefone achado não grava nem debita: a revelação de telefone está indisponível');
select is((select phone from public.contacts where id = pg_temp.id('outro')), null, 'o telefone não é gravado');

select is(pg_temp.disponivel(), (select valor from saldo_inicial) - 4, 'só os dois e-mails novos debitaram');

-- 8. Depois, uma correção manual do e-mail: a origem volta a manual e o provedor sai.
select count(*) from public.set_contact_channels(pg_temp.id('sem_email'), '[{"value": "sara@acme-b3.test"}]'::jsonb, null);
select is(pg_temp.procedencia('sem_email'), 'sara@acme-b3.test:manual:',
  'a correção manual troca a origem e não herda o provedor do revelado');

-- 9. A reserva tem de ser deste Workspace e desta revelação.
create temporary table t_reserva_de_telefone as
  select reservation_id from public.begin_reveal_contact(
    'b3200000-0000-0000-0000-000000000001', pg_temp.id('sem_email'), 'telefone');
select throws_ok(
  format($$ select * from public.finish_reveal_contact(%L, %L, 'email', 'x@acme-b3.test', 'apify') $$,
    (select reservation_id from t_reserva_de_telefone), pg_temp.id('sem_email')),
  '22023',
  null,
  'a reserva do telefone não finaliza uma revelação de e-mail'
);

-- 10. Outro Workspace não lê o e-mail revelado.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3100000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.list_contact_channels(array[
    (select valor from ids where chave = 'um_email'),
    (select valor from ids where chave = 'sem_email')])),
  0::bigint,
  'outro Workspace não lê os e-mails revelados pela lista de canais'
);
select is(
  (select count(*) from public.contacts where email in ('novo@acme-b3.test', 'ugo@acme-b3.test', 'sara@acme-b3.test')),
  0::bigint,
  'outro Workspace não lê o Contato com o e-mail revelado'
);
select throws_ok(
  format($$ select * from public.get_contact_channels(%L) $$, (select valor from ids where chave = 'um_email')),
  'P0002',
  null,
  'outro Workspace não abre os canais do Contato'
);

select * from finish();
rollback;
