-- Entrada-03: respostas pessoais globais, empresa compartilhada e conclusão por Participação.
-- Não cria nem renomeia Workspace. As RPCs não recebem identidade do cliente.
create table public.day0_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text check (papel in ('Founder', 'Head de Vendas', 'SDR/BDR', 'AE', 'Marketing', 'RevOps', 'Outro')),
  como_conheceu text check (como_conheceu in ('Google Ads', 'Meta Ads', 'Instagram', 'LinkedIn', 'YouTube', 'X', 'TikTok', 'Influenciador', 'Indicação', 'Evento', 'Podcast', 'Busca no Google', 'Outro')),
  personal_done boolean not null default false
);
create table public.day0_companies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  empresa text not null default '' check (length(empresa) <= 160),
  dominio text not null default '' check (length(dominio) <= 253),
  logo text check (logo is null or (length(logo) <= 2048 and logo like 'https://%'))
);
create table public.day0_completions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.day0_accounts enable row level security;
alter table public.day0_companies enable row level security;
alter table public.day0_completions enable row level security;
revoke all on public.day0_accounts, public.day0_companies, public.day0_completions from public, anon, authenticated;
grant select on public.day0_accounts, public.day0_companies, public.day0_completions to authenticated;
create policy "own personal Day0 with active participation" on public.day0_accounts for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.workspace_memberships m where m.user_id = (select auth.uid()) and m.active
  ));
create policy "participants read company Day0" on public.day0_companies for select to authenticated
  using (exists (select 1 from public.workspace_memberships m
    where m.workspace_id = day0_companies.workspace_id and m.user_id = (select auth.uid()) and m.active));
create policy "participants read only own completion" on public.day0_completions for select to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.workspace_memberships m
    where m.workspace_id = day0_completions.workspace_id and m.user_id = (select auth.uid()) and m.active));

-- O convite inicial do provisionamento permite empresa; convites posteriores pulam.
-- O histórico persistido identifica o convite, sem confiar no papel ou no remetente sozinho.
create function private.day0_is_invited(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.workspace_invitations i
    where i.workspace_id = p_workspace_id and i.accepted_by = auth.uid() and i.status = 'aceito'
      and not exists (
        select 1 from private.workspace_participation_events c
        join private.workspace_participation_events e on e.workspace_id = c.workspace_id
          and e.event = 'convite_criado' and e.actor_user_id = c.actor_user_id
          and e.subject_email = c.subject_email and e.created_at = c.created_at
        where c.workspace_id = i.workspace_id and c.event = 'workspace_criado'
          and e.invitation_id = i.id
          and e.id = (select min(first_invite.id) from private.workspace_participation_events first_invite
            where first_invite.workspace_id = i.workspace_id and first_invite.event = 'convite_criado')
      ))
$$;
revoke all on function private.day0_is_invited(uuid) from public, anon, authenticated;

-- Definer para consultar histórico privado e retornar apenas os dados da sessão após conferir Participação.
create function public.get_my_day0(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_invited boolean;
  v_account public.day0_accounts;
  v_company public.day0_companies;
  v_done boolean;
  v_step text;
begin
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  select * into v_account from public.day0_accounts where user_id = auth.uid();
  select * into v_company from public.day0_companies where workspace_id = p_workspace_id;
  v_done := exists (select 1 from public.day0_completions where workspace_id = p_workspace_id and user_id = auth.uid());
  v_step := case
    when v_done then 'checklist'
    when v_account.papel is null and not coalesce(v_account.personal_done, false) then 'papel'
    when not v_invited and coalesce(v_company.empresa, '') = '' then 'empresa'
    when not v_invited and coalesce(v_company.dominio, '') = '' then 'dominio'
    when not coalesce(v_account.personal_done, false) then 'hdyhau'
    else 'convite' end;
  return jsonb_build_object('ramo', case when v_invited then 'convidado' else 'criador' end,
    'etapa', v_step, 'papel', v_account.papel, 'comoConheceu', v_account.como_conheceu,
    'empresa', coalesce(v_company.empresa, ''), 'dominio', coalesce(v_company.dominio, ''),
    'logoDoSite', v_company.logo, 'concluido', v_done);
end;
$$;
revoke all on function public.get_my_day0(uuid) from public, anon, authenticated;
grant execute on function public.get_my_day0(uuid) to authenticated;

create function public.save_my_day0(p_workspace_id uuid, p_action text, p_value text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_invited boolean;
begin
  -- Serializa com remoção/rebaixamento da Participação, e entre dispositivos da mesma Conta.
  v_role := private.lock_caller_membership(p_workspace_id);
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  insert into public.day0_accounts (user_id) values (auth.uid()) on conflict do nothing;
  perform 1 from public.day0_accounts where user_id = auth.uid() for update;
  if p_action = 'concluir' then
    update public.day0_accounts set personal_done = true where user_id = auth.uid();
    insert into public.day0_completions (workspace_id, user_id) values (p_workspace_id, auth.uid()) on conflict do nothing;
  elsif p_action in ('papel', 'hdyhau') then
    if p_value is null then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
    -- As respostas pessoais são perguntadas uma vez, inclusive se puladas.
    if not (select personal_done from public.day0_accounts where user_id = auth.uid()) then
      if p_action = 'papel' then
        update public.day0_accounts set papel = p_value where user_id = auth.uid();
      else
        update public.day0_accounts set como_conheceu = p_value, personal_done = true where user_id = auth.uid();
      end if;
    end if;
  elsif p_action in ('empresa', 'dominio') then
    if v_invited then raise exception 'company Day0 requires original administrator' using errcode = '42501'; end if;
    if p_value is null or btrim(p_value) = '' then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
    if p_action = 'dominio' and (length(p_value) > 253 or p_value !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
      or exists (select 1 from unnest(string_to_array(p_value, '.')) as labels(label)
        where length(label) > 63 or label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')) then
      raise exception 'invalid Day0 domain' using errcode = '22023';
    end if;
    insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
    if p_action = 'empresa' then
      update public.day0_companies set empresa = btrim(p_value) where workspace_id = p_workspace_id;
    else
      update public.day0_companies set dominio = p_value, logo = null where workspace_id = p_workspace_id;
    end if;
  else
    raise exception 'invalid Day0 action' using errcode = '22023';
  end if;
  return public.get_my_day0(p_workspace_id);
end;
$$;
revoke all on function public.save_my_day0(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_my_day0(uuid, text, text) to authenticated;
