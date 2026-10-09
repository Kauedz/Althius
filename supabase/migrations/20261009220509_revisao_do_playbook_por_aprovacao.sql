-- A Revisão do Playbook por Aprovação (CRM-09, ADR-0010; agentes-em-conversa 05). Numa Conversa, o Scopus e o Ethos
-- propõem uma nova versão de uma seção do Playbook da Especialidade deles (o Scopus o ICP e o Mercado; o Ethos as
-- Personas, o Processo de compra, a Dor e percepção e as Objeções). A proposta vira uma Aprovação da categoria `revisao`,
-- na mesma fila das ações em Integrações: não passa por Integração nem por Permissão, nasce sempre pendente e só um
-- Administrador ativo a decide, conferido aqui. Aprovar grava a versão nova da seção na mesma transação, com o
-- Administrador como autor; a Aprovação guarda qual Agente e qual Execução propuseram, quem pediu e a versão que gravou.
-- Daí em diante, quem lê o Playbook (os Agentes por `playbook_for_specialty`, as telas do Playbook e da Memória) lê a
-- versão aprovada. Se a seção mudou depois da proposta, a aprovação não sobrescreve: a revisão fica `desatualizada`.
-- Decidida (ou expirada, cancelada, desatualizada), a revisão guarda só o registro: o conteúdo proposto é apagado, e o
-- aprovado fica no Playbook. As Aprovações de ação seguem exatamente como antes.
--
-- Redefinidas a partir da definição mais recente da main: `decide_approval`, `cancel_approval` e `list_approvals`
-- (20261001130000) e `private.erase_agent_memory` (20260929160000). `list_approvals` muda as colunas que devolve, então
-- é apagada e criada de novo na mesma transação. Nenhum dado é apagado.

-- 1. A categoria e o que a revisão guarda. A ação continua exigindo a Integração; a revisão não tem Integração.
alter table private.approvals
  add column category text not null default 'acao' check (category in ('acao', 'revisao')),
  add column playbook_section text references private.playbook_section_catalog(section),
  add column base_version integer check (base_version >= 0),
  add column proposed_content jsonb,
  add column applied_version integer check (applied_version > 0);

alter table private.approvals alter column integration_id drop not null;

-- `desatualizada`: a seção ganhou outra versão antes de a revisão ser aprovada. Só uma revisão chega a esse estado.
alter table private.approvals drop constraint approvals_state_check;
alter table private.approvals add constraint approvals_state_check check (state in (
  'pendente', 'aprovada', 'recusada', 'cancelada', 'expirada', 'executando', 'executada', 'falhou', 'desatualizada'
));

alter table private.approvals add constraint approvals_category_shape check (
  case category
    when 'acao' then integration_id is not null and playbook_section is null and base_version is null
      and proposed_content is null and applied_version is null and state <> 'desatualizada'
    else integration_id is null and playbook_section is not null and base_version is not null
      and state not in ('executando', 'executada', 'falhou')
  end
);

create index approvals_playbook_section_idx on private.approvals (playbook_section);

-- 2. O texto de um conteúdo do Playbook (o texto e cada valor das linhas), para procurar um nome nele.
create function private.playbook_content_text(p_content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(' ',
    p_content ->> 'texto',
    (select string_agg(c.value, ' ')
     from jsonb_array_elements(case when jsonb_typeof(p_content -> 'linhas') = 'array' then p_content -> 'linhas' else '[]'::jsonb end) l
     cross join lateral jsonb_each_text(case when jsonb_typeof(l) = 'object' then l else '{}'::jsonb end) c))
$$;

-- O conteúdo sempre com as duas chaves, para a comparação e o hash não dependerem de uma chave ausente.
create function private.playbook_content_normalized(p_content jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('texto', coalesce(p_content ->> 'texto', ''), 'linhas', coalesce(p_content -> 'linhas', '[]'::jsonb))
$$;

revoke all on function private.playbook_content_text(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.playbook_content_normalized(jsonb) from public, anon, authenticated, service_role;

-- 3. Saiu de pendente, a revisão esquece o conteúdo proposto (ADR-0010): a fila não vira um histórico do Playbook.
create function private.forget_revision_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.proposed_content := null;
  return new;
end;
$$;

revoke all on function private.forget_revision_content() from public, anon, authenticated, service_role;

create trigger approvals_forget_revision_content
  before update of state on private.approvals
  for each row
  when (new.category = 'revisao' and new.state <> 'pendente')
  execute function private.forget_revision_content();

-- 4. Uma versão nova da seção (o Administrador salvou, restaurou ou aprovou outra revisão) deixa desatualizadas as
--    revisões ainda pendentes dela: elas partiram da versão anterior. A revisão que está sendo aprovada já saiu de
--    pendente antes de a versão ser gravada.
create function private.outdate_pending_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  for v in
    update private.approvals a set state = 'desatualizada', updated_at = now()
    where a.workspace_id = new.workspace_id and a.category = 'revisao' and a.playbook_section = new.section
      and a.state = 'pendente'
    returning a.id
  loop
    perform private.approval_transition(v.id, 'pendente', 'desatualizada', new.created_by,
      'a seção ganhou a versão ' || new.version || ' antes da decisão');
  end loop;
  return null;
end;
$$;

revoke all on function private.outdate_pending_revisions() from public, anon, authenticated, service_role;

create trigger playbook_version_outdates_revisions
  after insert on private.playbook_section_versions
  for each row
  execute function private.outdate_pending_revisions();

-- 5. O Agente propõe uma nova versão de uma seção. Só o servidor, a partir de uma Execução em andamento. Confere que o
--    Agente é do Workspace da Execução, que a Especialidade dele é o Scopus ou o Ethos e que a seção é dela (a Empresa
--    não é de ninguém), que quem pediu ainda participa e que o conteúdo é válido e muda a seção. Nasce sempre pendente,
--    mesmo com a Permissão Executar em alguma Integração. A mesma proposta repetida na mesma Execução (mesma seção, mesma
--    versão de partida, mesmo conteúdo) devolve a Aprovação que já existe (`existente`).
create function public.agent_propose_playbook_revision(
  p_run_id uuid, p_agent_id uuid, p_section text, p_content jsonb, p_justification text default ''
) returns table (approval_id uuid, outcome text, section_name text, base_version integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_agent private.agents%rowtype;
  v_name text;
  v_content jsonb;
  v_base integer;
  v_current jsonb;
  v_hash text;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_agent from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_agent.id is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  perform private.require_playbook_section(p_section);
  if v_agent.specialty not in ('scopus', 'ethos') or not exists (
    select 1 from private.playbook_specialty_sections m where m.specialty = v_agent.specialty and m.section = p_section
  ) then
    raise exception 'the agent specialty does not propose this playbook section' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  perform private.validate_playbook_content(p_content);
  v_content := private.playbook_content_normalized(p_content);
  select c.name into v_name from private.playbook_section_catalog c where c.section = p_section;

  -- A mesma trava de `write_playbook_version`: a versão de partida não muda enquanto a proposta nasce.
  perform pg_advisory_xact_lock(hashtext('playbook:' || v_run.workspace_id::text || ':' || p_section));
  select x.version, x.content into v_base, v_current
  from private.playbook_section_versions x
  where x.workspace_id = v_run.workspace_id and x.section = p_section
  order by x.version desc
  limit 1;
  v_base := coalesce(v_base, 0);
  if v_current is not null and private.playbook_content_normalized(v_current) = v_content then
    raise exception 'the revision does not change the playbook section' using errcode = '22023';
  end if;

  v_hash := private.approval_payload_hash(jsonb_build_object('secao', p_section, 'base', v_base, 'conteudo', v_content));
  select a.id into v_existing from private.approvals a
  where a.run_id = p_run_id and a.category = 'revisao' and a.playbook_section = p_section and a.payload_hash = v_hash
  order by a.created_at desc
  limit 1;
  if v_existing is not null then
    return query select v_existing, 'existente'::text, v_name, v_base;
    return;
  end if;

  insert into private.approvals (
    workspace_id, agent_id, integration_id, run_id, requested_by, action, impact, justification, payload, payload_hash,
    state, category, playbook_section, base_version, proposed_content
  ) values (
    v_run.workspace_id, p_agent_id, null, p_run_id, v_run.requested_by,
    'Nova versão de ' || v_name || ' no Playbook',
    'Aprovar grava a versão ' || (v_base + 1) || ' de ' || v_name || ', que os Agentes e as telas passam a usar no lugar '
      || case when v_base = 0 then 'da seção vazia' else 'da versão ' || v_base end || '. Recusar não muda o Playbook.',
    left(btrim(coalesce(p_justification, '')), 2000),
    jsonb_build_object('tipo', 'revisao_do_playbook', 'secao', p_section, 'versao_base', v_base),
    v_hash, 'pendente', 'revisao', p_section, v_base, v_content
  ) returning id into v_id;
  perform private.approval_transition(v_id, null, 'pendente', null, 'proposta do ' || v_agent.name);
  return query select v_id, 'pendente'::text, v_name, v_base;
end;
$$;

revoke all on function public.agent_propose_playbook_revision(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.agent_propose_playbook_revision(uuid, uuid, text, jsonb, text) to service_role;

-- 6. `decide_approval` (corpo de 20261001130000) com a revisão: só um Administrador ativo decide, como nas ações. Recusar
--    só registra. Aprovar confere, sob a trava da seção, que a versão vigente ainda é a de partida: se não for, a revisão
--    fica `desatualizada` e nada é gravado; se for, grava a versão nova (autor: quem aprovou) e guarda o número dela.
--    Devolve aprovada, recusada, expirada ou desatualizada.
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
  if private.require_active_membership(v.workspace_id) <> 'admin' then
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

-- `cancel_approval` (corpo de 20261001130000): uma revisão só se cancela enquanto pendente. Aprovada, ela já gravou a
-- versão, e cancelar diria o contrário do que aconteceu.
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
  if v.state not in ('pendente', 'aprovada') or (v.category = 'revisao' and v.state <> 'pendente') then
    raise exception 'the approval can no longer be cancelled' using errcode = '55000';
  end if;
  update private.approvals set state = 'cancelada', updated_at = now() where id = v.id;
  perform private.approval_transition(v.id, v.state, 'cancelada', auth.uid(), null);
end;
$$;

-- 7. `list_approvals` (corpo de 20261001130000) com a categoria e, na revisão, a seção, a versão de partida, a versão que a
--    aprovação gravou e, só enquanto pendente, o conteúdo proposto. Todo Participante ativo lê.
drop function public.list_approvals(uuid);

create function public.list_approvals(p_workspace_id uuid)
returns table (
  id uuid, agent_id uuid, integration_id text, action text, impact text, justification text, payload jsonb,
  target_account_id uuid, state text, decided_by_kind text, decided_by uuid, decided_where text, decided_at timestamptz,
  expires_at timestamptz, executed_at timestamptz, failure text, created_at timestamptz,
  category text, playbook_section text, base_version integer, applied_version integer, proposed_content jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.expire_approvals();
  return query
    select a.id, a.agent_id, a.integration_id, a.action, a.impact, a.justification, a.payload, a.target_account_id,
      a.state, a.decided_by_kind, a.decided_by, a.decided_where, a.decided_at, a.expires_at, a.executed_at, a.failure,
      a.created_at, a.category, a.playbook_section, a.base_version, a.applied_version,
      case when a.state = 'pendente' then a.proposed_content end
    from private.approvals a
    where a.workspace_id = p_workspace_id
    order by a.created_at desc, a.id;
end;
$$;

revoke all on function public.list_approvals(uuid) from public, anon;
grant execute on function public.list_approvals(uuid) to authenticated;

-- 8. `private.erase_agent_memory` (corpo de 20260929160000): apagar uma Conta ou um Contato também cancela a revisão
--    pendente que cita o nome, o e-mail, o telefone ou o LinkedIn dele, pela mesma regra dos fatos da Memória (trechos de
--    5 caracteres ou mais). Cancelada, ela esquece o conteúdo. O Playbook vigente é o texto da empresa e não muda aqui.
--    Devolve, como antes, quantos fatos da Memória saíram.
create or replace function private.erase_agent_memory(p_workspace_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v record;
begin
  delete from private.agent_memory_facts f
  where f.workspace_id = p_workspace_id
    and exists (
      select 1 from unnest(p_needles) n
      where length(btrim(coalesce(n, ''))) >= 5 and position(lower(btrim(n)) in lower(f.content)) > 0);
  get diagnostics v_count = row_count;

  for v in
    update private.approvals a set state = 'cancelada', updated_at = now()
    where a.workspace_id = p_workspace_id and a.category = 'revisao' and a.state = 'pendente'
      and exists (
        select 1 from unnest(p_needles) n
        where length(btrim(coalesce(n, ''))) >= 5
          and position(lower(btrim(n)) in lower(private.playbook_content_text(a.proposed_content))) > 0)
    returning a.id
  loop
    perform private.approval_transition(v.id, 'pendente', 'cancelada', null,
      'a proposta citava uma Conta ou um Contato que foi apagado');
  end loop;
  return v_count;
end;
$$;

revoke all on function private.erase_agent_memory(uuid, text[]) from public, anon, authenticated, service_role;
