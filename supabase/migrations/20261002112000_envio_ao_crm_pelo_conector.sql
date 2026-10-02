-- Enviar ao CRM pelo conector (conexoes-funcionais 30, fatia 4; ADR-0023). Quando o Vendedor responsável conectou o CRM pela
-- autorização (OAuth no servidor MCP), o botão "Enviar ao CRM" vira um pedido aos Agentes numa Conversa nova, com o pacote
-- de sempre (a empresa, os Contatos ativos e a nota com os Sinais). Os Agentes usam as ferramentas do PRÓPRIO conector
-- (`usar_conector`), sem código por app, e cada escrita segue a regra da ferramenta (ADR-0022): no padrão, uma Aprovação
-- por chamada, decidida no passo da Conversa. O caminho pela chave de API continua como estava (Edge Function
-- `crm-handoff`, `begin_crm_handoff`/`finish_crm_handoff`).
--
-- Como a Althius sabe que a empresa chegou ao CRM sem código por app: o Agente DECLARA o efeito na chamada que leva a
-- empresa ao CRM (`efeito: 'empresa_no_crm'`, guardado no payload da Aprovação). A tentativa em `private.crm_handoffs`
-- nasce ligada à Execução (`run_id`), e só uma chamada daquela Execução, do mesmo Workspace e para a mesma Conta, a fecha:
--   finish_crm_handoff_by_tool_approval   a Aprovação de ferramenta com o efeito terminou (executada: enviado e o cartão
--                                         vai para No CRM; falhou: falhou). O desfecho vem do estado da Aprovação no
--                                         banco, nunca de quem chama;
--   finish_crm_handoff_by_tool_call       a chamada liberada sem Aprovação (Executar + regra "sempre" explícita), feita
--                                         durante a Execução; o banco confere a Permissão e a regra de novo.
-- Uma tentativa que espera uma Aprovação com o efeito não vence em 10 minutos como as outras: ela fica "enviando"
-- enquanto a Execução roda ou a Aprovação está aberta, e vira falha quando a Aprovação é recusada, vence ou é cancelada,
-- ou quando a Execução termina sem nenhuma (gatilhos abaixo).
--
-- `begin_crm_handoff` (corpo de 20261001200000) e `begin_approved_crm_handoff` (corpo de 20261001210000) são redefinidas
-- mudando só a regra de vencimento: uma tentativa que espera pelos Agentes não é encerrada no meio.

alter table private.crm_handoffs
  add column run_id uuid references private.agent_runs(id) on delete set null;

-- Uma tentativa por Execução.
create unique index crm_handoffs_one_per_run on private.crm_handoffs (run_id) where run_id is not null;

-- A tentativa ainda espera pelos Agentes: a Execução dela está na fila ou rodando dentro do prazo, ou há uma Aprovação
-- daquela Execução com o efeito ainda aberta (pendente e no prazo, ou liberada/executando há menos de 10 minutos).
-- Uma tentativa sem Execução (o caminho da chave de API) nunca espera: segue a regra de antes.
create function private.crm_handoff_waits_for_agents(p_handoff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.crm_handoffs h
    where h.id = p_handoff_id and h.run_id is not null
      and (
        exists (
          select 1 from private.agent_runs r
          where r.id = h.run_id and r.status in ('queued', 'running')
            and coalesce(r.started_at, r.created_at) > clock_timestamp() - private.agent_run_deadline()
        )
        or exists (
          select 1 from private.approvals a
          where a.run_id = h.run_id and a.workspace_id = h.workspace_id
            and a.payload ->> 'tipo' = 'ferramenta' and a.payload ->> 'efeito' = 'empresa_no_crm'
            and (
              (a.state = 'pendente' and a.expires_at > now())
              or (a.state in ('aprovada', 'executando') and a.updated_at > now() - interval '10 minutes')
            )
        )
      )
  )
$$;

revoke all on function private.crm_handoff_waits_for_agents(uuid) from public, anon, authenticated, service_role;

-- O pedido aos Agentes, em português, com tudo o que vai ao CRM. Cabe nos 4000 caracteres de um pedido: a nota é cortada
-- e, se ainda faltar espaço, os últimos Contatos ficam de fora (o pedido diz quantos).
create function private.crm_handoff_request_text(
  p_account_id uuid, p_integration_id text, p_crm text, p_agent_name text, p_payload jsonb
) returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_empresa jsonb := coalesce(p_payload -> 'empresa', '{}'::jsonb);
  v_contatos jsonb := coalesce(p_payload -> 'contatos', '[]'::jsonb);
  v_total integer := jsonb_array_length(coalesce(p_payload -> 'contatos', '[]'::jsonb));
  v_nota text := coalesce(p_payload ->> 'nota', '');
  v_cabeca text;
  v_empresa_txt text;
  v_contatos_txt text;
  v_como text;
  v_texto text;
  v_cabem integer;
  c jsonb;
begin
  v_cabeca := '@' || p_agent_name || ', envie a Conta-alvo ' || coalesce(v_empresa ->> 'nome', '') || ' ao ' || p_crm
    || ' pelas ferramentas do conector (usar_conector, integracao "' || p_integration_id || '").'
    || E'\nconta_id: ' || p_account_id::text;
  select 'Empresa: ' || string_agg(r.rotulo || ' ' || r.valor, '; ' order by r.ordem)
    into v_empresa_txt
  from (values
    (1, 'nome', v_empresa ->> 'nome'), (2, 'domínio', v_empresa ->> 'dominio'), (3, 'site', v_empresa ->> 'site'),
    (4, 'CNPJ', v_empresa ->> 'cnpj'), (5, 'segmento', v_empresa ->> 'segmento'), (6, 'LinkedIn', v_empresa ->> 'linkedin')
  ) r(ordem, rotulo, valor)
  where r.valor is not null and btrim(r.valor) <> '';
  v_como := E'\nComo fazer: liste as ferramentas do conector; procure a empresa no ' || p_crm || ' antes de criar (pelo '
    || 'domínio ou pelo nome), para não duplicar; crie a empresa (ou use a que já existe) declarando efeito '
    || '"empresa_no_crm" e o conta_id acima nessa chamada; crie os Contatos, associe-os à empresa e crie a nota. '
    || 'Cada escrita segue a regra do conector: a que pede Aprovação espera a decisão na Conversa.';

  v_cabem := v_total;
  loop
    v_contatos_txt := E'\nContatos (' || v_total || '):';
    for c in select x from jsonb_array_elements(v_contatos) with ordinality t(x, n) where t.n <= v_cabem order by t.n loop
      v_contatos_txt := v_contatos_txt || E'\n- ' || coalesce(c ->> 'nome', '')
        || coalesce(', ' || nullif(btrim(c ->> 'cargo'), ''), '')
        || coalesce('; e-mail ' || nullif(btrim(c ->> 'email'), ''), '')
        || coalesce('; telefone ' || nullif(btrim(c ->> 'telefone'), ''), '')
        || coalesce('; LinkedIn ' || nullif(btrim(c ->> 'linkedin'), ''), '');
    end loop;
    if v_total = 0 then
      v_contatos_txt := E'\nContatos: nenhum Contato ativo.';
    elsif v_cabem < v_total then
      v_contatos_txt := v_contatos_txt || E'\n- e mais ' || (v_total - v_cabem) || ' Contatos que não couberam neste pedido.';
    end if;
    v_texto := v_cabeca || E'\n' || coalesce(v_empresa_txt, 'Empresa: sem dados.') || v_contatos_txt
      || E'\nNota:\n' || left(v_nota, 1200) || v_como;
    exit when length(v_texto) <= 4000 or v_cabem = 0;
    v_cabem := v_cabem - 1;
  end loop;
  return left(v_texto, 4000);
end;
$$;

revoke all on function private.crm_handoff_request_text(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;

-- Começa o Envio ao CRM pelos Agentes. Só o servidor chama (a Edge Function `agent-conversation`), com o participante que o
-- JWT identificou. Confere o que `begin_crm_handoff` confere, nesta ordem: Participação ativa (42501), a Conta no
-- Workspace e fora do arquivo (P0002), o Vendedor responsável (42501), nenhum envio em andamento ou concluído (23505), a
-- Integração de categoria CRM, habilitada e com o Acesso `conectado` de quem pede (55000), e mais: o Acesso é pela
-- autorização (55000 "access is not by authorization"; pela chave de API o envio é o da `crm-handoff`) e algum Agente
-- tem a Permissão Propor ou Executar no CRM (55000 "no agent can write"). Cria a Conversa coordenada, a Execução na fila
-- (mencionando o Agente com a maior Permissão) e a tentativa ligada a ela. Idempotente por `p_client_request_id`.
create function public.begin_crm_handoff_by_agents(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_user_id uuid,
  p_integration_id text,
  p_client_request_id uuid
) returns table (handoff_id uuid, conversation_id uuid, run_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_account public.target_accounts%rowtype;
  v_crm text;
  v_kind text;
  v_state text;
  v_agent_id uuid;
  v_agent_name text;
  v_payload jsonb;
  v_conversation_id uuid;
  v_run_id uuid;
  v_id uuid;
  v_existing record;
begin
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client request id required' using errcode = '22023';
  end if;

  -- O mesmo pedido de novo: a tentativa e a Execução que já existem.
  select h.id as hid, r.conversation_id as cid, r.id as rid, r.status as st into v_existing
  from private.agent_runs r
  join private.crm_handoffs h on h.run_id = r.id
  where r.requested_by = p_user_id and r.client_request_id = p_client_request_id and r.workspace_id = p_workspace_id;
  if found then
    return query select v_existing.hid, v_existing.cid, v_existing.rid, v_existing.st;
    return;
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

  perform pg_advisory_xact_lock(hashtext('crm_handoff:' || p_workspace_id::text || ':' || p_target_account_id::text));

  update private.crm_handoffs h
  set status = 'falhou',
      error = 'O envio anterior não terminou. Confira no CRM o que já foi criado antes de tentar de novo.',
      updated_at = now(),
      finished_at = now()
  where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
    and h.status = 'enviando' and h.updated_at < now() - interval '10 minutes'
    and not private.crm_handoff_waits_for_agents(h.id);

  if exists (
    select 1 from private.crm_handoffs h
    where h.workspace_id = p_workspace_id and h.target_account_id = p_target_account_id
      and h.status in ('enviando', 'enviado')
  ) then
    raise exception 'target account already sent to the CRM' using errcode = '23505';
  end if;

  select c.name into v_crm from private.integration_catalog c where c.id = p_integration_id and c.category = 'CRM';
  if v_crm is null then
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
  if v_kind <> 'oauth_mcp' then
    raise exception 'integration access is not by authorization' using errcode = '55000';
  end if;

  -- O Agente que escreve: o de maior Permissão no CRM entre os que propõem envio (Scopus, Ethos, Rhetor).
  select a.id, a.name into v_agent_id, v_agent_name
  from private.agents a
  join private.agent_permissions p on p.agent_id = a.id and p.integration_id = p_integration_id
  where a.workspace_id = p_workspace_id and a.specialty in ('scopus', 'ethos', 'rhetor')
    and p.permission in ('propor', 'executar')
  order by (p.permission = 'executar') desc, (a.kind = 'padrao') desc,
    array_position(array['rhetor', 'ethos', 'scopus'], a.specialty), a.created_at, a.id
  limit 1;
  if v_agent_id is null then
    raise exception 'no agent can write to this CRM' using errcode = '55000';
  end if;

  v_payload := private.crm_handoff_payload(p_workspace_id, p_target_account_id);

  insert into private.agent_conversations (workspace_id, owner_id, kind, title)
  values (p_workspace_id, p_user_id, 'coordenada', left('Enviar ' || v_account.name || ' ao ' || v_crm, 80))
  returning id into v_conversation_id;
  insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, mentions)
  values (
    p_workspace_id, v_conversation_id, p_user_id, p_client_request_id,
    btrim(private.crm_handoff_request_text(p_target_account_id, p_integration_id, v_crm, v_agent_name, v_payload)),
    array[v_agent_id]
  )
  returning id into v_run_id;
  insert into private.crm_handoffs (workspace_id, target_account_id, integration_id, requested_by, run_id)
  values (p_workspace_id, p_target_account_id, p_integration_id, p_user_id, v_run_id)
  returning id into v_id;

  return query select v_id, v_conversation_id, v_run_id, 'queued'::text;
end;
$$;

-- Conclui a tentativa ligada a uma Execução e grava o desfecho. Quem chama já conferiu tudo; o cartão vai para No CRM em
-- nome de quem pediu, como em `finish_crm_handoff`.
create function private.close_agents_crm_handoff(
  p_handoff_id uuid, p_ok boolean, p_tool text, p_approval_id uuid, p_error text
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
  update private.crm_handoffs x
  set status = v_status,
      crm_refs = x.crm_refs || jsonb_build_object('conector', jsonb_strip_nulls(jsonb_build_object(
        'ferramenta', p_tool, 'aprovacao', p_approval_id, 'run', h.run_id))),
      error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'A chamada que levava a empresa ao CRM falhou.'), 500) end,
      updated_at = now(),
      finished_at = now()
  where x.id = h.id;
  if p_ok then
    perform private.apply_prospecting_stage(h.workspace_id, h.target_account_id, 'no_crm', h.requested_by, 'enviada_ao_crm');
  end if;
  return v_status;
end;
$$;

revoke all on function private.close_agents_crm_handoff(uuid, boolean, text, uuid, text) from public, anon, authenticated, service_role;

-- O fechamento pela Aprovação de ferramenta com o efeito, chamado pelo executor depois de `finish_approved_action`. Tudo
-- vem da Aprovação guardada: ela é de ferramenta, declara `efeito: 'empresa_no_crm'`, tem Execução e Conta, e terminou
-- (executada: enviado; falhou: falhou com o motivo dela; outro estado: 55000). A tentativa precisa ser `enviando`, da
-- MESMA Execução, do mesmo Workspace, da mesma Conta, do mesmo CRM e de quem pediu ao Agente (P0002 se não houver).
create function public.finish_crm_handoff_by_tool_approval(p_approval_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_handoff uuid;
begin
  select * into v from private.approvals a where a.id = p_approval_id;
  if v.id is null or v.payload ->> 'tipo' is distinct from 'ferramenta'
    or v.payload ->> 'efeito' is distinct from 'empresa_no_crm' then
    raise exception 'tool approval with the crm effect not found' using errcode = 'P0002';
  end if;
  if v.state not in ('executada', 'falhou') then
    raise exception 'the approval has not finished' using errcode = '55000';
  end if;
  select h.id into v_handoff from private.crm_handoffs h
  join private.agent_runs r on r.id = h.run_id
  where v.run_id is not null and h.run_id = v.run_id and h.status = 'enviando'
    and r.workspace_id = v.workspace_id and h.workspace_id = v.workspace_id
    and v.target_account_id is not null and h.target_account_id = v.target_account_id
    and h.integration_id = v.integration_id
    and h.requested_by is not distinct from v.requested_by
  for update of h;
  if v_handoff is null then
    raise exception 'crm handoff attempt not found for this run' using errcode = 'P0002';
  end if;
  return private.close_agents_crm_handoff(v_handoff, v.state = 'executada', v.payload ->> 'ferramenta', v.id, v.failure);
end;
$$;

-- O fechamento pela chamada liberada sem Aprovação, feita durante a Execução (`usar_conector` executou na hora). O banco
-- confere de novo o que liberou a chamada: a Execução rodando, o Agente do Workspace dela com a Permissão Executar no
-- CRM e a regra "sempre" DECIDIDA para aquela ferramenta (sem decisão, uma ferramenta que escreve pede Aprovação; uma
-- leitura não leva a empresa ao CRM). A tentativa precisa ser `enviando`, da mesma Execução, Workspace, Conta e CRM.
create function public.finish_crm_handoff_by_tool_call(
  p_run_id uuid,
  p_agent_id uuid,
  p_integration_id text,
  p_tool_name text,
  p_target_account_id uuid,
  p_ok boolean,
  p_error text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_handoff uuid;
begin
  if not exists (
    select 1 from private.agents a
    join private.agent_permissions p on p.agent_id = a.id and p.integration_id = p_integration_id
    where a.id = p_agent_id and a.workspace_id = v_run.workspace_id and p.permission = 'executar'
  ) then
    raise exception 'the agent may not execute in this integration' using errcode = '42501';
  end if;
  if private.tool_rule(v_run.workspace_id, p_integration_id, btrim(coalesce(p_tool_name, ''))) is distinct from 'sempre' then
    raise exception 'the tool is not always allowed in this workspace' using errcode = '42501';
  end if;
  select h.id into v_handoff from private.crm_handoffs h
  where h.run_id = v_run.id and h.status = 'enviando' and h.workspace_id = v_run.workspace_id
    and h.target_account_id = p_target_account_id and h.integration_id = p_integration_id
    and h.requested_by is not distinct from v_run.requested_by
  for update;
  if v_handoff is null then
    raise exception 'crm handoff attempt not found for this run' using errcode = 'P0002';
  end if;
  return private.close_agents_crm_handoff(v_handoff, coalesce(p_ok, false), btrim(p_tool_name), null, p_error);
end;
$$;

-- A Conversa do Envio ao CRM pelos Agentes de cada Conta-alvo, para a tela abrir: só a tentativa mais recente, quando
-- ela tem Execução e foi pedida por quem lê (a Conversa é de quem a começou, ADR-0008). Só Participação ativa.
create function public.list_crm_handoff_conversations(p_workspace_id uuid)
returns table (target_account_id uuid, conversation_id uuid, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := private.require_user();
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select u.target_account_id, r.conversation_id, u.status
  from (
    select distinct on (h.target_account_id) h.target_account_id, h.run_id, h.requested_by, h.status
    from private.crm_handoffs h
    where h.workspace_id = p_workspace_id
    order by h.target_account_id, h.attempt desc
  ) u
  join private.agent_runs r on r.id = u.run_id
  where u.requested_by = v_user_id;
end;
$$;

-- Os gatilhos que encerram a tentativa que não vai mais acontecer. Uma Aprovação com o efeito recusada, vencida ou
-- cancelada, ou a Execução que terminou: se nada mais espera (nenhuma outra Aprovação com o efeito aberta), falhou.
create function private.crm_handoff_after_effect_approval_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.crm_handoffs h
  set status = 'falhou',
      error = case new.state
        when 'recusada' then 'A Aprovação para levar a empresa ao CRM foi recusada. Nada foi marcado como enviado.'
        when 'expirada' then 'A Aprovação para levar a empresa ao CRM venceu sem decisão. Peça aos Agentes de novo.'
        else 'A Aprovação para levar a empresa ao CRM foi cancelada. Nada foi marcado como enviado.'
      end,
      updated_at = now(),
      finished_at = now()
  where h.run_id = new.run_id and h.workspace_id = new.workspace_id and h.status = 'enviando'
    and not private.crm_handoff_waits_for_agents(h.id);
  return null;
end;
$$;

create function private.crm_handoff_after_run_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.crm_handoffs h
  set status = 'falhou',
      error = 'Os Agentes terminaram sem levar a empresa ao CRM. Veja na Conversa o que aconteceu antes de tentar de novo.',
      updated_at = now(),
      finished_at = now()
  where h.run_id = new.id and h.status = 'enviando'
    and not private.crm_handoff_waits_for_agents(h.id);
  return null;
end;
$$;

revoke all on function private.crm_handoff_after_effect_approval_ended() from public, anon, authenticated, service_role;
revoke all on function private.crm_handoff_after_run_ended() from public, anon, authenticated, service_role;

create trigger crm_handoff_after_effect_approval_ended
  after update of state on private.approvals
  for each row
  when (new.state in ('recusada', 'expirada', 'cancelada') and old.state is distinct from new.state
    and new.run_id is not null and new.payload ->> 'efeito' = 'empresa_no_crm')
  execute function private.crm_handoff_after_effect_approval_ended();

create trigger crm_handoff_after_run_ended
  after update of status on private.agent_runs
  for each row
  when (new.status in ('succeeded', 'failed') and old.status is distinct from new.status)
  execute function private.crm_handoff_after_run_ended();

-- `begin_crm_handoff` (corpo de 20261001200000): só a regra de vencimento muda, para não encerrar no meio uma tentativa
-- que espera pelos Agentes.
create or replace function public.begin_crm_handoff(
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
    and h.status = 'enviando' and h.updated_at < now() - interval '10 minutes'
    and not private.crm_handoff_waits_for_agents(h.id);

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

-- `begin_approved_crm_handoff` (corpo de 20261001210000): só a regra de vencimento muda, como acima.
create or replace function public.begin_approved_crm_handoff(p_approval_id uuid)
returns table (handoff_id uuid, access_kind text, user_id uuid, payload jsonb, previous_refs jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v private.approvals%rowtype;
  v_account_id uuid;
  v_integration text;
  v_kind text;
  v_state text;
  v_previous jsonb;
  v_id uuid;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if v.id is null or v.payload ->> 'tipo' is distinct from 'envio_ao_crm' then
    raise exception 'crm handoff approval not found' using errcode = 'P0002';
  end if;
  if v.state <> 'executando' then
    raise exception 'the approval is not being executed' using errcode = '55000';
  end if;
  v_account_id := v.target_account_id;
  v_integration := v.integration_id;
  if v.requested_by is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = v.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.target_accounts a
    where a.workspace_id = v.workspace_id and a.id = v_account_id and a.archived_at is null and a.deleted_at is null
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v.workspace_id and r.target_account_id = v_account_id::text and r.owner_user_id = v.requested_by
  ) then
    raise exception 'only the responsible seller can send this target account to the CRM' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('crm_handoff:' || v.workspace_id::text || ':' || v_account_id::text));
  update private.crm_handoffs h
  set status = 'falhou',
      error = 'O envio anterior não terminou. Confira no CRM o que já foi criado antes de tentar de novo.',
      updated_at = now(),
      finished_at = now()
  where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id
    and h.status = 'enviando' and h.updated_at < now() - interval '10 minutes'
    and not private.crm_handoff_waits_for_agents(h.id);
  if exists (
    select 1 from private.crm_handoffs h
    where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id and h.status in ('enviando', 'enviado')
  ) then
    raise exception 'target account already sent to the CRM' using errcode = '23505';
  end if;

  if not exists (
    select 1 from public.workspace_integrations wi where wi.workspace_id = v.workspace_id and wi.integration_id = v_integration
  ) then
    raise exception 'integration not enabled' using errcode = '55000';
  end if;
  select x.kind, x.state into v_kind, v_state from private.integration_accesses x
  where x.workspace_id = v.workspace_id and x.user_id = v.requested_by and x.integration_id = v_integration;
  if v_kind is null or v_state <> 'conectado' then
    raise exception 'integration access not connected' using errcode = '55000';
  end if;

  select h.crm_refs into v_previous from private.crm_handoffs h
  where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id
    and h.integration_id = v_integration and h.status = 'falhou'
  order by h.attempt desc limit 1;

  insert into private.crm_handoffs (workspace_id, target_account_id, integration_id, requested_by, approval_id)
  values (v.workspace_id, v_account_id, v_integration, v.requested_by, v.id)
  returning id into v_id;

  return query select v_id, v_kind, v.requested_by, v.payload -> 'envio', coalesce(v_previous, '{}'::jsonb);
end;
$$;

revoke all on function public.begin_crm_handoff_by_agents(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_crm_handoff_by_tool_approval(uuid) from public, anon, authenticated;
revoke all on function public.finish_crm_handoff_by_tool_call(uuid, uuid, text, text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.list_crm_handoff_conversations(uuid) from public, anon;
revoke all on function public.begin_crm_handoff(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.begin_approved_crm_handoff(uuid) from public, anon, authenticated;
grant execute on function public.begin_crm_handoff_by_agents(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.finish_crm_handoff_by_tool_approval(uuid) to service_role;
grant execute on function public.finish_crm_handoff_by_tool_call(uuid, uuid, text, text, uuid, boolean, text) to service_role;
grant execute on function public.list_crm_handoff_conversations(uuid) to authenticated;
grant execute on function public.begin_crm_handoff(uuid, uuid, uuid, text) to service_role;
grant execute on function public.begin_approved_crm_handoff(uuid) to service_role;
