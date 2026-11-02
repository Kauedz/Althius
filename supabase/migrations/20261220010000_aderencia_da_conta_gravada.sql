-- A Aderência da Conta-alvo gravada (spec kanban-de-prospeccao, ticket 08). A Conta passa a ter Fit ou Não fit, com quem
-- avaliou (a pessoa ou o Scopus), quando e um motivo curto; sem linha, a Conta está sem avaliação, e nada é preenchido
-- para as Contas que já existem. Não fit pede motivo: é o que explica a Descartada (decisão de 2026-11-02).
--
-- Quem grava:
--   - o Vendedor responsável pela Conta, com Participação ativa (ADR-0009), por `public.set_account_fit`;
--   - o Scopus, que sempre propõe: não existe Permissão do Agente fora das Integrações, então a proposta vira uma
--     Aprovação da categoria `aderencia` que só o Vendedor responsável decide, no mesmo molde da Sequência proposta pelo
--     Rhetor (20261105100000). Aprovar grava, na mesma transação, com o Scopus como quem avaliou e a pessoa como quem
--     aprovou.
--
-- Gravar Fit ou Não fit chama o gancho do kanban (`private.record_prospecting_event` com `fit` ou `nao_fit`): Fit não
-- volta um cartão que já passou de Fit; Não fit leva a Descartada; e Descartada só sai à mão (ticket 01). Mudar só o
-- motivo não move o cartão. O `fit_level` das empresas descobertas (`private.discovered_accounts`) é outra coisa e não
-- muda.
--
-- Redefinidas a partir da definição mais recente da main (20261105100000): `decide_approval` e `cancel_approval`, mais
-- as checagens de categoria de `private.approvals`. `list_approvals` fica como está: a Aderência proposta e o motivo vão
-- no payload, que todo Participante lê, e a coluna `responsible_seller` já diz quem decide. Nenhum dado é apagado.

-- 1. A Aderência vigente de cada Conta avaliada e o histórico de cada mudança.
create table private.account_fit (
  workspace_id uuid not null,
  target_account_id uuid not null,
  fit text not null check (fit in ('fit', 'nao_fit')),
  reason text not null default '' check (length(reason) <= 500),
  decided_by_kind text not null check (decided_by_kind in ('pessoa', 'agente')),
  -- Na pessoa, quem avaliou; no Scopus, quem aprovou a proposta dele.
  decided_by_user uuid references auth.users(id) on delete set null,
  decided_by_agent uuid,
  approval_id uuid references private.approvals(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (workspace_id, target_account_id),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade,
  check (fit <> 'nao_fit' or btrim(reason) <> ''),
  check ((decided_by_kind = 'pessoa') = (decided_by_agent is null))
);

create table private.account_fit_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  from_fit text check (from_fit in ('fit', 'nao_fit')),
  to_fit text not null check (to_fit in ('fit', 'nao_fit')),
  reason text not null default '',
  decided_by_kind text not null check (decided_by_kind in ('pessoa', 'agente')),
  decided_by_user uuid references auth.users(id) on delete set null,
  decided_by_agent uuid,
  approval_id uuid references private.approvals(id) on delete set null,
  -- clock_timestamp: duas mudanças na mesma transação ficam na ordem em que aconteceram.
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade
);

create index account_fit_history_account_idx
  on private.account_fit_history (workspace_id, target_account_id, created_at desc);

alter table private.account_fit enable row level security;
alter table private.account_fit_history enable row level security;
revoke all on private.account_fit from public, anon, authenticated, service_role;
revoke all on private.account_fit_history from public, anon, authenticated, service_role;

-- 2. Grava a Aderência e o histórico e, quando o Fit ou Não fit muda, move o cartão pelo gancho do kanban. Devolve false
--    quando nada mudou (mesma Aderência e mesmo motivo).
create function private.apply_account_fit(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_fit text,
  p_reason text,
  p_kind text,
  p_user uuid,
  p_agent uuid,
  p_approval_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_current private.account_fit%rowtype;
begin
  if p_fit is null or p_fit not in ('fit', 'nao_fit') then
    raise exception 'fit: unknown fit' using errcode = '22023';
  end if;
  if p_fit = 'nao_fit' and v_reason = '' then
    raise exception 'fit: a reason is required for nao_fit' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'fit: reason too long' using errcode = '22023';
  end if;
  perform private.require_prospecting_account(p_workspace_id, p_target_account_id);

  perform pg_advisory_xact_lock(hashtext('fit:' || p_workspace_id::text || ':' || p_target_account_id::text));
  select * into v_current from private.account_fit f
  where f.workspace_id = p_workspace_id and f.target_account_id = p_target_account_id;
  if v_current.fit = p_fit and v_current.reason = v_reason then
    return false;
  end if;

  insert into private.account_fit (
    workspace_id, target_account_id, fit, reason, decided_by_kind, decided_by_user, decided_by_agent, approval_id
  ) values (p_workspace_id, p_target_account_id, p_fit, v_reason, p_kind, p_user, p_agent, p_approval_id)
  on conflict (workspace_id, target_account_id) do update set
    fit = excluded.fit,
    reason = excluded.reason,
    decided_by_kind = excluded.decided_by_kind,
    decided_by_user = excluded.decided_by_user,
    decided_by_agent = excluded.decided_by_agent,
    approval_id = excluded.approval_id,
    decided_at = now();
  insert into private.account_fit_history (
    workspace_id, target_account_id, from_fit, to_fit, reason, decided_by_kind, decided_by_user, decided_by_agent,
    approval_id
  ) values (
    p_workspace_id, p_target_account_id, v_current.fit, p_fit, v_reason, p_kind, p_user, p_agent, p_approval_id
  );

  if v_current.fit is distinct from p_fit then
    perform private.record_prospecting_event(p_workspace_id, p_target_account_id, p_fit);
  end if;
  return true;
end;
$$;

revoke all on function private.apply_account_fit(uuid, uuid, text, text, text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 3. A pessoa grava: só o Vendedor responsável pela Conta, com Participação ativa (como `move_prospecting_stage`).
create function public.set_account_fit(p_workspace_id uuid, p_target_account_id uuid, p_fit text, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.require_prospecting_account(p_workspace_id, p_target_account_id);
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = auth.uid()
  ) then
    raise exception 'only the responsible seller can set the fit of this target account' using errcode = '42501';
  end if;
  return private.apply_account_fit(p_workspace_id, p_target_account_id, p_fit, p_reason, 'pessoa', auth.uid(), null, null);
end;
$$;

-- A Aderência das Contas avaliadas do Workspace, para a Fonte de Contas. Conta sem linha está sem avaliação.
create function public.list_account_fits(p_workspace_id uuid)
returns table (
  target_account_id uuid, fit text, reason text, decided_by_kind text, decided_by_user uuid, decided_by_agent uuid,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select f.target_account_id, f.fit, f.reason, f.decided_by_kind, f.decided_by_user, f.decided_by_agent, f.decided_at
  from private.account_fit f
  where f.workspace_id = p_workspace_id
  order by f.decided_at desc, f.target_account_id;
end;
$$;

revoke all on function public.set_account_fit(uuid, uuid, text, text) from public, anon;
revoke all on function public.list_account_fits(uuid) from public, anon;
grant execute on function public.set_account_fit(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_account_fits(uuid) to authenticated;

-- 4. A categoria `aderencia` nas Aprovações: sem Integração, com a Conta-alvo, sem execução externa e sem conteúdo
--    guardado à parte (a Aderência e o motivo vão no payload). As outras categorias seguem como em 20261105100000.
alter table private.approvals drop constraint if exists approvals_category_check;
alter table private.approvals add constraint approvals_category_check
  check (category in ('acao', 'revisao', 'sequencia', 'aderencia'));

alter table private.approvals drop constraint if exists approvals_category_shape;
alter table private.approvals add constraint approvals_category_shape check (
  case category
    when 'acao' then integration_id is not null and playbook_section is null and base_version is null
      and proposed_content is null and applied_version is null and created_sequence_id is null
      and state <> 'desatualizada'
    when 'revisao' then integration_id is null and playbook_section is not null and base_version is not null
      and created_sequence_id is null and state not in ('executando', 'executada', 'falhou')
    when 'sequencia' then integration_id is null and playbook_section is null and base_version is null
      and applied_version is null and target_account_id is not null
      and state in ('pendente', 'aprovada', 'recusada', 'cancelada', 'expirada')
      and (created_sequence_id is null or state = 'aprovada')
    else integration_id is null and playbook_section is null and base_version is null and applied_version is null
      and proposed_content is null and created_sequence_id is null and target_account_id is not null
      and coalesce(payload ->> 'aderencia', '') in ('fit', 'nao_fit')
      and state in ('pendente', 'aprovada', 'recusada', 'cancelada', 'expirada')
  end
);

-- 5. O Scopus propõe a Aderência de uma Conta. Só o servidor, a partir de uma Execução em andamento. Confere que o Agente
--    é do Workspace da Execução e da Especialidade Scopus, que quem pediu ainda participa, que a Conta existe, tem
--    Vendedor responsável (é ele quem decide) e não tem já essa Aderência, e que Não fit traz o motivo. Nasce sempre
--    pendente. A mesma proposta repetida na mesma Execução devolve a Aprovação que já existe (`existente`). Os erros
--    começam com "fit:" para a ferramenta dizer o motivo ao Agente.
create function public.agent_propose_account_fit(
  p_run_id uuid, p_agent_id uuid, p_target_account_id uuid, p_fit text, p_reason text default ''
) returns table (approval_id uuid, outcome text, account_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_agent private.agents%rowtype;
  v_account public.target_accounts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_label text;
  v_hash text;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_agent from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_agent.id is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if v_agent.specialty <> 'scopus' then
    raise exception 'fit: only the ICP specialist proposes the fit' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if p_fit is null or p_fit not in ('fit', 'nao_fit') then
    raise exception 'fit: unknown fit' using errcode = '22023';
  end if;
  if p_fit = 'nao_fit' and v_reason = '' then
    raise exception 'fit: a reason is required for nao_fit' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'fit: reason too long' using errcode = '22023';
  end if;
  select * into v_account from public.target_accounts a
  where a.id = p_target_account_id and a.workspace_id = v_run.workspace_id and a.deleted_at is null;
  if v_account.id is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_run.workspace_id and r.target_account_id = p_target_account_id::text
  ) then
    raise exception 'fit: the target account has no responsible seller' using errcode = '55000';
  end if;
  if exists (
    select 1 from private.account_fit f
    where f.workspace_id = v_run.workspace_id and f.target_account_id = p_target_account_id and f.fit = p_fit
  ) then
    raise exception 'fit: the target account already has this fit' using errcode = '22023';
  end if;

  v_hash := private.approval_payload_hash(jsonb_build_object('conta', p_target_account_id, 'aderencia', p_fit,
    'motivo', v_reason));
  select a.id into v_existing from private.approvals a
  where a.run_id = p_run_id and a.category = 'aderencia' and a.target_account_id = p_target_account_id
    and a.payload_hash = v_hash
  order by a.created_at desc
  limit 1;
  if v_existing is not null then
    return query select v_existing, 'existente'::text, v_account.name;
    return;
  end if;

  v_label := case p_fit when 'fit' then 'Fit' else 'Não fit' end;
  insert into private.approvals (
    workspace_id, agent_id, integration_id, run_id, requested_by, action, impact, justification, payload, payload_hash,
    target_account_id, state, category
  ) values (
    v_run.workspace_id, p_agent_id, null, p_run_id, v_run.requested_by,
    left('Aderência ' || v_label || ' para ' || v_account.name, 300),
    case p_fit
      when 'fit' then 'Aprovar grava Fit na Conta-alvo e leva o cartão a Fit, se ele ainda não passou de lá.'
      else 'Aprovar grava Não fit na Conta-alvo e leva o cartão a Descartada.'
    end || ' Recusar não muda nada.',
    left(v_reason, 2000),
    jsonb_build_object('tipo', 'aderencia', 'conta', v_account.name, 'aderencia', p_fit, 'motivo', v_reason),
    v_hash, p_target_account_id, 'pendente', 'aderencia'
  ) returning id into v_id;
  perform private.approval_transition(v_id, null, 'pendente', null, 'proposta do ' || v_agent.name);
  return query select v_id, 'pendente'::text, v_account.name;
end;
$$;

revoke all on function public.agent_propose_account_fit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.agent_propose_account_fit(uuid, uuid, uuid, text, text) to service_role;

-- 6. `decide_approval` (corpo de 20261105100000) com a Aderência proposta: só o Vendedor responsável pela Conta-alvo a
--    decide, como a Sequência. Recusar só registra. Aprovar grava a Aderência (o Scopus avaliou, quem aprovou fica
--    registrado) e move o cartão; se a Conta não existe mais, a Aprovação é recusada pelo sistema, com o motivo. As
--    outras categorias seguem exatamente como antes.
create or replace function public.decide_approval(p_approval_id uuid, p_decision text, p_where text default 'fila')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_to text;
  v_current integer;
  v_version integer;
  v_role text;
  v_reason text;
  v_contact text;
  v_document jsonb;
  v_sequence public.sequences;
begin
  if p_decision not in ('aprovar', 'recusar') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  if p_where not in ('fila', 'conversa', 'canal') then
    raise exception 'unknown decision place' using errcode = '22023';
  end if;
  -- A revisão trava a seção antes da linha, na mesma ordem de quem grava uma versão (a trava e depois as revisões).
  select * into v from private.approvals a where a.id = p_approval_id;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  if v.category = 'revisao' then
    perform pg_advisory_xact_lock(hashtext('playbook:' || v.workspace_id::text || ':' || v.playbook_section));
  end if;
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  v_role := private.require_active_membership(v.workspace_id);
  if v.category in ('sequencia', 'aderencia') then
    if not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v.workspace_id and r.target_account_id = v.target_account_id::text
        and r.owner_user_id = auth.uid()
    ) then
      if v.category = 'aderencia' then
        raise exception 'only the responsible seller of the target account decides this fit' using errcode = '42501';
      end if;
      raise exception 'only the responsible seller of the target account decides this sequence' using errcode = '42501';
    end if;
  elsif v_role <> 'admin' then
    raise exception 'only administrators can decide approvals' using errcode = '42501';
  end if;
  if v.state = 'pendente' and v.expires_at <= now() then
    update private.approvals set state = 'expirada', updated_at = now() where id = v.id;
    perform private.approval_transition(v.id, 'pendente', 'expirada', null, null);
    return 'expirada';
  end if;
  if v.state <> 'pendente' then
    raise exception 'the approval was already decided' using errcode = '55000';
  end if;

  if v.category = 'revisao' and p_decision = 'aprovar' then
    select coalesce(max(x.version), 0) into v_current
    from private.playbook_section_versions x
    where x.workspace_id = v.workspace_id and x.section = v.playbook_section;
    if v_current <> v.base_version then
      update private.approvals set
        state = 'desatualizada', decided_by_kind = 'pessoa', decided_by = auth.uid(), decided_where = p_where,
        decided_at = now(), updated_at = now()
      where id = v.id;
      perform private.approval_transition(v.id, 'pendente', 'desatualizada', auth.uid(),
        'a seção está na versão ' || v_current || ', e a proposta partiu da versão ' || v.base_version);
      return 'desatualizada';
    end if;
  end if;

  if v.category = 'sequencia' and p_decision = 'aprovar' then
    -- O que mudou desde a proposta: a Conta, uma Sequência em andamento, cada Contato. O conteúdo vem da linha lida
    -- antes da decisão: a linha o esquece ao sair de pendente.
    if not exists (
      select 1 from public.target_accounts a
      where a.id = v.target_account_id and a.workspace_id = v.workspace_id and a.deleted_at is null
    ) then
      v_reason := 'a Conta-alvo não existe mais';
    elsif exists (
      select 1 from public.sequences s
      where s.workspace_id = v.workspace_id and s.target_account_id = v.target_account_id::text
        and s.status <> 'encerrada'
    ) then
      v_reason := 'a Conta-alvo já tem uma Sequência em andamento';
    else
      for v_contact in select c ->> 'id' from jsonb_array_elements(v.proposed_content -> 'contatos') t(c) loop
        v_reason := case private.sequence_contact_problem(v.workspace_id, v.target_account_id, v_contact::uuid)
          when 'not_linked' then 'um Contato não está mais vinculado à Conta-alvo'
          when 'no_email' then 'um Contato está sem e-mail'
          when 'suppressed' then 'um Contato se descadastrou'
          when 'in_other_sequence' then 'um Contato já está em outra Sequência'
        end;
        exit when v_reason is not null;
      end loop;
    end if;

    if v_reason is null then
      v_document := private.sequence_document_from_proposal(v.proposed_content);
      begin
        select s.* into v_sequence from public.create_sequence(
          v.workspace_id, v.target_account_id::text, v_document,
          jsonb_build_object('totalParticipantes', jsonb_array_length(v_document -> 'participantesIds'),
            'totalSteps', jsonb_array_length(v_document -> 'steps'), 'passoAtual', 0)) s;
      exception when unique_violation then
        v_reason := 'a Conta-alvo já tem uma Sequência em andamento';
      end;
    end if;

    if v_reason is not null then
      update private.approvals set
        state = 'recusada', decided_by_kind = null, decided_by = null, decided_where = p_where, decided_at = now(),
        failure = v_reason, updated_at = now()
      where id = v.id;
      perform private.approval_transition(v.id, 'pendente', 'recusada', null, 'recusada pelo sistema: ' || v_reason);
      return 'recusada';
    end if;

    update private.approvals set
      state = 'aprovada', decided_by_kind = 'pessoa', decided_by = auth.uid(), decided_where = p_where,
      decided_at = now(), created_sequence_id = v_sequence.id, updated_at = now()
    where id = v.id;
    perform private.approval_transition(v.id, 'pendente', 'aprovada', auth.uid(), 'Sequência criada, envios não ativados');
    return 'aprovada';
  end if;

  if v.category = 'aderencia' and p_decision = 'aprovar' then
    if not exists (
      select 1 from public.target_accounts a
      where a.id = v.target_account_id and a.workspace_id = v.workspace_id and a.deleted_at is null
    ) then
      update private.approvals set
        state = 'recusada', decided_by_kind = null, decided_by = null, decided_where = p_where, decided_at = now(),
        failure = 'a Conta-alvo não existe mais', updated_at = now()
      where id = v.id;
      perform private.approval_transition(v.id, 'pendente', 'recusada', null,
        'recusada pelo sistema: a Conta-alvo não existe mais');
      return 'recusada';
    end if;

    update private.approvals set
      state = 'aprovada', decided_by_kind = 'pessoa', decided_by = auth.uid(), decided_where = p_where,
      decided_at = now(), updated_at = now()
    where id = v.id;
    perform private.apply_account_fit(v.workspace_id, v.target_account_id, v.payload ->> 'aderencia',
      v.payload ->> 'motivo', 'agente', auth.uid(), v.agent_id, v.id);
    perform private.approval_transition(v.id, 'pendente', 'aprovada', auth.uid(), 'Aderência gravada');
    return 'aprovada';
  end if;

  v_to := case when p_decision = 'aprovar' then 'aprovada' else 'recusada' end;
  update private.approvals set
    state = v_to, decided_by_kind = 'pessoa', decided_by = auth.uid(), decided_where = p_where, decided_at = now(),
    updated_at = now()
  where id = v.id;
  if v.category = 'revisao' and v_to = 'aprovada' then
    -- O conteúdo vem da linha lida antes da decisão: a linha já o esqueceu ao sair de pendente.
    v_version := private.write_playbook_version(v.workspace_id, v.playbook_section, v.proposed_content);
    update private.approvals set applied_version = v_version where id = v.id;
    perform private.approval_transition(v.id, 'pendente', v_to, auth.uid(), 'versão ' || v_version || ' gravada');
  else
    perform private.approval_transition(v.id, 'pendente', v_to, auth.uid(), null);
  end if;
  return v_to;
end;
$$;

revoke all on function public.decide_approval(uuid, text, text) from public, anon;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;

-- `cancel_approval` (corpo de 20261105100000): a Aderência proposta, como a revisão e a Sequência, só se cancela
-- enquanto pendente. Aprovada, ela já gravou a Aderência, e cancelar diria o contrário do que aconteceu.
create or replace function public.cancel_approval(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_role text;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  v_role := private.require_active_membership(v.workspace_id);
  if v_role <> 'admin' and v.requested_by is distinct from auth.uid() then
    raise exception 'only the requester or an administrator can cancel' using errcode = '42501';
  end if;
  if v.state not in ('pendente', 'aprovada')
     or (v.category in ('revisao', 'sequencia', 'aderencia') and v.state <> 'pendente') then
    raise exception 'the approval can no longer be cancelled' using errcode = '55000';
  end if;
  update private.approvals set state = 'cancelada', updated_at = now() where id = v.id;
  perform private.approval_transition(v.id, v.state, 'cancelada', auth.uid(), null);
end;
$$;

revoke all on function public.cancel_approval(uuid) from public, anon;
grant execute on function public.cancel_approval(uuid) to authenticated;
