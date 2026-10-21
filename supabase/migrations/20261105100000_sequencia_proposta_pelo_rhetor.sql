-- A Sequência proposta pelo Rhetor (cadencia-pela-ia 01 e 02). Numa Conversa do Workspace operacional, o Rhetor
-- propõe uma Sequência de E-mail para uma Conta-alvo: os Contatos e os passos (espera, assunto e corpo com as variáveis
-- do PR #227). A proposta vira uma Aprovação da categoria `sequencia`, na mesma fila das outras: não passa por
-- Integração nem pelo executor de Aprovações, nasce sempre pendente (mesmo com a Permissão Executar) e só o Vendedor
-- responsável pela Conta-alvo a decide (ADR-0009), porque é ele quem cria a Sequência. Aprovar cria a Sequência na
-- mesma transação, por `public.create_sequence`, sem Versão autorizada e sem Envio na fila: os envios só começam quando
-- ele clica "Ativar envios" (decisão do Renan, 2026-10-17). Se, entre a proposta e a decisão, a Conta ganhou outra
-- Sequência ou um Contato saiu (descadastro, Vínculo encerrado, outra Sequência), a Aprovação é recusada pelo sistema,
-- com o motivo, e nada é criado. O assunto e o corpo propostos só o Vendedor responsável lê, pela mesma regra do
-- documento da Sequência; saiu de pendente, o conteúdo é esquecido, e a Sequência criada guarda o que vale.
--
-- Redefinidas a partir da definição mais recente da main (20261009220509): `decide_approval`, `cancel_approval` e
-- `list_approvals`. `list_approvals` muda as colunas que devolve, então é apagada e criada de novo na mesma transação,
-- como em 20261009220509. As outras categorias seguem exatamente como antes. Nenhum dado é apagado.

-- 1. A categoria e o que a proposta de Sequência guarda: a Conta-alvo (já existe), a proposta em `proposed_content`
--    (enquanto pendente) e a Sequência que a aprovação criou.
alter table private.approvals add column if not exists created_sequence_id uuid references public.sequences(id) on delete set null;

create index if not exists approvals_created_sequence_idx on private.approvals (created_sequence_id)
  where created_sequence_id is not null;

alter table private.approvals drop constraint if exists approvals_category_check;
alter table private.approvals add constraint approvals_category_check
  check (category in ('acao', 'revisao', 'sequencia'));

alter table private.approvals drop constraint if exists approvals_category_shape;
alter table private.approvals add constraint approvals_category_shape check (
  case category
    when 'acao' then integration_id is not null and playbook_section is null and base_version is null
      and proposed_content is null and applied_version is null and created_sequence_id is null
      and state <> 'desatualizada'
    when 'revisao' then integration_id is null and playbook_section is not null and base_version is not null
      and created_sequence_id is null and state not in ('executando', 'executada', 'falhou')
    else integration_id is null and playbook_section is null and base_version is null and applied_version is null
      and target_account_id is not null
      and state in ('pendente', 'aprovada', 'recusada', 'cancelada', 'expirada')
      and (created_sequence_id is null or state = 'aprovada')
  end
);

-- Saiu de pendente, a proposta de Sequência também esquece o conteúdo (a mesma função da revisão).
drop trigger if exists approvals_forget_sequence_content on private.approvals;
create trigger approvals_forget_sequence_content
  before update of state on private.approvals
  for each row
  when (new.category = 'sequencia' and new.state <> 'pendente')
  execute function private.forget_revision_content();

-- 2. As variáveis do texto que não existem, pela mesma lista de `private.step_variable_value`: uma Conta e um Contato
--    com todos os campos preenchidos dão valor a toda variável conhecida, então o que fica sem valor é desconhecido.
create or replace function private.unknown_step_variables(p_text text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(nome order by primeira), '{}')
  from (
    select lower(m[1]) as nome, min(n) as primeira
    from regexp_matches(coalesce(p_text, ''), '\{\{\s*([A-Za-z_.]+)\s*\}\}', 'g') with ordinality as t(m, n)
    group by lower(m[1])
  ) v
  where private.step_variable_value(
    nome,
    jsonb_populate_record(null::public.target_accounts, '{"name": "x", "segment": "x", "domain": "x"}'),
    jsonb_populate_record(null::public.contacts, '{"name": "x y", "role": "x", "email": "x"}'),
    'x'
  ) is null;
$$;

revoke all on function private.unknown_step_variables(text) from public, anon, authenticated, service_role;

-- Por que um Contato não pode entrar na Sequência da Conta-alvo, ou null quando pode: o mesmo filtro do lote (#227).
create or replace function private.sequence_contact_problem(p_workspace_id uuid, p_target_account_id uuid, p_contact_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select c.email into v_email
  from public.contact_account_links l
  join public.contacts c on c.id = l.contact_id and c.workspace_id = l.workspace_id and c.archived_at is null
  where l.workspace_id = p_workspace_id and l.target_account_id = p_target_account_id and l.contact_id = p_contact_id
    and l.ended_at is null;
  if not found then
    return 'not_linked';
  end if;
  if nullif(btrim(v_email), '') is null then
    return 'no_email';
  end if;
  if private.is_suppressed(p_workspace_id, v_email) then
    return 'suppressed';
  end if;
  if exists (
    select 1 from public.sequences s
    join private.sequence_documents d on d.sequence_id = s.id
    where s.workspace_id = p_workspace_id and s.status in ('ativa', 'pausada')
      and jsonb_typeof(d.document -> 'participantesIds') = 'array'
      and d.document -> 'participantesIds' ? p_contact_id::text
  ) then
    return 'in_other_sequence';
  end if;
  return null;
end;
$$;

revoke all on function private.sequence_contact_problem(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- O documento da Sequência a partir da proposta, no formato do lote (#227): cada passo proposto vai para cada Contato,
-- em ordem; a espera do passo fica no primeiro Contato, e os outros saem em seguida (0 dias).
create or replace function private.sequence_document_from_proposal(p_content jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with contatos as (
    select c ->> 'id' as id, n as j, count(*) over () as total
    from jsonb_array_elements(p_content -> 'contatos') with ordinality as t(c, n)
  ), passos as (
    select p, n as k from jsonb_array_elements(p_content -> 'passos') with ordinality as t(p, n)
  )
  select jsonb_build_object(
    'participantesIds', (select coalesce(jsonb_agg(id order by j), '[]'::jsonb) from contatos),
    'janelaPadrao', jsonb_build_object('de', '09:00', 'ate', '17:00'),
    'regraDePause',
      'Qualquer resposta nesta Conta-alvo (positiva ou negativa) pausa a sequência inteira para análise humana.',
    'passoAtual', 0,
    'steps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', 'r' || k || '-' || j,
        'ordem', (k - 1) * c.total + j,
        'canal', 'email',
        'contatoId', c.id,
        'delayDiasUteis', case when j = 1 then (p ->> 'esperaEmDias')::int else 0 end,
        'titulo', 'E-mail ' || k,
        'assunto', p ->> 'assunto',
        'corpo', p ->> 'corpo'
      ) order by k, j), '[]'::jsonb)
      from passos cross join contatos c
    )
  )
$$;

revoke all on function private.sequence_document_from_proposal(jsonb) from public, anon, authenticated, service_role;

-- 3. Os Contatos que podem entrar na Sequência de uma Conta-alvo, para o Rhetor escolher pelo id. `ler_contas_e_sinais`
--    não devolve o id dos Contatos (e a saída dela fica como está): esta leitura devolve, para cada Contato com Vínculo
--    ativo, o id, o nome, o cargo e se pode entrar (ou por que não), além de quem é o responsável e se já há Sequência em
--    andamento. Como na outra leitura, o modelo não recebe o e-mail nem o telefone.
create or replace function public.agent_read_sequence_contacts(p_run_id uuid, p_target_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_account public.target_accounts%rowtype;
begin
  select * into v_account from public.target_accounts a
  where a.id = p_target_account_id and a.workspace_id = v_run.workspace_id and a.deleted_at is null;
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

revoke all on function public.agent_read_sequence_contacts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agent_read_sequence_contacts(uuid, uuid) to service_role;

-- 4. O Rhetor propõe a Sequência. Só o servidor, a partir de uma Execução em andamento. Confere que o Agente é do
--    Workspace da Execução, que é da Especialidade Rhetor e que tem a Permissão Propor ou Executar em alguma Integração
--    (com só Ler, ele não propõe nada); que quem pediu participa e é o Vendedor responsável pela Conta-alvo (ADR-0009);
--    que a Conta não tem Sequência em andamento; que cada Contato tem Vínculo ativo com a Conta, e-mail, não está
--    suprimido nem em outra Sequência ativa ou pausada; e que os passos são de E-mail, de 1 a 8, com espera, assunto e
--    corpo, sem variável desconhecida. Nasce sempre pendente. A mesma proposta repetida na mesma Execução devolve a
--    Aprovação que já existe (`existente`). Os erros começam com "sequence:" para a ferramenta dizer o motivo ao Agente.
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
  if v_agent.specialty <> 'rhetor' then
    raise exception 'sequence: only the cadence specialist proposes sequences' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.agent_permissions p where p.agent_id = p_agent_id and p.permission in ('propor', 'executar')
  ) then
    raise exception 'sequence: the agent may only read' using errcode = '42501';
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

-- 5. `decide_approval` (corpo de 20261009220509) com a Sequência proposta: só o Vendedor responsável pela Conta-alvo a
--    decide (um Administrador que não é o responsável recebe 42501). Recusar só registra. Aprovar confere tudo de novo:
--    se a Conta ganhou Sequência em andamento, ou um Contato saiu (descadastro, Vínculo encerrado, outra Sequência), a
--    Aprovação é recusada pelo sistema com o motivo, e nada é criado; senão, cria a Sequência por `create_sequence`,
--    sem Versão autorizada e sem Envio, e guarda o id. As outras categorias seguem exatamente como antes.
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
  if v.category = 'sequencia' then
    if not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v.workspace_id and r.target_account_id = v.target_account_id::text
        and r.owner_user_id = auth.uid()
    ) then
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

-- `cancel_approval` (corpo de 20261009220509): a Sequência proposta, como a revisão, só se cancela enquanto pendente.
-- Aprovada, ela já criou a Sequência, e cancelar diria o contrário do que aconteceu.
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
  if v.state not in ('pendente', 'aprovada') or (v.category in ('revisao', 'sequencia') and v.state <> 'pendente') then
    raise exception 'the approval can no longer be cancelled' using errcode = '55000';
  end if;
  update private.approvals set state = 'cancelada', updated_at = now() where id = v.id;
  perform private.approval_transition(v.id, v.state, 'cancelada', auth.uid(), null);
end;
$$;

revoke all on function public.cancel_approval(uuid) from public, anon;
grant execute on function public.cancel_approval(uuid) to authenticated;

-- 6. `list_approvals` (corpo de 20261009220509) com a Sequência criada e se quem lê é o Vendedor responsável pela
--    Conta-alvo. A proposta de Sequência só mostra o conteúdo (Contatos, assunto e corpo) a ele, e só enquanto
--    pendente; os outros leem a Conta-alvo e as quantidades no payload. Todo Participante ativo lê a fila.
drop function public.list_approvals(uuid);

create function public.list_approvals(p_workspace_id uuid)
returns table (
  id uuid, agent_id uuid, integration_id text, action text, impact text, justification text, payload jsonb,
  target_account_id uuid, state text, decided_by_kind text, decided_by uuid, decided_where text, decided_at timestamptz,
  expires_at timestamptz, executed_at timestamptz, failure text, created_at timestamptz,
  category text, playbook_section text, base_version integer, applied_version integer, proposed_content jsonb,
  created_sequence_id uuid, responsible_seller boolean
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
      case when a.state = 'pendente' and (a.category <> 'sequencia' or r.owner_user_id is not null)
        then a.proposed_content end,
      a.created_sequence_id,
      r.owner_user_id is not null
    from private.approvals a
    left join public.sales_responsibilities r
      on a.target_account_id is not null and r.workspace_id = a.workspace_id
        and r.target_account_id = a.target_account_id::text and r.owner_user_id = auth.uid()
    where a.workspace_id = p_workspace_id
    order by a.created_at desc, a.id;
end;
$$;

revoke all on function public.list_approvals(uuid) from public, anon;
grant execute on function public.list_approvals(uuid) to authenticated;
