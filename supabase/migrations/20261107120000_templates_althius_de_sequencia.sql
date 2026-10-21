-- Ticket 07: catálogo de templates da Althius. Estrutura sem Contato, destino ou histórico.
-- O Cliente lê; não edita o original. A sugestão só devolve um template existente, com o Sinal real,
-- e não cria Sequência, autorização nem envio. O teto de Execuções de Agentes barra a sugestão paga.

create table public.althius_sequence_templates (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  resumo text not null check (length(btrim(resumo)) between 1 and 300),
  passos jsonb not null check (jsonb_typeof(passos) = 'array' and jsonb_array_length(passos) between 1 and 8),
  available boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.althius_sequence_templates enable row level security;

revoke all on public.althius_sequence_templates from public, anon, authenticated;
grant select on public.althius_sequence_templates to authenticated;

-- Sem política de escrita: o Cliente autenticado não insere, altera nem apaga o original.
create policy althius_sequence_templates_read
  on public.althius_sequence_templates
  for select
  to authenticated
  using (
    available
    and exists (
      select 1 from public.workspace_memberships m
      where m.user_id = (select auth.uid()) and m.active
    )
  );

insert into public.althius_sequence_templates (id, nome, resumo, passos) values
  (
    'abertura-por-sinal',
    'Abertura pelo Sinal',
    'Três e-mails, nos dias 0, 3 e 7, para abrir a partir de um Sinal da Conta. Sem destinatário.',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'abertura-1', 'ordem', 1, 'canal', 'email', 'delayDiasUteis', 0,
        'titulo', 'Abertura com o Sinal',
        'assunto', '{{primeiro_nome}}, sobre a {{empresa}}',
        'corpo', 'Oi {{primeiro_nome}}, vi um sinal recente na {{empresa}}. Faz sentido uma conversa?',
        'objetivo', 'Abrir a conversa a partir do Sinal da Conta.'
      ),
      jsonb_build_object(
        'id', 'abertura-2', 'ordem', 2, 'canal', 'email', 'delayDiasUteis', 3,
        'titulo', 'Retomada', 'assunto', 'Re: {{empresa}}',
        'corpo', 'Retomando, {{primeiro_nome}}.', 'objetivo', 'Retomar se não houve resposta.'
      ),
      jsonb_build_object(
        'id', 'abertura-3', 'ordem', 3, 'canal', 'email', 'delayDiasUteis', 4,
        'titulo', 'Último toque', 'assunto', 'Última ideia para {{empresa}}',
        'corpo', 'Fico à disposição. {{remetente.nome}}', 'objetivo', 'Encerrar o ciclo sem insistir.'
      )
    )
  ),
  (
    'retomada-curta',
    'Retomada curta',
    'Dois e-mails, nos dias 0 e 4. Sem destinatário e sem afirmar resultado.',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'retomada-1', 'ordem', 1, 'canal', 'email', 'delayDiasUteis', 0,
        'titulo', 'Primeiro e-mail',
        'assunto', '{{primeiro_nome}}, uma ideia para a {{empresa}}',
        'corpo', 'Oi {{primeiro_nome}}, escrevo sobre a {{empresa}}.',
        'objetivo', 'Abrir a conversa.'
      ),
      jsonb_build_object(
        'id', 'retomada-2', 'ordem', 2, 'canal', 'email', 'delayDiasUteis', 4,
        'titulo', 'Segundo e-mail', 'assunto', 'Re: {{empresa}}',
        'corpo', 'Retomando, {{primeiro_nome}}. {{remetente.nome}}',
        'objetivo', 'Retomar uma vez.'
      )
    )
  );

-- Tira da leitura qualquer identidade, destino ou histórico que um seed futuro coloque no passo.
create function private.althius_template_steps(p_steps jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    (passo - 'contatoId' - 'destino' - 'metricas' - 'anexos' - 'historico' - 'autorizacao')
    order by coalesce((passo ->> 'ordem')::int, 0)
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) passo
  where jsonb_typeof(passo) = 'object'
    and nullif(btrim(passo ->> 'id'), '') is not null
    and nullif(btrim(passo ->> 'titulo'), '') is not null
    and passo ->> 'canal' in ('email', 'linkedin', 'whatsapp');
$$;

revoke all on function private.althius_template_steps(jsonb) from public, anon, authenticated, service_role;

create function public.list_althius_sequence_templates()
returns table (id text, nome text, resumo text, passos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.workspace_memberships m where m.user_id = auth.uid() and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
  select t.id, t.nome, t.resumo, private.althius_template_steps(t.passos)
  from public.althius_sequence_templates t
  where t.available
  order by t.nome;
end;
$$;

revoke all on function public.list_althius_sequence_templates() from public, anon;
grant execute on function public.list_althius_sequence_templates() to authenticated;

-- Teto existente de Execuções de Agentes (e do Rhetor, quando a chamada vem dele).
-- confirmar não barra: quem pediu é uma pessoa, ou uma Execução que ela já abriu.
-- teto_atingido, sem_teto e sem_espaco barram. A leitura não soma gasto.
create function private.althius_template_cap_block(p_workspace_id uuid, p_agent_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_amount numeric := private.reply_proposal_round_credits(p_workspace_id);
  v_scope text;
  v_reason text;
begin
  foreach v_scope in array (
    array['acao:agentes'] || case when p_agent_id is null then '{}'::text[] else array['agente:' || p_agent_id::text] end
  ) loop
    v_reason := private.automation_scope_refusal(p_workspace_id, v_scope, v_amount);
    if v_reason in ('teto_atingido', 'sem_teto', 'sem_espaco') then
      return v_reason;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.althius_template_cap_block(uuid, uuid) from public, anon, authenticated, service_role;

create function private.suggest_althius_sequence_template(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_requester uuid,
  p_agent_id uuid
)
returns table (template_id text, justification text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phrase text;
  v_block text;
  v_template text;
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
    return query select null::text, ''::text, v_block;
    return;
  end if;

  select g.phrase into v_phrase
  from private.signals g
  where g.workspace_id = p_workspace_id and g.target_account_id = p_target_account_id
    and private.signal_is_valid(g.fired_at)
  order by g.fired_at desc, g.id desc
  limit 1;

  if nullif(btrim(coalesce(v_phrase, '')), '') is null then
    return query select null::text, ''::text, 'sem_contexto'::text;
    return;
  end if;

  select t.id into v_template
  from public.althius_sequence_templates t
  where t.id = 'abertura-por-sinal' and t.available;
  if v_template is null then
    return query select null::text, ''::text, 'indisponivel'::text;
    return;
  end if;

  return query select v_template,
    ('A Conta ' || btrim(v_name) || ' tem o Sinal “' || btrim(v_phrase) || '”. ' ||
     'O template Abertura pelo Sinal é uma estrutura de e-mails já existente, sem destinatário. ' ||
     'Não há medida de resultado deste template.')::text,
    'ok'::text;
end;
$$;

revoke all on function private.suggest_althius_sequence_template(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.suggest_althius_sequence_template(
  p_workspace_id uuid,
  p_target_account_id uuid
)
returns table (template_id text, justification text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select * from private.suggest_althius_sequence_template(
    p_workspace_id, p_target_account_id, auth.uid(), null
  );
end;
$$;

revoke all on function public.suggest_althius_sequence_template(uuid, uuid) from public, anon;
grant execute on function public.suggest_althius_sequence_template(uuid, uuid) to authenticated;

create function public.agent_suggest_althius_sequence_template(
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
  select * from private.suggest_althius_sequence_template(
    v_run.workspace_id, p_target_account_id, v_run.requested_by, p_agent_id
  );
end;
$$;

revoke all on function public.agent_suggest_althius_sequence_template(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agent_suggest_althius_sequence_template(uuid, uuid, uuid) to service_role;
