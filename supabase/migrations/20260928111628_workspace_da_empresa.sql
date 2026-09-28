-- Workspace da empresa por ação explícita (CRM-22, ADR-0011).
-- A partir do Workspace pessoal, a pessoa escolhe criar um Workspace da empresa, com o nome da empresa, e se torna sua
-- Administradora. Nada do Workspace pessoal é copiado, movido ou renomeado: o novo Workspace nasce só com a Participação
-- de quem o criou. Cadastro, login, Day0 e troca de Workspace nunca chamam esta função.
-- O pedido leva uma chave gerada pelo app: repeti-lo (nova tentativa, clique duplo, resposta perdida) devolve o mesmo
-- Workspace, sem criar outro. A identidade vem sempre de auth.uid().

-- Os pedidos de criação já atendidos, por Conta de usuário e chave. É o que torna a criação idempotente.
create table private.company_workspace_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index company_workspace_requests_workspace_idx on private.company_workspace_requests (workspace_id);

alter table private.company_workspace_requests enable row level security;
revoke all on private.company_workspace_requests from public, anon, authenticated;

-- A criação do Workspace entra no histórico de participação, com quem o criou e o papel que recebeu.
alter table private.workspace_participation_events
  drop constraint workspace_participation_events_event_check,
  add constraint workspace_participation_events_event_check check (event in (
    'convite_criado', 'convite_revogado', 'convite_aceito', 'papel_alterado', 'participacao_removida', 'workspace_criado'
  ));

-- O Workspace que um pedido já criou, ou nenhum. Quem foi removida dele não o recebe de volta repetindo o pedido.
create function private.company_workspace_of_request(p_user_id uuid, p_request_id uuid)
returns public.workspaces
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  select w.* into v_workspace
  from private.company_workspace_requests r
  join public.workspaces w on w.id = r.workspace_id
  where r.user_id = p_user_id and r.request_id = p_request_id;
  if found and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_workspace.id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return v_workspace;
end;
$$;

revoke all on function private.company_workspace_of_request(uuid, uuid) from public, anon, authenticated;

-- Cria o Workspace da empresa e a Participação de Administrador de quem pede, na mesma transação. Com a mesma chave,
-- devolve o Workspace já criado, sem renomeá-lo; dois pedidos simultâneos com a mesma chave criam um só.
create function public.create_company_workspace(p_name text, p_request_id uuid)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user auth.users%rowtype;
  -- Espaços, tabulações e quebras de linha nas pontas não contam como nome.
  v_name text := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
  v_workspace public.workspaces;
  v_constraint text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_user from auth.users u where u.id = v_user_id;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'email not verified' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'company name is required' using errcode = '22023';
  end if;
  if length(v_name) > 100 then
    raise exception 'company name is too long' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'request id is required' using errcode = '22023';
  end if;

  v_workspace := private.company_workspace_of_request(v_user_id, p_request_id);
  if v_workspace.id is not null then
    return v_workspace;
  end if;

  begin
    insert into public.workspaces (kind, name) values ('empresa', v_name) returning * into v_workspace;
    -- Um pedido simultâneo com a mesma chave espera aqui pelo primeiro e, quando ele confirma, desiste do seu.
    insert into private.company_workspace_requests (user_id, request_id, workspace_id)
    values (v_user_id, p_request_id, v_workspace.id);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'company_workspace_requests_pkey' then
      raise;
    end if;
    return private.company_workspace_of_request(v_user_id, p_request_id);
  end;

  insert into public.workspace_memberships (workspace_id, user_id, role, active)
  values (v_workspace.id, v_user_id, 'admin', true);

  insert into private.workspace_participation_events
    (workspace_id, event, subject_user_id, subject_email, actor_user_id, new_role)
  values (v_workspace.id, 'workspace_criado', v_user_id, v_user.email, v_user_id, 'admin');

  return v_workspace;
end;
$$;

revoke all on function public.create_company_workspace(text, uuid) from public, anon;
grant execute on function public.create_company_workspace(text, uuid) to authenticated;
