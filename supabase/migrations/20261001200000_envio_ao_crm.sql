-- Enviar ao CRM (kanban-de-prospeccao 05, ADR-0020): o Vendedor responsável leva a Conta-alvo, os Contatos ativos e uma
-- nota com os Sinais e a abordagem para o CRM em que ele tem Acesso conectado, pelo PRÓPRIO Acesso (ADR-0017, ADR-0021).
-- Quem escreve no CRM é a Edge Function `crm-handoff`; o banco confere quem pode, monta o que vai, registra cada tentativa
-- e, quando dá certo, leva o cartão para No CRM (o único caminho até esse estágio, como manda `move_prospecting_stage`).
--
-- Depois do envio, o CRM manda: o índice único abaixo impede um segundo envio (em andamento ou concluído) da mesma Conta.
-- Uma tentativa que falhou guarda o que já foi criado no CRM (`crm_refs`), para a próxima não criar de novo às cegas.
--
-- A ação da pessoa (o Vendedor responsável clicando) não passa por Aprovação: ela já é quem decide (ADR-0002). O envio
-- pedido por um Agente com Propor entra pelas Aprovações (20261001130000) numa próxima fatia, e `approval_id` liga os dois.

create table private.crm_handoffs (
  id uuid primary key default gen_random_uuid(),
  -- A ordem das tentativas (duas na mesma transação têm o mesmo `created_at`).
  attempt bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_account_id uuid not null,
  integration_id text not null references private.integration_catalog(id),
  requested_by uuid references auth.users(id) on delete set null,
  approval_id uuid references private.approvals(id) on delete set null,
  status text not null default 'enviando' check (status in ('enviando', 'enviado', 'falhou')),
  -- Os ids do que foi criado no CRM: { "empresa": "...", "contatos": { "<contato>": "..." }, "nota": "..." }.
  crm_refs jsonb not null default '{}'::jsonb check (jsonb_typeof(crm_refs) = 'object'),
  -- Por que falhou, em palavras do produto e sem dado de token.
  error text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade
);

-- "Depois do envio, a Althius não escreve de novo": no máximo um envio em andamento ou concluído por Conta-alvo.
create unique index crm_handoffs_one_per_account
  on private.crm_handoffs (workspace_id, target_account_id) where status in ('enviando', 'enviado');
create index crm_handoffs_account_idx on private.crm_handoffs (workspace_id, target_account_id, attempt desc);
create index crm_handoffs_integration_idx on private.crm_handoffs (integration_id);
create index crm_handoffs_requested_by_idx on private.crm_handoffs (requested_by);
create index crm_handoffs_approval_idx on private.crm_handoffs (approval_id);

alter table private.crm_handoffs enable row level security;
revoke all on private.crm_handoffs from public, anon, authenticated, service_role;

-- A nota que vai ao CRM, em português: os Sinais ainda válidos (ADR-0007) e a abordagem (o estado da Sequência e os
-- títulos dos passos que já saíram, como em `send_outcome_rates_by_approach`; nunca o corpo nem o assunto de mensagem).
create function private.crm_handoff_note(p_workspace_id uuid, p_target_account_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.target_accounts%rowtype;
  v_signals text;
  v_sequence public.sequences%rowtype;
  v_steps text;
  v_note text;
begin
  select * into v_account from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.id = p_target_account_id;

  select string_agg('- ' || s.phrase || ' (' || to_char(s.fired_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')',
                    E'\n' order by s.fired_at desc)
    into v_signals
  from private.signals s
  where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id
    and private.signal_is_valid(s.fired_at);

  select * into v_sequence from public.sequences q
  where q.workspace_id = p_workspace_id and q.target_account_id = p_target_account_id::text;

  if v_sequence.id is not null then
    select string_agg(t.titulo, ', ' order by t.primeiro)
      into v_steps
    from (
      select coalesce(nullif(btrim(passo.titulo), ''), 'Sem título') as titulo, min(e.sent_at) as primeiro
      from private.sequence_step_sends e
      left join private.sequence_documents d on d.sequence_id = e.sequence_id
      left join lateral (
        select p ->> 'titulo' as titulo
        from jsonb_array_elements(case when jsonb_typeof(d.document -> 'steps') = 'array' then d.document -> 'steps' else '[]'::jsonb end) p
        where p ->> 'id' = e.step_id
        limit 1
      ) passo on true
      where e.sequence_id = v_sequence.id and e.status = 'sent'
      group by 1
    ) t;
  end if;

  v_note := 'Enviada pela Althius em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.';
  if v_account.legal_identifier is not null and btrim(v_account.legal_identifier) <> '' then
    v_note := v_note || E'\nCNPJ: ' || v_account.legal_identifier;
  end if;
  if v_account.segment is not null and btrim(v_account.segment) <> '' then
    v_note := v_note || E'\nSegmento: ' || v_account.segment;
  end if;
  v_note := v_note || E'\n\nSinais ativos:\n' || coalesce(v_signals, '- Nenhum Sinal ativo.');
  v_note := v_note || E'\n\nAbordagem: ' || case
    when v_sequence.id is null then 'nenhuma Sequência.'
    else 'Sequência ' || case v_sequence.status
        when 'ativa' then 'em andamento'
        when 'pausada' then 'pausada'
        when 'reuniao' then 'com reunião marcada'
        when 'esgotada' then 'esgotada'
        else v_sequence.status
      end
      || coalesce('; passos enviados: ' || v_steps, '; nenhum passo enviado ainda') || '.'
  end;
  return v_note;
end;
$$;

revoke all on function private.crm_handoff_note(uuid, uuid) from public, anon, authenticated, service_role;

-- Começa o envio. Só o servidor chama, com o participante que o JWT identificou. Confere, nesta ordem: Participação
-- ativa (42501), a Conta no Workspace e fora do arquivo (P0002), o Vendedor responsável (42501), nenhum envio em
-- andamento ou concluído da Conta (23505), a Integração de categoria CRM, habilitada e com o Acesso `conectado` de quem
-- pede (55000). Uma tentativa que ficou "enviando" por mais de 10 minutos sem progresso (a função caiu no meio) é
-- encerrada como falha, e o que ela registrou como criado (`save_crm_handoff_progress`) passa para esta.
--
-- Devolve o id da tentativa, o caminho do Acesso (`api_key` ou `oauth_mcp`, para o servidor saber se as ferramentas REST
-- existem), o que vai (`payload`: empresa, contatos ativos e nota) e o que a última tentativa que falhou nesta
-- Integração já criou no CRM (`previous_refs`), para não criar de novo.
create function public.begin_crm_handoff(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_user_id uuid,
  p_integration_id text
) returns table (handoff_id uuid, access_kind text, payload jsonb, previous_refs jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_account public.target_accounts%rowtype;
  v_kind text;
  v_state text;
  v_previous jsonb;
  v_id uuid;
  v_contacts jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  select * into v_account from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.id = p_target_account_id
    and a.archived_at is null and a.deleted_at is null;
  if v_account.id is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = p_user_id
  ) then
    raise exception 'only the responsible seller can send this target account to the CRM' using errcode = '42501';
  end if;

  -- Uma tentativa por vez por Conta, mesmo com dois cliques simultâneos.
  perform pg_advisory_xact_lock(hashtext('crm_handoff:' || p_workspace_id::text || ':' || p_target_account_id::text));

  update private.crm_handoffs h
  set status = 'falhou',
      error = 'O envio anterior não terminou. Confira no CRM o que já foi criado antes de tentar de novo.',
      updated_at = now(),
      finished_at = now()
  where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
    and h.status = 'enviando' and h.updated_at < now() - interval '10 minutes';

  if exists (
    select 1 from private.crm_handoffs h
    where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
      and h.status in ('enviando', 'enviado')
  ) then
    raise exception 'target account already sent to the CRM' using errcode = '23505';
  end if;

  if not exists (
    select 1 from private.integration_catalog c where c.id = p_integration_id and c.category = 'CRM'
  ) then
    raise exception 'integration is not a CRM' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.workspace_integrations wi
    where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled' using errcode = '55000';
  end if;
  select x.kind, x.state into v_kind, v_state from private.integration_accesses x
  where x.workspace_id = p_workspace_id and x.user_id = p_user_id and x.integration_id = p_integration_id;
  if v_kind is null or v_state <> 'conectado' then
    raise exception 'integration access not connected' using errcode = '55000';
  end if;

  select h.crm_refs into v_previous from private.crm_handoffs h
  where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
    and h.integration_id = p_integration_id and h.status = 'falhou'
  order by h.attempt desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.name, 'cargo', c.role, 'email', c.email, 'telefone', c.phone, 'linkedin', c.linkedin
    ) order by c.name, c.id), '[]'::jsonb)
    into v_contacts
  from public.contacts c
  where c.workspace_id = p_workspace_id and c.archived_at is null
    and exists (
      select 1 from public.contact_account_links l
      where l.workspace_id = p_workspace_id and l.contact_id = c.id
        and l.target_account_id = p_target_account_id and l.ended_at is null
    );

  insert into private.crm_handoffs (workspace_id, target_account_id, integration_id, requested_by)
  values (p_workspace_id, p_target_account_id, p_integration_id, p_user_id)
  returning id into v_id;

  return query select
    v_id,
    v_kind,
    jsonb_build_object(
      'empresa', jsonb_build_object(
        'nome', v_account.name,
        'dominio', v_account.domain,
        'site', v_account.canonical_url,
        'cnpj', v_account.legal_identifier,
        'segmento', v_account.segment,
        'linkedin', v_account.linkedin_url
      ),
      'contatos', v_contacts,
      'nota', private.crm_handoff_note(p_workspace_id, p_target_account_id)
    ),
    coalesce(v_previous, '{}'::jsonb);
end;
$$;

-- Conclui a tentativa. Deu certo: `enviado`, com os ids do CRM, e o cartão vai para No CRM em nome de quem pediu (o
-- histórico guarda a pessoa e o evento `enviada_ao_crm`). Falhou: `falhou`, com o que já foi criado e o motivo; uma nova
-- tentativa pode começar. Devolve o status gravado. Uma tentativa já concluída não se conclui de novo (55000).
create function public.finish_crm_handoff(
  p_handoff_id uuid,
  p_ok boolean,
  p_crm_refs jsonb,
  p_error text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  h private.crm_handoffs%rowtype;
  v_status text := case when p_ok then 'enviado' else 'falhou' end;
begin
  select * into h from private.crm_handoffs x where x.id = p_handoff_id for update;
  if h.id is null then
    raise exception 'handoff not found' using errcode = 'P0002';
  end if;
  if h.status <> 'enviando' then
    raise exception 'handoff already finished' using errcode = '55000';
  end if;

  update private.crm_handoffs x
  set status = v_status,
      crm_refs = case when jsonb_typeof(p_crm_refs) = 'object' then p_crm_refs else '{}'::jsonb end,
      error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'O envio ao CRM falhou.'), 500) end,
      updated_at = now(),
      finished_at = now()
  where x.id = h.id;

  if p_ok then
    perform private.apply_prospecting_stage(h.workspace_id, h.target_account_id, 'no_crm', h.requested_by, 'enviada_ao_crm');
  end if;
  return v_status;
end;
$$;

-- O progresso de uma tentativa em andamento: o servidor grava os ids de cada objeto logo depois de criá-lo no CRM, para
-- que uma queda no meio não leve a criar de novo o que já existe lá. Só enquanto a tentativa está `enviando`.
create function public.save_crm_handoff_progress(p_handoff_id uuid, p_crm_refs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_crm_refs) is distinct from 'object' then
    raise exception 'crm refs must be an object' using errcode = '22023';
  end if;
  update private.crm_handoffs x
  set crm_refs = p_crm_refs, updated_at = now()
  where x.id = p_handoff_id and x.status = 'enviando';
  if not found then
    raise exception 'handoff not in progress' using errcode = '55000';
  end if;
end;
$$;

-- O estado do envio de cada Conta-alvo do Workspace (a tentativa mais recente), para a tela: para qual CRM, em que pé,
-- os ids criados lá e o motivo da falha. Nenhum token: a tabela não guarda nenhum. Só Participação ativa.
create function public.list_crm_handoffs(p_workspace_id uuid)
returns table (
  target_account_id uuid,
  integration_id text,
  status text,
  crm_refs jsonb,
  error text,
  requested_by uuid,
  created_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select distinct on (h.target_account_id)
    h.target_account_id, h.integration_id, h.status, h.crm_refs, h.error, h.requested_by, h.created_at, h.finished_at
  from private.crm_handoffs h
  where h.workspace_id = p_workspace_id
  order by h.target_account_id, h.attempt desc;
end;
$$;

revoke all on function public.begin_crm_handoff(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_crm_handoff(uuid, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.save_crm_handoff_progress(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_crm_handoffs(uuid) from public, anon;
grant execute on function public.begin_crm_handoff(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finish_crm_handoff(uuid, boolean, jsonb, text) to service_role;
grant execute on function public.save_crm_handoff_progress(uuid, jsonb) to service_role;
grant execute on function public.list_crm_handoffs(uuid) to authenticated;
