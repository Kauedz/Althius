-- Anexos persistentes e privados nos passos da Sequência (canais-10). Até aqui um anexo era só um endereço local do
-- navegador (blob:), que morria com a aba, e o Workspace operacional recusava qualquer anexo no documento. Agora o
-- arquivo do Vendedor responsável fica num bucket privado do Storage, ligado ao Workspace, ao titular, à Sequência e
-- ao passo; o documento guarda só o id. O navegador nunca recebe URL pública: a Edge Function sequence-attachments
-- grava o arquivo com a chave de serviço e devolve, só ao titular, uma URL assinada que vale poucos minutos.
--
-- Formato e tamanho são conferidos por canal em três momentos: ao subir (pelo canal do passo), ao ativar (o canal pode
-- ter mudado depois) e no envio (o Executor confere de novo a versão autorizada). Um anexo inválido não sai e não é
-- marcado como enviado: o Envio fica falho com o motivo, sem nova tentativa, e as outras Sequências seguem.
--
-- Os limites por canal são os da documentação dos provedores que a busca encontrou; a Unipile v2 não publica um teto
-- próprio. não confirmado: conferir no primeiro envio real de cada canal (Passos do Nan do canais-10).
--
-- O módulo nasce DESLIGADO (private.set_sequence_attachments_enabled): ligar é um passo do Nan, depois de publicar a
-- Edge Function sequence-attachments. Desligado, a tela diz que os anexos ainda não estão disponíveis, como antes.
--
-- Aditiva. Redefine, a partir da versão mais recente (20261001150000), private.step_signature (o anexo entra na
-- assinatura do passo: trocar o arquivo de um passo pendente revoga a ativação) e public.activate_sequence (uma linha:
-- o anexo inválido para o canal barra a ativação).

-- 1. O interruptor do módulo.
create table private.sequence_attachment_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.sequence_attachment_settings (id) values (true);

alter table private.sequence_attachment_settings enable row level security;
revoke all on private.sequence_attachment_settings from public, anon, authenticated, service_role;

comment on table private.sequence_attachment_settings is
  'Whether Sequence step attachments are available. Off by default: turn on only after the sequence-attachments '
  'Edge Function is deployed.';

-- Passo do Nan, no SQL Editor: select private.set_sequence_attachments_enabled(true);
create function private.set_sequence_attachments_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sequence_attachment_settings set enabled = coalesce(p_enabled, false), updated_at = now();
  return coalesce(p_enabled, false);
end;
$$;

revoke all on function private.set_sequence_attachments_enabled(boolean) from public, anon, authenticated, service_role;

create function private.sequence_attachments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from private.sequence_attachment_settings s), false);
$$;

revoke all on function private.sequence_attachments_enabled() from public, anon, authenticated, service_role;

-- 2. Os limites por canal. Um arquivo por mensagem no WhatsApp e no LinkedIn (cada mídia é uma mensagem); até cinco
-- no E-mail, somados no teto do e-mail. Só imagem e vídeo MP4, os dois tipos que a tela oferece.
-- não confirmado: os tetos da Unipile v2 por canal; os números abaixo são os do provedor de cada canal.
create function private.attachment_limits(p_channel text)
returns table (max_bytes bigint, max_files integer, max_total_bytes bigint, mime_types text[])
language sql
immutable
set search_path = ''
as $$
  select l.max_bytes, l.max_files, l.max_total_bytes, l.mime_types from (values
    ('email', 10485760::bigint, 5, 10485760::bigint,
      array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']),
    ('whatsapp', 16777216::bigint, 1, 16777216::bigint,
      array['image/jpeg', 'image/png', 'video/mp4']),
    ('linkedin', 15728640::bigint, 1, 15728640::bigint,
      array['image/jpeg', 'image/png', 'image/gif', 'video/mp4'])
  ) as l(channel, max_bytes, max_files, max_total_bytes, mime_types)
  where l.channel = p_channel;
$$;

revoke all on function private.attachment_limits(text) from public, anon, authenticated;

-- A tela pergunta se os anexos estão ligados e quais são os limites, para avisar antes de subir um arquivo.
create function public.sequence_attachment_limits()
returns table (channel text, max_bytes bigint, max_files integer, mime_types text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not private.sequence_attachments_enabled() then
    return;
  end if;
  return query
    select c.channel, l.max_bytes, l.max_files, l.mime_types
    from unnest(array['email', 'whatsapp', 'linkedin']) as c(channel), lateral private.attachment_limits(c.channel) l;
end;
$$;

revoke all on function public.sequence_attachment_limits() from public, anon;
grant execute on function public.sequence_attachment_limits() to authenticated;

-- 3. O bucket privado. Só existe onde o Storage existe (o banco do CI e o de teste local não têm storage-api). Sem
-- política em storage.objects: o Storage nega tudo ao navegador (inclusive a outro participante e a outro Workspace), e
-- só a Edge Function, com a chave de serviço e depois de o banco conferir o titular, grava e assina.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('sequence-attachments', 'sequence-attachments', false, 16777216,
      array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- 4. O registro de cada arquivo. O caminho no bucket é anexos/<Sequência>/<anexo>/arquivo: nunca o nome original,
-- que fica só aqui (é dado do titular) e nunca vai para log, evento ou erro de terceiro.
create table private.sequence_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  step_id text not null check (btrim(step_id) <> ''),
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'stored')),
  created_at timestamptz not null default now(),
  stored_at timestamptz
);

create index sequence_attachments_sequence_idx on private.sequence_attachments (sequence_id);

alter table private.sequence_attachments enable row level security;
revoke all on private.sequence_attachments from public, anon, authenticated, service_role;

comment on table private.sequence_attachments is
  'Private files attached to Sequence steps by the responsible seller. Only the owner reads them, through a short '
  'signed URL issued by the sequence-attachments Edge Function; the file name never leaves this table.';

-- O arquivo apagado do registro sai do Storage pela fila (a Edge Function storage-purge), em duas passadas como os
-- anexos recebidos: a segunda pega um upload que estava em andamento.
create function private.purge_removed_sequence_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_purge_queue (bucket, prefix, run_after)
  select 'sequence-attachments', 'anexos/' || old.sequence_id::text || '/' || old.id::text || '/', t.quando
  from (values (now()), (now() + interval '6 hours')) as t(quando);
  return old;
end;
$$;

revoke all on function private.purge_removed_sequence_attachment() from public, anon, authenticated, service_role;

create trigger sequence_attachments_purge
  after delete on private.sequence_attachments
  for each row execute function private.purge_removed_sequence_attachment();

-- Apagar a Conta-alvo esvazia o documento da Sequência (erase de 20260929160000): os anexos dela saem junto.
create function private.erase_attachments_of_erased_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document = '{}'::jsonb and old.document is distinct from '{}'::jsonb then
    delete from private.sequence_attachments where sequence_id = new.sequence_id;
  end if;
  return new;
end;
$$;

revoke all on function private.erase_attachments_of_erased_document() from public, anon, authenticated, service_role;

create trigger sequence_documents_erase_attachments
  after update of document on private.sequence_documents
  for each row execute function private.erase_attachments_of_erased_document();

-- Os ids dos anexos de um passo, na ordem do documento.
create function private.step_attachment_ids(p_step jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(a ->> 'id' order by n), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_step -> 'anexos') = 'array'
    then p_step -> 'anexos' else '[]'::jsonb end) with ordinality as t(a, n);
$$;

revoke all on function private.step_attachment_ids(jsonb) from public, anon, authenticated;

-- O que impede os anexos de um passo de sair pelo canal dele, ou null. Cada id tem de ser um arquivo guardado desta
-- Sequência e deste titular; formato, tamanho e quantidade seguem o canal. Um convite do LinkedIn não leva anexo.
create function private.step_attachments_problem(p_sequence_id uuid, p_owner_user_id uuid, p_step jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids text[] := private.step_attachment_ids(p_step);
  v_channel text := p_step ->> 'canal';
  v_limits record;
  v_found integer;
  v_total bigint;
begin
  if cardinality(v_ids) = 0 then
    return null;
  end if;
  select * into v_limits from private.attachment_limits(v_channel);
  if not found then
    return 'attachment_not_supported';
  end if;
  if v_channel = 'linkedin' and coalesce(p_step ->> 'subtipoLinkedIn', 'convite') = 'convite' then
    return 'attachment_not_supported_on_invite';
  end if;
  if exists (select 1 from unnest(v_ids) i where i is null or i !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$') then
    return 'attachment_not_stored';
  end if;
  select count(*), coalesce(sum(a.size_bytes), 0) into v_found, v_total
  from private.sequence_attachments a
  where a.id = any (v_ids::uuid[]) and a.sequence_id = p_sequence_id and a.owner_user_id = p_owner_user_id
    and a.status = 'stored';
  if v_found <> cardinality(v_ids) then
    return 'attachment_not_stored';
  end if;
  if cardinality(v_ids) > v_limits.max_files then
    return 'too_many_attachments';
  end if;
  if exists (
    select 1 from private.sequence_attachments a
    where a.id = any (v_ids::uuid[]) and not (a.mime_type = any (v_limits.mime_types))) then
    return 'attachment_type_not_supported';
  end if;
  if v_total > v_limits.max_total_bytes or exists (
    select 1 from private.sequence_attachments a
    where a.id = any (v_ids::uuid[]) and a.size_bytes > v_limits.max_bytes) then
    return 'attachment_too_large';
  end if;
  return null;
end;
$$;

revoke all on function private.step_attachments_problem(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

-- 5. Subir um arquivo. Quem chama é a Edge Function, com o JWT do titular: o banco confere a Sequência, o passo e o
-- canal antes de o Storage ser tocado, e devolve o caminho onde o arquivo vai ficar. O tipo é o que a função leu dos
-- primeiros bytes do arquivo, não o que o navegador disse.
create function public.register_sequence_attachment(
  p_sequence_id uuid,
  p_step_id text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
) returns table (attachment_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_step jsonb;
  v_channel text;
  v_limits record;
  v_name text;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not private.sequence_attachments_enabled() then
    raise exception 'sequence attachments are not enabled' using errcode = '0A000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where s.id = p_sequence_id and s.owner_user_id = v_user_id and s.status <> 'encerrada';
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  v_step := private.sequence_step(v_sequence.id, p_step_id);
  if v_step is null then
    raise exception 'step not found' using errcode = '22023';
  end if;
  v_channel := v_step ->> 'canal';
  select * into v_limits from private.attachment_limits(v_channel);
  if not found then
    raise exception 'attachments are not supported on this channel' using errcode = '22023';
  end if;
  if v_channel = 'linkedin' and coalesce(v_step ->> 'subtipoLinkedIn', 'convite') = 'convite' then
    raise exception 'attachments are not supported on a LinkedIn invitation' using errcode = '22023';
  end if;
  if p_mime_type is null or not (p_mime_type = any (v_limits.mime_types)) then
    raise exception 'attachment type not supported on this channel' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_limits.max_bytes then
    raise exception 'attachment too large for this channel' using errcode = '22023';
  end if;
  if cardinality(private.step_attachment_ids(v_step)) + 1 > v_limits.max_files then
    raise exception 'too many attachments on this step' using errcode = '22023';
  end if;

  -- O nome só serve para a pessoa reconhecer o arquivo: sem caminho, sem controle, no máximo 200 caracteres.
  v_name := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', '_', 'g')), 200);
  if v_name = '' then
    v_name := 'anexo';
  end if;
  v_path := 'anexos/' || v_sequence.id::text || '/' || v_id::text || '/arquivo';

  insert into private.sequence_attachments (
    id, workspace_id, sequence_id, owner_user_id, step_id, channel, file_name, mime_type, size_bytes, storage_path
  ) values (
    v_id, v_sequence.workspace_id, v_sequence.id, v_user_id, p_step_id, v_channel, v_name, p_mime_type, p_size_bytes, v_path
  );
  return query select v_id, v_path;
end;
$$;

revoke all on function public.register_sequence_attachment(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_sequence_attachment(uuid, text, text, text, bigint) to authenticated;

-- O arquivo chegou ao bucket: a partir daqui ele pode entrar num passo e sair num envio.
create function public.mark_sequence_attachment_stored(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sequence_attachments set status = 'stored', stored_at = now()
  where id = p_attachment_id and status = 'pending';
  return found;
end;
$$;

revoke all on function public.mark_sequence_attachment_stored(uuid) from public, anon, authenticated;
grant execute on function public.mark_sequence_attachment_stored(uuid) to service_role;

-- O upload falhou: o registro pendente sai (e a fila confere o Storage), para não sobrar um arquivo pela metade.
create function public.discard_pending_sequence_attachment(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.sequence_attachments where id = p_attachment_id and status = 'pending';
  return found;
end;
$$;

revoke all on function public.discard_pending_sequence_attachment(uuid) from public, anon, authenticated;
grant execute on function public.discard_pending_sequence_attachment(uuid) to service_role;

-- O caminho de um anexo guardado, para a Edge Function assinar uma URL curta. Só o titular da Sequência, com
-- Participação ativa e a responsabilidade pela Conta-alvo; nem o Administrador nem outro Workspace.
create function public.get_sequence_attachment_path(p_attachment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_path text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.storage_path, a.status into v_path, v_status
  from private.sequence_attachments a
  join public.sequences s on s.id = a.sequence_id and s.owner_user_id = v_user_id
  join public.workspace_memberships m on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where a.id = p_attachment_id and a.owner_user_id = v_user_id;
  if not found then
    raise exception 'attachment not found or not owned by active user' using errcode = '42501';
  end if;
  if v_status <> 'stored' then
    raise exception 'attachment not stored' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

revoke all on function public.get_sequence_attachment_path(uuid) from public, anon;
grant execute on function public.get_sequence_attachment_path(uuid) to authenticated;

-- 6. O envio. Depois da liberação (o Envio já está em "sending"), o Executor pede os anexos do passo da versão
-- autorizada. Volta uma linha por arquivo, ou uma linha só com o motivo que impede o envio.
create function public.step_send_attachments(p_send_id uuid)
returns table (problem text, attachment_id uuid, storage_path text, file_name text, mime_type text, size_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_step jsonb;
  v_problem text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'sending' then
    return query select 'send_not_in_flight', null::uuid, null::text, null::text, null::text, null::bigint;
    return;
  end if;
  v_step := case when v_send.authorization_id is not null
    then private.authorized_step(v_send.authorization_id, v_send.step_id)
    else private.sequence_step(v_send.sequence_id, v_send.step_id) end;
  if v_step is null then
    return query select 'step_missing', null::uuid, null::text, null::text, null::text, null::bigint;
    return;
  end if;
  -- O canal que vale é o do Envio: o passo autorizado tem o mesmo, mas o Envio é o que sai.
  v_problem := private.step_attachments_problem(v_send.sequence_id, v_send.owner_user_id,
    v_step || jsonb_build_object('canal', v_send.channel));
  if v_problem is not null then
    return query select v_problem, null::uuid, null::text, null::text, null::text, null::bigint;
    return;
  end if;
  return query
    select null::text, a.id, a.storage_path, a.file_name, a.mime_type, a.size_bytes
    from unnest(private.step_attachment_ids(v_step)) with ordinality as i(id, n)
    join private.sequence_attachments a on a.id = i.id::uuid
    order by i.n;
end;
$$;

revoke all on function public.step_send_attachments(uuid) from public, anon, authenticated;
grant execute on function public.step_send_attachments(uuid) to service_role;

-- O anexo não pôde sair (inválido para o canal, arquivo que sumiu): o Envio em voo fica falho com o motivo, sem nova
-- tentativa (repetir não conserta o arquivo) e sem contar como enviado. O Vendedor responsável troca o anexo e ativa de
-- novo; as outras Sequências seguem.
create function public.fail_step_send_for_attachment(p_send_id uuid, p_problem text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  if p_problem is null or p_problem !~ '^(attachment_[a-z_]+|too_many_attachments|step_missing)$' then
    raise exception 'unknown attachment problem' using errcode = '22023';
  end if;
  -- A trava da Sequência vem antes da linha do Envio, na mesma ordem da liberação.
  perform 1 from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'sending' then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;
  update private.sequence_step_sends set
    status = 'failed', claimed_until = null, last_error = p_problem, last_error_at = now(), updated_at = now()
  where id = v_send.id;
  return 'failed';
end;
$$;

revoke all on function public.fail_step_send_for_attachment(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_step_send_for_attachment(uuid, text) to service_role;

-- 7. O anexo entra na assinatura do passo (só os ids): trocar o arquivo de um passo pendente revoga a ativação, como
-- trocar o texto. Cópia de 20261001150000 com a linha 'anexos'.
create or replace function private.step_signature(p_document jsonb, p_step jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_step -> 'id',
    'canal', p_step -> 'canal',
    'contatoId', p_step -> 'contatoId',
    'delayDiasUteis', private.step_delay(p_step),
    'titulo', p_step -> 'titulo',
    'assunto', p_step -> 'assunto',
    'corpo', p_step -> 'corpo',
    'modoEmail', p_step -> 'modoEmail',
    'janela', private.step_window(p_document, p_step),
    'subtipoLinkedIn', case when p_step ->> 'canal' = 'linkedin' then p_step -> 'subtipoLinkedIn' end,
    'telefone', case when p_step ->> 'canal' = 'whatsapp' then p_step -> 'destino' end,
    'anexos', case when cardinality(private.step_attachment_ids(p_step)) > 0
      then to_jsonb(private.step_attachment_ids(p_step)) end);
$$;

-- 8. A ativação confere os anexos de cada passo pendente pelo canal dele. Cópia de 20261001150000 com o bloco
-- marcado "canais-10" (e a variável v_problem).
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
  v_channel text;
  v_contact public.contacts;
  v_account public.target_accounts;
  v_owner_name text;
  v_ordinal integer;
  v_destination text;
  v_phone record;
  v_subtype text;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_scheduled uuid;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
  v_problem text;
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

  -- Para medir a nota do convite já com as variáveis preenchidas, como ela vai sair.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = v_user_id;

  -- Os passos pendentes dos canais liberados, validados na ordem do documento, com o Contato e o Destino atual.
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    v_channel := v_step ->> 'canal';
    continue when v_channel is null;
    continue when v_channel <> 'email'
      and not (v_channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_channel));
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

    if v_channel = 'email' then
      -- O passo escolhe qual e-mail do Contato usa (`destino`, de 1 a 3; ausente vale 1).
      v_ordinal := private.step_destination_ordinal(v_step);
      v_destination := private.contact_email_at(v_contact.id, v_ordinal);
      if v_destination is null then
        return query select case when v_ordinal = 1 then 'contact_without_email' else 'destination_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
    elsif v_channel = 'whatsapp' then
      -- O passo escolhe qual telefone do Contato usa (`destino`, de 1 a 3), e ele precisa usar WhatsApp.
      v_ordinal := private.step_destination_ordinal(v_step);
      select p.phone, p.whatsapp into v_phone from private.contact_phone_at(v_contact.id, v_ordinal) p;
      if not found then
        return query select case when v_ordinal = 1 then 'contact_without_phone' else 'phone_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if not v_phone.whatsapp then
        return query select 'phone_without_whatsapp', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_phone.phone;
    else
      if v_contact.linkedin is null then
        return query select 'contact_without_linkedin', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if private.linkedin_public_identifier(v_contact.linkedin) is null then
        return query select 'linkedin_profile_invalid', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_subtype := coalesce(v_step ->> 'subtipoLinkedIn', 'convite');
      if v_subtype not in ('convite', 'mensagem', 'inmail') then
        return query select 'invalid_linkedin_subtype', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_contact.linkedin;
    end if;

    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- canais-10: os anexos do passo têm de servir ao canal dele (formato, tamanho, quantidade; convite não leva).
    v_problem := private.step_attachments_problem(v_sequence.id, v_user_id, v_step);
    if v_problem is not null then
      return query select v_problem, v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- A nota do convite não é cortada em silêncio: se passa do limite, o Vendedor responsável a encurta antes de ativar.
    -- Se o Contato já for conexão o passo vira mensagem, mas só o envio sabe disso; o limite vale por garantia.
    if v_channel = 'linkedin' and v_subtype = 'convite' and char_length(
        private.render_step_template(v_step ->> 'corpo', v_account, v_contact, v_owner_name)
      ) > private.linkedin_invite_note_limit() then
      return query select 'invite_note_too_long', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- Um passo que voltou só sai de novo para outro endereço: ativar não reenvia para o endereço que voltou.
    if v_channel = 'email' and exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.status = 'bounced' and e.destination = v_destination) then
      return query select 'destination_bounced', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    v_pending := v_pending || jsonb_build_object('step', v_step, 'n', v_n, 'channel', v_channel,
      'contact_id', v_contact.id, 'destination', v_destination);
  end loop;

  -- Cada canal usado precisa de uma Conta remetente do titular, pronta e sem reconciliação pendente.
  foreach v_channel in array array['email', 'whatsapp', 'linkedin'] loop
    if exists (select 1 from jsonb_array_elements(v_pending) i where i ->> 'channel' = v_channel)
      and not exists (
        select 1 from private.sender_accounts a
        where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
          and a.channel = v_channel and a.status = 'ready' and not a.reconciliation_required) then
      return query select case v_channel when 'email' then 'sender_not_ready' else v_channel || '_sender_not_ready' end,
        (select i -> 'step' ->> 'id' from jsonb_array_elements(v_pending) i
          where i ->> 'channel' = v_channel and v_channel <> 'email' limit 1),
        null::integer, null::timestamptz;
      return;
    end if;
  end loop;

  update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'reactivated'
  where sequence_id = v_sequence.id and revoked_at is null;
  select coalesce(max(a.version), 0) + 1 into v_version
  from private.sequence_authorizations a where a.sequence_id = v_sequence.id;
  insert into private.sequence_authorizations (sequence_id, version, document, authorized_by)
  values (v_sequence.id, v_version,
    jsonb_build_object('steps', v_steps, 'janelaPadrao', v_document -> 'janelaPadrao'), v_user_id)
  returning * into v_auth;

  -- Ativar é confirmar o documento inteiro: cada passo pendente fixa o Destino atual (ADR-0014) e espera a vez.
  -- Só o E-mail tem passo manual; WhatsApp e LinkedIn saem sozinhos.
  for v_item in select value from jsonb_array_elements(v_pending) loop
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_item -> 'step' ->> 'id', v_user_id, (v_item ->> 'contact_id')::uuid,
      v_item ->> 'channel', v_item ->> 'destination', 'waiting', v_auth.id,
      case when v_item ->> 'channel' = 'email' and v_item -> 'step' ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end,
      (v_item ->> 'n')::integer
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      channel = excluded.channel,
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

revoke all on function public.activate_sequence(uuid) from public, anon;
grant execute on function public.activate_sequence(uuid) to authenticated;
