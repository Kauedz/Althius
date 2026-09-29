-- Importação de Contas e Contatos por CSV (CRM-07).
-- O arquivo vai para o bucket privado csv-imports (só a Edge Function csv-import, com a chave de serviço, escreve e lê;
-- nenhuma política de Storage libera o navegador) e vira um lote durável, private.import_batches, com uma linha por
-- registro do arquivo em private.import_rows. O navegador nunca grava Conta, Contato ou Vínculo: só as funções abaixo,
-- com a Participação e o papel conferidos pelo auth.uid(), e a função do banco de cada linha.
--
-- Fluxo de um lote (status):
--   uploading  -> create_import_batch abriu o lote; a Edge Function guardou o arquivo e as linhas (service_role);
--   mapping    -> o arquivo foi lido: delimitador, cabeçalho e colunas conhecidos, com um mapeamento sugerido;
--   preview    -> preview_import_batch gravou o mapeamento e validou cada linha, com a prévia das correspondências;
--   processing -> confirm_import_batch exigiu as decisões e liberou o processamento;
--   completed  -> process_import_chunk processou a última linha pendente.
-- failed (o arquivo não pôde ser lido) e cancelled (a pessoa desistiu) encerram o lote sem afetar o Workspace.
--
-- Regras do CSV:
--   * URL e nome da empresa são obrigatórios; o nome do Contato é obrigatório quando a linha traz dado de Contato;
--     LinkedIn, telefone e e-mail podem faltar. A URL canônica identifica a Conta; o nome nunca identifica um Contato,
--     só e-mail, telefone ou LinkedIn.
--   * Campo vazio nunca apaga dado. Campo não vazio preenche o que está vazio e atualiza o que já existe conforme a
--     origem do campo (private.account_field_sources e contact_field_sources): o que uma pessoa escreveu no app
--     (origin manual) só é trocado se a pessoa confirmou "substituir dados corrigidos manualmente" no lote. O que veio
--     de importação ou de enriquecimento automático é atualizado. Campo sem origem registrada (anterior a esta
--     migration) é tratado como manual.
--   * Contato que já existe (mesmo e-mail, telefone ou LinkedIn) e ainda não tem Vínculo com a Conta da linha exige uma
--     decisão por linha: atualizar os dados, adicionar o Vínculo ou transferir o Vínculo (encerra os outros Vínculos
--     ativos do Contato). Nada disso acontece sem a decisão.
--   * A Conta nova nasce sob a responsabilidade de quem importa (private.create_imported_target_account, do CRM-06, que
--     grava a auditoria com o lote); a Conta que já existe só é atualizada por quem responde por ela, como no cadastro
--     manual. Contato: Administrador ou Vendedor responsável, como em create_contact/link_contact.
--   * O processamento é em blocos (process_import_chunk). Cada linha pendente é processada uma vez, numa subtransação:
--     uma falha marca só aquela linha, e chamar o bloco de novo nunca repete uma linha nem duplica Conta ou Contato.
--
-- Origem por campo: os gatilhos abaixo, em target_accounts e contacts, marcam como manual (pessoa no app) ou
-- automático (sem usuário: a recomendação da Althius) todo campo que muda fora da importação. A importação avisa que é
-- ela quem escreve com a configuração de transação althius.importacao_lote, e grava a própria origem.

-- O bucket privado do arquivo. Só existe onde o Storage existe (o banco do CI e o de teste local não têm storage-api).
-- Sem política em storage.objects: o Storage nega tudo ao navegador, e a Edge Function usa a chave de serviço.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('csv-imports', 'csv-imports', false, 5242880)
    on conflict (id) do nothing;
  end if;
end
$$;

create table private.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  file_name text not null check (btrim(file_name) <> '' and length(file_name) <= 255),
  file_size integer not null check (file_size between 1 and 5242880),
  storage_path text not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'mapping', 'preview', 'processing', 'completed', 'failed', 'cancelled')),
  delimiter text check (delimiter in (',', ';', E'\t', '|')),
  has_header boolean not null default true,
  -- O primeiro registro do arquivo (o do cabeçalho, quando houver) e os nomes das colunas.
  header_line integer,
  headers jsonb not null default '[]'::jsonb check (jsonb_typeof(headers) = 'array'),
  row_count integer not null default 0,
  -- {campo: índice da coluna}; ver private.import_fields.
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  replace_manual boolean not null default false,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  finished_at timestamptz,
  unique (workspace_id, id)
);

create index import_batches_workspace_idx on private.import_batches (workspace_id, created_at desc);

create table private.import_rows (
  batch_id uuid not null,
  workspace_id uuid not null,
  -- O número do registro no arquivo, contando os vazios: o que a pessoa vê numa planilha.
  line_number integer not null check (line_number >= 1),
  cells jsonb not null check (jsonb_typeof(cells) = 'array'),
  status text not null default 'pending'
    check (status in ('header', 'pending', 'invalid', 'created', 'updated', 'linked', 'skipped', 'failed')),
  -- Os valores mapeados e normalizados (URL canônica, e-mail, telefone e LinkedIn na forma de comparação).
  parsed jsonb not null default '{}'::jsonb,
  -- A prévia contra o banco: ação na Conta e no Contato, campos que mudam, conflitos e o que exige decisão.
  preview jsonb not null default '{}'::jsonb,
  decision text check (decision in ('update', 'link', 'transfer', 'skip')),
  -- Os erros da validação, ou, depois de processada, os motivos e observações da linha.
  error_codes text[] not null default '{}',
  error_detail text,
  -- {account, contact, changed[], preserved[]}
  outcome jsonb not null default '{}'::jsonb,
  target_account_id uuid,
  contact_id uuid,
  processed_at timestamptz,
  primary key (batch_id, line_number),
  foreign key (workspace_id, batch_id) references private.import_batches(workspace_id, id) on delete cascade,
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete set null (target_account_id),
  foreign key (workspace_id, contact_id)
    references public.contacts(workspace_id, id) on delete set null (contact_id)
);

create index import_rows_pending_idx on private.import_rows (batch_id, line_number) where status = 'pending';

-- A origem de cada campo: quem escreveu o valor que está lá. É o que decide se o CSV pode trocá-lo.
create table private.account_field_sources (
  workspace_id uuid not null,
  target_account_id uuid not null,
  field text not null check (field in ('name', 'legal_identifier', 'linkedin_url', 'segment')),
  origin text not null check (origin in ('manual', 'importacao', 'automatico')),
  -- O lote da importação que escreveu o campo.
  source_id uuid,
  observed_at timestamptz not null default now(),
  primary key (target_account_id, field),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade
);

create table private.contact_field_sources (
  workspace_id uuid not null,
  contact_id uuid not null,
  field text not null check (field in ('name', 'role', 'email', 'phone', 'linkedin')),
  origin text not null check (origin in ('manual', 'importacao', 'automatico')),
  source_id uuid,
  observed_at timestamptz not null default now(),
  primary key (contact_id, field),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

alter table private.import_batches enable row level security;
alter table private.import_rows enable row level security;
alter table private.account_field_sources enable row level security;
alter table private.contact_field_sources enable row level security;
revoke all on private.import_batches from public, anon, authenticated, service_role;
revoke all on private.import_rows from public, anon, authenticated, service_role;
revoke all on private.account_field_sources from public, anon, authenticated, service_role;
revoke all on private.contact_field_sources from public, anon, authenticated, service_role;

-- Os campos que uma coluna do CSV pode alimentar.
create function private.import_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'company_name', 'company_url', 'company_legal_identifier', 'company_linkedin', 'company_segment',
    'contact_name', 'contact_role', 'contact_email', 'contact_phone', 'contact_linkedin'
  ];
$$;

-- As conversões que recusam com exceção, em versão que devolve nulo: o valor inválido vira erro da linha.
create function private.try_canonical_company_url(p_url text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return private.canonical_company_url(p_url);
exception when others then
  return null;
end;
$$;

create function private.try_validate_email(p_email text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return private.validate_email(p_email);
exception when others then
  return null;
end;
$$;

create function private.try_normalize_whatsapp(p_phone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return private.normalize_whatsapp(p_phone);
exception when others then
  return null;
end;
$$;

-- O valor aparado de uma célula do registro, pelo campo mapeado; nulo se o campo não tem coluna ou a célula é vazia.
create function private.import_cell(p_cells jsonb, p_mapping jsonb, p_field text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_cells ->> (p_mapping ->> p_field)::integer), '')
  where p_mapping ? p_field;
$$;

revoke all on function private.import_fields() from public, anon, authenticated, service_role;
revoke all on function private.try_canonical_company_url(text) from public, anon, authenticated, service_role;
revoke all on function private.try_validate_email(text) from public, anon, authenticated, service_role;
revoke all on function private.try_normalize_whatsapp(text) from public, anon, authenticated, service_role;
revoke all on function private.import_cell(jsonb, jsonb, text) from public, anon, authenticated, service_role;

-- Origem por campo fora da importação: uma pessoa no app (auth.uid()) escreve como manual; sem usuário (a recomendação
-- da Althius, um processo do servidor), como automático. Só campo que ganhou valor ou mudou de valor conta. A
-- importação escreve a própria origem e avisa com althius.importacao_lote.
create function private.track_account_field_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text := case
    when tg_op = 'INSERT' and new.origin = 'manual' then 'manual'
    when tg_op = 'INSERT' then 'automatico'
    when auth.uid() is null then 'automatico'
    else 'manual' end;
  v_field text;
  v_new text;
begin
  if nullif(current_setting('althius.importacao_lote', true), '') is not null then
    return null;
  end if;
  foreach v_field in array array['name', 'legal_identifier', 'linkedin_url', 'segment'] loop
    v_new := to_jsonb(new) ->> v_field;
    if nullif(btrim(v_new), '') is not null
       and (tg_op = 'INSERT' or v_new is distinct from (to_jsonb(old) ->> v_field)) then
      insert into private.account_field_sources (workspace_id, target_account_id, field, origin)
      values (new.workspace_id, new.id, v_field, v_origin)
      on conflict (target_account_id, field)
      do update set origin = excluded.origin, source_id = null, observed_at = now();
    end if;
  end loop;
  return null;
end;
$$;

create function private.track_contact_field_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text := case when auth.uid() is null then 'automatico' else 'manual' end;
  v_field text;
  v_new text;
begin
  if nullif(current_setting('althius.importacao_lote', true), '') is not null then
    return null;
  end if;
  foreach v_field in array array['name', 'role', 'email', 'phone', 'linkedin'] loop
    v_new := to_jsonb(new) ->> v_field;
    if nullif(btrim(v_new), '') is not null
       and (tg_op = 'INSERT' or v_new is distinct from (to_jsonb(old) ->> v_field)) then
      insert into private.contact_field_sources (workspace_id, contact_id, field, origin)
      values (new.workspace_id, new.id, v_field, v_origin)
      on conflict (contact_id, field)
      do update set origin = excluded.origin, source_id = null, observed_at = now();
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.track_account_field_sources() from public, anon, authenticated, service_role;
revoke all on function private.track_contact_field_sources() from public, anon, authenticated, service_role;

create trigger target_accounts_field_sources
  after insert or update of name, legal_identifier, linkedin_url, segment on public.target_accounts
  for each row execute function private.track_account_field_sources();

create trigger contacts_field_sources
  after insert or update of name, role, email, phone, linkedin on public.contacts
  for each row execute function private.track_contact_field_sources();

-- O que o CSV muda numa Conta ou num Contato que já existe, campo a campo. p_current é a linha atual (to_jsonb) e
-- p_parsed, os valores da linha do arquivo. Devolve {apply: {campo: valor}, conflicts: [campo]}: apply é o que se grava
-- (campo vazio recebe o valor; campo preenchido só é trocado se a origem não é manual ou se o lote confirmou a
-- substituição); conflicts são os campos cujo valor manual foi preservado. Valor igual ao atual não é mudança.
create function private.plan_field_updates(
  p_entity text,
  p_id uuid,
  p_current jsonb,
  p_parsed jsonb,
  p_replace boolean
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_map text[][];
  v_pair text[];
  v_new text;
  v_cur text;
  v_origin text;
  v_apply jsonb := '{}'::jsonb;
  v_conflicts text[] := '{}';
begin
  v_map := case p_entity
    when 'account' then array[
      ['name', 'company_name'], ['legal_identifier', 'company_legal_identifier'],
      ['linkedin_url', 'company_linkedin'], ['segment', 'company_segment']]
    else array[
      ['name', 'contact_name'], ['role', 'contact_role'], ['email', 'contact_email'],
      ['phone', 'contact_phone'], ['linkedin', 'contact_linkedin']] end;
  foreach v_pair slice 1 in array v_map loop
    v_new := p_parsed ->> v_pair[2];
    if v_new is null then
      continue;
    end if;
    v_cur := nullif(btrim(p_current ->> v_pair[1]), '');
    if v_new is not distinct from v_cur then
      continue;
    end if;
    if v_cur is not null and not p_replace then
      if p_entity = 'account' then
        select s.origin into v_origin from private.account_field_sources s
        where s.target_account_id = p_id and s.field = v_pair[1];
      else
        select s.origin into v_origin from private.contact_field_sources s
        where s.contact_id = p_id and s.field = v_pair[1];
      end if;
      if coalesce(v_origin, 'manual') = 'manual' then
        v_conflicts := v_conflicts || v_pair[1];
        continue;
      end if;
    end if;
    v_apply := v_apply || jsonb_build_object(v_pair[1], v_new);
  end loop;
  return jsonb_build_object('apply', v_apply, 'conflicts', to_jsonb(v_conflicts));
end;
$$;

revoke all on function private.plan_field_updates(text, uuid, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;

-- Quem pode editar os dados de um Contato que já existe: Administrador ativo, ou o Vendedor responsável por todas as
-- Contas onde ele tem Vínculo ativo (e ao menos uma). É a regra de public.update_contact.
create function private.can_update_contact(p_workspace_id uuid, p_contact_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active and m.role = 'admin'
  ) or (
    exists (
      select 1 from public.contact_account_links l
      where l.contact_id = p_contact_id and l.ended_at is null
    ) and not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = p_contact_id and l.ended_at is null
        and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, p_user_id)
    )
  );
$$;

revoke all on function private.can_update_contact(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Valida o lote inteiro contra o mapeamento e o banco, e grava em cada linha os valores normalizados e a prévia.
-- Roda no preview e de novo na confirmação, então a prévia nunca é mais velha que a decisão de confirmar. Quem chama
-- já travou o lote. As decisões por linha continuam onde ainda fazem sentido.
create function private.validate_import_rows(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
  r record;
  v_errors text[];
  v_name text;
  v_url_raw text;
  v_url text;
  v_legal text;
  v_company_linkedin text;
  v_segment text;
  v_cname text;
  v_role text;
  v_email_raw text;
  v_email text;
  v_phone_raw text;
  v_phone text;
  v_linkedin_raw text;
  v_linkedin text;
  v_has_contact boolean;
  v_account public.target_accounts;
  v_owner uuid;
  v_plan jsonb;
  v_account_action text;
  v_account_changes text[];
  v_account_conflicts jsonb;
  v_account_id uuid;
  v_permitted boolean;
  v_matches uuid[];
  v_contact public.contacts;
  v_match text;
  v_linked boolean;
  v_dup_url text;
  v_dup_line integer;
  v_contact_plan jsonb;
  v_can_update boolean;
  v_can_transfer boolean;
  v_other_links jsonb;
  v_needs boolean;
  v_preview jsonb;
begin
  select * into b from private.import_batches where id = p_batch_id;

  update private.import_rows
  set status = case when b.has_header and line_number = b.header_line then 'header' else 'pending' end,
      parsed = '{}'::jsonb, preview = '{}'::jsonb, error_codes = '{}', error_detail = null
  where batch_id = p_batch_id;

  -- 1. Cada registro: valores normalizados e erros de formato.
  for r in
    select line_number, cells from private.import_rows
    where batch_id = p_batch_id and status = 'pending' order by line_number
  loop
    v_errors := '{}';
    v_name := private.import_cell(r.cells, b.mapping, 'company_name');
    v_url_raw := private.import_cell(r.cells, b.mapping, 'company_url');
    v_legal := private.import_cell(r.cells, b.mapping, 'company_legal_identifier');
    v_company_linkedin := private.import_cell(r.cells, b.mapping, 'company_linkedin');
    v_segment := private.import_cell(r.cells, b.mapping, 'company_segment');
    v_cname := private.import_cell(r.cells, b.mapping, 'contact_name');
    v_role := private.import_cell(r.cells, b.mapping, 'contact_role');
    v_email_raw := private.import_cell(r.cells, b.mapping, 'contact_email');
    v_phone_raw := private.import_cell(r.cells, b.mapping, 'contact_phone');
    v_linkedin_raw := private.import_cell(r.cells, b.mapping, 'contact_linkedin');
    v_url := private.try_canonical_company_url(v_url_raw);
    v_email := private.try_validate_email(v_email_raw);
    v_phone := private.try_normalize_whatsapp(v_phone_raw);
    v_linkedin := private.normalize_linkedin(v_linkedin_raw);
    v_has_contact := coalesce(v_cname, v_role, v_email_raw, v_phone_raw, v_linkedin_raw) is not null;

    if v_name is null then v_errors := v_errors || 'company_name_required'::text; end if;
    if v_url_raw is null then
      v_errors := v_errors || 'company_url_required'::text;
    elsif v_url is null then
      v_errors := v_errors || 'company_url_invalid'::text;
    end if;
    if v_has_contact then
      if v_cname is null then v_errors := v_errors || 'contact_name_required'::text; end if;
      if v_email_raw is not null and v_email is null then v_errors := v_errors || 'contact_email_invalid'::text; end if;
      if v_phone_raw is not null and v_phone is null then v_errors := v_errors || 'contact_phone_invalid'::text; end if;
    end if;
    if greatest(length(v_name), length(v_url_raw), length(v_legal), length(v_company_linkedin), length(v_segment),
                length(v_cname), length(v_role), length(v_email_raw), length(v_phone_raw), length(v_linkedin_raw)) > 500 then
      v_errors := v_errors || 'value_too_long'::text;
    end if;

    update private.import_rows set
      parsed = jsonb_strip_nulls(jsonb_build_object(
        'company_name', v_name, 'company_url', v_url, 'company_legal_identifier', v_legal,
        'company_linkedin', v_company_linkedin, 'company_segment', v_segment,
        'contact_name', v_cname, 'contact_role', v_role, 'contact_email', v_email,
        'contact_phone', v_phone, 'contact_linkedin', v_linkedin)),
      error_codes = v_errors,
      status = case when cardinality(v_errors) > 0 then 'invalid' else 'pending' end
    where batch_id = p_batch_id and line_number = r.line_number;
  end loop;

  -- 2. Repetições dentro do próprio arquivo: a mesma URL, ou o mesmo e-mail, telefone ou LinkedIn, numa linha anterior
  -- válida. A anterior é quem cria; esta atualiza (Conta) ou reencontra o Contato (que pode pedir decisão).
  with p as (
    select line_number,
      parsed ->> 'company_url' as u, parsed ->> 'contact_email' as e,
      parsed ->> 'contact_phone' as t, parsed ->> 'contact_linkedin' as l
    from private.import_rows where batch_id = p_batch_id and status = 'pending'
  ), w as (
    select line_number, u,
      case when u is not null then min(line_number) over (partition by u) end as first_u,
      case when e is not null then min(line_number) over (partition by e) end as fe,
      case when e is not null then first_value(u) over (partition by e order by line_number) end as ue,
      case when t is not null then min(line_number) over (partition by t) end as ft,
      case when t is not null then first_value(u) over (partition by t order by line_number) end as ut,
      case when l is not null then min(line_number) over (partition by l) end as fl,
      case when l is not null then first_value(u) over (partition by l order by line_number) end as ul
    from p
  )
  update private.import_rows ir set preview = jsonb_strip_nulls(jsonb_build_object(
    'dup_url_line', case when w.first_u < w.line_number then w.first_u end,
    'dup_contact_line', d.line, 'dup_contact_url', d.url))
  from w
  left join lateral (
    select v.line, v.url from (values (w.fe, w.ue), (w.ft, w.ut), (w.fl, w.ul)) v(line, url)
    where v.line < w.line_number order by v.line limit 1
  ) d on true
  where ir.batch_id = p_batch_id and ir.line_number = w.line_number;

  -- 3. A prévia de cada linha válida contra o banco.
  for r in
    select line_number, parsed, preview, decision from private.import_rows
    where batch_id = p_batch_id and status = 'pending' order by line_number
  loop
    v_preview := r.preview;
    v_account_id := null;
    v_account_changes := '{}';
    v_account_conflicts := '[]'::jsonb;
    v_permitted := true;
    v_errors := '{}';
    v_has_contact := r.parsed ? 'contact_name';

    select * into v_account from public.target_accounts a
    where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url';
    if found then
      v_account_id := v_account.id;
      select s.owner_user_id into v_owner from public.sales_responsibilities s
      where s.workspace_id = b.workspace_id and s.target_account_id = v_account.id::text;
      if v_owner is not distinct from b.created_by then
        v_account_action := 'update';
        v_plan := private.plan_field_updates('account', v_account.id, to_jsonb(v_account), r.parsed, b.replace_manual);
        v_account_changes := array(select jsonb_object_keys(v_plan -> 'apply'));
        v_account_conflicts := v_plan -> 'conflicts';
      else
        v_account_action := 'skip';
      end if;
      v_permitted := private.can_manage_account_contacts(b.workspace_id, v_account.id, b.created_by);
    else
      -- Nova, ou criada por uma linha anterior do arquivo.
      v_account_action := case when v_preview ? 'dup_url_line' then 'update' else 'create' end;
    end if;

    v_match := 'none';
    v_linked := false;
    v_can_update := true;
    v_can_transfer := v_permitted;
    v_other_links := '[]'::jsonb;
    v_contact_plan := jsonb_build_object('apply', '{}'::jsonb, 'conflicts', '[]'::jsonb);
    v_contact := null;

    if v_has_contact then
      select array_agg(distinct c.id) into v_matches from public.contacts c
      where c.workspace_id = b.workspace_id
        and (c.email = r.parsed ->> 'contact_email' or c.phone = r.parsed ->> 'contact_phone'
             or c.linkedin = r.parsed ->> 'contact_linkedin');
      if cardinality(v_matches) > 1 then
        v_errors := v_errors || 'contact_identity_conflict'::text;
      elsif cardinality(v_matches) = 1 then
        select * into v_contact from public.contacts c where c.id = v_matches[1];
        v_match := 'existing';
        v_linked := v_account_id is not null and exists (
          select 1 from public.contact_account_links l
          where l.contact_id = v_contact.id and l.target_account_id = v_account_id and l.ended_at is null);
        v_can_update := private.can_update_contact(b.workspace_id, v_contact.id, b.created_by);
        v_contact_plan := private.plan_field_updates(
          'contact', v_contact.id, to_jsonb(v_contact), r.parsed, b.replace_manual);
        select coalesce(jsonb_agg(jsonb_build_object('account_id', l.target_account_id, 'name', a.name)), '[]'::jsonb),
               coalesce(bool_and(private.can_manage_account_contacts(l.workspace_id, l.target_account_id, b.created_by)), true)
        into v_other_links, v_can_transfer
        from public.contact_account_links l
        join public.target_accounts a on a.workspace_id = l.workspace_id and a.id = l.target_account_id
        where l.contact_id = v_contact.id and l.ended_at is null
          and l.target_account_id is distinct from v_account_id;
        v_can_transfer := v_can_transfer and v_permitted;
      elsif v_preview ? 'dup_contact_line' then
        v_match := 'in_file';
        v_linked := (v_preview ->> 'dup_contact_url') = (r.parsed ->> 'company_url');
      end if;
    end if;

    v_needs := v_match <> 'none' and not v_linked and v_permitted;

    v_preview := v_preview || jsonb_strip_nulls(jsonb_build_object(
      'account_action', v_account_action,
      'account_id', v_account_id,
      'account_name', case when v_account_id is not null then v_account.name end,
      'account_changes', to_jsonb(v_account_changes),
      'account_conflicts', v_account_conflicts,
      'has_contact', v_has_contact,
      'contact_match', case when v_has_contact then v_match end,
      'contact_id', v_contact.id,
      'contact_name', v_contact.name,
      'contact_linked', case when v_has_contact then v_linked end,
      'contact_links', v_other_links,
      'contact_changes', array(select jsonb_object_keys(v_contact_plan -> 'apply')),
      'contact_conflicts', v_contact_plan -> 'conflicts',
      'contact_permitted', case when v_has_contact then v_permitted end,
      'contact_can_update', case when v_has_contact then v_can_update end,
      'can_transfer', case when v_has_contact then v_can_transfer end,
      'needs_decision', v_needs));

    update private.import_rows set
      preview = v_preview,
      error_codes = v_errors,
      status = case when cardinality(v_errors) > 0 then 'invalid' else 'pending' end,
      -- Uma decisão só vale enquanto a linha ainda precisa dela.
      decision = case when v_needs then decision end
    where batch_id = p_batch_id and line_number = r.line_number;
  end loop;

  update private.import_batches set
    row_count = (select count(*) from private.import_rows x where x.batch_id = p_batch_id and x.status <> 'header'),
    updated_at = now()
  where id = p_batch_id;
end;
$$;

revoke all on function private.validate_import_rows(uuid) from public, anon, authenticated, service_role;

-- O lote como o navegador o vê: os dados do lote, as contagens por resultado e, na prévia, o que a confirmação vai fazer.
create function private.import_batch_summary(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'workspace_id', b.workspace_id, 'created_by', b.created_by, 'is_mine', b.created_by = auth.uid(),
    'file_name', b.file_name, 'file_size', b.file_size, 'status', b.status, 'delimiter', b.delimiter,
    'has_header', b.has_header, 'headers', b.headers, 'row_count', b.row_count, 'mapping', b.mapping,
    'replace_manual', b.replace_manual, 'error_code', b.error_code, 'created_at', b.created_at,
    'confirmed_at', b.confirmed_at, 'finished_at', b.finished_at,
    'counts', jsonb_build_object(
      'total', b.row_count,
      'pending', count(*) filter (where r.status = 'pending'),
      'invalid', count(*) filter (where r.status = 'invalid'),
      'created', count(*) filter (where r.status = 'created'),
      'updated', count(*) filter (where r.status = 'updated'),
      'linked', count(*) filter (where r.status = 'linked'),
      'skipped', count(*) filter (where r.status = 'skipped'),
      'failed', count(*) filter (where r.status = 'failed')),
    'preview', jsonb_build_object(
      'account_create', count(*) filter (where r.status = 'pending' and r.preview ->> 'account_action' = 'create'),
      'account_update', count(*) filter (where r.status = 'pending' and r.preview ->> 'account_action' = 'update'),
      'account_skip', count(*) filter (where r.status = 'pending' and r.preview ->> 'account_action' = 'skip'),
      'contact_create', count(*) filter (where r.status = 'pending' and r.preview ->> 'contact_match' = 'none'),
      'contact_match', count(*) filter (where r.status = 'pending' and r.preview ->> 'contact_match' in ('existing', 'in_file')),
      'decisions_pending', count(*) filter (
        where r.status = 'pending' and r.preview ->> 'needs_decision' = 'true' and r.decision is null),
      'conflicts', count(*) filter (where r.status = 'pending' and (
        jsonb_array_length(coalesce(r.preview -> 'account_conflicts', '[]'::jsonb)) > 0
        or jsonb_array_length(coalesce(r.preview -> 'contact_conflicts', '[]'::jsonb)) > 0)))
  )
  from private.import_batches b
  left join private.import_rows r on r.batch_id = b.id and r.status <> 'header'
  where b.id = p_batch_id
  group by b.id;
$$;

revoke all on function private.import_batch_summary(uuid) from public, anon, authenticated, service_role;

-- O lote que quem chama pode ver: o dele, ou qualquer um do Workspace se for Administrador ativo. Para alterar, só o
-- dele (p_only_importer), e o lote fica travado até o fim da transação. Quem não participa recebe "não encontrado".
create function private.import_batch_for_caller(p_batch_id uuid, p_only_importer boolean, p_lock boolean)
returns private.import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_lock then
    select x.* into b from private.import_batches x
    join public.workspace_memberships m on m.workspace_id = x.workspace_id and m.user_id = auth.uid() and m.active
    where x.id = p_batch_id and (x.created_by = auth.uid() or (m.role = 'admin' and not p_only_importer))
    for update of x;
  else
    select x.* into b from private.import_batches x
    join public.workspace_memberships m on m.workspace_id = x.workspace_id and m.user_id = auth.uid() and m.active
    where x.id = p_batch_id and (x.created_by = auth.uid() or (m.role = 'admin' and not p_only_importer));
  end if;
  if not found then
    raise exception 'import batch not found' using errcode = 'P0002';
  end if;
  return b;
end;
$$;

revoke all on function private.import_batch_for_caller(uuid, boolean, boolean) from public, anon, authenticated, service_role;

-- Abre o lote de um arquivo. Quem chama é o participante ativo que importa; o caminho no bucket sai daqui, então nem
-- a Edge Function escolhe onde gravar.
create function public.create_import_batch(p_workspace_id uuid, p_file_name text, p_file_size integer)
returns table (batch_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if p_file_name is null or btrim(p_file_name) = '' then
    raise exception 'file name is required' using errcode = '22023';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 5242880 then
    raise exception 'file size must be between 1 byte and 5 MB' using errcode = '22023';
  end if;

  insert into private.import_batches (id, workspace_id, created_by, file_name, file_size, storage_path)
  values (v_id, p_workspace_id, auth.uid(), left(btrim(p_file_name), 255), p_file_size,
          p_workspace_id::text || '/' || v_id::text || '/arquivo.csv');
  return query select b.id, b.storage_path from private.import_batches b where b.id = v_id;
end;
$$;

revoke all on function public.create_import_batch(uuid, text, integer) from public, anon;
grant execute on function public.create_import_batch(uuid, text, integer) to authenticated;

-- A Edge Function guarda os registros lidos do arquivo, em blocos, com a chave de serviço. Repetir um bloco regrava as
-- mesmas linhas. p_rows é [{line, cells}], com as células como texto.
create function public.stage_import_rows(p_batch_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
begin
  select * into b from private.import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import batch not found' using errcode = 'P0002';
  end if;
  if b.status <> 'uploading' then
    raise exception 'import batch is not receiving rows' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;

  insert into private.import_rows (batch_id, workspace_id, line_number, cells)
  select b.id, b.workspace_id, (x ->> 'line')::integer, x -> 'cells'
  from jsonb_array_elements(p_rows) x
  on conflict (batch_id, line_number) do update set cells = excluded.cells;

  if (select count(*) from private.import_rows where batch_id = b.id) > 5001 then
    raise exception 'too many rows' using errcode = '54000';
  end if;
  return jsonb_array_length(p_rows);
end;
$$;

-- O arquivo foi lido por inteiro: o lote passa a esperar o mapeamento, com o sugerido.
create function public.finish_import_upload(
  p_batch_id uuid,
  p_delimiter text,
  p_has_header boolean,
  p_headers jsonb,
  p_mapping jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
  v_first integer;
  v_data integer;
begin
  select * into b from private.import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import batch not found' using errcode = 'P0002';
  end if;
  if b.status <> 'uploading' then
    raise exception 'import batch is not receiving rows' using errcode = '22023';
  end if;
  select min(line_number), count(*) into v_first, v_data from private.import_rows where batch_id = b.id;
  if v_first is null or v_data - p_has_header::integer < 1 then
    raise exception 'file has no data rows' using errcode = '22023';
  end if;

  update private.import_batches set
    status = 'mapping', delimiter = p_delimiter, has_header = p_has_header, header_line = v_first,
    headers = p_headers, mapping = coalesce(p_mapping, '{}'::jsonb),
    row_count = v_data - p_has_header::integer, updated_at = now()
  where id = b.id;
end;
$$;

-- O arquivo não pôde ser lido: o lote falha com o motivo, e os registros já guardados saem.
create function public.fail_import_upload(p_batch_id uuid, p_error_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.import_batches set status = 'failed', error_code = left(p_error_code, 60), updated_at = now(),
    finished_at = now()
  where id = p_batch_id and status = 'uploading';
  if found then
    delete from private.import_rows where batch_id = p_batch_id;
  end if;
end;
$$;

revoke all on function public.stage_import_rows(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_import_upload(uuid, text, boolean, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_import_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.stage_import_rows(uuid, jsonb) to service_role;
grant execute on function public.finish_import_upload(uuid, text, boolean, jsonb, jsonb) to service_role;
grant execute on function public.fail_import_upload(uuid, text) to service_role;

-- Grava o mapeamento das colunas, se a primeira linha é cabeçalho e se dados corrigidos à mão podem ser substituídos, e
-- valida o lote inteiro. Pode ser repetido enquanto o lote está em mapeamento ou prévia. Devolve o lote com a prévia.
create function public.preview_import_batch(
  p_batch_id uuid,
  p_mapping jsonb,
  p_has_header boolean default true,
  p_replace_manual boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, true, true);
  v_columns integer := jsonb_array_length(b.headers);
  v_key text;
  v_index integer;
begin
  if b.status not in ('mapping', 'preview') then
    raise exception 'import batch can no longer be mapped' using errcode = '22023';
  end if;
  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'mapping must be an object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_mapping) loop
    if not (v_key = any (private.import_fields())) then
      raise exception 'unknown import field %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_mapping -> v_key) <> 'number' then
      raise exception 'mapping must point to a column index' using errcode = '22023';
    end if;
    v_index := (p_mapping ->> v_key)::integer;
    if v_index < 0 or v_index >= v_columns then
      raise exception 'mapped column does not exist' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct p_mapping ->> k) from jsonb_object_keys(p_mapping) k) <> (select count(*) from jsonb_object_keys(p_mapping)) then
    raise exception 'a column can be mapped to one field only' using errcode = '22023';
  end if;
  if not (p_mapping ? 'company_name' and p_mapping ? 'company_url') then
    raise exception 'company name and company url columns are required' using errcode = '22023';
  end if;

  update private.import_batches set
    mapping = p_mapping, has_header = coalesce(p_has_header, true), replace_manual = coalesce(p_replace_manual, false),
    status = 'preview', updated_at = now()
  where id = b.id;
  perform private.validate_import_rows(b.id);
  return private.import_batch_summary(b.id);
end;
$$;

-- O lote e as contagens. Quem importou e o Administrador do Workspace consultam.
create function public.get_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, false, false);
begin
  return private.import_batch_summary(b.id);
end;
$$;

-- Os lotes recentes do Workspace: os de quem chama, e todos para o Administrador.
create function public.list_import_batches(p_workspace_id uuid)
returns table (
  batch_id uuid, file_name text, status text, row_count integer, created_by uuid, is_mine boolean,
  created_at timestamptz, finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select m.role into v_role from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.active;
  if not found then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
    select b.id, b.file_name, b.status, b.row_count, b.created_by, b.created_by = auth.uid(), b.created_at, b.finished_at
    from private.import_batches b
    where b.workspace_id = p_workspace_id and (b.created_by = auth.uid() or v_role = 'admin')
    order by b.created_at desc
    limit 20;
end;
$$;

-- Os registros do lote, em ordem, para a prévia e para o relatório. Filtros: all, invalid, decisions (esperam
-- decisão), conflicts (valor manual preservado) e problems (falhas, ignoradas com motivo e observações).
create function public.list_import_rows(
  p_batch_id uuid,
  p_filter text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  line_number integer, status text, cells jsonb, parsed jsonb, preview jsonb, decision text, error_codes text[],
  error_detail text, outcome jsonb, target_account_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, false, false);
begin
  if p_filter not in ('all', 'invalid', 'decisions', 'conflicts', 'problems') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  return query
    select r.line_number, r.status, r.cells, r.parsed, r.preview, r.decision, r.error_codes, r.error_detail, r.outcome,
      r.target_account_id
    from private.import_rows r
    where r.batch_id = b.id and r.status <> 'header'
      and case p_filter
        when 'invalid' then r.status = 'invalid'
        when 'decisions' then r.status = 'pending' and r.preview ->> 'needs_decision' = 'true'
        when 'conflicts' then r.status = 'pending' and (
          jsonb_array_length(coalesce(r.preview -> 'account_conflicts', '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(r.preview -> 'contact_conflicts', '[]'::jsonb)) > 0)
        when 'problems' then r.status in ('invalid', 'failed') or exists (
          select 1 from unnest(r.error_codes) c where c <> 'no_changes')
        else true end
    order by r.line_number
    limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- A decisão sobre o Contato que já existe: update (atualizar os dados), link (adicionar o Vínculo com a Conta da
-- linha), transfer (encerrar os outros Vínculos ativos e abrir este) ou skip (não mexer no Contato desta linha).
-- Sem p_line_numbers vale para todas as linhas que esperam decisão. Devolve quantas linhas mudaram: transfer não vale
-- onde quem importa não gerencia todos os Vínculos do Contato.
create function public.set_import_decisions(p_batch_id uuid, p_line_numbers integer[], p_decision text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, true, true);
  v_count integer;
begin
  if b.status <> 'preview' then
    raise exception 'import batch is not in preview' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('update', 'link', 'transfer', 'skip') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  update private.import_rows r set decision = p_decision
  where r.batch_id = b.id and r.status = 'pending' and r.preview ->> 'needs_decision' = 'true'
    and (p_line_numbers is null or r.line_number = any (p_line_numbers))
    and (p_decision <> 'transfer' or r.preview ->> 'can_transfer' = 'true')
    and r.decision is distinct from p_decision;
  get diagnostics v_count = row_count;
  update private.import_batches set updated_at = now() where id = b.id;
  return v_count;
end;
$$;

-- Confirma o lote: valida de novo (o banco pode ter mudado desde a prévia), exige a decisão de cada Contato que já
-- existe, marca as linhas inválidas como falhas e libera o processamento em blocos.
create function public.confirm_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, true, true);
begin
  if b.status <> 'preview' then
    raise exception 'import batch is not in preview' using errcode = '22023';
  end if;
  perform private.validate_import_rows(b.id);
  if exists (
    select 1 from private.import_rows r
    where r.batch_id = b.id and r.status = 'pending' and r.preview ->> 'needs_decision' = 'true' and r.decision is null
  ) then
    raise exception 'decisions are pending' using errcode = '22023';
  end if;
  if not exists (select 1 from private.import_rows r where r.batch_id = b.id and r.status = 'pending') then
    raise exception 'no valid rows to import' using errcode = '22023';
  end if;

  update private.import_rows set status = 'failed', processed_at = now()
  where batch_id = b.id and status = 'invalid';
  update private.import_batches set status = 'processing', confirmed_at = now(), updated_at = now() where id = b.id;
  return private.import_batch_summary(b.id);
end;
$$;

-- O lote desistido não afeta o Workspace, e os registros do arquivo saem.
create function public.cancel_import_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, true, true);
begin
  if b.status not in ('uploading', 'mapping', 'preview') then
    raise exception 'import batch can no longer be cancelled' using errcode = '22023';
  end if;
  delete from private.import_rows where batch_id = b.id;
  update private.import_batches set status = 'cancelled', updated_at = now(), finished_at = now() where id = b.id;
end;
$$;

-- Processa uma linha do lote e grava o resultado nela. O trabalho todo roda numa subtransação: uma falha desfaz o que a
-- linha tinha feito e a marca como falha, sem afetar as outras. Só processa linha pendente, então repetir é inofensivo.
create function private.process_import_row(p_batch_id uuid, p_line_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
  r private.import_rows;
  v_actor uuid;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_created boolean;
  v_owner uuid;
  v_plan jsonb;
  v_apply jsonb;
  v_account_result text := 'none';
  v_contact_result text := 'none';
  v_changed text[] := '{}';
  v_preserved text[] := '{}';
  v_reasons text[] := '{}';
  v_matches uuid[];
  v_linked boolean;
  v_effective text;
  v_status text;
  v_field text;
  v_code text;
begin
  select * into b from private.import_batches where id = p_batch_id;
  select * into r from private.import_rows
  where batch_id = p_batch_id and line_number = p_line_number and status = 'pending'
  for update;
  if not found then
    return;
  end if;
  v_actor := b.created_by;

  begin
    perform set_config('althius.importacao_lote', b.id::text, true);

    -- A Conta: nova, nascida com quem importa como responsável, ou a da mesma URL canônica.
    select * into v_account from public.target_accounts a
    where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url'
    for update;
    if not found then
      select c.created into v_created
      from private.create_imported_target_account(
        b.workspace_id, v_actor, b.id, r.parsed ->> 'company_name', r.parsed ->> 'company_url',
        r.parsed ->> 'company_legal_identifier', r.parsed ->> 'company_linkedin', r.parsed ->> 'company_segment') c;
      select * into v_account from public.target_accounts a
      where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url'
      for update;
      if v_created then
        insert into private.account_field_sources (workspace_id, target_account_id, field, origin, source_id)
        select v_account.workspace_id, v_account.id, f, 'importacao', b.id
        from unnest(array['name', 'legal_identifier', 'linkedin_url', 'segment']) f
        where nullif(btrim(to_jsonb(v_account) ->> f), '') is not null;
        v_account_result := 'created';
      end if;
    end if;

    if v_account_result <> 'created' then
      select s.owner_user_id into v_owner from public.sales_responsibilities s
      where s.workspace_id = b.workspace_id and s.target_account_id = v_account.id::text;
      if v_owner is distinct from v_actor then
        v_account_result := 'skipped';
        v_reasons := v_reasons || 'account_not_responsible'::text;
      else
        v_plan := private.plan_field_updates('account', v_account.id, to_jsonb(v_account), r.parsed, b.replace_manual);
        v_apply := v_plan -> 'apply';
        if v_apply = '{}'::jsonb then
          v_account_result := 'unchanged';
        else
          update public.target_accounts set
            name = coalesce(v_apply ->> 'name', name),
            legal_identifier = coalesce(v_apply ->> 'legal_identifier', legal_identifier),
            linkedin_url = coalesce(v_apply ->> 'linkedin_url', linkedin_url),
            segment = coalesce(v_apply ->> 'segment', segment),
            updated_at = now()
          where id = v_account.id;
          insert into private.account_field_sources (workspace_id, target_account_id, field, origin, source_id)
          select v_account.workspace_id, v_account.id, k, 'importacao', b.id from jsonb_object_keys(v_apply) k
          on conflict (target_account_id, field)
          do update set origin = 'importacao', source_id = excluded.source_id, observed_at = now();
          v_account_result := 'updated';
          v_changed := v_changed || array(select 'account.' || k from jsonb_object_keys(v_apply) k);
        end if;
        v_preserved := v_preserved || array(select 'account.' || jsonb_array_elements_text(v_plan -> 'conflicts'));
      end if;
    end if;

    -- O Contato, quando a linha traz dado de Contato. A identidade é e-mail, telefone ou LinkedIn; nunca o nome.
    if r.parsed ? 'contact_name' then
      select array_agg(distinct c.id) into v_matches from public.contacts c
      where c.workspace_id = b.workspace_id
        and (c.email = r.parsed ->> 'contact_email' or c.phone = r.parsed ->> 'contact_phone'
             or c.linkedin = r.parsed ->> 'contact_linkedin');
      if cardinality(v_matches) > 1 then
        raise exception 'contact identity matches more than one contact' using errcode = '22023';
      end if;

      if cardinality(v_matches) is null then
        if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor) then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'contact_not_permitted'::text;
        else
          insert into public.contacts (workspace_id, name, role, email, phone, linkedin, created_by)
          values (b.workspace_id, r.parsed ->> 'contact_name', r.parsed ->> 'contact_role',
                  r.parsed ->> 'contact_email', r.parsed ->> 'contact_phone', r.parsed ->> 'contact_linkedin', v_actor)
          returning * into v_contact;
          insert into private.contact_field_sources (workspace_id, contact_id, field, origin, source_id)
          select v_contact.workspace_id, v_contact.id, f, 'importacao', b.id
          from unnest(array['name', 'role', 'email', 'phone', 'linkedin']) f
          where nullif(btrim(to_jsonb(v_contact) ->> f), '') is not null;
          perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
          v_contact_result := 'created';
        end if;
      else
        select * into v_contact from public.contacts c where c.id = v_matches[1] for update;
        v_linked := exists (
          select 1 from public.contact_account_links l
          where l.contact_id = v_contact.id and l.target_account_id = v_account.id and l.ended_at is null);
        v_effective := case when v_linked then 'update' else r.decision end;

        if v_effective is null then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'decision_required'::text;
        elsif v_effective = 'skip' then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'contact_skipped_by_user'::text;
        elsif v_effective = 'update' then
          if not private.can_update_contact(b.workspace_id, v_contact.id, v_actor) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            v_plan := private.plan_field_updates('contact', v_contact.id, to_jsonb(v_contact), r.parsed, b.replace_manual);
            v_apply := v_plan -> 'apply';
            if v_apply = '{}'::jsonb then
              v_contact_result := 'unchanged';
            else
              update public.contacts set
                name = coalesce(v_apply ->> 'name', name),
                role = coalesce(v_apply ->> 'role', role),
                email = coalesce(v_apply ->> 'email', email),
                phone = coalesce(v_apply ->> 'phone', phone),
                linkedin = coalesce(v_apply ->> 'linkedin', linkedin),
                updated_at = now()
              where id = v_contact.id;
              insert into private.contact_field_sources (workspace_id, contact_id, field, origin, source_id)
              select v_contact.workspace_id, v_contact.id, k, 'importacao', b.id from jsonb_object_keys(v_apply) k
              on conflict (contact_id, field)
              do update set origin = 'importacao', source_id = excluded.source_id, observed_at = now();
              v_contact_result := 'updated';
              v_changed := v_changed || array(select 'contact.' || k from jsonb_object_keys(v_apply) k);
            end if;
            v_preserved := v_preserved || array(select 'contact.' || jsonb_array_elements_text(v_plan -> 'conflicts'));
          end if;
        elsif v_effective = 'link' then
          if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
            v_contact_result := 'linked';
          end if;
        else
          -- transfer: os Vínculos ativos com outras Contas terminam, e o Vínculo com esta Conta abre.
          if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor)
             or exists (
               select 1 from public.contact_account_links l
               where l.contact_id = v_contact.id and l.ended_at is null and l.target_account_id <> v_account.id
                 and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, v_actor)) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            update public.contact_account_links set ended_at = greatest(now(), started_at)
            where contact_id = v_contact.id and ended_at is null and target_account_id <> v_account.id;
            perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
            v_contact_result := 'transferred';
          end if;
        end if;
      end if;
    end if;

    perform set_config('althius.importacao_lote', '', true);

    v_status := case
      when 'created' in (v_account_result, v_contact_result) then 'created'
      when v_contact_result in ('linked', 'transferred') then 'linked'
      when 'updated' in (v_account_result, v_contact_result) then 'updated'
      else 'skipped' end;
    if v_status = 'skipped' and cardinality(v_reasons) = 0 then
      v_reasons := array['no_changes'];
    end if;

    update private.import_rows set
      status = v_status, error_codes = v_reasons, processed_at = now(),
      outcome = jsonb_build_object(
        'account', v_account_result, 'contact', v_contact_result,
        'changed', to_jsonb(v_changed), 'preserved', to_jsonb(v_preserved)),
      target_account_id = v_account.id, contact_id = v_contact.id
    where batch_id = p_batch_id and line_number = p_line_number;
  exception when others then
    -- A subtransação desfez o que a linha tinha escrito; a configuração volta com ela, mas não custa garantir.
    perform set_config('althius.importacao_lote', '', true);
    v_code := case
      when sqlerrm like '%more than one contact%' then 'contact_identity_conflict'
      when sqlstate = '23505' then 'duplicate_identity'
      when sqlstate = '42501' then 'not_permitted'
      else 'unexpected_error' end;
    update private.import_rows set
      status = 'failed', error_codes = array[v_code], error_detail = left(sqlerrm, 300), processed_at = now(),
      outcome = '{}'::jsonb
    where batch_id = p_batch_id and line_number = p_line_number;
  end;
end;
$$;

revoke all on function private.process_import_row(uuid, integer) from public, anon, authenticated, service_role;

-- Processa as próximas linhas pendentes do lote confirmado. Devolve o lote com as contagens; quando não sobra linha
-- pendente, o lote termina. Pode ser chamado de novo a qualquer momento, inclusive depois de uma interrupção ou de o
-- lote terminar: cada linha é processada uma só vez, e o lote fica travado enquanto um bloco roda.
create function public.process_import_chunk(p_batch_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, true, true);
  v_line integer;
begin
  if b.status = 'completed' then
    return private.import_batch_summary(b.id);
  end if;
  if b.status <> 'processing' then
    raise exception 'import batch is not processing' using errcode = '22023';
  end if;

  for v_line in
    select r.line_number from private.import_rows r
    where r.batch_id = b.id and r.status = 'pending'
    order by r.line_number
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    perform private.process_import_row(b.id, v_line);
  end loop;

  if not exists (select 1 from private.import_rows r where r.batch_id = b.id and r.status = 'pending') then
    update private.import_batches set status = 'completed', finished_at = now(), updated_at = now() where id = b.id;
  else
    update private.import_batches set updated_at = now() where id = b.id;
  end if;
  return private.import_batch_summary(b.id);
end;
$$;

-- As Contas que este lote criou e que o Administrador ainda pode distribuir (public.distribute_imported_target_accounts):
-- do lote, ainda com quem importou, sem outra atribuição, sem Sequência e dentro das 24 horas da importação.
create function public.list_import_distributable_accounts(p_batch_id uuid)
returns table (
  target_account_id uuid, line_number integer, account_name text, owner_user_id uuid, distributable_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b private.import_batches := private.import_batch_for_caller(p_batch_id, false, false);
begin
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = b.workspace_id and m.user_id = auth.uid() and m.active and m.role = 'admin'
  ) then
    raise exception 'only administrators can distribute imported target accounts' using errcode = '42501';
  end if;
  return query
    select a.id, r.line_number, a.name, s.owner_user_id, e.created_at + interval '24 hours'
    from private.import_rows r
    join public.target_accounts a on a.workspace_id = r.workspace_id and a.id = r.target_account_id
    join public.sales_responsibilities s on s.workspace_id = a.workspace_id and s.target_account_id = a.id::text
    join private.account_assignment_events e
      on e.workspace_id = a.workspace_id and e.target_account_id = a.id::text
     and e.origin = 'importacao' and e.import_batch_id = b.id
    where r.batch_id = b.id and r.outcome ->> 'account' = 'created' and a.origin = 'importacao'
      and e.created_at > now() - interval '24 hours'
      and not exists (
        select 1 from private.account_assignment_events x
        where x.workspace_id = a.workspace_id and x.target_account_id = a.id::text and x.origin <> 'importacao')
      and not exists (
        select 1 from public.sequences q
        where q.workspace_id = a.workspace_id and q.target_account_id = a.id::text)
    order by r.line_number;
end;
$$;

revoke all on function public.preview_import_batch(uuid, jsonb, boolean, boolean) from public, anon;
revoke all on function public.get_import_batch(uuid) from public, anon;
revoke all on function public.list_import_batches(uuid) from public, anon;
revoke all on function public.list_import_rows(uuid, text, integer, integer) from public, anon;
revoke all on function public.set_import_decisions(uuid, integer[], text) from public, anon;
revoke all on function public.confirm_import_batch(uuid) from public, anon;
revoke all on function public.cancel_import_batch(uuid) from public, anon;
revoke all on function public.process_import_chunk(uuid, integer) from public, anon;
revoke all on function public.list_import_distributable_accounts(uuid) from public, anon;
grant execute on function public.preview_import_batch(uuid, jsonb, boolean, boolean) to authenticated;
grant execute on function public.get_import_batch(uuid) to authenticated;
grant execute on function public.list_import_batches(uuid) to authenticated;
grant execute on function public.list_import_rows(uuid, text, integer, integer) to authenticated;
grant execute on function public.set_import_decisions(uuid, integer[], text) to authenticated;
grant execute on function public.confirm_import_batch(uuid) to authenticated;
grant execute on function public.cancel_import_batch(uuid) to authenticated;
grant execute on function public.process_import_chunk(uuid, integer) to authenticated;
grant execute on function public.list_import_distributable_accounts(uuid) to authenticated;
