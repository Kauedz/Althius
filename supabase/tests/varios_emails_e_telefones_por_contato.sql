begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(97);

-- Procura, em toda tabela de public e de private, uma linha que contenha algum dos trechos (sem diferenciar maiúsculas):
-- devolve as tabelas e as quantidades, ou '' quando nada vazou. Roda como dono do banco.
create function pg_temp.vazamentos(p_trechos text[]) returns text language plpgsql as $f$
declare
  v_tabela record;
  v_qtd bigint;
  v_achados text := '';
begin
  for v_tabela in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private') order by 1, 2
  loop
    execute format('select count(*) from %I.%I t where t::text ilike any (%L::text[])', v_tabela.nspname, v_tabela.relname, p_trechos)
      into v_qtd;
    if v_qtd > 0 then
      v_achados := v_achados || v_tabela.nspname || '.' || v_tabela.relname || ':' || v_qtd || ' ';
    end if;
  end loop;
  return btrim(v_achados);
end
$f$;

-- Um e-mail no formato do objeto Email da Unipile v2.
create function pg_temp.email(p_id text, p_thread text, p_from text, p_subject text, p_headers jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb, p_message_id text default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'message_id', p_message_id, 'thread_id', p_thread,
    'subject', p_subject, 'body', 'Corpo de ' || p_subject, 'snippet', left('Corpo de ' || p_subject, 20),
    'date', '2026-09-26T15:00:00Z',
    'from', jsonb_build_array(jsonb_build_object('email', p_from, 'display_name', split_part(p_from, '@', 1))),
    'to', jsonb_build_array(jsonb_build_object('email', 'althius.relacionamento@gmail.com')),
    'headers', p_headers, 'attachments', p_attachments))
$$;
grant execute on function pg_temp.email(text, text, text, text, jsonb, jsonb, text) to service_role, authenticated;

-- O id do Envio de um passo, lido como dono do banco para valer também sob service_role.
create function pg_temp.envio(p_step text) returns uuid language sql security definer as $f$
  select id from private.sequence_step_sends where step_id = p_step
$f$;
grant execute on function pg_temp.envio(text) to service_role, authenticated;

-- Os canais de um Contato numa linha só: "e-mail:posição:valor:rótulo" e "telefone:posição:valor:tipo:whatsapp".
create function pg_temp.canais(p_contact text) returns text language plpgsql as $f$
begin
  return (select coalesce(string_agg(
    channel || ':' || ordinal || ':' || value || ':' || label || case when channel = 'phone' then ':' || whatsapp else '' end,
    ' ' order by channel, ordinal), '')
  from public.get_contact_channels((select valor::uuid from ids where chave = p_contact)));
end
$f$;

-- Workspace Norte: Ana (Administradora), Beto (Membro, responsável por Alfa e Beta), Eva (Membro sem Conta) e Dora
-- (Participação removida). Caio administra o Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'caio@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('e2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'admin', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'member', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'member', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004', 'member', false),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000005', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Beto responde pela Alfa; Ana, pela Gama; Caio, pela Zeta no outro Workspace.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
insert into ids select 'alfa', id::text from public.save_target_account('e2000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
insert into ids select 'gama', id::text from public.save_target_account('e2000000-0000-0000-0000-000000000001', 'Gama', 'gama.com.br');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000005', true);
insert into ids select 'zeta', id::text from public.save_target_account('e2000000-0000-0000-0000-000000000002', 'Zeta', 'zeta.com.br');
insert into ids select 'zico', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'zeta'), 'Zico Zeta', null, 'joao.casa@gmail.com', '+55 11 97777-0001');

select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'Maria Souza', 'CFO', 'maria@alfa.com.br', '(11) 98888-7777');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'João Lima', 'Gerente', 'joao@alfa.com.br', null);

-- 1. O que existe continua valendo: o principal, com o tipo e a marca padrão (e-mail de trabalho, telefone celular com WhatsApp).
select is(pg_temp.canais('maria'),
  'email:1:maria@alfa.com.br:trabalho phone:1:+5511988887777:celular:true',
  'an existing Contato reads as principal e-mail (trabalho) and principal phone (celular, WhatsApp)');
select is(pg_temp.canais('joao'), 'email:1:joao@alfa.com.br:trabalho',
  'a Contato without a phone lists only the e-mail');

-- 2. Gravar as listas inteiras, com rótulo, tipo e a marca de WhatsApp por telefone.
select is((select count(*)::int from public.set_contact_channels(
    (select valor::uuid from ids where chave = 'maria'),
    '[{"value": "Maria@Alfa.com.br", "label": "trabalho"}, {"value": " maria.pessoal@gmail.com ", "label": "pessoal"}, {"value": "m@outro.com", "label": "outro"}]',
    '[{"value": "(11) 98888-7777", "kind": "celular", "whatsapp": true}, {"value": "11 3333-4444", "kind": "fixo", "whatsapp": false}, {"value": "+351 912 345 678", "kind": "celular"}]')),
  6, 'the responsible seller replaces both lists at once and gets the six channels back');
select is(pg_temp.canais('maria'),
  'email:1:maria@alfa.com.br:trabalho email:2:maria.pessoal@gmail.com:pessoal email:3:m@outro.com:outro '
  || 'phone:1:+5511988887777:celular:true phone:2:+551133334444:fixo:false phone:3:+351912345678:celular:true',
  'values are normalized, the label and the type come from the fixed lists and the WhatsApp flag is per phone');
select is((select email || ' ' || email_label || ' ' || phone || ' ' || phone_kind || ' ' || phone_whatsapp::text
    from public.contacts where id = (select valor::uuid from ids where chave = 'maria')),
  'maria@alfa.com.br trabalho +5511988887777 celular true',
  'the principal stays in contacts.email and contacts.phone, with its label, type and flag');
select is((select email || ' ' || phone from public.target_contacts where id = (select valor::uuid from ids where chave = 'maria')),
  'maria@alfa.com.br +5511988887777', 'the Contatos view still shows the principal');
select is((select count(*)::int from public.list_contact_channels(array[(select valor::uuid from ids where chave = 'maria'),
    (select valor::uuid from ids where chave = 'joao')])), 7, 'the bulk read lists the channels of several Contatos');

-- 3. Limite de 3 e listas inválidas: nada muda.
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'),
    '[{"value": "a@x.com"}, {"value": "b@x.com"}, {"value": "c@x.com"}, {"value": "d@x.com"}]')$$,
  '22023', 'a contact can have at most 3 emails', 'a fourth e-mail is refused');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null,
    '[{"value": "+5511900000001"}, {"value": "+5511900000002"}, {"value": "+5511900000003"}, {"value": "+5511900000004"}]')$$,
  '22023', 'a contact can have at most 3 phones', 'a fourth phone is refused');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "a@x.com", "label": "casa"}]')$$,
  '22023', 'invalid email label', 'an e-mail label outside the fixed list is refused');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null, '[{"value": "+5511900000001", "kind": "satelite"}]')$$,
  '22023', 'invalid phone kind', 'a phone type outside the fixed list is refused');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null, '[{"value": "+5511900000001", "whatsapp": "sim"}]')$$,
  '22023', 'the whatsapp flag must be true or false', 'the WhatsApp flag must be a boolean');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "isto não é e-mail"}]')$$,
  '22023', 'invalid email address format', 'an invalid e-mail is refused');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "a@x.com"}, {"value": "A@X.com"}]')$$,
  '23505', 'the same email appears twice in the list', 'the same e-mail twice in one list is refused, ignoring case');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null, '[{"value": "+5511900000001"}, {"value": "(11) 90000-0001"}]')$$,
  '23505', 'the same phone appears twice in the list', 'the same phone twice in one list is refused, after normalization');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '{"value": "a@x.com"}')$$,
  '22023', 'emails must be a json array', 'a list that is not an array is refused');
select is(pg_temp.canais('joao'), 'email:1:joao@alfa.com.br:trabalho', 'after the refusals the Contato is unchanged');

-- 4. Um valor pertence a um só Contato do Workspace, entre principal e adicionais, em qualquer ordem de escrita.
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "joao@alfa.com.br"}, {"value": "maria@alfa.com.br"}]')$$,
  '23505', 'email already belongs to another contact of this workspace', 'an additional e-mail cannot be the principal of another Contato');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "joao@alfa.com.br"}, {"value": "maria.pessoal@gmail.com"}]')$$,
  '23505', 'email already belongs to another contact of this workspace', 'an additional e-mail cannot be the additional of another Contato');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null, '[{"value": "+551133334444"}]')$$,
  '23505', 'phone already belongs to another contact of this workspace', 'a principal phone cannot be the additional phone of another Contato');
select throws_ok(
  $$select * from public.create_contact((select valor::uuid from ids where chave = 'alfa'), 'Outra Maria', null, 'maria.pessoal@gmail.com')$$,
  '23505', 'email already belongs to a contact of this workspace', 'creating a Contato with an additional e-mail of another one is refused');
select throws_ok(
  $$select * from public.create_contact((select valor::uuid from ids where chave = 'alfa'), 'Outra Maria', null, null, '11 3333-4444')$$,
  '23505', 'phone already belongs to a contact of this workspace', 'the same goes for an additional phone');
select throws_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'joao'), p_email => 'm@outro.com')$$,
  '23505', 'email already belongs to a contact of this workspace', 'update_contact cannot take an additional e-mail of another Contato');
select throws_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'joao'), p_phone => '+351 912 345 678')$$,
  '23505', 'phone already belongs to a contact of this workspace', 'nor an additional phone');
select throws_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => 'maria.pessoal@gmail.com')$$,
  '23505', 'email already belongs to a contact of this workspace', 'nor can a Contato make its own additional e-mail the principal by update_contact');

-- Na outra direção: o adicional novo esbarra no principal de outro Contato, mesmo que o principal seja de escrita posterior.
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "joao@alfa.com.br"}, {"value": "joao.casa@gmail.com", "label": "pessoal"}]')$$,
  'a Contato can have an additional e-mail nobody else in the Workspace has');
select throws_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => 'joao.casa@gmail.com')$$,
  '23505', 'email already belongs to a contact of this workspace', 'an additional e-mail of one Contato cannot become the principal of another');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}, {"value": "JOAO@alfa.com.br"}]')$$,
  '23505', 'email already belongs to another contact of this workspace', 'the comparison ignores case');
select is(pg_temp.canais('maria') like 'email:1:maria@alfa.com.br:trabalho email:2:maria.pessoal@gmail.com:pessoal email:3:m@outro.com:outro %', true,
  'a refused write leaves the lists as they were (the replacement is atomic)');

-- O Workspace Sul usa os mesmos valores sem conflito: a unicidade é por Workspace.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000005', true);
select is((select email from public.contacts where id = (select valor::uuid from ids where chave = 'zico')), 'joao.casa@gmail.com',
  'another Workspace holds the same e-mail as its principal, and João still got it as an additional one (the rule is per Workspace)');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);

-- 5. Trocar o principal: os campos de contacts ficam coerentes e nada se perde.
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "m@outro.com", "label": "outro"}, {"value": "maria.pessoal@gmail.com", "label": "pessoal"}, {"value": "maria@alfa.com.br", "label": "trabalho"}]',
    '[{"value": "+551133334444", "kind": "fixo", "whatsapp": true}, {"value": "+5511988887777", "kind": "celular", "whatsapp": false}]')$$,
  'the principal e-mail and phone can be swapped for an additional one');
select is((select email || ' ' || email_label || ' ' || phone || ' ' || phone_kind || ' ' || phone_whatsapp::text
    from public.contacts where id = (select valor::uuid from ids where chave = 'maria')),
  'm@outro.com outro +551133334444 fixo true', 'contacts now carries the new principal with its own label, type and flag');
select is(pg_temp.canais('maria'),
  'email:1:m@outro.com:outro email:2:maria.pessoal@gmail.com:pessoal email:3:maria@alfa.com.br:trabalho '
  || 'phone:1:+551133334444:fixo:true phone:2:+5511988887777:celular:false',
  'the old principal became an additional one, in the order given');
select throws_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => '')$$,
  '23514', 'the primary email cannot be removed while additional emails exist',
  'the principal e-mail cannot be cleared by update_contact while additional ones exist');
select lives_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => 'novo@alfa.com.br', p_phone => '+5511900001111')$$,
  'update_contact still changes the principal e-mail and phone to a free value');
select is((select count(*)::int from public.get_contact_channels((select valor::uuid from ids where chave = 'maria')) where ordinal > 1), 3,
  'and the additional ones stay where they were');
select is((select email_label || ' ' || phone_whatsapp::text from public.contacts where id = (select valor::uuid from ids where chave = 'maria')),
  'outro true', 'the principal label and flag are kept when only the value changes');
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), '[]', '[]')$$,
  'an empty list clears the channel, additional ones included');
select is(pg_temp.canais('maria'), '', 'the Contato has no channel left');
select is((select email is null and phone is null and email_label is null and phone_kind is null and phone_whatsapp is null
    from public.contacts where id = (select valor::uuid from ids where chave = 'maria')), true, 'and contacts carries no principal');
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}, {"value": "maria.pessoal@gmail.com", "label": "pessoal"}, {"value": "m@outro.com", "label": "outro"}]',
    '[{"value": "(11) 98888-7777"}, {"value": "11 3333-4444", "kind": "fixo", "whatsapp": false}]')$$,
  'the values freed by the clearing are free for the same Contato again');
select is(pg_temp.canais('maria'),
  'email:1:maria@alfa.com.br:trabalho email:2:maria.pessoal@gmail.com:pessoal email:3:m@outro.com:outro '
  || 'phone:1:+5511988887777:celular:true phone:2:+551133334444:fixo:false',
  'the defaults are work, mobile and WhatsApp on');

-- 6. Permissão como a do update_contact e isolamento entre Workspaces.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), '[{"value": "eva@alfa.com.br"}]')$$,
  '42501', 'only the responsible seller or an admin can edit this contact', 'a Member who does not answer for the Contato cannot write the lists');
select is(pg_temp.canais('maria') like 'email:1:maria@alfa.com.br:trabalho %', true, 'but any active member reads them');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.get_contact_channels((select valor::uuid from ids where chave = 'maria'))$$,
  'P0002', 'contact not found', 'a removed participant reads nothing');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.get_contact_channels((select valor::uuid from ids where chave = 'maria'))$$,
  'P0002', 'contact not found', 'another Workspace cannot read the channels');
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), '[{"value": "caio@sul.com.br"}]')$$,
  'P0002', 'contact not found', 'another Workspace cannot write them');
select is((select count(*)::int from public.list_contact_channels(array[(select valor::uuid from ids where chave = 'maria')])), 0,
  'the bulk read returns nothing from another Workspace');

-- Vínculo com a Conta de outro responsável: o Membro deixa de poder editar, o Administrador pode.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.link_contact((select valor::uuid from ids where chave = 'joao'), (select valor::uuid from ids where chave = 'gama'))$$,
  'the administrator links João to Gama, which Ana answers for');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), '[{"value": "joao@alfa.com.br"}]')$$,
  '42501', 'only the responsible seller or an admin can edit this contact',
  'the seller cannot write the lists of a Contato that also acts on an account of someone else');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'),
    '[{"value": "joao@alfa.com.br"}, {"value": "joao.casa@gmail.com", "label": "pessoal"}]')$$,
  'the administrator writes the lists of any Contato of the Workspace');

-- Sem acesso direto: nem as tabelas, nem as funções para anon.
select throws_ok($$select * from private.contact_emails$$, '42501', 'permission denied for schema private',
  'the additional e-mails are not readable through the API');
select throws_ok($$select * from private.contact_phones$$, '42501', 'permission denied for schema private',
  'nor the additional phones');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('contact_emails', 'contact_phones') and c.relrowsecurity), 2,
  'both new tables have row level security enabled');
reset role;
set local role anon;
select throws_ok($$select * from public.get_contact_channels('00000000-0000-0000-0000-000000000000')$$,
  '42501', 'permission denied for function get_contact_channels', 'anon cannot read the channels');
select throws_ok($$select * from public.list_contact_channels('{}')$$,
  '42501', 'permission denied for function list_contact_channels', 'anon cannot bulk read them');
select throws_ok($$select * from public.set_contact_channels('00000000-0000-0000-0000-000000000000', '[]')$$,
  '42501', 'permission denied for function set_contact_channels', 'anon cannot write them');
reset role;

-- 7. O passo escolhe a posição do e-mail; a confirmação fixa o endereço; o envio só sai para um endereço que o Contato ainda tem.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'e2000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-27', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the seller email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-google-27', 'SYNC_SUCCESS'), true, 'the seller email sender account is ready');
reset role;

create function pg_temp.passo(p_id text, p_contato text, p_destino jsonb default null, p_canal text default 'email')
returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'canal', p_canal,
    'contatoId', (select valor from ids where chave = p_contato), 'delayDiasUteis', 0, 'titulo', p_id,
    'assunto', 'Assunto ' || p_id, 'corpo', 'Olá.')
    || case when p_destino is null then '{}'::jsonb else jsonb_build_object('destino', p_destino) end;
$f$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}, {"value": "maria.pessoal@gmail.com", "label": "pessoal"}, {"value": "m@outro.com", "label": "outro"}]', null)$$,
  'the seller restores the three e-mails of Maria');
insert into ids select 'sequencia', id::text from public.create_sequence(
  'e2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'),
  jsonb_build_object('participantesIds', '[]'::jsonb, 'steps', jsonb_build_array(
    pg_temp.passo('p-1', 'maria'),
    pg_temp.passo('p-2', 'maria', '2'),
    pg_temp.passo('p-3', 'maria', '3'),
    pg_temp.passo('p-4', 'joao', '3'),
    pg_temp.passo('p-5', 'maria', '7'),
    pg_temp.passo('p-6', 'maria', '"dois"'),
    pg_temp.passo('p-7', 'maria', 'null'))));

select is((select destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-1')),
  'maria@alfa.com.br', 'a step without `destino` fixes the principal e-mail, as before');
select is((select destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-7')),
  'maria@alfa.com.br', 'a null `destino` also means the principal');
select is((select destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-2')),
  'maria.pessoal@gmail.com', 'a step with destino 2 fixes the second e-mail');
select is((select destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-3')),
  'm@outro.com', 'a step with destino 3 fixes the third e-mail');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-4')$$,
  '22023', 'contact has no email destination', 'a position the Contato does not have is refused');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-5')$$,
  '22023', 'invalid destination position in the step', 'a position outside 1 to 3 is refused');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-6')$$,
  '22023', 'invalid destination position in the step', 'a position that is not a number is refused');

-- Liberar: o endereço fixado sai.
reset role;
set local role service_role;
select is((select outcome || ' ' || destination from public.release_sequence_step_send(
    pg_temp.envio('p-2'), 'e1000000-0000-0000-0000-000000000002')),
  'released maria.pessoal@gmail.com', 'the release goes to the address fixed at the confirmation');
select is(public.record_sequence_step_send_result(
  pg_temp.envio('p-2'), 'sent', 'email-27', '<m27@x>', null),
  'sent', 'the provider accepted it');

-- A resposta vinda do e-mail adicional é atribuída ao Contato.
create temporary table eco as select * from public.ingest_unipile_email_event(
  'evt-27-1', 'email.new', 'unipile-google-27',
  pg_temp.email('email-27', 'thread-27', 'althius.relacionamento@gmail.com', 'Assunto p-2', p_message_id => '<m27@x>'),
  array['althius.relacionamento@gmail.com']);
grant all on eco to authenticated, service_role;
create temporary table resposta as select * from public.ingest_unipile_email_event(
  'evt-27-2', 'email.new', 'unipile-google-27',
  pg_temp.email('email-27-r', 'thread-27', 'maria.pessoal@gmail.com', 'Re: Assunto p-2'),
  array['althius.relacionamento@gmail.com']);
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'the e-mail from the second address is a reply');
select is((select contact_id from public.account_interactions where id = (select interaction_id from resposta)),
  (select valor::uuid from ids where chave = 'maria'), 'and it is attributed to the Contato that owns that address');

-- A resposta pausou a Sequência; o titular a retoma.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'ativa')$$,
  'the seller resumes the sequence the reply paused');
reset role;

-- O destino fixado deixou de ser qualquer e-mail do Contato: bloqueia; enquanto for um deles, sai, mesmo mudando de posição.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "m@outro.com", "label": "outro"}, {"value": "maria@alfa.com.br"}]', null)$$,
  'the administrator swaps the principal and drops the second e-mail');
reset role;
set local role service_role;
select is((select outcome || ' ' || destination from public.release_sequence_step_send(
    pg_temp.envio('p-1'), 'e1000000-0000-0000-0000-000000000002')),
  'released maria@alfa.com.br', 'a destination that moved position but is still an e-mail of the Contato is released');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}]', null)$$,
  'the administrator removes the e-mail the step p-3 had fixed');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send(
    pg_temp.envio('p-3'), 'e1000000-0000-0000-0000-000000000002')),
  'destination_changed', 'a fixed destination the Contato no longer has blocks the send');
reset role;
select is((select status || ' ' || destination || ' ' || last_error from private.sequence_step_sends where step_id = 'p-3'),
  'awaiting_reconfirmation m@outro.com destination_changed', 'the step waits for the seller and keeps the old address on record');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p-3')$$,
  '22023', 'contact has no email destination', 'reconfirming a position that no longer exists is refused');

-- Um Contato com um só e-mail continua como antes: trocar o e-mail bloqueia o envio fixado (ADR-0014).
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => 'maria.nova@alfa.com.br')$$,
  'the administrator changes the only e-mail');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send(
    pg_temp.envio('p-7'), 'e1000000-0000-0000-0000-000000000002')),
  'destination_changed', 'a Contato with a single e-mail behaves as before: the changed destination blocks');
reset role;

-- 8. Ativar fixa o endereço de cada passo; posição sem e-mail bloqueia a ativação.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}, {"value": "maria.pessoal@gmail.com", "label": "pessoal"}]', null)$$,
  'Maria has two e-mails again');
insert into ids select 'beta', id::text from public.save_target_account('e2000000-0000-0000-0000-000000000001', 'Beta', 'beta.com.br');
select public.link_contact((select valor::uuid from ids where chave = 'maria'), (select valor::uuid from ids where chave = 'beta'));
insert into ids select 'sequencia-2', id::text from public.create_sequence(
  'e2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'beta'),
  jsonb_build_object('participantesIds', '[]'::jsonb, 'steps', jsonb_build_array(
    pg_temp.passo('q-1', 'maria', '2'),
    pg_temp.passo('q-2', 'maria'),
    pg_temp.passo('q-3', 'maria', '3'))));
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'destination_not_found q-3', 'the activation is blocked by a step whose position the Contato does not have');
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
    jsonb_build_object('participantesIds', '[]'::jsonb, 'steps', jsonb_build_array(
      pg_temp.passo('q-1', 'maria', '2'), pg_temp.passo('q-2', 'maria'))), null, null)$$,
  'the seller drops the step');
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated', 'the sequence activates');
select is((select string_agg(step_id || ':' || destination, ' ' order by step_id)
    from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia-2'))),
  'q-1:maria.pessoal@gmail.com q-2:maria@alfa.com.br', 'each step fixed the e-mail of its position');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'),
    '[{"value": "maria@alfa.com.br"}, {"value": "maria.pessoal@gmail.com", "label": "pessoal"}, {"value": "terceiro@alfa.com.br"}]', null)$$,
  'a third e-mail does not disturb what was fixed');
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select is((select string_agg(step_id || ':' || destination, ' ' order by step_id)
    from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia-2'))),
  'q-1:maria.pessoal@gmail.com q-2:maria@alfa.com.br', 'the fixed destinations stay');

-- 9. Apagar o Contato (CRM-18): os adicionais saem junto e as varreduras acham zero resíduo.
reset role;
insert into private.target_contacts_canais02 (id, workspace_id, target_account_id, name, role, email, whatsapp, linkedin_identity)
values ('legado-maria-27', 'e2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'), 'Legado',
  null, 'terceiro@alfa.com.br', null, null),
  ('legado-maria-28', 'e2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'), 'Legado Dois',
  null, null, '+551133334444', null);
insert into private.import_batches (id, workspace_id, created_by, file_name, file_size, storage_path, status, row_count) values
  ('d2700000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
    'lista.csv', 100, 'e2000000-0000-0000-0000-000000000001/d2700000-0000-0000-0000-00000000000a/arquivo.csv', 'completed', 3);
insert into private.import_rows (batch_id, workspace_id, line_number, cells, status, parsed, outcome) values
  ('d2700000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', 1,
    '["Maria", "maria.pessoal@gmail.com"]', 'skipped', '{"contact_name": "Maria", "contact_email": "maria.pessoal@gmail.com"}', '{}'),
  ('d2700000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', 2,
    '["Maria", "", "+5511977770009"]', 'skipped', '{"contact_name": "Maria", "contact_phone": "+551133334444"}', '{}'),
  ('d2700000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', 3,
    '["Rui", "rui@outra.test"]', 'skipped', '{"contact_name": "Rui", "contact_email": "rui@outra.test"}', '{}');
insert into private.agents (workspace_id, specialty, kind)
select 'e2000000-0000-0000-0000-000000000001', 'scopus', 'padrao'
where not exists (select 1 from private.agents where workspace_id = 'e2000000-0000-0000-0000-000000000001');
insert into private.agent_memory_facts (workspace_id, agent_id, content, origin)
select 'e2000000-0000-0000-0000-000000000001', (select id from private.agents where workspace_id = 'e2000000-0000-0000-0000-000000000001' limit 1), f.content, 'teste'
from (values ('Escreve do terceiro@alfa.com.br fora do expediente'), ('Atende no +551133334444'), ('O ICP prefere varejo')) as f(content);

-- O telefone principal da Maria e o adicional ficam de uma vez: a Maria tem dois telefones para o apagamento.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), null,
    '[{"value": "(11) 98888-7777"}, {"value": "11 3333-4444", "kind": "fixo", "whatsapp": false}]')$$,
  'Maria has a principal and an additional phone');
reset role;
select isnt(pg_temp.vazamentos(array['%terceiro@alfa.com.br%', '%maria.pessoal@gmail.com%', '%551133334444%', '%maria@alfa.com.br%']), '',
  'before the deletion the sweep finds the additional values, so the check below means something');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
insert into ids select 'res-maria', (public.erase_contact((select valor::uuid from ids where chave = 'maria'), 'Maria Souza'))::text;
reset role;
select is((select valor::jsonb ->> 'result' from ids where chave = 'res-maria'), 'erased', 'the administrator permanently deletes Maria');
select is((select count(*)::int from private.contact_emails where contact_id = (select valor::uuid from ids where chave = 'maria'))
    + (select count(*)::int from private.contact_phones where contact_id = (select valor::uuid from ids where chave = 'maria')), 0,
  'the additional e-mails and phones went with the Contato');
select is(pg_temp.vazamentos(array['%terceiro@alfa.com.br%', '%maria.pessoal@gmail.com%', '%551133334444%', '%maria@alfa.com.br%',
    '%98888-7777%', '%5511988887777%', '%m@outro.com%', '%maria%']), '',
  'no table keeps anything of the Contato, additional values included');
select is((select valor::jsonb ->> 'import_rows_erased' from ids where chave = 'res-maria') || ','
    || (select valor::jsonb ->> 'extra_legacy_rows_erased' from ids where chave = 'res-maria') || ','
    || (select valor::jsonb ->> 'agent_facts_erased' from ids where chave = 'res-maria'),
  '2,2,2', 'the result counts the CSV rows, the old copies and the Agent memory facts found by the additional values');
select is((select count(*)::int from private.import_rows where batch_id = 'd2700000-0000-0000-0000-00000000000a' and cells <> '[]'::jsonb), 1,
  'the CSV row of somebody else stays');
select is((select count(*)::int from private.agent_memory_facts), 1, 'and so does the Agent memory fact that cites nobody');
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'joao')), 1,
  'the other Contato is untouched');
select is((select count(*)::int from private.contact_emails where email = 'joao.casa@gmail.com'), 1,
  'and so are its additional values');

select * from finish();
rollback;
