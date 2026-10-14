-- Anexos nas Conversas dos Agentes (PR-10). Aditiva e idempotente.
-- Quem pede sobe o arquivo pela Edge Function agent-attachments: ela lê o tipo pelos primeiros bytes, extrai o texto
-- dos documentos e, depois de o banco conferir a Participação (register_agent_attachment, com o JWT de quem pede), grava
-- no bucket privado com a chave de serviço. O navegador nunca fala com o Storage. No envio, a agent-conversation reserva
-- os anexos para o pedido (reserve_agent_attachments) antes de guardá-lo; quando a Execução nasce, um gatilho liga os
-- anexos a ela e à Conversa, e o motor os lê pela chave de serviço (agent_run_attachments). Só quem subiu lê o arquivo.
-- Limites: 5 arquivos por pedido, 10 MB cada; png, jpg, webp, pdf, csv, txt, docx e xlsx.
-- E o Parar: quem pediu interrompe a própria Execução (cancel_agent_run), que fecha como falha "cancelled".

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('agent-attachments', 'agent-attachments', false, 10485760, array[
      'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/csv', 'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- Os tipos aceitos e os limites, num lugar só.
create or replace function private.agent_attachment_mime_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/csv', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
$$;

revoke all on function private.agent_attachment_mime_types() from public, anon, authenticated, service_role;

create table if not exists private.agent_message_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid,
  run_id uuid references private.agent_runs(id) on delete cascade,
  -- O pedido a que o anexo foi reservado, antes de a Execução existir (o mesmo client_request_id do envio).
  client_request_id uuid,
  path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null,
  size bigint not null check (size > 0 and size <= 10485760),
  -- O texto dos documentos, já cortado no limite, para o contexto do modelo. Nulo nas imagens.
  extracted_text text check (extracted_text is null or char_length(extracted_text) <= 20000),
  status text not null default 'pending' check (status in ('pending', 'stored')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, conversation_id) references private.agent_conversations (workspace_id, id) on delete cascade
);

create index if not exists agent_message_attachments_run_idx on private.agent_message_attachments (run_id);
create index if not exists agent_message_attachments_conversation_idx on private.agent_message_attachments (workspace_id, conversation_id);
create index if not exists agent_message_attachments_request_idx on private.agent_message_attachments (created_by, client_request_id);
create index if not exists agent_message_attachments_workspace_idx on private.agent_message_attachments (workspace_id);

alter table private.agent_message_attachments enable row level security;
revoke all on private.agent_message_attachments from public, anon, authenticated, service_role;

comment on table private.agent_message_attachments is
  'Files attached to Agent requests. Only the uploader reads them, through a short signed URL issued by the '
  'agent-attachments Edge Function; the engine reads them with the service key.';

-- O arquivo apagado do registro (inclusive pela Conversa ou pela Execução apagada) sai do Storage pela fila.
create or replace function private.purge_removed_agent_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_purge_queue (bucket, prefix, run_after)
  select 'agent-attachments', 'conversas/' || old.workspace_id::text || '/' || old.id::text || '/', t.quando
  from (values (now()), (now() + interval '6 hours')) as t(quando);
  return old;
end;
$$;

revoke all on function private.purge_removed_agent_attachment() from public, anon, authenticated, service_role;

create or replace trigger agent_message_attachments_purge
  after delete on private.agent_message_attachments
  for each row execute function private.purge_removed_agent_attachment();

-- A Execução nasce: os anexos reservados para o pedido passam a ser dela e da Conversa.
create or replace function private.bind_agent_attachments_to_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.agent_message_attachments a
  set run_id = new.id, conversation_id = new.conversation_id
  where a.created_by = new.requested_by and a.client_request_id = new.client_request_id
    and a.workspace_id = new.workspace_id and a.run_id is null;
  return new;
end;
$$;

revoke all on function private.bind_agent_attachments_to_run() from public, anon, authenticated, service_role;

create or replace trigger agent_runs_bind_attachments
  after insert on private.agent_runs
  for each row execute function private.bind_agent_attachments_to_run();

-- Subir um arquivo: com o JWT de quem pede, antes de o Storage ser tocado. O tipo é o que a função leu dos bytes.
create or replace function public.register_agent_attachment(
  p_workspace_id uuid,
  p_file_name text,
  p_mime text,
  p_size bigint,
  p_extracted_text text default null
) returns table (attachment_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := private.require_user();
  v_id uuid := gen_random_uuid();
  v_name text;
  v_path text;
begin
  perform private.require_active_membership(p_workspace_id);
  if p_mime is null or not (p_mime = any (private.agent_attachment_mime_types())) then
    raise exception 'attachment type not supported' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'attachment too large' using errcode = '22023';
  end if;
  -- Um teto de anexos soltos (subidos e ainda não enviados) por pessoa, para o bucket não virar depósito.
  if (select count(*) from private.agent_message_attachments a
      where a.created_by = v_user_id and a.run_id is null and a.created_at > now() - interval '1 day') >= 50 then
    raise exception 'too many pending attachments' using errcode = '22023';
  end if;
  v_name := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', '_', 'g')), 200);
  if v_name = '' then
    v_name := 'anexo';
  end if;
  v_path := 'conversas/' || p_workspace_id::text || '/' || v_id::text || '/arquivo';
  insert into private.agent_message_attachments (id, workspace_id, path, file_name, mime, size, extracted_text, created_by)
  values (v_id, p_workspace_id, v_path, v_name, p_mime, p_size, left(p_extracted_text, 20000), v_user_id);
  return query select v_id, v_path;
end;
$$;

create or replace function public.mark_agent_attachment_stored(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.agent_message_attachments set status = 'stored' where id = p_attachment_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.discard_pending_agent_attachment(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.agent_message_attachments where id = p_attachment_id and status = 'pending';
  return found;
end;
$$;

-- Reserva os anexos para um pedido, antes de ele ser guardado. Cada um tem de ser de quem pede, deste Workspace, já
-- guardado e ainda solto (ou já deste mesmo pedido, num reenvio). No máximo 5.
create or replace function public.reserve_agent_attachments(
  p_workspace_id uuid,
  p_client_request_id uuid,
  p_attachment_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_ids uuid[] := array(select distinct unnest(coalesce(p_attachment_ids, '{}')));
  v_found integer;
begin
  perform private.require_active_membership(p_workspace_id);
  if p_client_request_id is null then
    raise exception 'client request id required' using errcode = '22023';
  end if;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  if cardinality(v_ids) > 5 then
    raise exception 'too many attachments' using errcode = '22023';
  end if;
  perform 1 from private.agent_message_attachments a where a.id = any (v_ids) for update;
  select count(*) into v_found from private.agent_message_attachments a
  where a.id = any (v_ids) and a.created_by = v_user_id and a.workspace_id = p_workspace_id and a.status = 'stored'
    and a.run_id is null and (a.client_request_id is null or a.client_request_id = p_client_request_id);
  if v_found <> cardinality(v_ids) then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  update private.agent_message_attachments set client_request_id = p_client_request_id where id = any (v_ids);
  return v_found;
end;
$$;

-- Os anexos de uma Execução, para o motor: o texto dos documentos e o caminho das imagens.
create or replace function public.agent_run_attachments(p_run_id uuid)
returns table (id uuid, file_name text, mime text, size bigint, path text, extracted_text text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.file_name, a.mime, a.size, a.path, a.extracted_text
  from private.agent_message_attachments a
  where a.run_id = p_run_id and a.status = 'stored'
  order by a.created_at, a.id
$$;

-- Os anexos de cada pedido de uma Conversa, para a tela mostrar. Só quem começou a Conversa.
create or replace function public.list_agent_conversation_attachments(p_conversation_id uuid)
returns table (run_id uuid, id uuid, file_name text, mime text, size bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id from private.agent_conversations c
  where c.id = p_conversation_id and c.owner_id = v_user_id;
  if v_workspace_id is null then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_workspace_id);
  return query
    select a.run_id, a.id, a.file_name, a.mime, a.size
    from private.agent_message_attachments a
    where a.conversation_id = p_conversation_id and a.workspace_id = v_workspace_id and a.status = 'stored'
    order by a.created_at, a.id;
end;
$$;

-- O caminho de um anexo guardado, para a Edge Function assinar uma URL curta. Só quem subiu, com Participação ativa.
create or replace function public.get_agent_attachment_path(p_attachment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_row private.agent_message_attachments%rowtype;
begin
  select * into v_row from private.agent_message_attachments a where a.id = p_attachment_id and a.created_by = v_user_id;
  if v_row.id is null then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_row.workspace_id);
  if v_row.status <> 'stored' then
    raise exception 'attachment not stored' using errcode = 'P0002';
  end if;
  return v_row.path;
end;
$$;

-- Remove um anexo ainda solto (o "x" do composer). O arquivo sai do Storage pela fila.
create or replace function public.remove_agent_attachment(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  delete from private.agent_message_attachments a
  where a.id = p_attachment_id and a.created_by = v_user_id and a.run_id is null;
  return found;
end;
$$;

-- O Parar: quem pediu interrompe a própria Execução, que fecha como falha "cancelled", e os créditos fecham pelo que
-- já foi feito. O motor que ainda roda recebe "run is not running" no próximo passo e para.
create or replace function public.cancel_agent_run(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id and r.requested_by = v_user_id for update;
  if v_run.id is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_run.workspace_id);
  if v_run.status not in ('queued', 'running') then
    return false;
  end if;
  perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'cancelled'));
  update private.agent_runs
  set status = 'failed', error_code = 'cancelled', finished_at = clock_timestamp(),
    started_at = coalesce(started_at, clock_timestamp())
  where id = p_run_id;
  perform private.close_run_credits(p_run_id);
  return true;
end;
$$;

revoke all on function public.register_agent_attachment(uuid, text, text, bigint, text) from public, anon;
revoke all on function public.mark_agent_attachment_stored(uuid) from public, anon, authenticated;
revoke all on function public.discard_pending_agent_attachment(uuid) from public, anon, authenticated;
revoke all on function public.reserve_agent_attachments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.agent_run_attachments(uuid) from public, anon, authenticated;
revoke all on function public.list_agent_conversation_attachments(uuid) from public, anon;
revoke all on function public.get_agent_attachment_path(uuid) from public, anon;
revoke all on function public.remove_agent_attachment(uuid) from public, anon;
revoke all on function public.cancel_agent_run(uuid) from public, anon;
grant execute on function public.register_agent_attachment(uuid, text, text, bigint, text) to authenticated;
grant execute on function public.mark_agent_attachment_stored(uuid) to service_role;
grant execute on function public.discard_pending_agent_attachment(uuid) to service_role;
grant execute on function public.reserve_agent_attachments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.agent_run_attachments(uuid) to service_role;
grant execute on function public.list_agent_conversation_attachments(uuid) to authenticated;
grant execute on function public.get_agent_attachment_path(uuid) to authenticated;
grant execute on function public.remove_agent_attachment(uuid) to authenticated;
grant execute on function public.cancel_agent_run(uuid) to authenticated;
