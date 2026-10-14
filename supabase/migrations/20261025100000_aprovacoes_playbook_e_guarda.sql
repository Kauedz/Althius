-- Aprovações, Playbook e guarda em dólar (aprovacoes-playbook-automacao-tetos).
--
-- 1. Uma regra só para editar o Playbook (que é a Memória do Workspace operacional): o Administrador grava direto
--    (save_playbook_section, versão nova); o Membro propõe uma revisão que vai para Aprovações, como os Agentes.
--    A proposta do Membro fica no nome do Agente padrão da Especialidade dona da seção (Scopus para a Empresa) e
--    quem pediu é o Membro. A mesma proposta pendente repetida devolve a Aprovação que já existe.
-- 2. A guarda interna em dólar (`contract_tiers.internal_usd_guard`) vira o teto de Sinais ao criar o contrato ou trocar
--    a faixa. A Equipe, com créditos ilimitados, segue sem teto. A migração alinha os contratos que já existem.

create or replace function public.propose_playbook_revision(
  p_workspace_id uuid, p_section text, p_content jsonb, p_justification text default ''
) returns table (approval_id uuid, outcome text, section_name text, base_version integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_agent uuid;
  v_name text;
  v_content jsonb;
  v_base integer;
  v_current jsonb;
  v_hash text;
  v_existing uuid;
  v_id uuid;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.require_playbook_section(p_section);
  perform private.validate_playbook_content(p_content);
  v_content := private.playbook_content_normalized(p_content);
  select c.name into v_name from private.playbook_section_catalog c where c.section = p_section;

  select a.id into v_agent
  from private.agents a
  left join private.playbook_specialty_sections m on m.specialty = a.specialty and m.section = p_section
  where a.workspace_id = p_workspace_id and a.kind = 'padrao' and (m.section is not null or a.specialty = 'scopus')
  order by (m.section is null), a.specialty
  limit 1;
  if v_agent is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('playbook:' || p_workspace_id::text || ':' || p_section));
  select x.version, x.content into v_base, v_current
  from private.playbook_section_versions x
  where x.workspace_id = p_workspace_id and x.section = p_section
  order by x.version desc
  limit 1;
  v_base := coalesce(v_base, 0);
  if v_current is not null and private.playbook_content_normalized(v_current) = v_content then
    raise exception 'the revision does not change the playbook section' using errcode = '22023';
  end if;

  v_hash := private.approval_payload_hash(jsonb_build_object('secao', p_section, 'base', v_base, 'conteudo', v_content));
  select a.id into v_existing from private.approvals a
  where a.workspace_id = p_workspace_id and a.requested_by = v_user and a.run_id is null and a.category = 'revisao'
    and a.state = 'pendente' and a.playbook_section = p_section and a.payload_hash = v_hash
  limit 1;
  if v_existing is not null then
    return query select v_existing, 'existente'::text, v_name, v_base;
    return;
  end if;

  insert into private.approvals (
    workspace_id, agent_id, integration_id, run_id, requested_by, action, impact, justification, payload, payload_hash,
    state, category, playbook_section, base_version, proposed_content
  ) values (
    p_workspace_id, v_agent, null, null, v_user,
    'Nova versão de ' || v_name || ' no Playbook',
    'Aprovar grava a versão ' || (v_base + 1) || ' de ' || v_name || ', que os Agentes e as telas passam a usar no lugar '
      || case when v_base = 0 then 'da seção vazia' else 'da versão ' || v_base end || '. Recusar não muda o Playbook.',
    left(btrim(coalesce(p_justification, '')), 2000),
    jsonb_build_object('tipo', 'revisao_do_playbook', 'secao', p_section, 'versao_base', v_base, 'origem', 'participante'),
    v_hash, 'pendente', 'revisao', p_section, v_base, v_content
  ) returning id into v_id;
  perform private.approval_transition(v_id, null, 'pendente', v_user, 'proposta de um Participante');
  return query select v_id, 'criada'::text, v_name, v_base;
end;
$$;
revoke all on function public.propose_playbook_revision(uuid, text, jsonb, text) from public, anon;
grant execute on function public.propose_playbook_revision(uuid, text, jsonb, text) to authenticated;

-- 2. A guarda da faixa no teto de Sinais, ao criar o contrato ou trocar a faixa.
create or replace function private.sync_contract_usd_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.credits_unlimited(new.workspace_id) then
    return new;
  end if;
  insert into private.workspace_signal_budget (workspace_id, monthly_cap_usd)
  select new.workspace_id, t.internal_usd_guard from private.contract_tiers t where t.id = new.tier_id
  on conflict (workspace_id) do update set monthly_cap_usd = excluded.monthly_cap_usd
  where private.workspace_signal_budget.monthly_cap_usd is distinct from excluded.monthly_cap_usd;
  return new;
end;
$$;
revoke all on function private.sync_contract_usd_guard() from public, anon, authenticated;

create or replace trigger workspace_contracts_usd_guard
  after insert or update of tier_id, starts_at, status on private.workspace_contracts
  for each row execute function private.sync_contract_usd_guard();

-- Os contratos que já existem.
insert into private.workspace_signal_budget (workspace_id, monthly_cap_usd)
select c.workspace_id, t.internal_usd_guard
from private.workspace_contracts c
join private.contract_tiers t on t.id = c.tier_id
where not private.credits_unlimited(c.workspace_id)
on conflict (workspace_id) do update set monthly_cap_usd = excluded.monthly_cap_usd
where private.workspace_signal_budget.monthly_cap_usd is distinct from excluded.monthly_cap_usd;
