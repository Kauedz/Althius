-- Arquivar e apagar Contas-alvo e Contatos com privacidade (CRM-18).
--
-- Arquivar é reversível e tira o registro da operação: a Conta-alvo arquivada some das listas e buscas padrão, pausa a
-- Sequência (as primitivas do CRM-17) e não recebe Interação manual, Vínculo novo nem Sequência nova; o Contato
-- arquivado tem os Vínculos ativos encerrados (o que já barra os passos dele: `contact_unlinked`) e volta com eles
-- quando restaurado. O histórico fica.
--
-- Apagar definitivamente é outra ação, só do Administrador e com o nome do registro digitado como confirmação:
--   * Contato: a linha some (Vínculos, foto e consultas de foto vão junto pela cascata). O que era dele fora do
--     cadastro é apagado ou desidentificado: respostas recebidas (e a fila de exclusão dos anexos no Storage), o
--     Destino e o conteúdo dos Envios do passo, os passos dele no documento e na autorização das Sequências e a cópia
--     da tabela antiga de Contatos (canais-02);
--   * Conta-alvo: a linha fica como marcador (`deleted_at`), sem nenhum dado da empresa, para as Interações continuarem
--     ligadas a algo. As Sequências dela são encerradas (CRM-17) e o que guardavam é apagado: documento privado, cópia
--     da autorização, Envios, respostas e anexos. Os Contatos que só existiam nela são apagados como acima; os que
--     também atuam em outra Conta perdem só o Vínculo com esta. As Interações ficam, sem o Contato.
-- O marcador não aparece a ninguém (a política de leitura o esconde) e nunca mais muda: nenhum retry, resposta
-- atrasada da Unipile ou escrita antiga devolve dado pessoal a ele nem aos Envios já desidentificados.
--
-- Eventos comerciais preservados: Interações (tipo, data, origem e quem registrou), a Sequência encerrada com o resumo
-- público (só contagens), a responsabilidade e o histórico de atribuição (só ids de usuários), a contagem do que foi
-- preenchido por recomendação e os Envios (estado, tentativas e datas, sem destino, conteúdo nem id do provedor).
--
-- Auditoria: private.data_lifecycle_events guarda quem, o quê, em qual registro e o resultado, só com ids e números.
-- Nunca recebe nome, e-mail, telefone, URL nem a confirmação digitada. Uma repetição que não muda nada não grava
-- evento: a auditoria conta efeitos, e a resposta "já apagado" sai desse mesmo histórico.
--
-- Concorrência. Cada Conta e cada Contato tem uma trava consultiva (advisory) própria: quem arquiva, restaura ou apaga
-- toma a trava exclusiva, sempre primeiro e na ordem Conta, Contatos; quem grava algo novo que dependa do registro
-- (Sequência, Vínculo, Interação manual) toma a trava compartilhada SEM esperar e desiste com 55P03, em vez de se
-- enfileirar atrás de quem apaga (evita impasse com as travas de linha, que seguem a ordem de sempre: Sequência,
-- depois Envios, depois Conta). Duas solicitações iguais se serializam pela trava: a segunda relê o estado e sai sem
-- efeito.
--
-- Pontos de extensão para o que ainda não existe nesta base. A importação por CSV (CRM-07: import_batches,
-- import_rows, account_field_sources, contact_field_sources e o bucket csv-imports), os Sinais (CRM-10 e CRM-11) e os
-- Agentes (CRM-13) redefinem, com `create or replace` numa migration própria, private.erase_account_extensions e
-- private.erase_contact_extensions, chamadas no fim de cada apagamento, e usam private.storage_purge_queue para os
-- arquivos. Nada aqui os referencia.

-- 1. Estados.
alter table public.target_accounts
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column deleted_at timestamptz;

alter table public.target_accounts
  add constraint target_accounts_archive_consistency check (archived_by is null or archived_at is not null);

alter table public.contacts
  add column archived_at timestamptz,
  add column archived_by uuid;

alter table public.contacts
  add constraint contacts_archive_consistency check (archived_by is null or archived_at is not null);

-- Por que um Vínculo terminou, quando não foi a pessoa que o encerrou: o arquivamento do Contato, para a restauração
-- saber quais reabrir.
alter table public.contact_account_links
  add column ended_reason text check (ended_reason in ('contact_archived'));

create index target_accounts_archived_idx on public.target_accounts (workspace_id)
  where archived_at is not null and deleted_at is null;
create index contacts_archived_idx on public.contacts (workspace_id) where archived_at is not null;
create index contact_account_links_archived_idx on public.contact_account_links (contact_id)
  where ended_reason is not null;

-- Um Envio desidentificado perde o Contato e o Destino, e o resultado do provedor que chegar depois nunca os devolve.
alter table private.sequence_step_sends
  alter column contact_id drop not null,
  alter column destination drop not null,
  add column anonymized_at timestamptz;

-- A Conta apagada não aparece a ninguém: o marcador só existe para as Interações e as Sequências encerradas.
drop policy "active members read target accounts" on public.target_accounts;
create policy "active members read target accounts"
  on public.target_accounts for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_accounts.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

-- 2. Auditoria: só ids e números.
create table private.data_lifecycle_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Sem chave estrangeira de propósito: é histórico, e o registro apagado nem existe mais.
  actor_user_id uuid not null,
  action text not null check (action in ('archive', 'restore', 'erase')),
  subject_kind text not null check (subject_kind in ('account', 'contact')),
  subject_id uuid not null,
  result text not null check (result in ('done')),
  -- O que a operação fez, em números. Nunca texto: nada de nome, e-mail, telefone ou URL.
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(counts) = 'object')
);

create index data_lifecycle_events_subject_idx
  on private.data_lifecycle_events (subject_kind, subject_id, action);
create index data_lifecycle_events_workspace_idx on private.data_lifecycle_events (workspace_id, id);

alter table private.data_lifecycle_events enable row level security;
revoke all on private.data_lifecycle_events from public, anon, authenticated, service_role;

comment on table private.data_lifecycle_events is
  'Audit of archive, restore and permanent deletion of target accounts and contacts: who, what, which record and the '
  'result, with counts only. It never holds a name, e-mail, phone, URL or the typed confirmation.';

-- 3. Arquivos do Storage a apagar. O banco só enfileira o prefixo; quem apaga é a Edge Function storage-purge, porque
-- o Storage não deixa remover o arquivo por SQL. A entrada leva o prefixo e nada mais (nunca o nome do arquivo).
create table private.storage_purge_queue (
  id bigint generated always as identity primary key,
  bucket text not null check (btrim(bucket) <> ''),
  prefix text not null check (prefix like '%/' and btrim(prefix) <> '/'),
  -- Uma segunda passada horas depois pega o anexo que um download em andamento gravou depois da primeira.
  run_after timestamptz not null default now(),
  claimed_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index storage_purge_queue_due_idx on private.storage_purge_queue (run_after) where done_at is null;

alter table private.storage_purge_queue enable row level security;
revoke all on private.storage_purge_queue from public, anon, authenticated, service_role;

create table private.storage_purge_settings (
  singleton boolean primary key default true check (singleton),
  function_url text,
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

insert into private.storage_purge_settings default values;

alter table private.storage_purge_settings enable row level security;
revoke all on private.storage_purge_settings from public, anon, authenticated, service_role;

-- 4. As travas.
-- 'exclusive' espera (quem arquiva, restaura ou apaga); 'shared' não espera e desiste com 55P03 (quem só grava algo
-- que depende do registro). A trava é da sessão e vale até o fim da transação, e uma sessão nunca trava contra si.
create function private.take_subject_lock(p_kind text, p_id uuid, p_mode text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_key bigint := hashtextextended(p_kind || ':' || p_id::text, 0);
begin
  if p_mode = 'exclusive' then
    perform pg_advisory_xact_lock(v_key);
  elsif not pg_try_advisory_xact_lock_shared(v_key) then
    raise exception 'the record is being archived or erased, try again' using errcode = '55P03';
  end if;
end;
$$;

revoke all on function private.take_subject_lock(text, uuid, text) from public, anon, authenticated, service_role;

-- A Conta-alvo aceita escrita nova? Arquivada ou apagada, não.
create function private.assert_account_operable(p_workspace_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.target_accounts;
begin
  perform private.take_subject_lock('account', p_account_id, 'shared');
  select a.* into v_account from public.target_accounts a
  where a.id = p_account_id and a.workspace_id = p_workspace_id;
  if not found then
    return;
  end if;
  if v_account.deleted_at is not null then
    raise exception 'the target account was deleted' using errcode = '55006';
  end if;
  if v_account.archived_at is not null then
    raise exception 'the target account is archived' using errcode = '55006';
  end if;
end;
$$;

create function private.assert_contact_operable(p_workspace_id uuid, p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.take_subject_lock('contact', p_contact_id, 'shared');
  if exists (
    select 1 from public.contacts c
    where c.id = p_contact_id and c.workspace_id = p_workspace_id and c.archived_at is not null
  ) then
    raise exception 'the contact is archived' using errcode = '55006';
  end if;
end;
$$;

revoke all on function private.assert_account_operable(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.assert_contact_operable(uuid, uuid) from public, anon, authenticated, service_role;

-- 5. As regras no próprio banco, valem para qualquer caminho de escrita (as funções do Contato e da Conta são de outro
-- desenvolvimento e não mudam: quem barra é o gatilho).
--   * Sequência nova só numa Conta que aceita escrita;
--   * Vínculo novo só entre Contato e Conta que aceitam escrita;
--   * Interação manual só numa Conta (e Contato) que aceitam escrita. As do envio e da resposta (source 'sequencia')
--     passam: o resultado de um envio em voo não se perde por causa do arquivamento;
--   * a Conta apagada não muda mais, salvo a data da última Interação e o autor do arquivamento (que uma exclusão de
--     usuário zera): nada devolve dado pessoal ao marcador.
create function private.guard_sequence_account_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_account_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.assert_account_operable(new.workspace_id, new.target_account_id::uuid);
  end if;
  return new;
end;
$$;

create function private.guard_link_subjects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_account_operable(new.workspace_id, new.target_account_id);
  perform private.assert_contact_operable(new.workspace_id, new.contact_id);
  return new;
end;
$$;

create function private.guard_interaction_subjects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'manual' then
    perform private.assert_account_operable(new.workspace_id, new.target_account_id);
    if new.contact_id is not null then
      perform private.assert_contact_operable(new.workspace_id, new.contact_id);
    end if;
  end if;
  return new;
end;
$$;

create function private.guard_deleted_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null
     and (to_jsonb(new) - '{last_interaction_at,archived_by,updated_at}'::text[])
       is distinct from (to_jsonb(old) - '{last_interaction_at,archived_by,updated_at}'::text[]) then
    raise exception 'a deleted target account cannot change' using errcode = '55006';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sequence_account_state() from public, anon, authenticated, service_role;
revoke all on function private.guard_link_subjects() from public, anon, authenticated, service_role;
revoke all on function private.guard_interaction_subjects() from public, anon, authenticated, service_role;
revoke all on function private.guard_deleted_account() from public, anon, authenticated, service_role;

create trigger sequences_guard_account_state
  before insert on public.sequences
  for each row execute function private.guard_sequence_account_state();

create trigger contact_account_links_guard_subjects
  before insert on public.contact_account_links
  for each row execute function private.guard_link_subjects();

create trigger account_interactions_guard_subjects
  before insert on public.account_interactions
  for each row execute function private.guard_interaction_subjects();

create trigger target_accounts_guard_deleted
  before update on public.target_accounts
  for each row execute function private.guard_deleted_account();

-- O documento privado de uma Sequência cuja Conta foi apagada não volta a receber conteúdo (o titular antigo ainda
-- poderia chamar update_owned_sequence).
create function private.guard_document_of_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sequences q
    join public.target_accounts a on a.workspace_id = q.workspace_id and a.id::text = q.target_account_id
    where q.id = new.sequence_id and a.deleted_at is not null
  ) then
    raise exception 'an ended sequence cannot be changed' using errcode = '55006';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_document_of_deleted_account() from public, anon, authenticated, service_role;

create trigger sequence_documents_guard_deleted_account
  before update on private.sequence_documents
  for each row execute function private.guard_document_of_deleted_account();

-- Um Envio já desidentificado continua sem Contato, Destino, conteúdo, ids do provedor e erro, seja qual for a escrita
-- que chegar (o resultado do provedor, o eco do e-mail, uma reconfirmação): o estado e as datas seguem, o resto não.
create function private.keep_send_anonymized()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anonymized_at is not null then
    new.anonymized_at := old.anonymized_at;
    new.contact_id := null;
    new.destination := null;
    new.subject := null;
    new.body := null;
    new.provider_email_id := null;
    new.provider_message_id := null;
    new.provider_thread_id := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_send_anonymized() from public, anon, authenticated, service_role;

create trigger sequence_step_sends_keep_anonymized
  before update on private.sequence_step_sends
  for each row execute function private.keep_send_anonymized();

-- 6. Pontos de extensão do apagamento (ver o cabeçalho). Vazios nesta base.
create function private.erase_account_extensions(p_workspace_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;

create function private.erase_contact_extensions(p_workspace_id uuid, p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;

revoke all on function private.erase_account_extensions(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.erase_contact_extensions(uuid, uuid) from public, anon, authenticated, service_role;

-- 7. Peças do apagamento.
-- O documento sem o Contato: os passos dele e o id dele na lista de participantes. O resto não muda.
create function private.strip_contact_from_document(p_document jsonb, p_contact_id uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_document) <> 'object' then p_document else
    p_document
    || case when jsonb_typeof(p_document -> 'steps') = 'array' then jsonb_build_object('steps', coalesce((
         select jsonb_agg(t.step order by t.n)
         from jsonb_array_elements(p_document -> 'steps') with ordinality as t(step, n)
         where t.step ->> 'contatoId' is distinct from p_contact_id::text), '[]'::jsonb))
       else '{}'::jsonb end
    || case when jsonb_typeof(p_document -> 'participantesIds') = 'array' then jsonb_build_object('participantesIds', coalesce((
         select jsonb_agg(t.id order by t.n)
         from jsonb_array_elements(p_document -> 'participantesIds') with ordinality as t(id, n)
         where t.id #>> '{}' is distinct from p_contact_id::text), '[]'::jsonb))
       else '{}'::jsonb end
  end;
$$;

revoke all on function private.strip_contact_from_document(jsonb, uuid) from public, anon, authenticated, service_role;

-- As respostas recebidas que serão apagadas: enfileira a pasta dos anexos no Storage (duas passadas), desliga do evento
-- da Unipile o id do e-mail no provedor e apaga o conteúdo. p_sequence_ids e p_contact_id escolhem o que sai: as
-- respostas dessas Sequências, ou as do Contato (pelo id ou pelo e-mail dele). Devolve quantas apagou.
create function private.erase_received_emails(
  p_workspace_id uuid, p_sequence_ids uuid[], p_contact_id uuid, p_contact_email text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(r.interaction_id), '{}') into v_ids
  from private.received_emails r
  where r.workspace_id = p_workspace_id
    and (r.sequence_id = any (p_sequence_ids)
      or r.contact_id = p_contact_id
      or (p_contact_email is not null and lower(r.from_email) = lower(p_contact_email)));

  insert into private.storage_purge_queue (bucket, prefix, run_after)
  select 'email-attachments', 'recebidos/' || r.interaction_id::text || '/', t.quando
  from private.received_emails r
  cross join (values (now()), (now() + interval '1 hour')) as t(quando)
  where r.interaction_id = any (v_ids) and jsonb_array_length(r.attachments) > 0;

  update private.unipile_email_events e set send_id = null, provider_email_id = null
  where e.interaction_id = any (v_ids)
     or e.send_id in (select r.send_id from private.received_emails r where r.interaction_id = any (v_ids));

  delete from private.received_emails r where r.interaction_id = any (v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.erase_received_emails(uuid, uuid[], uuid, text) from public, anon, authenticated, service_role;

-- Desidentifica os Envios escolhidos: o que não saiu é cancelado, e todos perdem Contato, Destino, assunto, corpo, ids
-- do provedor e erro. Estado, tentativas e datas ficam (evento comercial sem pessoa). Também solta dos eventos da
-- Unipile os ids do provedor desses Envios. Devolve quantos Envios mudou.
create function private.anonymize_sends(p_workspace_id uuid, p_sequence_ids uuid[], p_contact_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.unipile_email_events ev set send_id = null, provider_email_id = null
  where ev.send_id in (
    select e.id from private.sequence_step_sends e
    where e.workspace_id = p_workspace_id and (e.sequence_id = any (p_sequence_ids) or e.contact_id = p_contact_id));

  update private.sequence_step_sends e set
    status = case when private.send_is_cancellable(e.status) then 'cancelled' else e.status end,
    scheduled_for = case when private.send_is_cancellable(e.status) then null else e.scheduled_for end,
    claimed_until = case when private.send_is_cancellable(e.status) then null else e.claimed_until end,
    contact_id = null, destination = null, subject = null, body = null,
    provider_email_id = null, provider_message_id = null, provider_thread_id = null,
    last_error = null, anonymized_at = coalesce(e.anonymized_at, now()), updated_at = now()
  where e.workspace_id = p_workspace_id
    and (e.sequence_id = any (p_sequence_ids) or e.contact_id = p_contact_id)
    and (e.anonymized_at is null or e.contact_id is not null or e.destination is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.anonymize_sends(uuid, uuid[], uuid) from public, anon, authenticated, service_role;

-- Apaga os dados pessoais de um Contato, sem conferir quem chama nem confirmação (quem chama já fez as duas coisas e
-- tem as travas do Contato). Devolve o que fez, em números. Um Contato que não existe (já apagado) devolve zeros.
create function private.erase_contact_data(p_workspace_id uuid, p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts;
  v_sequence_ids uuid[];
  v_cleaned uuid[];
  v_id uuid;
  v_emails integer := 0;
  v_sends integer := 0;
  v_documents integer := 0;
  v_legacy integer := 0;
  v_links integer := 0;
begin
  select c.* into v_contact from public.contacts c
  where c.id = p_contact_id and c.workspace_id = p_workspace_id;
  if not found then
    return jsonb_build_object('contacts_erased', 0);
  end if;

  -- As Sequências em que ele aparece: por Envio, por resposta ou pelo id dentro do documento.
  select coalesce(array_agg(x.id order by x.id), '{}') into v_sequence_ids
  from (
    select e.sequence_id as id from private.sequence_step_sends e
      where e.workspace_id = p_workspace_id and e.contact_id = p_contact_id
    union
    select r.sequence_id from private.received_emails r
      where r.workspace_id = p_workspace_id and r.contact_id = p_contact_id
    union
    select d.sequence_id from private.sequence_documents d
      join public.sequences q on q.id = d.sequence_id
      where q.workspace_id = p_workspace_id and position(p_contact_id::text in d.document::text) > 0
    union
    select a.sequence_id from private.sequence_authorizations a
      join public.sequences q on q.id = a.sequence_id
      where q.workspace_id = p_workspace_id and position(p_contact_id::text in a.document::text) > 0
  ) x;

  -- Sequência antes dos Envios, na ordem de sempre.
  perform 1 from public.sequences q where q.id = any (v_sequence_ids) order by q.id for update;

  -- As respostas das Sequências inteiras ficam, só as do Contato saem: por isso o filtro de Sequência vai vazio aqui.
  v_emails := private.erase_received_emails(p_workspace_id, '{}', p_contact_id, v_contact.email);
  v_sends := private.anonymize_sends(p_workspace_id, '{}', p_contact_id);

  with limpos as (
    update private.sequence_documents d set
      document = private.strip_contact_from_document(d.document, p_contact_id), updated_at = now()
    where d.sequence_id = any (v_sequence_ids) and position(p_contact_id::text in d.document::text) > 0
    returning d.sequence_id
  )
  select coalesce(array_agg(l.sequence_id), '{}') into v_cleaned from limpos l;
  v_documents := cardinality(v_cleaned);
  update private.sequence_authorizations a set
    document = private.strip_contact_from_document(a.document, p_contact_id)
  where a.sequence_id = any (v_sequence_ids) and position(p_contact_id::text in a.document::text) > 0;

  -- O resumo público acompanha as contagens do documento; e um passo cancelado não trava a fila dos outros.
  update public.sequences q set
    public_summary = q.public_summary || jsonb_build_object(
      'totalSteps', jsonb_array_length(case when jsonb_typeof(d.document -> 'steps') = 'array'
        then d.document -> 'steps' else '[]'::jsonb end),
      'totalParticipantes', jsonb_array_length(case when jsonb_typeof(d.document -> 'participantesIds') = 'array'
        then d.document -> 'participantesIds' else '[]'::jsonb end)),
    updated_at = now()
  from private.sequence_documents d
  where d.sequence_id = q.id and q.id = any (v_cleaned) and q.status <> 'encerrada';
  for v_id in select q.id from public.sequences q where q.id = any (v_sequence_ids) and q.status = 'ativa' order by q.id loop
    perform private.schedule_next_step(v_id, coalesce(
      (select max(e.sent_at) from private.sequence_step_sends e where e.sequence_id = v_id), private.clock_now()));
  end loop;

  -- A cópia da tabela antiga de Contatos (canais-02): pelo id, ou por um destino igual ao dele.
  delete from private.target_contacts_canais02 t
  where t.workspace_id = p_workspace_id
    and (t.id = p_contact_id::text
      or (v_contact.email is not null and lower(t.email) = lower(v_contact.email))
      or (v_contact.phone is not null and t.whatsapp = v_contact.phone)
      or (v_contact.linkedin is not null and t.linkedin_identity = v_contact.linkedin));
  get diagnostics v_legacy = row_count;

  select count(*) into v_links from public.contact_account_links l where l.contact_id = p_contact_id;
  perform private.erase_contact_extensions(p_workspace_id, p_contact_id);

  -- Vínculos, foto e consultas de foto saem pela cascata; as Interações perdem só o Contato.
  delete from public.contacts c where c.id = p_contact_id and c.workspace_id = p_workspace_id;

  return jsonb_build_object(
    'contacts_erased', 1, 'links_removed', v_links, 'received_emails_erased', v_emails, 'sends_anonymized', v_sends,
    'documents_cleaned', v_documents, 'legacy_rows_erased', v_legacy);
end;
$$;

revoke all on function private.erase_contact_data(uuid, uuid) from public, anon, authenticated, service_role;

-- 8. Arquivar e restaurar a Conta-alvo. O Vendedor responsável ou um Administrador; a Sequência é pausada pelas
-- primitivas do CRM-17 e restaurar só a destrava (retomar é ação explícita do responsável).
create function public.archive_target_account(p_target_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_account public.target_accounts;
  v_paused integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Quem não participa do Workspace da Conta recebe a mesma resposta de uma Conta que não existe.
  select a.workspace_id into v_workspace_id from public.target_accounts a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('account', p_target_account_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  select a.* into v_account from public.target_accounts a where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if v_role <> 'admin' and not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_workspace_id and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'only the responsible seller or an administrator can archive this target account'
      using errcode = '42501';
  end if;
  if v_account.archived_at is not null then
    return jsonb_build_object('result', 'already_archived');
  end if;

  -- A Sequência primeiro (trava da Sequência, depois dos Envios), a Conta por último.
  v_paused := private.pause_sequences_of_archived_account(v_workspace_id, p_target_account_id);
  update public.target_accounts set archived_at = now(), archived_by = v_user_id, updated_at = now()
  where id = p_target_account_id;

  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'archive', 'account', p_target_account_id, 'done',
    jsonb_build_object('sequences_paused', v_paused));
  return jsonb_build_object('result', 'archived', 'sequences_paused', v_paused);
end;
$$;

create function public.restore_target_account(p_target_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_account public.target_accounts;
  v_unblocked integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.workspace_id into v_workspace_id from public.target_accounts a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('account', p_target_account_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  select a.* into v_account from public.target_accounts a where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if v_role <> 'admin' and not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_workspace_id and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'only the responsible seller or an administrator can restore this target account'
      using errcode = '42501';
  end if;
  if v_account.archived_at is null then
    return jsonb_build_object('result', 'not_archived');
  end if;

  update public.target_accounts set archived_at = null, archived_by = null, updated_at = now()
  where id = p_target_account_id;
  v_unblocked := private.unblock_sequences_of_restored_account(v_workspace_id, p_target_account_id);

  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'restore', 'account', p_target_account_id, 'done',
    jsonb_build_object('sequences_unblocked', v_unblocked));
  return jsonb_build_object('result', 'restored', 'sequences_unblocked', v_unblocked);
end;
$$;

revoke all on function public.archive_target_account(uuid) from public, anon;
revoke all on function public.restore_target_account(uuid) from public, anon;
grant execute on function public.archive_target_account(uuid) to authenticated;
grant execute on function public.restore_target_account(uuid) to authenticated;

-- 9. Arquivar e restaurar o Contato. Administrador, ou o Vendedor responsável por todas as Contas em que ele atua
-- (a mesma regra de editar o Contato). Arquivar encerra os Vínculos ativos, marcados como do arquivamento; restaurar
-- reabre, como Vínculos novos, os que o arquivamento encerrou e cujas Contas ainda aceitam escrita.
create function public.archive_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_contact public.contacts;
  v_ended integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select c.workspace_id into v_workspace_id from public.contacts c
  join public.workspace_memberships m on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('contact', p_contact_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  select c.* into v_contact from public.contacts c where c.id = p_contact_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  -- Repetir não muda nada, e o estado já é público a todo participante: a resposta não pede permissão.
  if v_contact.archived_at is not null then
    return jsonb_build_object('result', 'already_archived');
  end if;
  if v_role <> 'admin' and (
    not exists (select 1 from public.contact_account_links l where l.contact_id = p_contact_id and l.ended_at is null)
    or exists (
      select 1 from public.contact_account_links l
      where l.contact_id = p_contact_id and l.ended_at is null
        and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, v_user_id))
  ) then
    raise exception 'only the responsible seller or an administrator can archive this contact' using errcode = '42501';
  end if;

  update public.contact_account_links set ended_at = greatest(now(), started_at), ended_reason = 'contact_archived'
  where contact_id = p_contact_id and ended_at is null;
  get diagnostics v_ended = row_count;
  update public.contacts set archived_at = now(), archived_by = v_user_id, updated_at = now() where id = p_contact_id;

  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'archive', 'contact', p_contact_id, 'done',
    jsonb_build_object('links_ended', v_ended));
  return jsonb_build_object('result', 'archived', 'links_ended', v_ended);
end;
$$;

create function public.restore_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_contact public.contacts;
  v_link record;
  v_reopened integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select c.workspace_id into v_workspace_id from public.contacts c
  join public.workspace_memberships m on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('contact', p_contact_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  select c.* into v_contact from public.contacts c where c.id = p_contact_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if v_contact.archived_at is null then
    return jsonb_build_object('result', 'not_archived');
  end if;
  -- Quem arquivou restaura; senão, a mesma regra de arquivar, sobre as Contas dos Vínculos que o arquivamento encerrou.
  if v_role <> 'admin' and v_contact.archived_by is distinct from v_user_id and (
    not exists (select 1 from public.contact_account_links l where l.contact_id = p_contact_id and l.ended_reason is not null)
    or exists (
      select 1 from public.contact_account_links l
      where l.contact_id = p_contact_id and l.ended_reason is not null
        and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, v_user_id))
  ) then
    raise exception 'only the responsible seller or an administrator can restore this contact' using errcode = '42501';
  end if;

  update public.contacts set archived_at = null, archived_by = null, updated_at = now() where id = p_contact_id;
  for v_link in
    select distinct l.target_account_id from public.contact_account_links l
    where l.contact_id = p_contact_id and l.ended_reason = 'contact_archived'
    order by l.target_account_id
  loop
    if exists (
      select 1 from public.target_accounts a
      where a.id = v_link.target_account_id and a.archived_at is null and a.deleted_at is null
    ) then
      perform private.open_contact_link(v_workspace_id, p_contact_id, v_link.target_account_id, v_user_id);
      v_reopened := v_reopened + 1;
    end if;
  end loop;
  -- O marcador cumpriu o papel: um novo arquivamento só reabre o que ele mesmo encerrar.
  update public.contact_account_links set ended_reason = null where contact_id = p_contact_id and ended_reason is not null;

  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'restore', 'contact', p_contact_id, 'done',
    jsonb_build_object('links_reopened', v_reopened));
  return jsonb_build_object('result', 'restored', 'links_reopened', v_reopened);
end;
$$;

revoke all on function public.archive_contact(uuid) from public, anon;
revoke all on function public.restore_contact(uuid) from public, anon;
grant execute on function public.archive_contact(uuid) to authenticated;
grant execute on function public.restore_contact(uuid) to authenticated;

-- 10. Apagar o Contato definitivamente. Só o Administrador, com o nome do Contato como confirmação. Repetir depois de
-- apagado responde "already_erased" (pelo histórico da auditoria, só a Administradores do mesmo Workspace) e não muda
-- nada.
create function public.erase_contact(p_contact_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_contact public.contacts;
  v_counts jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select c.workspace_id into v_workspace_id from public.contacts c
  join public.workspace_memberships m on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id;
  if not found then
    -- Já apagado? Só quem administra o Workspace onde ele foi apagado sabe.
    select e.workspace_id into v_workspace_id from private.data_lifecycle_events e
    join public.workspace_memberships m
      on m.workspace_id = e.workspace_id and m.user_id = v_user_id and m.active and m.role = 'admin'
    where e.subject_kind = 'contact' and e.subject_id = p_contact_id and e.action = 'erase'
    limit 1;
    if found then
      return jsonb_build_object('result', 'already_erased');
    end if;
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('contact', p_contact_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  if v_role <> 'admin' then
    raise exception 'only administrators can permanently delete a contact' using errcode = '42501';
  end if;
  -- Outra solicitação igual pode ter terminado enquanto esta esperava a trava.
  select c.* into v_contact from public.contacts c where c.id = p_contact_id;
  if not found then
    return jsonb_build_object('result', 'already_erased');
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(btrim(v_contact.name)) then
    raise exception 'the confirmation does not match the contact name' using errcode = '22023';
  end if;

  v_counts := private.erase_contact_data(v_workspace_id, p_contact_id);
  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'erase', 'contact', p_contact_id, 'done', v_counts);
  return jsonb_build_object('result', 'erased') || v_counts;
end;
$$;

revoke all on function public.erase_contact(uuid, text) from public, anon;
grant execute on function public.erase_contact(uuid, text) to authenticated;

-- 11. Apagar a Conta-alvo definitivamente. Só o Administrador, com o nome da Conta como confirmação.
-- Ordem: travas (Conta, depois os Contatos que só existiam nela), Sequências (encerra, depois apaga o que guardavam),
-- Contatos, Vínculos, Interações e, por último, o marcador. Uma falha desfaz tudo: a operação é uma transação só.
create function public.erase_target_account(p_target_account_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_account public.target_accounts;
  v_contact_ids uuid[];
  v_kept integer;
  v_contact_id uuid;
  v_sequence_ids uuid[];
  v_ended integer;
  v_emails integer;
  v_sends integer;
  v_legacy integer;
  v_interactions integer;
  v_erased jsonb;
  v_contacts_erased integer := 0;
  v_counts jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.workspace_id into v_workspace_id from public.target_accounts a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('account', p_target_account_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  if v_role <> 'admin' then
    raise exception 'only administrators can permanently delete a target account' using errcode = '42501';
  end if;
  select a.* into v_account from public.target_accounts a where a.id = p_target_account_id;
  if v_account.deleted_at is not null then
    return jsonb_build_object('result', 'already_erased');
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(btrim(v_account.name)) then
    raise exception 'the confirmation does not match the target account name' using errcode = '22023';
  end if;

  -- Os Contatos que só existiam nesta Conta (nenhum Vínculo, ativo ou encerrado, com outra). Travas em ordem de id.
  select coalesce(array_agg(x.contact_id order by x.contact_id), '{}') into v_contact_ids
  from (select distinct l.contact_id from public.contact_account_links l where l.target_account_id = p_target_account_id) x
  where not exists (
    select 1 from public.contact_account_links o
    where o.contact_id = x.contact_id and o.target_account_id <> p_target_account_id);
  select count(distinct l.contact_id) into v_kept from public.contact_account_links l
  where l.target_account_id = p_target_account_id and l.contact_id <> all (v_contact_ids);
  foreach v_contact_id in array v_contact_ids loop
    perform private.take_subject_lock('contact', v_contact_id, 'exclusive');
  end loop;

  -- As Sequências da Conta, de qualquer estado: a Sequência antes dos Envios, na ordem de sempre.
  select coalesce(array_agg(q.id order by q.id), '{}') into v_sequence_ids
  from public.sequences q
  where q.workspace_id = v_workspace_id and q.target_account_id = p_target_account_id::text;
  perform 1 from public.sequences q where q.id = any (v_sequence_ids) order by q.id for update;

  v_ended := private.end_sequences_of_deleted_account(v_workspace_id, p_target_account_id);
  v_emails := private.erase_received_emails(v_workspace_id, v_sequence_ids, null, null);
  v_sends := private.anonymize_sends(v_workspace_id, v_sequence_ids, null);
  update private.sequence_documents set document = '{}'::jsonb, updated_at = now()
  where sequence_id = any (v_sequence_ids) and document <> '{}'::jsonb;
  update private.sequence_authorizations set document = '{}'::jsonb
  where sequence_id = any (v_sequence_ids) and document <> '{}'::jsonb;

  delete from private.target_contacts_canais02 t
  where t.workspace_id = v_workspace_id and t.target_account_id = p_target_account_id::text;
  get diagnostics v_legacy = row_count;

  -- Os Contatos exclusivos saem por inteiro; os demais perdem só o Vínculo com esta Conta.
  foreach v_contact_id in array v_contact_ids loop
    v_erased := private.erase_contact_data(v_workspace_id, v_contact_id);
    v_contacts_erased := v_contacts_erased + coalesce((v_erased ->> 'contacts_erased')::integer, 0);
  end loop;
  delete from public.contact_account_links l where l.target_account_id = p_target_account_id;
  update public.account_interactions i set contact_id = null
  where i.target_account_id = p_target_account_id and i.contact_id is not null;
  get diagnostics v_interactions = row_count;

  perform private.erase_account_extensions(v_workspace_id, p_target_account_id);

  -- O marcador, por último: sem nome, URL, domínio, identificador legal, LinkedIn nem segmento. A URL de mentira é
  -- única por Conta e não aponta para empresa nenhuma; a URL real fica livre para um cadastro novo.
  update public.target_accounts set
    name = 'Conta apagada', canonical_url = 'https://conta-apagada.invalid/' || id::text, domain = 'conta-apagada.invalid',
    legal_identifier = null, linkedin_url = null, segment = null, deleted_at = now(), updated_at = now()
  where id = p_target_account_id;

  v_counts := jsonb_build_object(
    'sequences_ended', v_ended, 'received_emails_erased', v_emails, 'sends_anonymized', v_sends,
    'legacy_rows_erased', v_legacy, 'contacts_erased', v_contacts_erased, 'contacts_kept', v_kept,
    'interactions_detached', v_interactions);
  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'erase', 'account', p_target_account_id, 'done', v_counts);
  return jsonb_build_object('result', 'erased') || v_counts;
end;
$$;

revoke all on function public.erase_target_account(uuid, text) from public, anon;
grant execute on function public.erase_target_account(uuid, text) to authenticated;

-- 12. A auditoria, para os Administradores do Workspace.
create function public.list_data_lifecycle_events(p_workspace_id uuid, p_limit integer default 100)
returns table (
  action text, subject_kind text, subject_id uuid, actor_user_id uuid, result text, counts jsonb, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.active and m.role = 'admin'
  ) then
    raise exception 'only administrators can read the audit history' using errcode = '42501';
  end if;
  return query
    select e.action, e.subject_kind, e.subject_id, e.actor_user_id, e.result, e.counts, e.created_at
    from private.data_lifecycle_events e
    where e.workspace_id = p_workspace_id
    order by e.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.list_data_lifecycle_events(uuid, integer) from public, anon;
grant execute on function public.list_data_lifecycle_events(uuid, integer) to authenticated;

-- 13. A fila do Storage. A Edge Function storage-purge reserva as entradas vencidas, apaga a pasta pela API do Storage
-- e dá baixa. Como o Executor da Sequência: o banco chama a função com um token que só ele guarda, e o endereço da
-- função é o único passo manual (private.configure_storage_purge, no SQL Editor, uma vez por projeto).
create function public.storage_purge_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.storage_purge_settings s
    where length(coalesce(p_token, '')) >= 32 and s.token = p_token);
$$;

revoke all on function public.storage_purge_token_matches(text) from public, anon, authenticated;
grant execute on function public.storage_purge_token_matches(text) to service_role;

-- Reserva por 10 minutos as pastas vencidas que ainda não foram apagadas. Desiste depois de 20 tentativas.
create function public.claim_storage_purge(p_limit integer default 10)
returns table (id bigint, bucket text, prefix text)
language sql
security definer
set search_path = ''
as $$
  update private.storage_purge_queue q set claimed_until = now() + interval '10 minutes', attempts = q.attempts + 1
  where q.id in (
    select x.id from private.storage_purge_queue x
    where x.done_at is null and x.run_after <= now() and x.attempts < 20
      and (x.claimed_until is null or x.claimed_until < now())
    order by x.run_after, x.id
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked)
  returning q.id, q.bucket, q.prefix;
$$;

-- Dá baixa (sem erro) ou registra o erro e libera para a próxima passada. Devolve se a entrada existia.
create function public.finish_storage_purge(p_id bigint, p_error text default null)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with feito as (
    update private.storage_purge_queue q set
      done_at = case when p_error is null then now() end,
      last_error = left(p_error, 300),
      claimed_until = null
    where q.id = p_id and q.done_at is null
    returning 1)
  select exists (select 1 from feito);
$$;

revoke all on function public.claim_storage_purge(integer) from public, anon, authenticated;
revoke all on function public.finish_storage_purge(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_storage_purge(integer) to service_role;
grant execute on function public.finish_storage_purge(bigint, text) to service_role;

create function private.configure_storage_purge(p_project_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(p_project_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/?$' then
    raise exception 'project url must look like https://<ref>.supabase.co' using errcode = '22023';
  end if;
  v_url := regexp_replace(p_project_url, '/$', '') || '/functions/v1/storage-purge';
  update private.storage_purge_settings set function_url = v_url, updated_at = now();
  return v_url;
end;
$$;

revoke all on function private.configure_storage_purge(text) from public, anon, authenticated, service_role;

-- A chamada HTTP em si, separada para os testes a trocarem dentro da transação.
create function private.post_to_storage_purge(p_url text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := p_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-purge-token', p_token),
    timeout_milliseconds := 5000);
end;
$$;

revoke all on function private.post_to_storage_purge(text, text) from public, anon, authenticated, service_role;

-- O que o pg_cron roda: chama a função só quando há pasta vencida a apagar. Devolve se chamou.
create function private.kick_storage_purge()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.storage_purge_settings;
begin
  select s.* into v_settings from private.storage_purge_settings s;
  if v_settings.function_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.storage_purge_queue q
    where q.done_at is null and q.run_after <= now() and q.attempts < 20
      and (q.claimed_until is null or q.claimed_until < now())) then
    return false;
  end if;
  perform private.post_to_storage_purge(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.kick_storage_purge() from public, anon, authenticated, service_role;

-- O relógio, como no Executor da Sequência: onde não há pg_cron e pg_net, a fila só não é esvaziada sozinha.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-storage-purge', '*/5 * * * *', 'select private.kick_storage_purge()');
  end if;
end
$cron$;

comment on column public.target_accounts.deleted_at is
  'Set when the target account was permanently deleted: the row stays only as a marker without company data, hidden by RLS.';
comment on column public.target_accounts.archived_at is
  'Set while the target account is archived: out of the default lists and searches, history kept.';
comment on column public.contacts.archived_at is
  'Set while the contact is archived: its active links were ended (ended_reason contact_archived) and come back on restore.';
comment on column private.sequence_step_sends.anonymized_at is
  'Set when the contact or the target account of the send was permanently deleted: contact, destination, content and '
  'provider ids are gone and stay gone.';
