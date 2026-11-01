-- Sinais first 11 (ADR-0033 D3 e D9(b)): Sequência sem exigir o Rhetor. As quatro RPCs da Sequência
-- (`agent_read_sequence_contacts` e `agent_propose_sequence`, de 20261105100000; `agent_suggest_althius_sequence_template`,
-- de 20261107120000; `agent_suggest_own_sequence_template`, de 20261108120000) recusavam qualquer Agente cuja Especialidade
-- não fosse `rhetor`. A escrita de Sequência vira um passo interno com Permissão própria (ADR-0002: Ler, Propor,
-- Executar), dada por Agente, e a trava passa a ser "tem Permissão de Propor em Sequência".
--
-- A Permissão de passo interno não usa `private.agent_permissions`, que é por Integração do catálogo (as Conexões): a
-- Sequência não passa por Integração. Por isso há uma tabela própria, `private.agent_step_permissions`, hoje só com o
-- passo `sequencia`.
--
-- Comportamento de quem usa o Rhetor hoje não muda: todo Agente de Especialidade `rhetor` (padrão e criado) recebe Propor
-- em Sequência aqui, e um gatilho dá o mesmo ao Rhetor que `private.seed_default_agents` (sem mudança) semear num
-- Workspace novo, até o ticket 13 parar a semeadura. Migration só aditiva: nenhuma linha é apagada; as quatro RPCs são
-- redefinidas a partir da última versão de cada uma na main, mudando só a trava e a mensagem (sem citar Especialidade).
-- `private.specialty_catalog`, `private.protect_default_agent` e `private.seed_default_agents` não mudam.

-- A Permissão de cada Agente em cada passo interno. Sem linha, o Agente não faz o passo.
create table private.agent_step_permissions (
  agent_id uuid not null,
  workspace_id uuid not null,
  step text not null check (step in ('sequencia')),
  permission text not null check (permission in ('ler', 'propor', 'executar')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (agent_id, step),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_step_permissions_workspace_agent_idx on private.agent_step_permissions (workspace_id, agent_id);
create index agent_step_permissions_updated_by_idx on private.agent_step_permissions (updated_by);
alter table private.agent_step_permissions enable row level security;
revoke all on private.agent_step_permissions from public, anon, authenticated, service_role;

-- O Agente pode propor (ou sugerir modelo de) Sequência no Workspace: Propor ou Executar no passo `sequencia`. A
-- Sequência proposta nasce sempre pendente, então Executar não pula a Aprovação.
create or replace function private.agent_can_propose_sequence(p_workspace_id uuid, p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.agent_step_permissions p
    where p.workspace_id = p_workspace_id and p.agent_id = p_agent_id
      and p.step = 'sequencia' and p.permission in ('propor', 'executar')
  );
$$;

revoke all on function private.agent_can_propose_sequence(uuid, uuid) from public, anon, authenticated, service_role;

-- Quem é Rhetor hoje continua propondo.
insert into private.agent_step_permissions (agent_id, workspace_id, step, permission)
select a.id, a.workspace_id, 'sequencia', 'propor'
from private.agents a where a.specialty = 'rhetor'
on conflict (agent_id, step) do nothing;

-- O Rhetor semeado depois desta migration (Workspace novo, até o ticket 13) também propõe.
create or replace function private.grant_rhetor_sequence_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.specialty = 'rhetor' then
    insert into private.agent_step_permissions (agent_id, workspace_id, step, permission)
    values (new.id, new.workspace_id, 'sequencia', 'propor')
    on conflict (agent_id, step) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_rhetor_sequence_step() from public, anon, authenticated, service_role;
create trigger agents_grant_rhetor_sequence_step
after insert on private.agents
for each row execute function private.grant_rhetor_sequence_step();

-- Leitura de Contatos: o gate é a Permissão de Propor em Sequência, não a Especialidade.
create or replace function public.agent_read_sequence_contacts(p_run_id uuid, p_agent_id uuid, p_target_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_agent private.agents%rowtype;
  v_account public.target_accounts%rowtype;
begin
  select * into v_agent from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_agent.id is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if not private.agent_can_propose_sequence(v_run.workspace_id, v_agent.id) then
    raise exception 'sequence: the agent has no permission to propose sequences' using errcode = '42501';
  end if;
  select * into v_account from public.target_accounts a
  where a.id = p_target_account_id and a.workspace_id = v_run.workspace_id and a.archived_at is null
    and a.deleted_at is null;
  if v_account.id is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'conta', v_account.name,
    'responsavel_e_quem_pediu', exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_run.workspace_id and r.target_account_id = v_account.id::text
        and r.owner_user_id = v_run.requested_by),
    'sequencia_em_andamento', exists (
      select 1 from public.sequences s
      where s.workspace_id = v_run.workspace_id and s.target_account_id = v_account.id::text and s.status <> 'encerrada'),
    'contatos', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.name, 'cargo', c.role,
          'pode_entrar', c.problema is null, 'motivo', c.problema) order by c.name)
      from (
        select c2.id, c2.name, c2.role,
          private.sequence_contact_problem(v_run.workspace_id, v_account.id, c2.id) as problema
        from public.contacts c2
        where c2.workspace_id = v_run.workspace_id and c2.archived_at is null
          and exists (
            select 1 from public.contact_account_links l
            where l.workspace_id = v_run.workspace_id and l.contact_id = c2.id and l.target_account_id = v_account.id
              and l.ended_at is null)
        order by c2.name
        limit 20
      ) c), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.agent_read_sequence_contacts(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.agent_read_sequence_contacts(uuid, uuid, uuid) to service_role;

-- Proposta de Sequência: o gate é a Permissão de Propor em Sequência, não a Especialidade.
create or replace function public.agent_propose_sequence(
  p_run_id uuid,
  p_agent_id uuid,
  p_target_account_id uuid,
  p_contacts uuid[],
  p_steps jsonb,
  p_justification text default ''
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
  v_contacts uuid[];
  v_contact uuid;
  v_problem text;
  v_step jsonb;
  v_wait text;
  v_unknown text[];
  v_passos jsonb := '[]'::jsonb;
  v_contatos jsonb;
  v_content jsonb;
  v_hash text;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_agent from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_agent.id is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if not private.agent_can_propose_sequence(v_run.workspace_id, v_agent.id) then
    raise exception 'sequence: the agent has no permission to propose sequences' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  select * into v_account from public.target_accounts a
  where a.id = p_target_account_id and a.workspace_id = v_run.workspace_id and a.archived_at is null
    and a.deleted_at is null;
  if v_account.id is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_run.workspace_id and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = v_run.requested_by
  ) then
    raise exception 'sequence: the requester is not the responsible seller of the target account' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.sequences s
    where s.workspace_id = v_run.workspace_id and s.target_account_id = p_target_account_id::text
      and s.status <> 'encerrada'
  ) then
    raise exception 'sequence: the target account already has a sequence in progress' using errcode = '23505';
  end if;

  -- Os Contatos, sem repetição e na ordem pedida.
  select coalesce(array_agg(c order by n), '{}') into v_contacts
  from (select c, min(n) as n from unnest(p_contacts) with ordinality as t(c, n) where c is not null group by c) x;
  if cardinality(v_contacts) not between 1 and 5 then
    raise exception 'sequence: between 1 and 5 contacts' using errcode = '22023';
  end if;
  foreach v_contact in array v_contacts loop
    v_problem := private.sequence_contact_problem(v_run.workspace_id, p_target_account_id, v_contact);
    if v_problem = 'not_linked' then
      raise exception 'sequence: contact is not linked to the target account' using errcode = '22023';
    elsif v_problem = 'no_email' then
      raise exception 'sequence: contact has no e-mail' using errcode = '22023';
    elsif v_problem = 'suppressed' then
      raise exception 'sequence: contact is suppressed' using errcode = '22023';
    elsif v_problem = 'in_other_sequence' then
      raise exception 'sequence: contact is in another active sequence' using errcode = '22023';
    end if;
  end loop;

  -- Os passos: só E-mail, de 1 a 8, cada um com espera inteira de 0 a 60 dias, assunto e corpo, sem variável que não
  -- existe.
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) not between 1 and 8 then
    raise exception 'sequence: between 1 and 8 steps' using errcode = '22023';
  end if;
  for v_step in select s from jsonb_array_elements(p_steps) t(s) loop
    if jsonb_typeof(v_step) <> 'object' then
      raise exception 'sequence: invalid step' using errcode = '22023';
    end if;
    if coalesce(v_step ->> 'canal', 'email') <> 'email' then
      raise exception 'sequence: only e-mail steps' using errcode = '22023';
    end if;
    v_wait := case when jsonb_typeof(v_step -> 'esperaEmDias') = 'number' then v_step ->> 'esperaEmDias' end;
    if coalesce(v_wait, '') !~ '^[0-9]{1,2}$' then
      raise exception 'sequence: invalid step wait' using errcode = '22023';
    end if;
    if v_wait::int > 60 then
      raise exception 'sequence: invalid step wait' using errcode = '22023';
    end if;
    if jsonb_typeof(v_step -> 'assunto') is distinct from 'string'
      or length(btrim(v_step ->> 'assunto')) not between 1 and 200
      or jsonb_typeof(v_step -> 'corpo') is distinct from 'string'
      or length(btrim(v_step ->> 'corpo')) not between 1 and 5000 then
      raise exception 'sequence: invalid step text' using errcode = '22023';
    end if;
    v_unknown := private.unknown_step_variables((v_step ->> 'assunto') || ' ' || (v_step ->> 'corpo'));
    if cardinality(v_unknown) > 0 then
      raise exception 'sequence: unknown variable: %', array_to_string(v_unknown, ', ') using errcode = '22023';
    end if;
    v_passos := v_passos || jsonb_build_array(jsonb_build_object(
      'esperaEmDias', v_wait::int,
      'assunto', btrim(v_step ->> 'assunto'),
      'corpo', btrim(v_step ->> 'corpo')
    ));
  end loop;

  select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.name, 'cargo', c.role) order by x.n) into v_contatos
  from unnest(v_contacts) with ordinality as x(id, n)
  join public.contacts c on c.id = x.id;
  v_content := jsonb_build_object('contatos', v_contatos, 'passos', v_passos);

  v_hash := private.approval_payload_hash(jsonb_build_object(
    'conta', p_target_account_id, 'contatos', to_jsonb(v_contacts), 'passos', v_passos));
  select a.id into v_existing from private.approvals a
  where a.run_id = p_run_id and a.category = 'sequencia' and a.target_account_id = p_target_account_id
    and a.payload_hash = v_hash
  order by a.created_at desc
  limit 1;
  if v_existing is not null then
    return query select v_existing, 'existente'::text, v_account.name;
    return;
  end if;

  insert into private.approvals (
    workspace_id, agent_id, integration_id, run_id, requested_by, action, impact, justification, payload, payload_hash,
    target_account_id, state, category, proposed_content
  ) values (
    v_run.workspace_id, p_agent_id, null, p_run_id, v_run.requested_by,
    left('Sequência de E-mail para ' || v_account.name, 300),
    'Aprovar cria a Sequência com ' || cardinality(v_contacts)
      || case when cardinality(v_contacts) = 1 then ' Contato' else ' Contatos' end || ' e '
      || jsonb_array_length(v_passos) || case when jsonb_array_length(v_passos) = 1 then ' passo' else ' passos' end
      || ' de E-mail, sem envio: nada sai até o Vendedor responsável clicar em "Ativar envios". Recusar não cria nada.',
    left(btrim(coalesce(p_justification, '')), 2000),
    -- O payload é o que todo Participante lê: só a Conta e as quantidades, nunca o assunto nem o corpo.
    jsonb_build_object('tipo', 'sequencia', 'conta', v_account.name, 'total_contatos', cardinality(v_contacts),
      'total_passos', jsonb_array_length(v_passos)),
    v_hash, p_target_account_id, 'pendente', 'sequencia', v_content
  ) returning id into v_id;
  perform private.approval_transition(v_id, null, 'pendente', null, 'proposta do ' || v_agent.name);
  return query select v_id, 'pendente'::text, v_account.name;
end;
$$;

revoke all on function public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text) from public, anon, authenticated;
grant execute on function public.agent_propose_sequence(uuid, uuid, uuid, uuid[], jsonb, text) to service_role;

-- Sugestão de modelo da Althius: o gate é a Permissão de Propor em Sequência, não a Especialidade.
create or replace function public.agent_suggest_althius_sequence_template(
  p_run_id uuid,
  p_agent_id uuid,
  p_target_account_id uuid
)
returns table (template_id text, justification text, outcome text)
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
  if not private.agent_can_propose_sequence(v_run.workspace_id, v_agent.id) then
    raise exception 'sequence: the agent has no permission to propose sequences' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
  select * from private.suggest_althius_sequence_template(
    v_run.workspace_id, p_target_account_id, v_run.requested_by, p_agent_id
  );
end;
$$;

revoke all on function public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agent_suggest_althius_sequence_template(uuid, uuid, uuid) to service_role;

-- Sugestão de modelo próprio: o gate é a Permissão de Propor em Sequência, não a Especialidade.
create or replace function public.agent_suggest_own_sequence_template(
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
  if not private.agent_can_propose_sequence(v_run.workspace_id, v_agent.id) then
    raise exception 'sequence: the agent has no permission to propose sequences' using errcode = '42501';
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

