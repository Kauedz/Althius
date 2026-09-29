-- Vários e-mails e telefones por Contato, e a escolha de qual usar em cada passo da Sequência (CRM-27).
-- O Contato passa a ter até 3 e-mails e 3 telefones. O principal continua em contacts.email e contacts.phone, por isso
-- create_contact, update_contact, link_contact, end_contact_link, a importação por CSV, a foto, o arquivar e o apagar
-- seguem como estão. Os adicionais (posições 2 e 3) ficam em tabelas novas do schema private, sem acesso direto dos
-- papéis do app, e só se leem e se gravam pelas funções abaixo.
--
-- Rótulo por lista fixa: e-mail Trabalho, Pessoal ou Outro; telefone Celular ou Fixo. "Usa WhatsApp" é uma marca por
-- telefone, independente de ser celular ou fixo. Um valor pertence a um só Contato do Workspace, entre principal e
-- adicionais: o índice único de contacts não cruza tabelas, então gatilhos travam o valor e conferem os dois lados.
--
-- O passo da Sequência ganha `destino` (posição 1 a 3 do e-mail ou do telefone; ausente vale 1). A confirmação e a
-- ativação fixam o endereço dessa posição (ADR-0014), e o envio só sai se esse endereço ainda for um dos e-mails do
-- Contato. Só aditiva: colunas anuláveis com padrão, tabelas novas, nenhuma linha existente é apagada ou reescrita.

-- 1. O principal ganha tipo e marca. O padrão preserva o que existe: o e-mail atual é de trabalho e o telefone atual é
-- um celular que usa WhatsApp (era "o WhatsApp do Contato").
alter table public.contacts
  add column email_label text default 'trabalho' check (email_label in ('trabalho', 'pessoal', 'outro')),
  add column phone_kind text default 'celular' check (phone_kind in ('celular', 'fixo')),
  add column phone_whatsapp boolean default true;

-- 2. Os adicionais. A posição é o número que o passo escolhe: 1 é o principal (em contacts), 2 e 3 estão aqui.
create table private.contact_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null,
  ordinal smallint not null check (ordinal in (2, 3)),
  email text not null check (email <> '' and email = lower(btrim(email))),
  label text not null default 'trabalho' check (label in ('trabalho', 'pessoal', 'outro')),
  created_at timestamptz not null default now(),
  unique (contact_id, ordinal),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create unique index contact_emails_per_workspace on private.contact_emails (workspace_id, email);

create table private.contact_phones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null,
  ordinal smallint not null check (ordinal in (2, 3)),
  phone text not null check (phone <> ''),
  kind text not null default 'celular' check (kind in ('celular', 'fixo')),
  whatsapp boolean not null default true,
  created_at timestamptz not null default now(),
  unique (contact_id, ordinal),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create unique index contact_phones_per_workspace on private.contact_phones (workspace_id, phone);

alter table private.contact_emails enable row level security;
alter table private.contact_phones enable row level security;
revoke all on private.contact_emails from public, anon, authenticated, service_role;
revoke all on private.contact_phones from public, anon, authenticated, service_role;

-- 3. Unicidade entre principal e adicionais, e entre Contatos, também sob concorrência. O lock é por valor (e-mail ou
-- telefone, no Workspace) e dura a transação: duas sessões que gravam o mesmo valor se serializam, e a segunda enxerga o
-- que a primeira gravou. Quem trava vários valores (a troca da lista inteira) os trava em ordem, para não travar em ciclo.
create function private.lock_contact_channel(p_workspace_id uuid, p_channel text, p_value text)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('contact-channel:' || p_workspace_id::text || ':' || p_channel || ':' || p_value, 0));
$$;

revoke all on function private.lock_contact_channel(uuid, text, text) from public, anon, authenticated, service_role;

-- No principal (contacts): o valor novo não pode já ser adicional de nenhum Contato do Workspace, nem do próprio; e o
-- principal não pode ser apagado enquanto houver adicionais (a lista nunca fica sem a posição 1).
create function private.guard_contact_channels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    perform private.lock_contact_channel(new.workspace_id, 'email', lower(new.email));
    if exists (
      select 1 from private.contact_emails e where e.workspace_id = new.workspace_id and e.email = lower(new.email)) then
      raise exception 'email already belongs to a contact of this workspace' using errcode = '23505';
    end if;
  end if;
  if new.phone is not null and (tg_op = 'INSERT' or new.phone is distinct from old.phone) then
    perform private.lock_contact_channel(new.workspace_id, 'phone', new.phone);
    if exists (
      select 1 from private.contact_phones p where p.workspace_id = new.workspace_id and p.phone = new.phone) then
      raise exception 'phone already belongs to a contact of this workspace' using errcode = '23505';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.email is null and old.email is not null
       and exists (select 1 from private.contact_emails e where e.contact_id = new.id) then
      raise exception 'the primary email cannot be removed while additional emails exist' using errcode = '23514';
    end if;
    if new.phone is null and old.phone is not null
       and exists (select 1 from private.contact_phones p where p.contact_id = new.id) then
      raise exception 'the primary phone cannot be removed while additional phones exist' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_contact_channels() from public, anon, authenticated, service_role;

create trigger contacts_guard_channels
  before insert or update of email, phone on public.contacts
  for each row execute function private.guard_contact_channels();

-- Nos adicionais: o valor não pode ser o principal de nenhum Contato do Workspace (inclusive o do próprio Contato).
-- Adicional contra adicional é o índice único.
create function private.guard_contact_extra_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'contact_emails' then
    perform private.lock_contact_channel(new.workspace_id, 'email', new.email);
    if exists (select 1 from public.contacts c where c.workspace_id = new.workspace_id and c.email = new.email) then
      raise exception 'email already belongs to a contact of this workspace' using errcode = '23505';
    end if;
  else
    perform private.lock_contact_channel(new.workspace_id, 'phone', new.phone);
    if exists (select 1 from public.contacts c where c.workspace_id = new.workspace_id and c.phone = new.phone) then
      raise exception 'phone already belongs to a contact of this workspace' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_contact_extra_channel() from public, anon, authenticated, service_role;

create trigger contact_emails_guard
  before insert or update of email, workspace_id on private.contact_emails
  for each row execute function private.guard_contact_extra_channel();
create trigger contact_phones_guard
  before insert or update of phone, workspace_id on private.contact_phones
  for each row execute function private.guard_contact_extra_channel();

-- 4. Leitura. Uma linha por canal, principal (posição 1) primeiro e depois os adicionais na ordem. `label` é o rótulo
-- do e-mail (trabalho, pessoal, outro) ou o tipo do telefone (celular, fixo); `whatsapp` só vale para telefone.
create function private.contact_channels(p_contact_ids uuid[])
returns table (contact_id uuid, channel text, ordinal integer, value text, label text, whatsapp boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.contact_id, t.channel, t.ordinal, t.value, t.label, t.whatsapp
  from (
    select c.id as contact_id, 'email'::text as channel, 1 as ordinal, c.email as value,
      coalesce(c.email_label, 'trabalho') as label, null::boolean as whatsapp
    from public.contacts c where c.id = any (p_contact_ids) and c.email is not null
    union all
    select e.contact_id, 'email', e.ordinal::integer, e.email, e.label, null
    from private.contact_emails e where e.contact_id = any (p_contact_ids)
    union all
    select c.id, 'phone', 1, c.phone, coalesce(c.phone_kind, 'celular'), coalesce(c.phone_whatsapp, true)
    from public.contacts c where c.id = any (p_contact_ids) and c.phone is not null
    union all
    select p.contact_id, 'phone', p.ordinal::integer, p.phone, p.kind, p.whatsapp
    from private.contact_phones p where p.contact_id = any (p_contact_ids)
  ) t
  order by t.contact_id, t.channel, t.ordinal;
$$;

revoke all on function private.contact_channels(uuid[]) from public, anon, authenticated, service_role;

-- O e-mail da posição (1 a 3) do Contato, ou nulo se não existe. Posição inválida (nula ou fora de 1 a 3) também dá nulo.
create function private.contact_email_at(p_contact_id uuid, p_ordinal integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_ordinal = 1 then (select c.email from public.contacts c where c.id = p_contact_id)
    when p_ordinal in (2, 3) then (
      select e.email from private.contact_emails e where e.contact_id = p_contact_id and e.ordinal = p_ordinal)
  end;
$$;

revoke all on function private.contact_email_at(uuid, integer) from public, anon, authenticated, service_role;

-- O endereço ainda é um dos e-mails do Contato (o principal ou um adicional)?
create function private.contact_has_email(p_contact_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_email is not null and (
    exists (select 1 from public.contacts c where c.id = p_contact_id and c.email = p_email)
    or exists (select 1 from private.contact_emails e where e.contact_id = p_contact_id and e.email = p_email));
$$;

revoke all on function private.contact_has_email(uuid, text) from public, anon, authenticated, service_role;

-- A posição que o passo escolhe: `destino` de 1 a 3 (ausente ou nulo vale 1); qualquer outro valor é inválido (nulo).
create function private.step_destination_ordinal(p_step jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_step -> 'destino' is null or jsonb_typeof(p_step -> 'destino') = 'null' then 1
    when jsonb_typeof(p_step -> 'destino') = 'number' and (p_step ->> 'destino')::numeric in (1, 2, 3)
      then (p_step ->> 'destino')::numeric::integer
  end;
$$;

revoke all on function private.step_destination_ordinal(jsonb) from public, anon, authenticated, service_role;

-- Os canais dos Contatos visíveis a quem chama (Participação ativa no Workspace do Contato), como o select de contacts.
create function public.list_contact_channels(p_contact_ids uuid[])
returns table (contact_id uuid, channel text, ordinal integer, value text, label text, whatsapp boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  return query
    select r.contact_id, r.channel, r.ordinal, r.value, r.label, r.whatsapp
    from private.contact_channels(array(
      select c.id from public.contacts c
      join public.workspace_memberships m
        on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
      where c.id = any (p_contact_ids))) r;
end;
$$;

revoke all on function public.list_contact_channels(uuid[]) from public, anon;
grant execute on function public.list_contact_channels(uuid[]) to authenticated;

create function public.get_contact_channels(p_contact_id uuid)
returns table (contact_id uuid, channel text, ordinal integer, value text, label text, whatsapp boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.contacts c
    join public.workspace_memberships m
      on m.workspace_id = c.workspace_id and m.user_id = auth.uid() and m.active
    where c.id = p_contact_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  return query select * from public.list_contact_channels(array[p_contact_id]);
end;
$$;

revoke all on function public.get_contact_channels(uuid) from public, anon;
grant execute on function public.get_contact_channels(uuid) to authenticated;

-- 5. Gravação: troca atômica da lista inteira. Cada lista é um array JSON em que o primeiro item é o principal:
--   p_emails: [{"value": "...", "label": "trabalho|pessoal|outro"}, ...]
--   p_phones: [{"value": "...", "kind": "celular|fixo", "whatsapp": true|false}, ...]
-- Nulo mantém a lista como está; [] a esvazia. Rótulo, tipo e marca ausentes valem trabalho, celular e true. Mais de 3
-- itens, valor inválido, repetido na lista ou de outro Contato do Workspace são recusados, e nada muda. A mesma regra
-- de permissão do update_contact: o Administrador, ou o responsável por todas as Contas em que o Contato atua.
create function public.set_contact_channels(
  p_contact_id uuid,
  p_emails jsonb default null,
  p_phones jsonb default null
) returns table (contact_id uuid, channel text, ordinal integer, value text, label text, whatsapp boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_contact public.contacts;
  v_item jsonb;
  v_n integer;
  v_value text;
  v_values text[];
  v_email_values text[] := '{}';
  v_email_labels text[] := '{}';
  v_phone_values text[] := '{}';
  v_phone_kinds text[] := '{}';
  v_phone_whatsapp boolean[] := '{}';
  v_label text;
  v_kind text;
  v_whatsapp boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select c.* into v_contact from public.contacts c
  join public.workspace_memberships m
    on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id
  for update of c;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if not private.can_update_contact(v_contact.workspace_id, v_contact.id, v_user_id) then
    raise exception 'only the responsible seller or an admin can edit this contact' using errcode = '42501';
  end if;
  -- A regra do apagamento (CRM-18): quem grava dado do Contato segura a trava compartilhada, e apagar o Contato espera
  -- por ela. Sem isto, um valor adicional gravado durante o apagamento escaparia da varredura.
  perform private.take_subject_lock('contact', v_contact.id, 'shared');

  -- Valida e normaliza as duas listas antes de gravar qualquer coisa.
  if p_emails is not null then
    if jsonb_typeof(p_emails) <> 'array' then
      raise exception 'emails must be a json array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_emails) > 3 then
      raise exception 'a contact can have at most 3 emails' using errcode = '22023';
    end if;
    for v_item in select t from jsonb_array_elements(p_emails) t loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'each email must be a json object' using errcode = '22023';
      end if;
      v_value := private.validate_email(v_item ->> 'value');
      if v_value is null then
        raise exception 'email value is required' using errcode = '22023';
      end if;
      v_label := coalesce(nullif(btrim(v_item ->> 'label'), ''), 'trabalho');
      if v_label not in ('trabalho', 'pessoal', 'outro') then
        raise exception 'invalid email label' using errcode = '22023';
      end if;
      if v_value = any (v_email_values) then
        raise exception 'the same email appears twice in the list' using errcode = '23505';
      end if;
      v_email_values := v_email_values || v_value;
      v_email_labels := v_email_labels || v_label;
    end loop;
  end if;

  if p_phones is not null then
    if jsonb_typeof(p_phones) <> 'array' then
      raise exception 'phones must be a json array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_phones) > 3 then
      raise exception 'a contact can have at most 3 phones' using errcode = '22023';
    end if;
    for v_item in select t from jsonb_array_elements(p_phones) t loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'each phone must be a json object' using errcode = '22023';
      end if;
      v_value := private.normalize_whatsapp(v_item ->> 'value');
      if v_value is null then
        raise exception 'phone value is required' using errcode = '22023';
      end if;
      v_kind := coalesce(nullif(btrim(v_item ->> 'kind'), ''), 'celular');
      if v_kind not in ('celular', 'fixo') then
        raise exception 'invalid phone kind' using errcode = '22023';
      end if;
      if v_item -> 'whatsapp' is null or jsonb_typeof(v_item -> 'whatsapp') = 'null' then
        v_whatsapp := true;
      elsif jsonb_typeof(v_item -> 'whatsapp') = 'boolean' then
        v_whatsapp := (v_item ->> 'whatsapp')::boolean;
      else
        raise exception 'the whatsapp flag must be true or false' using errcode = '22023';
      end if;
      if v_value = any (v_phone_values) then
        raise exception 'the same phone appears twice in the list' using errcode = '23505';
      end if;
      v_phone_values := v_phone_values || v_value;
      v_phone_kinds := v_phone_kinds || v_kind;
      v_phone_whatsapp := v_phone_whatsapp || v_whatsapp;
    end loop;
  end if;

  -- Trava os valores em ordem (uma sessão concorrente com os mesmos valores espera esta) e recusa, com erro claro, o que
  -- já pertence a outro Contato. Os gatilhos repetem essa conferência: a garantia contra a corrida está neles.
  if p_emails is not null then
    for v_value in select distinct x from unnest(v_email_values) x order by x loop
      perform private.lock_contact_channel(v_contact.workspace_id, 'email', v_value);
      if exists (
        select 1 from public.contacts c
        where c.workspace_id = v_contact.workspace_id and c.email = v_value and c.id <> v_contact.id
      ) or exists (
        select 1 from private.contact_emails e
        where e.workspace_id = v_contact.workspace_id and e.email = v_value and e.contact_id <> v_contact.id
      ) then
        raise exception 'email already belongs to another contact of this workspace' using errcode = '23505';
      end if;
    end loop;
  end if;
  if p_phones is not null then
    for v_value in select distinct x from unnest(v_phone_values) x order by x loop
      perform private.lock_contact_channel(v_contact.workspace_id, 'phone', v_value);
      if exists (
        select 1 from public.contacts c
        where c.workspace_id = v_contact.workspace_id and c.phone = v_value and c.id <> v_contact.id
      ) or exists (
        select 1 from private.contact_phones p
        where p.workspace_id = v_contact.workspace_id and p.phone = v_value and p.contact_id <> v_contact.id
      ) then
        raise exception 'phone already belongs to another contact of this workspace' using errcode = '23505';
      end if;
    end loop;
  end if;

  -- Os adicionais saem antes de o principal mudar: trocar o principal não pode esbarrar num adicional do próprio Contato.
  if p_emails is not null then
    delete from private.contact_emails e where e.contact_id = v_contact.id;
    update public.contacts c set
      email = v_email_values[1],
      email_label = case when cardinality(v_email_values) = 0 then null else v_email_labels[1] end,
      updated_at = now()
    where c.id = v_contact.id;
    v_n := cardinality(v_email_values);
    for i in 2..v_n loop
      insert into private.contact_emails (workspace_id, contact_id, ordinal, email, label)
      values (v_contact.workspace_id, v_contact.id, i, v_email_values[i], v_email_labels[i]);
    end loop;
  end if;
  if p_phones is not null then
    delete from private.contact_phones p where p.contact_id = v_contact.id;
    update public.contacts c set
      phone = v_phone_values[1],
      phone_kind = case when cardinality(v_phone_values) = 0 then null else v_phone_kinds[1] end,
      phone_whatsapp = case when cardinality(v_phone_values) = 0 then null else v_phone_whatsapp[1] end,
      updated_at = now()
    where c.id = v_contact.id;
    v_n := cardinality(v_phone_values);
    for i in 2..v_n loop
      insert into private.contact_phones (workspace_id, contact_id, ordinal, phone, kind, whatsapp)
      values (v_contact.workspace_id, v_contact.id, i, v_phone_values[i], v_phone_kinds[i], v_phone_whatsapp[i]);
    end loop;
  end if;

  return query select r.contact_id, r.channel, r.ordinal, r.value, r.label, r.whatsapp
    from private.contact_channels(array[v_contact.id]) r;
end;
$$;

revoke all on function public.set_contact_channels(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.set_contact_channels(uuid, jsonb, jsonb) to authenticated;

-- 6. Confirmação, ativação e envio do passo de E-mail com o e-mail escolhido pelo passo. Redefinições por
-- `create or replace`, com a mesma assinatura e as mesmas permissões; a única diferença é de onde vem o Destino:
--   confirm_sequence_step e activate_sequence: o e-mail da posição `destino` do passo (ausente vale 1, o principal, que
--     é o comportamento de antes); posição sem e-mail é recusada (erro na confirmação, `destination_not_found` na
--     ativação, ou o `contact_without_email` de sempre na posição 1).
--   private.release_step_send (a lógica por trás de release_sequence_step_send e release_due_step_send): o Destino
--     fixado só bloqueia (`destination_changed`) se deixou de ser QUALQUER e-mail do Contato, em vez de diferir do
--     principal. Nunca sai para um endereço que o Contato não tem mais (ADR-0014).
--   ingest_unipile_email_event: a resposta vinda de um e-mail adicional também é atribuída ao Contato.

create or replace function public.confirm_sequence_step(p_sequence_id uuid, p_step_id text)
returns table (
  id uuid, step_id text, contact_id uuid, destination text, status text,
  attempts integer, confirmed_at timestamptz, sent_at timestamptz,
  last_error text, last_error_at timestamptz, updated_at timestamptz,
  mode text, scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_step jsonb;
  v_account_id uuid;
  v_contact public.contacts;
  v_ordinal integer;
  v_email text;
  v_send private.sequence_step_sends;
  v_auth private.sequence_authorizations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  v_step := private.sequence_step(v_sequence.id, p_step_id);
  if v_step is null then
    raise exception 'step not found in the sequence document' using errcode = 'P0002';
  end if;
  if v_step ->> 'canal' <> 'email' then
    raise exception 'only email steps can be confirmed for now' using errcode = '0A000';
  end if;

  -- O destinatário é um Contato canônico com Vínculo ativo na Conta-alvo desta Sequência.
  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  v_account_id := v_sequence.target_account_id::uuid;
  if coalesce(v_step ->> 'contatoId', '') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  select c.* into v_contact
  from public.contacts c
  join public.contact_account_links l
    on l.workspace_id = c.workspace_id and l.contact_id = c.id
      and l.target_account_id = v_account_id and l.ended_at is null
  where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
  if not found then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  -- O passo escolhe qual e-mail do Contato usa (`destino`, de 1 a 3; ausente vale 1).
  v_ordinal := private.step_destination_ordinal(v_step);
  if v_ordinal is null then
    raise exception 'invalid destination position in the step' using errcode = '22023';
  end if;
  v_email := private.contact_email_at(v_contact.id, v_ordinal);
  if v_email is null then
    raise exception 'contact has no email destination' using errcode = '22023',
      detail = 'position ' || v_ordinal;
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id
  for update;
  if found and private.send_went_out(v_send.status) then
    raise exception 'step already sent or in flight' using errcode = '55000';
  end if;

  -- A versão ativa que contém o passo. Um passo que estava em voo numa reativação ficou com a versão anterior:
  -- reconfirmado, ele entra na versão ativa, para o seguinte continuar sendo programado depois dele.
  if found then
    select a.* into v_auth from private.sequence_authorizations a
    where a.sequence_id = v_sequence.id and a.revoked_at is null
      and private.authorized_step(a.id, p_step_id) is not null;
  end if;

  if v_auth.id is not null then
    -- Reconfirmar não adianta o passo: ele mantém o horário dele, ou o próximo horário válido se já venceu.
    update private.sequence_step_sends e set
      contact_id = v_contact.id,
      destination = v_email,
      authorization_id = v_auth.id,
      mode = case when private.authorized_step(v_auth.id, e.step_id) ->> 'modoEmail' = 'manual'
        then 'manual' else 'auto' end,
      status = case
        when e.status in ('waiting', 'cancelled') then 'waiting'
        when private.authorized_step(v_auth.id, e.step_id) ->> 'modoEmail' = 'manual' then 'confirmed'
        else 'scheduled' end,
      scheduled_for = case
        when e.status in ('waiting', 'cancelled') then null
        else greatest(e.scheduled_for, private.next_send_slot(private.clock_now(), 0,
          private.step_window(v_auth.document, private.authorized_step(v_auth.id, e.step_id)))) end,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where e.id = v_send.id
    returning * into v_send;
    perform private.schedule_next_step(v_sequence.id, coalesce(
      (select max(x.sent_at) from private.sequence_step_sends x where x.sequence_id = v_sequence.id),
      private.clock_now()));
    select e.* into v_send from private.sequence_step_sends e where e.id = v_send.id;
  else
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination
    ) values (
      v_sequence.id, v_sequence.workspace_id, p_step_id, v_user_id, v_contact.id, 'email', v_email
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      destination = excluded.destination,
      status = 'confirmed',
      authorization_id = null,
      mode = 'manual',
      scheduled_for = null,
      claimed_until = null,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    returning * into v_send;
  end if;

  return query select * from public.list_sequence_step_sends(v_sequence.id) r where r.id = v_send.id;
end;
$$;
create or replace function public.activate_sequence(p_sequence_id uuid)
returns table (outcome text, step_id text, version integer, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_document jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_n bigint;
  v_contact public.contacts;
  v_ordinal integer;
  v_email text;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_scheduled uuid;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  if v_sequence.status <> 'ativa' then
    return query select 'sequence_not_active', null::text, null::integer, null::timestamptz;
    return;
  end if;

  select d.document into v_document from private.sequence_documents d where d.sequence_id = v_sequence.id;
  v_steps := case when jsonb_typeof(v_document -> 'steps') = 'array' then v_document -> 'steps' else '[]'::jsonb end;
  if jsonb_array_length(v_steps) = 0 then
    return query select 'no_steps', null::text, null::integer, null::timestamptz;
    return;
  end if;

  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  -- Os passos de E-mail pendentes, validados na ordem do documento, com o Contato e o Destino atual.
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    continue when v_step ->> 'canal' is distinct from 'email';
    continue when exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'id' and private.send_went_out(e.status));
    v_contact := null;
    if coalesce(v_step ->> 'contatoId', '') ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
      select c.* into v_contact from public.contacts c
      join public.contact_account_links l
        on l.workspace_id = c.workspace_id and l.contact_id = c.id
          and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
      where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
    end if;
    if v_contact.id is null then
      return query select 'contact_unlinked', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- O passo escolhe qual e-mail do Contato usa (`destino`, de 1 a 3; ausente vale 1).
    v_ordinal := private.step_destination_ordinal(v_step);
    v_email := private.contact_email_at(v_contact.id, v_ordinal);
    if v_email is null then
      return query select case when v_ordinal = 1 then 'contact_without_email' else 'destination_not_found' end,
        v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- Um passo que voltou só sai de novo para outro endereço: ativar não reenvia para o endereço que voltou.
    if exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.status = 'bounced' and e.destination = v_email) then
      return query select 'destination_bounced', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    v_pending := v_pending || jsonb_build_object('step', v_step, 'n', v_n,
      'contact_id', v_contact.id, 'email', v_email);
  end loop;

  if jsonb_array_length(v_pending) > 0 and not exists (
    select 1 from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required) then
    return query select 'sender_not_ready', null::text, null::integer, null::timestamptz;
    return;
  end if;

  update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'reactivated'
  where sequence_id = v_sequence.id and revoked_at is null;
  select coalesce(max(a.version), 0) + 1 into v_version
  from private.sequence_authorizations a where a.sequence_id = v_sequence.id;
  insert into private.sequence_authorizations (sequence_id, version, document, authorized_by)
  values (v_sequence.id, v_version,
    jsonb_build_object('steps', v_steps, 'janelaPadrao', v_document -> 'janelaPadrao'), v_user_id)
  returning * into v_auth;

  -- Ativar é confirmar o documento inteiro: cada passo pendente fixa o Destino atual (ADR-0014) e espera a vez.
  for v_item in select value from jsonb_array_elements(v_pending) loop
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_item -> 'step' ->> 'id', v_user_id, (v_item ->> 'contact_id')::uuid,
      'email', v_item ->> 'email', 'waiting', v_auth.id,
      case when v_item -> 'step' ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end, (v_item ->> 'n')::integer
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      destination = excluded.destination,
      status = 'waiting',
      authorization_id = excluded.authorization_id,
      mode = excluded.mode,
      step_order = excluded.step_order,
      scheduled_for = null,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where not private.send_went_out(private.sequence_step_sends.status);
  end loop;

  -- Um passo que saiu do documento não sai mais.
  update private.sequence_step_sends e set
    status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
  where e.sequence_id = v_sequence.id and e.authorization_id is distinct from v_auth.id
    and private.send_is_cancellable(e.status);

  v_scheduled := private.schedule_next_step(v_sequence.id, private.clock_now());
  return query
    select 'activated', e.step_id, v_version, e.scheduled_for
    from (select 1) one
    left join private.sequence_step_sends e on e.id = v_scheduled;
end;
$$;
create or replace function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_subject text;
  v_body text;
  v_reply_to text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;

  -- A trava da Sequência serializa os envios dela e espera uma pausa concorrente terminar.
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  if p_user_id is null or p_user_id <> v_send.owner_user_id or p_user_id <> v_sequence.owner_user_id
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_sequence.workspace_id and m.user_id = p_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_sequence.workspace_id
        and r.target_account_id = v_sequence.target_account_id and r.owner_user_id = p_user_id) then
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null and v_send.status = 'sending' then
    perform private.expire_stale_sends(v_send.id);
    select e.status into v_send.status from private.sequence_step_sends e where e.id = v_send.id;
  end if;

  if v_blocked is null then
    v_blocked := case v_send.status
      when 'sending' then 'in_flight'
      when 'sent' then 'already_sent'
      when 'uncertain' then 'reconcile_required'
      when 'scheduled' then null
      when 'confirmed' then case when p_due_only then 'not_scheduled' end
      else 'not_confirmed'
    end;
  end if;

  -- O passo de uma versão autorizada só sai na hora dele, pelo executor ou pela ação explícita do titular.
  if v_blocked is null and (p_due_only or v_send.authorization_id is not null)
    and (v_send.scheduled_for is null or v_send.scheduled_for > private.clock_now()) then
    v_blocked := 'not_due';
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
  end if;

  -- O conteúdo sai da versão autorizada; a confirmação avulsa (sem versão) usa o documento atual.
  if v_blocked is null and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if not found then
      v_blocked := 'authorization_revoked';
    end if;
  end if;

  if v_blocked is null then
    v_step := case when v_auth.id is not null
      then private.authorized_step(v_auth.id, v_send.step_id)
      else private.sequence_step(v_sequence.id, v_send.step_id) end;
    if v_step is null then
      v_blocked := 'step_missing';
    end if;
  end if;

  -- Só dentro da janela. Atrasado (ex.: executor fora do ar), o passo automático vai para o próximo horário válido.
  if v_blocked is null and v_auth.id is not null then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = v_slot, claimed_until = null, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := 'outside_window';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required
    order by a.last_status_at desc
    limit 1;
    if not found then
      v_blocked := 'sender_not_ready';
    end if;
  end if;

  if v_blocked is null then
    -- O Contato precisa continuar vinculado à Conta-alvo: quem saiu da empresa não recebe o passo.
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais (nem como principal, nem como adicional) não sai nem para o
    -- antigo nem para outro: o passo espera a reconfirmação.
    elsif not private.contact_has_email(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    -- Um endereço que já voltou nesta Sequência não recebe o passo automático seguinte; o titular ainda pode
    -- reconfirmar e enviar por conta própria.
    elsif p_due_only and exists (
      select 1 from private.sequence_step_sends b
      where b.sequence_id = v_sequence.id and b.id <> v_send.id and b.status = 'bounced'
        and b.destination = v_send.destination) then
      v_blocked := 'destination_bounced';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado (sem Conta remetente pronta, titular sem Participação) fica gravado
  -- com o motivo, e o executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_subject := coalesce(nullif(btrim(v_step ->> 'assunto'), ''), nullif(btrim(v_step ->> 'titulo'), ''), '(sem assunto)');

  -- Um passo "Re: …" continua a conversa do último e-mail enviado ao mesmo Contato nesta Sequência.
  -- A Unipile pode não devolver message_id: então vale o enviado anterior que tem um (a conversa é a mesma).
  -- Sem nenhum anterior, o passo abre uma conversa nova.
  if v_subject ~* '^\s*re\s*:' then
    select e.provider_message_id into v_reply_to from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id
      and e.status = 'sent' and e.provider_message_id is not null and e.id <> v_send.id
    order by e.sent_at desc
    limit 1;
  end if;

  -- As variáveis do passo ({{conta.nome}}, {{contato.primeiro_nome}}…) saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;
  v_subject := private.render_step_template(v_subject, v_account, v_contact, v_owner_name);
  v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);

  -- O que sai fica guardado no Envio: o histórico do passo não depende do documento editado depois.
  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), claimed_until = null, subject = v_subject, body = v_body, updated_at = now()
  where id = v_send.id;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_subject, v_body, v_reply_to, 'X-Althius-Envio', v_send.id::text;
end;
$$;
create or replace function public.ingest_unipile_email_event(
  p_event_id text,
  p_event_type text,
  p_unipile_account_id text,
  p_email jsonb,
  p_owner_addresses text[] default '{}'
) returns table (outcome text, interaction_id uuid, send_id uuid, attachments jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_row_id uuid;
  v_sender private.sender_accounts;
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_contact_id uuid;
  v_interaction public.account_interactions;
  v_email_id text := nullif(btrim(p_email ->> 'id'), '');
  v_message_id text := nullif(btrim(p_email ->> 'message_id'), '');
  v_thread_id text := nullif(btrim(p_email ->> 'thread_id'), '');
  v_from jsonb;
  v_from_email text;
  v_in_reply_to text := private.email_header(p_email, 'In-Reply-To');
  v_references text[] := array_remove(
    regexp_split_to_array(coalesce(private.email_header(p_email, 'References'), ''), '\s+'), '');
  v_header_send text := private.email_header(p_email, 'X-Althius-Envio');
  v_header_send_id uuid;
  v_attachments jsonb := '[]'::jsonb;
  v_received_at timestamptz;
  v_outcome text;
begin
  if p_event_type not in ('email.new', 'email.new.bounce') then
    raise exception 'unsupported email event type' using errcode = '22023';
  end if;

  -- 1. Dedupe pelo id do evento. A Unipile reentrega até duas vezes.
  insert into private.unipile_email_events (event_id, event_type, unipile_account_id, provider_email_id, outcome)
  values (p_event_id, p_event_type, p_unipile_account_id, v_email_id, 'unrelated')
  on conflict (event_id) do nothing
  returning id into v_event_row_id;
  if v_event_row_id is null then
    return query select 'duplicate_event', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  select a.* into v_sender from private.sender_accounts a where a.unipile_account_id = p_unipile_account_id;
  if not found then
    update private.unipile_email_events set outcome = 'unknown_account' where id = v_event_row_id;
    return query select 'unknown_account', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;
  update private.unipile_email_events set sender_account_id = v_sender.id where id = v_event_row_id;

  -- 2. Dedupe pelo e-mail: o email.new sai de novo quando o e-mail é movido ou vai para a lixeira.
  perform pg_advisory_xact_lock(hashtext(p_unipile_account_id || '|' || coalesce(v_email_id, p_event_id)));
  if v_email_id is not null and exists (
    select 1 from private.unipile_email_events e
    where e.unipile_account_id = p_unipile_account_id and e.provider_email_id = v_email_id
      and e.event_type = p_event_type and e.id <> v_event_row_id
      and e.outcome in ('echo', 'reply', 'bounce', 'unrelated')
  ) then
    update private.unipile_email_events set outcome = 'duplicate_email' where id = v_event_row_id;
    return query select 'duplicate_email', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  v_from := case when jsonb_typeof(p_email -> 'from') = 'array' then p_email -> 'from' -> 0 else p_email -> 'from' end;
  v_from_email := lower(nullif(btrim(v_from ->> 'email'), ''));
  if v_header_send ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    v_header_send_id := v_header_send::uuid;
  end if;

  -- 3. Bounce: o payload é o e-mail ORIGINAL enviado. Eco: o próprio envio nos itens enviados.
  select e.* into v_send from private.sequence_step_sends e
  where e.sender_account_id = v_sender.id
    and (e.id = v_header_send_id or e.provider_email_id = v_email_id or e.provider_message_id = v_message_id)
  limit 1;
  if p_event_type = 'email.new.bounce' then
    if found then
      update private.sequence_step_sends set
        status = 'bounced', last_error = 'bounced', last_error_at = now(), updated_at = now()
      where id = v_send.id;
      v_outcome := 'bounce';
    else
      v_outcome := 'unrelated';
    end if;
  elsif found then
    if v_from_email is not null and v_sender.email_address is distinct from v_from_email then
      update private.sender_accounts set email_address = v_from_email, updated_at = now() where id = v_sender.id;
    end if;
    -- O eco prova que o e-mail saiu, mesmo quando o resultado da chamada foi falha e o passo espera nova tentativa.
    if v_send.status not in ('sent', 'bounced') then
      v_send := private.mark_step_send_sent(v_send.id, v_email_id, v_message_id, v_thread_id);
    else
      update private.sequence_step_sends set
        provider_email_id = coalesce(provider_email_id, v_email_id),
        provider_message_id = coalesce(provider_message_id, v_message_id),
        provider_thread_id = coalesce(provider_thread_id, v_thread_id),
        updated_at = now()
      where id = v_send.id;
    end if;
    v_outcome := 'echo';
  -- O que o titular escreveu por conta própria também é eco, nunca resposta do Contato.
  elsif v_from_email is not null and (v_from_email = v_sender.email_address
    or v_from_email = any (select lower(a) from unnest(p_owner_addresses) a)) then
    v_send := null;
    v_outcome := 'echo';
  -- Resposta automática (mailer-daemon, fora do escritório, Auto-Submitted) não é resposta comercial.
  elsif v_from_email ~* '^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@'
    or lower(coalesce(private.email_header(p_email, 'Auto-Submitted'), 'no')) <> 'no'
    or private.email_header(p_email, 'X-Autoreply') is not null
    or private.email_header(p_email, 'X-Autorespond') is not null then
    v_send := null;
    v_outcome := 'automatic';
  end if;

  -- 4. Resposta: a conversa de um passo enviado, ou o In-Reply-To/References com um message_id enviado.
  if v_outcome is null then
    select e.* into v_send from private.sequence_step_sends e
    where e.sender_account_id = v_sender.id
      and e.status in ('sent', 'uncertain', 'bounced')
      and (
        (v_thread_id is not null and e.provider_thread_id = v_thread_id)
        or (e.provider_message_id is not null
          and (e.provider_message_id = v_in_reply_to or e.provider_message_id = any (v_references)))
      )
    order by e.sent_at desc nulls last
    limit 1;
    v_outcome := case when found then 'reply' else 'unrelated' end;
  end if;

  if v_outcome = 'reply' then
    -- A trava da Sequência serializa a pausa com uma liberação concorrente de envio.
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;

    -- Quem respondeu: o Contato com esse e-mail e Vínculo ativo na Conta-alvo. Outra pessoa da Conta-alvo
    -- (um colega na mesma conversa) também pausa, mas a Interação pública não a atribui ao Contato errado.
    select c.id into v_contact_id from public.contacts c
    join public.contact_account_links l
      on l.workspace_id = c.workspace_id and l.contact_id = c.id
        and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
    where c.workspace_id = v_sequence.workspace_id
      and (c.email = v_from_email or private.contact_has_email(c.id, v_from_email))
    limit 1;

    v_received_at := coalesce(private.safe_timestamptz(p_email ->> 'date'), now());

    insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
    values (v_sequence.workspace_id, v_sequence.target_account_id::uuid, v_contact_id, 'email-recebido',
      v_received_at, 'sequencia', v_sequence.owner_user_id)
    returning * into v_interaction;
    update public.target_accounts
    set last_interaction_at = greatest(last_interaction_at, v_received_at)
    where id = v_sequence.target_account_id::uuid;

    -- Os anexos chegam com id e/ou url; os dois ficam guardados para o download depois do 2xx.
    if jsonb_typeof(p_email -> 'attachments') = 'array' then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(nullif(btrim(a ->> 'id'), ''), 'anexo-' || n),
        'url', nullif(btrim(a ->> 'url'), ''),
        'name', coalesce(a ->> 'name', a ->> 'filename', 'anexo'),
        'mime', coalesce(a ->> 'mime', a ->> 'mime_type', a ->> 'content_type'),
        'size', case when (a ->> 'size') ~ '^\d+$' then (a ->> 'size')::bigint end,
        'status', 'pending')) order by n), '[]'::jsonb)
      into v_attachments
      from jsonb_array_elements(p_email -> 'attachments') with ordinality as t(a, n)
      where jsonb_typeof(a) = 'object';
    end if;

    insert into private.received_emails (
      interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id, sender_account_id,
      provider_email_id, provider_message_id, provider_thread_id, from_email, from_name,
      subject, body, snippet, received_at, attachments
    ) values (
      v_interaction.id, v_sequence.workspace_id, v_sequence.owner_user_id, v_sequence.id, v_send.id, v_contact_id, v_sender.id,
      coalesce(v_email_id, p_event_id), v_message_id, v_thread_id, v_from_email, nullif(btrim(v_from ->> 'display_name'), ''),
      p_email ->> 'subject', p_email ->> 'body', p_email ->> 'snippet', v_received_at, v_attachments
    );

    -- A pausa vale para a Sequência inteira da Conta-alvo; retomar é ação explícita do responsável.
    if v_sequence.status = 'ativa' then
      update public.sequences set
        status = 'pausada',
        public_summary = public_summary || jsonb_build_object('status', 'pausada'),
        updated_at = now()
      where id = v_sequence.id;
      update private.sequence_documents set
        document = document || jsonb_build_object('motivoPause', 'Contato respondeu'),
        updated_at = now()
      where sequence_id = v_sequence.id;
    end if;
  end if;

  update private.unipile_email_events
  set outcome = v_outcome, send_id = v_send.id, interaction_id = v_interaction.id
  where id = v_event_row_id;
  return query select v_outcome, v_interaction.id, v_send.id, v_attachments;
end;
$$;

-- 7. Apagamento definitivo (CRM-18): apagar o Contato apaga os adicionais em cascata, e as varreduras que casam por
-- e-mail e telefone passam a considerar também os valores adicionais: linhas cruas do CSV, respostas recebidas, cópia
-- da tabela antiga de Contatos e Memória dos Agentes. erase_contact_data chama isto antes de apagar o Contato, quando
-- os adicionais ainda existem. Os números do principal continuam nas chaves de sempre; o que os adicionais acharam vai
-- somado em import_rows_erased e import_files_queued e, à parte, em extra_received_emails_erased e
-- extra_legacy_rows_erased.
create or replace function private.erase_contact_extensions(p_workspace_id uuid, p_contact_id uuid, p_contact public.contacts)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emails text[];
  v_phones text[];
  v_value text;
  v_result jsonb;
  v_extra jsonb;
  v_rows integer;
  v_files integer;
  v_received integer := 0;
  v_legacy integer;
begin
  select coalesce(array_agg(e.email order by e.ordinal), '{}') into v_emails
  from private.contact_emails e where e.contact_id = p_contact_id;
  select coalesce(array_agg(p.phone order by p.ordinal), '{}') into v_phones
  from private.contact_phones p where p.contact_id = p_contact_id;

  v_result := private.erase_import_data(
    p_workspace_id, null, null, p_contact_id, p_contact.email, p_contact.phone, p_contact.linkedin);
  v_rows := (v_result ->> 'import_rows_erased')::integer;
  v_files := (v_result ->> 'import_files_queued')::integer;

  foreach v_value in array v_emails loop
    v_extra := private.erase_import_data(p_workspace_id, null, null, p_contact_id, v_value, null, null);
    v_rows := v_rows + (v_extra ->> 'import_rows_erased')::integer;
    v_files := v_files + (v_extra ->> 'import_files_queued')::integer;
    v_received := v_received + private.erase_received_emails(p_workspace_id, '{}', null, v_value);
  end loop;
  foreach v_value in array v_phones loop
    v_extra := private.erase_import_data(p_workspace_id, null, null, p_contact_id, null, v_value, null);
    v_rows := v_rows + (v_extra ->> 'import_rows_erased')::integer;
    v_files := v_files + (v_extra ->> 'import_files_queued')::integer;
  end loop;

  delete from private.target_contacts_canais02 t
  where t.workspace_id = p_workspace_id
    and (lower(t.email) = any (v_emails) or t.whatsapp = any (v_phones));
  get diagnostics v_legacy = row_count;

  return v_result
    || jsonb_build_object('import_rows_erased', v_rows, 'import_files_queued', v_files,
      'extra_received_emails_erased', v_received, 'extra_legacy_rows_erased', v_legacy,
      'agent_facts_erased', private.erase_agent_memory(
        p_workspace_id, array[p_contact.name, p_contact.email, p_contact.phone, p_contact.linkedin] || v_emails || v_phones));
end;
$$;
