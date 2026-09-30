-- O Estágio de prospecção da Conta-alvo (spec kanban-de-prospeccao, ticket 01, ADR-0020): Descoberta, Quente, Fit,
-- Em abordagem, Respondeu, Reunião, No CRM e Descartada, com o histórico de cada mudança. A Conta sem linha na tabela
-- está em Descoberta, então as Contas existentes e as importadas não precisam de backfill e `save_target_account`
-- continua como está. Quem move à mão é o vendedor responsável (ADR-0009); os eventos das outras specs movem pela
-- função interna, que nunca volta um cartão depois de Em abordagem.

create table private.prospecting_stage_catalog (
  stage text primary key,
  name text not null,
  position smallint not null unique
);

insert into private.prospecting_stage_catalog (stage, name, position) values
  ('descoberta', 'Descoberta', 1),
  ('quente', 'Quente', 2),
  ('fit', 'Fit', 3),
  ('em_abordagem', 'Em abordagem', 4),
  ('respondeu', 'Respondeu', 5),
  ('reuniao', 'Reunião', 6),
  ('no_crm', 'No CRM', 7),
  ('descartada', 'Descartada', 8);

-- O estágio vigente de cada Conta que já saiu de Descoberta.
create table private.prospecting_stages (
  workspace_id uuid not null,
  target_account_id uuid not null,
  stage text not null references private.prospecting_stage_catalog(stage),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, target_account_id),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade
);

-- Cada mudança: de onde, para onde, e quem (usuário) ou qual evento. As funções gravam sempre um dos dois; o usuário
-- pode sair do sistema depois, e então só o evento ou nada resta do autor.
create table private.prospecting_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  from_stage text not null references private.prospecting_stage_catalog(stage),
  to_stage text not null references private.prospecting_stage_catalog(stage),
  moved_by uuid references auth.users(id) on delete set null,
  event text check (event is null or btrim(event) <> ''),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade,
  check (from_stage <> to_stage)
);

create index prospecting_stage_history_account_idx
  on private.prospecting_stage_history (workspace_id, target_account_id, created_at desc);

alter table private.prospecting_stage_catalog enable row level security;
alter table private.prospecting_stages enable row level security;
alter table private.prospecting_stage_history enable row level security;
revoke all on private.prospecting_stage_catalog from public, anon, authenticated, service_role;
revoke all on private.prospecting_stages from public, anon, authenticated, service_role;
revoke all on private.prospecting_stage_history from public, anon, authenticated, service_role;

-- Grava a mudança e o histórico. Devolve false quando o estágio já é o pedido.
create function private.apply_prospecting_stage(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_stage text,
  p_moved_by uuid,
  p_event text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  perform pg_advisory_xact_lock(hashtext('prospecting:' || p_workspace_id::text || ':' || p_target_account_id::text));
  select s.stage into v_current
  from private.prospecting_stages s
  where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id;
  v_current := coalesce(v_current, 'descoberta');
  if v_current = p_stage then
    return false;
  end if;
  insert into private.prospecting_stages (workspace_id, target_account_id, stage)
  values (p_workspace_id, p_target_account_id, p_stage)
  on conflict (workspace_id, target_account_id)
  do update set stage = excluded.stage, updated_at = now();
  insert into private.prospecting_stage_history
    (workspace_id, target_account_id, from_stage, to_stage, moved_by, event)
  values (p_workspace_id, p_target_account_id, v_current, p_stage, p_moved_by, p_event);
  return true;
end;
$$;

-- A Conta existe no Workspace; senão, P0002.
create function private.require_prospecting_account(p_workspace_id uuid, p_target_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.target_accounts a
    where a.workspace_id = p_workspace_id and a.id = p_target_account_id
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Para os eventos das outras specs (Sinal, Aderência, Envio, resposta, reunião, envio ao CRM). Regras: depois de Em
-- abordagem o evento só avança (ou descarta); antes dela, pode ir para qualquer estágio (um Sinal vencido volta a
-- Descoberta); uma Conta Descartada só sai por movimento à mão. Devolve true quando o cartão se moveu.
create function private.advance_prospecting_stage(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_stage text,
  p_event text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_current_position smallint;
  v_target_position smallint;
  v_approach_position smallint;
begin
  if p_event is null or btrim(p_event) = '' then
    raise exception 'event is required' using errcode = '22023';
  end if;
  select c.position into v_target_position from private.prospecting_stage_catalog c where c.stage = p_stage;
  if v_target_position is null then
    raise exception 'unknown prospecting stage' using errcode = '22023';
  end if;
  perform private.require_prospecting_account(p_workspace_id, p_target_account_id);

  select s.stage into v_current
  from private.prospecting_stages s
  where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id;
  v_current := coalesce(v_current, 'descoberta');
  select c.position into v_current_position from private.prospecting_stage_catalog c where c.stage = v_current;
  select c.position into v_approach_position from private.prospecting_stage_catalog c where c.stage = 'em_abordagem';

  -- Descartada só sai à mão.
  if v_current = 'descartada' then
    return false;
  end if;
  -- Depois de Em abordagem, o evento nunca volta; só avança ou descarta.
  if v_current_position >= v_approach_position and p_stage <> 'descartada' and v_target_position <= v_current_position then
    return false;
  end if;
  return private.apply_prospecting_stage(p_workspace_id, p_target_account_id, p_stage, null, p_event);
end;
$$;

revoke all on function private.apply_prospecting_stage(uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.require_prospecting_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.advance_prospecting_stage(uuid, uuid, text, text) from public, anon, authenticated, service_role;

-- Mover à mão: só o vendedor responsável pela Conta (ADR-0009). Qualquer estágio, salvo No CRM, que só o envio ao
-- CRM define. Devolve false quando o cartão já estava lá.
create function public.move_prospecting_stage(p_workspace_id uuid, p_target_account_id uuid, p_stage text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.require_prospecting_account(p_workspace_id, p_target_account_id);
  if not exists (select 1 from private.prospecting_stage_catalog c where c.stage = p_stage) then
    raise exception 'unknown prospecting stage' using errcode = '22023';
  end if;
  if p_stage = 'no_crm' then
    raise exception 'only sending to the CRM sets this stage' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = auth.uid()
  ) then
    raise exception 'only the responsible seller can move this target account' using errcode = '42501';
  end if;
  return private.apply_prospecting_stage(p_workspace_id, p_target_account_id, p_stage, auth.uid(), null);
end;
$$;

-- O estágio de todas as Contas do Workspace (Descoberta para as que ainda não saíram dela), para a vista Kanban.
create function public.list_prospecting_stages(p_workspace_id uuid)
returns table (target_account_id uuid, stage text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select a.id, coalesce(s.stage, 'descoberta'), coalesce(s.updated_at, a.created_at)
  from public.target_accounts a
  left join private.prospecting_stages s
    on s.workspace_id = a.workspace_id and s.target_account_id = a.id
  where a.workspace_id = p_workspace_id
  order by a.created_at, a.id;
end;
$$;

-- O histórico de uma Conta, do mais novo ao mais antigo. `event` vem preenchido quando foi um evento; `moved_by`, quando
-- foi uma pessoa.
create function public.get_prospecting_history(p_workspace_id uuid, p_target_account_id uuid)
returns table (from_stage text, to_stage text, moved_by uuid, event text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.require_prospecting_account(p_workspace_id, p_target_account_id);
  return query
  select h.from_stage, h.to_stage, h.moved_by, h.event, h.created_at
  from private.prospecting_stage_history h
  where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
  order by h.created_at desc, h.id desc;
end;
$$;

revoke all on function public.move_prospecting_stage(uuid, uuid, text) from public, anon;
revoke all on function public.list_prospecting_stages(uuid) from public, anon;
revoke all on function public.get_prospecting_history(uuid, uuid) from public, anon;
grant execute on function public.move_prospecting_stage(uuid, uuid, text) to authenticated;
grant execute on function public.list_prospecting_stages(uuid) to authenticated;
grant execute on function public.get_prospecting_history(uuid, uuid) to authenticated;
