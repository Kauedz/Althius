-- Ticket 08: template próprio, privado do criador neste Workspace.
-- Não é biblioteca compartilhada. Não reutiliza o catálogo da Althius nem dados de Sequência como catálogo público.
-- Salvar só persiste a prévia já parametrizada: sem ID, destino, histórico, resposta, evidência ou autorização.

create table private.own_sequence_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  owner_user_id uuid not null references auth.users (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  resumo text not null check (length(btrim(resumo)) between 1 and 300),
  passos jsonb not null check (
    jsonb_typeof(passos) = 'array'
    and jsonb_array_length(passos) between 1 and 8
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index own_sequence_templates_owner_idx
  on private.own_sequence_templates (workspace_id, owner_user_id);

alter table private.own_sequence_templates enable row level security;

revoke all on private.own_sequence_templates from public, anon, authenticated, service_role;

-- Mesmo que alguém ganhe grant depois, só o criador lê a própria linha. Escrita só pela RPC.
create policy own_sequence_templates_owner_read
  on private.own_sequence_templates
  for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = own_sequence_templates.workspace_id
        and m.user_id = (select auth.uid())
        and m.active
    )
  );

comment on table private.own_sequence_templates is
  'Template próprio do criador no Workspace. Não é biblioteca compartilhada e não autoriza envio.';

create function private.own_template_text(p_text text, p_literals jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
  v_item jsonb;
  v_nome text;
  v_empresa text;
  v_cargo text;
  v_email text;
begin
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '{{email}}', 'g');
  v := regexp_replace(
    v,
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
    '',
    'g'
  );
  v := regexp_replace(v, '[0-9]{2}[[:space:]]+[0-9]{4,5}-[0-9]{4}', '', 'g');
  v := regexp_replace(v, '\([0-9]{2}\)[[:space:]]*[0-9]{4,5}-[0-9]{4}', '', 'g');
  v := regexp_replace(v, '[0-9]{8,15}', '', 'g');
  if jsonb_typeof(coalesce(p_literals, '[]'::jsonb)) = 'array' then
    for v_item in select value from jsonb_array_elements(p_literals) loop
      v_nome := btrim(coalesce(v_item ->> 'nome', ''));
      v_empresa := btrim(coalesce(v_item ->> 'empresa', ''));
      v_cargo := btrim(coalesce(v_item ->> 'cargo', ''));
      v_email := btrim(coalesce(v_item ->> 'email', ''));
      if length(v_nome) >= 3 then
        v := replace(v, v_nome, '{{nome}}');
      end if;
      if length(v_empresa) >= 3 then
        v := replace(v, v_empresa, '{{empresa}}');
      end if;
      if length(v_cargo) >= 3 then
        v := replace(v, v_cargo, '{{cargo}}');
      end if;
      if length(v_email) >= 3 then
        v := replace(v, v_email, '{{email}}');
      end if;
    end loop;
  end if;
  v := regexp_replace(btrim(v), '[[:space:]]{2,}', ' ', 'g');
  return btrim(v);
end;
$$;

revoke all on function private.own_template_text(text, jsonb) from public, anon, authenticated, service_role;

create function private.own_template_steps(p_steps jsonb, p_literals jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_passo jsonb;
  v_out jsonb := '[]'::jsonb;
  v_map jsonb := '{}'::jsonb;
  v_id text;
  v_new text;
  v_ordem int;
  v_n int := 0;
  v_obj jsonb;
  v_pred text;
  v_lib text;
  v_titulo text;
  v_extra text;
begin
  if jsonb_typeof(coalesce(p_steps, 'null'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_passo in select value from jsonb_array_elements(p_steps) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_passo) <> 'object' then
      continue;
    end if;
    if coalesce(v_passo ->> 'canal', '') not in ('email', 'linkedin', 'whatsapp') then
      continue;
    end if;
    if nullif(btrim(coalesce(v_passo ->> 'titulo', '')), '') is null then
      continue;
    end if;
    v_ordem := coalesce((v_passo ->> 'ordem')::int, v_n);
    v_id := nullif(btrim(coalesce(v_passo ->> 'id', '')), '');
    if v_id is null or v_id ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
      v_new := 'passo-' || v_ordem::text;
    else
      v_new := v_id;
    end if;
    if v_id is not null then
      v_map := v_map || jsonb_build_object(v_id, v_new);
    end if;
  end loop;

  v_n := 0;
  for v_passo in select value from jsonb_array_elements(p_steps) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_passo) <> 'object' then
      continue;
    end if;
    if coalesce(v_passo ->> 'canal', '') not in ('email', 'linkedin', 'whatsapp') then
      continue;
    end if;
    v_titulo := private.own_template_text(v_passo ->> 'titulo', p_literals);
    if v_titulo = '' then
      continue;
    end if;
    v_ordem := coalesce((v_passo ->> 'ordem')::int, v_n);
    v_id := nullif(btrim(coalesce(v_passo ->> 'id', '')), '');
    v_new := case
      when v_id is not null and v_map ? v_id then v_map ->> v_id
      else 'passo-' || v_ordem::text
    end;
    v_obj := jsonb_build_object(
      'id', v_new,
      'ordem', v_ordem,
      'canal', v_passo ->> 'canal',
      'delayDiasUteis', coalesce((v_passo ->> 'delayDiasUteis')::int, 0),
      'titulo', v_titulo
    );
    foreach v_extra in array array['assunto', 'corpo', 'objetivo'] loop
      if nullif(private.own_template_text(v_passo ->> v_extra, p_literals), '') is not null then
        v_obj := v_obj || jsonb_build_object(v_extra, private.own_template_text(v_passo ->> v_extra, p_literals));
      end if;
    end loop;
    v_lib := v_passo ->> 'liberacao';
    if v_lib in ('ativacao', 'predecessor', 'manual') then
      v_obj := v_obj || jsonb_build_object('liberacao', v_lib);
    end if;
    v_pred := v_passo ->> 'predecessorId';
    if v_pred is not null and v_map ? v_pred and v_lib = 'predecessor' then
      v_obj := v_obj || jsonb_build_object('predecessorId', v_map ->> v_pred);
    end if;
    v_out := v_out || jsonb_build_array(v_obj);
  end loop;
  return v_out;
end;
$$;

revoke all on function private.own_template_steps(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Limites aplicados no servidor, não só na tela. A entrada crua é medida antes da sanitização por regex.
create function private.own_template_limits(p_nome text, p_resumo text, p_passos jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_passo jsonb;
begin
  if length(coalesce(p_nome, '')) > 200
     or length(coalesce(p_resumo, '')) > 1000
     or length(coalesce(p_passos::text, '')) > 65536
  then
    raise exception 'own template: input too large' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_passos, 'null'::jsonb)) = 'array' then
    if jsonb_array_length(p_passos) > 8 then
      raise exception 'own template: at most 8 steps' using errcode = '22023';
    end if;
    for v_passo in select value from jsonb_array_elements(p_passos) loop
      if jsonb_typeof(v_passo) = 'object' and (
        length(coalesce(v_passo ->> 'titulo', '')) > 120
        or length(coalesce(v_passo ->> 'assunto', '')) > 200
        or length(coalesce(v_passo ->> 'objetivo', '')) > 500
        or length(coalesce(v_passo ->> 'corpo', '')) > 5000
      ) then
        raise exception 'own template: step text too long' using errcode = '22023';
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function private.own_template_limits(text, text, jsonb) from public, anon, authenticated, service_role;

create function public.preview_own_sequence_template(
  p_workspace_id uuid,
  p_nome text,
  p_resumo text,
  p_passos jsonb,
  p_literals jsonb default '[]'::jsonb
)
returns table (nome text, resumo text, passos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_resumo text;
  v_passos jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.own_template_limits(p_nome, p_resumo, p_passos);
  v_nome := private.own_template_text(p_nome, p_literals);
  v_resumo := private.own_template_text(p_resumo, p_literals);
  v_passos := private.own_template_steps(p_passos, p_literals);
  if length(v_nome) < 1 or length(v_resumo) < 1 or jsonb_array_length(v_passos) < 1 then
    raise exception 'template requires safe preview' using errcode = '22023';
  end if;
  return query select left(v_nome, 80), left(v_resumo, 300), v_passos;
end;
$$;

revoke all on function public.preview_own_sequence_template(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.preview_own_sequence_template(uuid, text, text, jsonb, jsonb) to authenticated;

create function public.save_own_sequence_template(
  p_workspace_id uuid,
  p_nome text,
  p_resumo text,
  p_passos jsonb,
  p_literals jsonb default '[]'::jsonb
)
returns table (id uuid, nome text, resumo text, passos jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nome text;
  v_resumo text;
  v_passos jsonb;
  v_id uuid;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.own_template_limits(p_nome, p_resumo, p_passos);
  v_nome := left(private.own_template_text(p_nome, p_literals), 80);
  v_resumo := left(private.own_template_text(p_resumo, p_literals), 300);
  v_passos := private.own_template_steps(p_passos, p_literals);
  if v_nome is distinct from btrim(coalesce(p_nome, ''))
     or v_resumo is distinct from btrim(coalesce(p_resumo, ''))
     or v_passos is distinct from p_passos
     or jsonb_array_length(coalesce(v_passos, '[]'::jsonb)) < 1
  then
    raise exception 'template requires safe preview' using errcode = '22023';
  end if;
  -- Até 50 templates por pessoa no Workspace. O lock evita que dois salvamentos simultâneos passem do limite.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_user::text, 0));
  if (select count(*) from private.own_sequence_templates t
      where t.workspace_id = p_workspace_id and t.owner_user_id = v_user) >= 50 then
    raise exception 'own template: limit reached' using errcode = '22023';
  end if;
  insert into private.own_sequence_templates (workspace_id, owner_user_id, nome, resumo, passos)
  values (p_workspace_id, v_user, v_nome, v_resumo, v_passos)
  returning own_sequence_templates.id into v_id;
  return query
  select t.id, t.nome, t.resumo, t.passos
  from private.own_sequence_templates t
  where t.id = v_id;
end;
$$;

revoke all on function public.save_own_sequence_template(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_own_sequence_template(uuid, text, text, jsonb, jsonb) to authenticated;

create function public.update_own_sequence_template(
  p_workspace_id uuid,
  p_template_id uuid,
  p_nome text,
  p_resumo text,
  p_passos jsonb,
  p_literals jsonb default '[]'::jsonb
)
returns table (id uuid, nome text, resumo text, passos jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nome text;
  v_resumo text;
  v_passos jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.own_template_limits(p_nome, p_resumo, p_passos);
  v_nome := left(private.own_template_text(p_nome, p_literals), 80);
  v_resumo := left(private.own_template_text(p_resumo, p_literals), 300);
  v_passos := private.own_template_steps(p_passos, p_literals);
  if v_nome is distinct from btrim(coalesce(p_nome, ''))
     or v_resumo is distinct from btrim(coalesce(p_resumo, ''))
     or v_passos is distinct from p_passos
  then
    raise exception 'template requires safe preview' using errcode = '22023';
  end if;
  update private.own_sequence_templates t
  set nome = v_nome, resumo = v_resumo, passos = v_passos, updated_at = now()
  where t.id = p_template_id
    and t.workspace_id = p_workspace_id
    and t.owner_user_id = v_user;
  if not found then
    raise exception 'own template: not the owner' using errcode = '42501';
  end if;
  return query
  select t.id, t.nome, t.resumo, t.passos
  from private.own_sequence_templates t
  where t.id = p_template_id;
end;
$$;

revoke all on function public.update_own_sequence_template(uuid, uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.update_own_sequence_template(uuid, uuid, text, text, jsonb, jsonb) to authenticated;

create function public.list_own_sequence_templates(p_workspace_id uuid)
returns table (id uuid, nome text, resumo text, passos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select t.id, t.nome, t.resumo, private.own_template_steps(t.passos, '[]'::jsonb)
  from private.own_sequence_templates t
  where t.workspace_id = p_workspace_id
    and t.owner_user_id = auth.uid()
  order by t.updated_at desc, t.nome;
end;
$$;

revoke all on function public.list_own_sequence_templates(uuid) from public, anon;
grant execute on function public.list_own_sequence_templates(uuid) to authenticated;

create function private.suggest_own_sequence_template(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_requester uuid,
  p_agent_id uuid
)
returns table (template_id uuid, justification text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phrase text;
  v_block text;
  v_template uuid;
  v_template_nome text;
begin
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = p_requester
  ) then
    raise exception 'sequence: the requester is not the responsible seller of the target account' using errcode = '42501';
  end if;

  select a.name into v_name
  from public.target_accounts a
  where a.id = p_target_account_id and a.workspace_id = p_workspace_id
    and a.archived_at is null and a.deleted_at is null;
  if v_name is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  v_block := private.althius_template_cap_block(p_workspace_id, p_agent_id);
  if v_block is not null then
    return query select null::uuid, ''::text, v_block;
    return;
  end if;

  select g.phrase into v_phrase
  from private.signals g
  where g.workspace_id = p_workspace_id and g.target_account_id = p_target_account_id
    and private.signal_is_valid(g.fired_at)
  order by g.fired_at desc, g.id desc
  limit 1;

  if nullif(btrim(coalesce(v_phrase, '')), '') is null then
    return query select null::uuid, ''::text, 'sem_contexto'::text;
    return;
  end if;

  select t.id, t.nome into v_template, v_template_nome
  from private.own_sequence_templates t
  where t.workspace_id = p_workspace_id
    and t.owner_user_id = p_requester
  order by t.updated_at desc, t.id desc
  limit 1;
  if v_template is null then
    return query select null::uuid, ''::text, 'indisponivel'::text;
    return;
  end if;

  return query select v_template,
    ('A Conta ' || btrim(v_name) || ' tem o Sinal “' || btrim(v_phrase) || '”. ' ||
     'O seu template ' || v_template_nome || ' é uma estrutura sua, sem destinatário e sem autorização. ' ||
     'Não há medida de resultado deste template.')::text,
    'ok'::text;
end;
$$;

revoke all on function private.suggest_own_sequence_template(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.suggest_own_sequence_template(
  p_workspace_id uuid,
  p_target_account_id uuid
)
returns table (template_id uuid, justification text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select * from private.suggest_own_sequence_template(
    p_workspace_id, p_target_account_id, auth.uid(), null
  );
end;
$$;

revoke all on function public.suggest_own_sequence_template(uuid, uuid) from public, anon;
grant execute on function public.suggest_own_sequence_template(uuid, uuid) to authenticated;

create function public.agent_suggest_own_sequence_template(
  p_run_id uuid,
  p_agent_id uuid,
  p_target_account_id uuid
)
returns table (template_id uuid, justification text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_agent private.agents%rowtype;
begin
  select * into v_agent from private.agents a
  where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_agent.id is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if v_agent.specialty <> 'rhetor' then
    raise exception 'sequence: only the cadence specialist proposes sequences' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
  select * from private.suggest_own_sequence_template(
    v_run.workspace_id, p_target_account_id, v_run.requested_by, p_agent_id
  );
end;
$$;

revoke all on function public.agent_suggest_own_sequence_template(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agent_suggest_own_sequence_template(uuid, uuid, uuid) to service_role;
