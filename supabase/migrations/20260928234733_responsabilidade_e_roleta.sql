-- Responsabilidade e Roleta de Contas (CRM-06).
-- Toda Conta-alvo nasce com um único Vendedor responsável (ADR-0009), gravado em public.sales_responsibilities:
--   * recomendação da Althius com URL nova: a Roleta de Contas escolhe, em rodízio, um participante ativo
--     (Administrador ou Membro). Uma recomendação cuja URL já existe só completa os dados da Conta: não cria outra
--     atribuição nem avança a roleta. Quem recomenda é o runtime dos Agentes, no servidor, com a chave de serviço:
--     só service_role executa recommend_target_account, e nenhum participante a chama pela API;
--   * cadastro manual (save_target_account, do CRM-04): quem criou;
--   * importação (CRM-07): quem importou; um Administrador pode, uma única vez por Conta importada, distribuí-la a
--     outro participante ativo.
-- Depois disso a responsabilidade não muda no fluxo normal. Só quando o responsável deixou o Workspace um
-- Administrador pode transferi-la a um participante ativo, com motivo, numa ação excepcional auditada. A Sequência e
-- as Contas remetentes do antigo responsável não vão junto: o executor já bloqueia envios de quem não é mais o
-- responsável (owner_not_responsible).
-- Cada atribuição fica em private.account_assignment_events com a origem, os participantes elegíveis, o cursor da
-- roleta antes e depois, quem agiu e o responsável atribuído. Nenhuma atribuição vai para uma Participação inativa:
-- um gatilho confere isso em toda escrita da responsabilidade.
--
-- Concorrência. As funções abaixo tomam os bloqueios sempre na mesma ordem: primeiro as Participações envolvidas
-- (FOR SHARE), depois o cursor da roleta ou a linha da responsabilidade (FOR UPDATE), e só então gravam Conta,
-- responsabilidade e evento. FOR SHARE nas Participações faz uma remoção concorrente (remove_participant, que as trava
-- FOR UPDATE) esperar o fim da atribuição, ou a atribuição reler a Participação já inativa e pulá-la; e, como as
-- gravações que referenciam public.workspaces vêm depois, não se forma ciclo com o bloqueio do Workspace que o gatilho
-- do último Administrador toma. O cursor é uma linha por Workspace travada FOR UPDATE: recomendações simultâneas no
-- mesmo Workspace passam uma de cada vez, cada uma lê o cursor gravado pela anterior (READ COMMITTED relê a versão
-- confirmada da linha travada), e a URL canônica única decide a corrida de duas recomendações da mesma empresa sem
-- consumir a roleta duas vezes.

-- A origem da Conta-alvo. Uma recomendação não tem um usuário que a criou.
alter table public.target_accounts
  add column origin text not null default 'manual' check (origin in ('manual', 'recomendacao', 'importacao'));
alter table public.target_accounts alter column created_by drop not null;
alter table public.target_accounts
  add constraint target_accounts_created_by_by_origin check (created_by is not null or origin = 'recomendacao');

-- O cursor da Roleta de Contas: quem recebeu a última Conta e a posição dele na ordem da roleta (entrada na
-- Participação, depois o id). Guardar a posição, e não um índice, mantém o rodízio quando alguém sai ou entra.
create table private.account_roulette_cursors (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_user_id uuid,
  last_joined_at timestamptz,
  assignments bigint not null default 0,
  updated_at timestamptz not null default now(),
  check ((last_user_id is null) = (last_joined_at is null))
);

-- A auditoria das atribuições de responsabilidade. Os usuários ficam sem chave estrangeira de propósito: é histórico.
create table private.account_assignment_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_account_id text not null,
  origin text not null check (origin in (
    'recomendacao', 'manual', 'importacao', 'distribuicao_importacao', 'transferencia', 'sequencia'
  )),
  assigned_user_id uuid not null,
  previous_user_id uuid,
  eligible_user_ids uuid[] not null,
  cursor_before uuid,
  cursor_after uuid,
  actor_user_id uuid,
  reason text,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  check (assigned_user_id = any (eligible_user_ids)),
  check (origin not in ('distribuicao_importacao', 'transferencia')
         or (previous_user_id is not null and actor_user_id is not null)),
  check (origin <> 'transferencia' or btrim(coalesce(reason, '')) <> ''),
  check (origin <> 'recomendacao' or cursor_after = assigned_user_id)
);

create index account_assignment_events_account_idx
  on private.account_assignment_events (workspace_id, target_account_id, id);

alter table private.account_roulette_cursors enable row level security;
alter table private.account_assignment_events enable row level security;
revoke all on private.account_roulette_cursors from public, anon, authenticated, service_role;
revoke all on private.account_assignment_events from public, anon, authenticated, service_role;

-- As responsabilidades anteriores a esta migration entram na auditoria: as das Contas-alvo vieram do cadastro manual;
-- as de identificadores de texto, da criação da Sequência.
insert into private.account_assignment_events
  (workspace_id, target_account_id, origin, assigned_user_id, eligible_user_ids, created_at)
select r.workspace_id, r.target_account_id,
  case when exists (
    select 1 from public.target_accounts a where a.workspace_id = r.workspace_id and a.id::text = r.target_account_id
  ) then 'manual' else 'sequencia' end,
  r.owner_user_id, array[r.owner_user_id], r.created_at
from public.sales_responsibilities r;

-- Nenhuma responsabilidade vai para uma Participação inativa, por RPC ou por qualquer outra escrita. FOR SHARE espera
-- uma remoção concorrente terminar e relê a Participação.
create function private.require_active_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.workspace_memberships m
  where m.workspace_id = new.workspace_id and m.user_id = new.owner_user_id and m.active
  for share;
  if not found then
    raise exception 'the responsible seller must be an active participant' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.require_active_responsible() from public, anon, authenticated, service_role;

create trigger sales_responsibilities_active_owner
  before insert or update of owner_user_id on public.sales_responsibilities
  for each row execute function private.require_active_responsible();

-- A responsabilidade continua permanente. A única exceção é trocar o responsável dentro das funções de distribuição e
-- transferência abaixo, que marcam a linha na própria transação; o cliente não tem UPDATE nesta tabela.
create or replace function private.prevent_responsibility_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.workspace_id = old.workspace_id
     and new.target_account_id = old.target_account_id
     and new.created_at = old.created_at
     and current_setting('althius.troca_de_responsavel', true) = old.workspace_id::text || '/' || old.target_account_id
  then
    return new;
  end if;
  raise exception 'sales responsibility is permanent';
end;
$$;

-- A atribuição que não passou pelas funções abaixo (cadastro manual e criação da Sequência) também fica auditada:
-- elegível é só quem assumiu. As funções abaixo gravam o evento antes da responsabilidade, e aí este gatilho não repete.
create function private.audit_initial_responsibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.account_assignment_events e
    where e.workspace_id = new.workspace_id and e.target_account_id = new.target_account_id
  ) then
    insert into private.account_assignment_events
      (workspace_id, target_account_id, origin, assigned_user_id, eligible_user_ids, actor_user_id)
    values (new.workspace_id, new.target_account_id,
      case when exists (
        select 1 from public.target_accounts a where a.workspace_id = new.workspace_id and a.id::text = new.target_account_id
      ) then 'manual' else 'sequencia' end,
      new.owner_user_id, array[new.owner_user_id], auth.uid());
  end if;
  return null;
end;
$$;

revoke all on function private.audit_initial_responsibility() from public, anon, authenticated, service_role;

create trigger sales_responsibilities_audit_initial
  after insert on public.sales_responsibilities
  for each row execute function private.audit_initial_responsibility();

-- Os participantes ativos do Workspace na ordem da roleta, travados FOR SHARE até o fim da transação.
create function private.lock_active_participants(p_workspace_id uuid, out user_ids uuid[], out joined_at timestamptz[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  with travadas as (
    select m.user_id, m.created_at
    from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.active and m.role in ('admin', 'member')
    order by m.created_at, m.user_id
    for share
  )
  select coalesce(array_agg(t.user_id order by t.created_at, t.user_id), '{}'),
    coalesce(array_agg(t.created_at order by t.created_at, t.user_id), '{}')
  into user_ids, joined_at
  from travadas t;
end;
$$;

revoke all on function private.lock_active_participants(uuid) from public, anon, authenticated, service_role;

-- Uma recomendação de Conta-alvo feita pela Althius. Quem chama é o runtime dos Agentes, no servidor, com a chave de
-- serviço: por isso só service_role executa, e o Workspace vem no pedido. URL nova cria a Conta e a atribui pela
-- roleta; URL conhecida só preenche o que a Conta ainda não tem, sem atribuição nova e sem mexer no cursor.
create function public.recommend_target_account(
  p_workspace_id uuid,
  p_name text,
  p_url text,
  p_legal_identifier text default null,
  p_linkedin_url text default null,
  p_segment text default null
) returns table (target_account_id uuid, created boolean, responsible_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_account public.target_accounts;
  v_users uuid[];
  v_joined timestamptz[];
  v_cursor private.account_roulette_cursors;
  v_next integer := 1;
  v_assigned uuid;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;
  v_url := private.canonical_company_url(p_url);

  select * into v_account from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.canonical_url = v_url
  for update;

  if not found then
    select l.user_ids, l.joined_at into v_users, v_joined from private.lock_active_participants(p_workspace_id) l;
    if cardinality(v_users) = 0 then
      raise exception 'no active participant to assign' using errcode = 'P0002';
    end if;

    insert into private.account_roulette_cursors (workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
    select * into v_cursor from private.account_roulette_cursors c where c.workspace_id = p_workspace_id for update;

    -- O próximo depois de quem recebeu a última Conta; do fim da fila, volta ao começo.
    if v_cursor.last_user_id is not null then
      for i in 1 .. cardinality(v_users) loop
        if (v_joined[i], v_users[i]) > (v_cursor.last_joined_at, v_cursor.last_user_id) then
          v_next := i;
          exit;
        end if;
      end loop;
    end if;
    v_assigned := v_users[v_next];

    insert into public.target_accounts (
      workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, segment, origin, created_by
    ) values (
      p_workspace_id, btrim(p_name), v_url,
      regexp_replace(substr(v_url, 9), '[:/].*$', ''),
      nullif(btrim(p_legal_identifier), ''), nullif(btrim(p_linkedin_url), ''), nullif(btrim(p_segment), ''),
      'recomendacao', null
    )
    on conflict (workspace_id, canonical_url) do nothing
    returning * into v_account;

    if found then
      insert into private.account_assignment_events
        (workspace_id, target_account_id, origin, assigned_user_id, eligible_user_ids, cursor_before, cursor_after)
      values (p_workspace_id, v_account.id::text, 'recomendacao', v_assigned, v_users, v_cursor.last_user_id, v_assigned);
      insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
      values (p_workspace_id, v_account.id::text, v_assigned);
      update private.account_roulette_cursors c
      set last_user_id = v_assigned, last_joined_at = v_joined[v_next], assignments = c.assignments + 1,
          updated_at = now()
      where c.workspace_id = p_workspace_id;
      return query select v_account.id, true, v_assigned;
      return;
    end if;

    -- Outra gravação criou a mesma URL enquanto isto rodava: é uma Conta conhecida, e a roleta não avança.
    select * into v_account from public.target_accounts a
    where a.workspace_id = p_workspace_id and a.canonical_url = v_url
    for update;
  end if;

  update public.target_accounts a set
    legal_identifier = coalesce(a.legal_identifier, nullif(btrim(p_legal_identifier), '')),
    linkedin_url = coalesce(a.linkedin_url, nullif(btrim(p_linkedin_url), '')),
    segment = coalesce(a.segment, nullif(btrim(p_segment), '')),
    updated_at = now()
  where a.id = v_account.id;

  return query
    select v_account.id, false, r.owner_user_id
    from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id and r.target_account_id = v_account.id::text;
end;
$$;

revoke all on function public.recommend_target_account(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.recommend_target_account(uuid, text, text, text, text, text) to service_role;

-- Troca o responsável de uma Conta dentro da própria transação, liberando só aquela linha no gatilho de imutabilidade.
-- Quem chama já conferiu a autorização, travou as Participações e a linha da responsabilidade e grava o evento.
create function private.change_responsible(p_workspace_id uuid, p_target_account_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('althius.troca_de_responsavel', p_workspace_id::text || '/' || p_target_account_id, true);
  update public.sales_responsibilities r set owner_user_id = p_user_id
  where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id;
  perform set_config('althius.troca_de_responsavel', '', true);
end;
$$;

revoke all on function private.change_responsible(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Primitiva da importação (CRM-07): cria a Conta-alvo importada, atribuída a quem importou. Se a URL já existe, só
-- devolve a Conta existente, sem mexer nela nem no responsável; as regras de atualização por campo são do CRM-07.
-- Não é chamada pela API: a RPC de importação do CRM-07 confere quem importa e a chama.
create function private.create_imported_target_account(
  p_workspace_id uuid,
  p_importer_user_id uuid,
  p_name text,
  p_url text,
  p_legal_identifier text default null,
  p_linkedin_url text default null,
  p_segment text default null,
  p_import_batch_id uuid default null
) returns table (target_account_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_account public.target_accounts;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;
  v_url := private.canonical_company_url(p_url);

  perform 1 from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = p_importer_user_id and m.active
  for share;
  if not found then
    raise exception 'the importer must be an active participant' using errcode = '42501';
  end if;

  insert into public.target_accounts (
    workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, segment, origin, created_by
  ) values (
    p_workspace_id, btrim(p_name), v_url,
    regexp_replace(substr(v_url, 9), '[:/].*$', ''),
    nullif(btrim(p_legal_identifier), ''), nullif(btrim(p_linkedin_url), ''), nullif(btrim(p_segment), ''),
    'importacao', p_importer_user_id
  )
  on conflict (workspace_id, canonical_url) do nothing
  returning * into v_account;

  if not found then
    return query select a.id, false from public.target_accounts a
      where a.workspace_id = p_workspace_id and a.canonical_url = v_url;
    return;
  end if;

  insert into private.account_assignment_events
    (workspace_id, target_account_id, origin, assigned_user_id, eligible_user_ids, actor_user_id, import_batch_id)
  values (p_workspace_id, v_account.id::text, 'importacao', p_importer_user_id, array[p_importer_user_id],
          p_importer_user_id, p_import_batch_id);
  insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
  values (p_workspace_id, v_account.id::text, p_importer_user_id);

  return query select v_account.id, true;
end;
$$;

revoke all on function private.create_imported_target_account(uuid, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;

-- O Administrador distribui Contas importadas entre participantes ativos. Cada Conta importada pode ser distribuída
-- uma única vez, enquanto ainda está com a atribuição da importação e sem Sequência; depois disso, só a transferência
-- excepcional. Tudo ou nada: uma Conta recusada desfaz o pedido inteiro. Devolve quantas Contas foram distribuídas.
create function public.distribute_imported_target_accounts(
  p_workspace_id uuid,
  p_target_account_ids uuid[],
  p_user_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligible uuid[];
  v_item record;
  v_owner uuid;
  v_count integer := 0;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can distribute imported target accounts' using errcode = '42501';
  end if;
  if p_target_account_ids is null or p_user_ids is null
     or cardinality(p_target_account_ids) <> cardinality(p_user_ids)
     or array_position(p_target_account_ids, null) is not null or array_position(p_user_ids, null) is not null then
    raise exception 'each target account needs one responsible seller' using errcode = '22023';
  end if;
  if cardinality(p_target_account_ids) <> (select count(distinct t) from unnest(p_target_account_ids) t) then
    raise exception 'each target account can appear only once' using errcode = '22023';
  end if;

  select l.user_ids into v_eligible from private.lock_active_participants(p_workspace_id) l;

  -- As linhas da responsabilidade em ordem de Conta, para duas distribuições simultâneas não se travarem em ciclo.
  for v_item in
    select d.account_id, d.user_id
    from unnest(p_target_account_ids, p_user_ids) as d(account_id, user_id)
    order by d.account_id
  loop
    if not (v_item.user_id = any (v_eligible)) then
      raise exception 'the new responsible seller must be an active participant' using errcode = '42501';
    end if;

    select r.owner_user_id into v_owner
    from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id and r.target_account_id = v_item.account_id::text
    for update;
    if not found then
      raise exception 'target account not found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.target_accounts a
      where a.workspace_id = p_workspace_id and a.id = v_item.account_id and a.origin = 'importacao'
    ) then
      raise exception 'only imported target accounts can be distributed' using errcode = '42501';
    end if;
    if exists (
      select 1 from private.account_assignment_events e
      where e.workspace_id = p_workspace_id and e.target_account_id = v_item.account_id::text and e.origin <> 'importacao'
    ) then
      raise exception 'imported target account was already distributed' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.sequences s
      where s.workspace_id = p_workspace_id and s.target_account_id = v_item.account_id::text
    ) then
      raise exception 'target account already has a sequence' using errcode = '42501';
    end if;

    insert into private.account_assignment_events
      (workspace_id, target_account_id, origin, assigned_user_id, previous_user_id, eligible_user_ids, actor_user_id)
    values (p_workspace_id, v_item.account_id::text, 'distribuicao_importacao', v_item.user_id, v_owner, v_eligible,
            auth.uid());
    perform private.change_responsible(p_workspace_id, v_item.account_id::text, v_item.user_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.distribute_imported_target_accounts(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.distribute_imported_target_accounts(uuid, uuid[], uuid[]) to authenticated;

-- Transferência excepcional (ADR-0009): só quando o responsável já deixou o Workspace, por um Administrador ativo,
-- para um participante ativo e com motivo. A Sequência e as Contas remetentes do antigo responsável não vão junto.
create function public.transfer_target_account_responsibility(
  p_target_account_id uuid,
  p_new_user_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_eligible uuid[];
  v_owner uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Quem não participa do Workspace da Conta recebe a mesma resposta de uma Conta que não existe.
  select a.workspace_id, m.role into v_workspace_id, v_role
  from public.target_accounts a
  join public.workspace_memberships m
    on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if v_role <> 'admin' then
    raise exception 'only administrators can transfer responsibility' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a reason is required to transfer responsibility' using errcode = '22023';
  end if;

  -- Participações primeiro (as ativas e a do responsável atual, para uma volta concorrente dele esperar), depois a
  -- linha da responsabilidade.
  select l.user_ids into v_eligible from private.lock_active_participants(v_workspace_id) l;
  perform 1 from public.workspace_memberships m
  join public.sales_responsibilities r
    on r.workspace_id = m.workspace_id and r.owner_user_id = m.user_id
  where r.workspace_id = v_workspace_id and r.target_account_id = p_target_account_id::text
  for share of m;

  select r.owner_user_id into v_owner
  from public.sales_responsibilities r
  where r.workspace_id = v_workspace_id and r.target_account_id = p_target_account_id::text
  for update;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_workspace_id and m.user_id = v_owner and m.active
  ) then
    raise exception 'the responsible seller is still an active participant' using errcode = '42501';
  end if;
  if p_new_user_id is null or not (p_new_user_id = any (v_eligible)) then
    raise exception 'the new responsible seller must be an active participant' using errcode = '42501';
  end if;

  insert into private.account_assignment_events
    (workspace_id, target_account_id, origin, assigned_user_id, previous_user_id, eligible_user_ids, actor_user_id, reason)
  values (v_workspace_id, p_target_account_id::text, 'transferencia', p_new_user_id, v_owner, v_eligible, v_user_id,
          btrim(p_reason));
  perform private.change_responsible(v_workspace_id, p_target_account_id::text, p_new_user_id);
end;
$$;

revoke all on function public.transfer_target_account_responsibility(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_target_account_responsibility(uuid, uuid, text) to authenticated;

-- O histórico de atribuições de uma Conta-alvo, que todo participante ativo do Workspace consulta.
create function public.list_account_assignment_events(p_target_account_id uuid)
returns table (
  origin text, assigned_user_id uuid, previous_user_id uuid, eligible_user_ids uuid[], cursor_before uuid,
  cursor_after uuid, actor_user_id uuid, reason text, import_batch_id uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.workspace_id into v_workspace_id
  from public.target_accounts a
  join public.workspace_memberships m
    on m.workspace_id = a.workspace_id and m.user_id = auth.uid() and m.active
  where a.id = p_target_account_id;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  return query
    select e.origin, e.assigned_user_id, e.previous_user_id, e.eligible_user_ids, e.cursor_before, e.cursor_after,
      e.actor_user_id, e.reason, e.import_batch_id, e.created_at
    from private.account_assignment_events e
    where e.workspace_id = v_workspace_id and e.target_account_id = p_target_account_id::text
    order by e.id;
end;
$$;

revoke all on function public.list_account_assignment_events(uuid) from public, anon;
grant execute on function public.list_account_assignment_events(uuid) to authenticated;
