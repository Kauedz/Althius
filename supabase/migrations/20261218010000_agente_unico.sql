-- O agente único (Fase 3 do "Como o Althius deve ser"): uma conversa por pessoa, com turnos (cada pedido) e passos
-- (cada ferramenta que o agente usou). O laço roda na Edge Function `agente`; o modelo responde pela fila do Hermes
-- (ADR-0018). Tabelas novas, separadas de private.agent_runs: o worker do Hermes busca aquelas, e o agente único não pode
-- ser pego por ele.
--
-- O teto: cada conversa gasta até `teto_por_conversa` Créditos (padrão 50, o Admin muda por Workspace) sem perguntar.
-- Passar do teto, e toda mensagem a prospect, viram um passo `aguardando_confirmacao`: o turno para e a pessoa decide.
-- Quem pede só lê as próprias conversas; a escrita dos passos é só da chave de serviço (a função), e a decisão de um
-- passo confere que quem decide é quem pediu.

create table private.agente_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  teto_por_conversa integer not null default 50 check (teto_por_conversa between 1 and 10000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

create table private.agente_conversas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  creditos_gastos numeric(12,2) not null default 0 check (creditos_gastos >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, id)
);
create index agente_conversas_dono_idx on private.agente_conversas (workspace_id, owner_id, updated_at desc);

create table private.agente_turnos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversa_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  origem text not null default 'app' check (origem in ('app', 'slack', 'whatsapp')),
  pedido text not null check (length(btrim(pedido)) between 1 and 4000),
  status text not null default 'fila' check (status in ('fila', 'rodando', 'aguardando', 'concluido', 'falhou')),
  resposta text check (resposta is null or length(resposta) <= 8000),
  error_code text check (error_code is null or length(error_code) <= 60),
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  lease_until timestamptz,
  unique (requested_by, client_request_id),
  foreign key (workspace_id, conversa_id) references private.agente_conversas (workspace_id, id) on delete cascade,
  check ((status = 'falhou') = (error_code is not null))
);
-- Um turno aberto por conversa: o próximo pedido espera este acabar (ou cancela o que aguarda confirmação).
create unique index agente_turnos_um_aberto_idx on private.agente_turnos (conversa_id)
  where status in ('fila', 'rodando', 'aguardando');
create index agente_turnos_conversa_idx on private.agente_turnos (conversa_id, created_at);
create index agente_turnos_vencidos_idx on private.agente_turnos (lease_until) where status in ('fila', 'rodando');

create table private.agente_passos (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references private.agente_turnos(id) on delete cascade,
  seq integer not null check (seq between 1 and 100),
  ferramenta text not null check (ferramenta ~ '^[a-z][a-z0-9_]{0,59}$'),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  estado text not null check (estado in ('rodando', 'ok', 'erro', 'aguardando_confirmacao', 'cancelado')),
  motivo_confirmacao text check (motivo_confirmacao in ('teto', 'prospect')),
  entrada jsonb not null default '{}'::jsonb check (jsonb_typeof(entrada) = 'object' and length(entrada::text) <= 20000),
  resultado jsonb check (resultado is null or length(resultado::text) <= 200000),
  resumo text check (resumo is null or length(resumo) <= 4000),
  custo_creditos numeric(12,2) not null default 0 check (custo_creditos >= 0),
  externo jsonb check (externo is null or jsonb_typeof(externo) = 'object'),
  erro text check (erro is null or length(erro) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (turno_id, seq),
  check (estado <> 'aguardando_confirmacao' or motivo_confirmacao is not null)
);

alter table private.agente_config enable row level security;
alter table private.agente_conversas enable row level security;
alter table private.agente_turnos enable row level security;
alter table private.agente_passos enable row level security;
revoke all on private.agente_config, private.agente_conversas, private.agente_turnos, private.agente_passos
  from public, anon, authenticated;

create or replace function private.agente_teto_do_workspace(p_workspace_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select c.teto_por_conversa from private.agente_config c where c.workspace_id = p_workspace_id), 50)
$$;
revoke all on function private.agente_teto_do_workspace(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Quem pede (authenticated).

-- Guarda o pedido. Sem conversa, abre uma nova. O mesmo client_request_id devolve o mesmo turno (clique duplo). Um turno
-- que aguardava confirmação é cancelado pelo pedido novo: a pessoa mudou de assunto.
create or replace function public.agente_iniciar_turno(
  p_workspace_id uuid, p_conversa_id uuid, p_pedido text, p_client_request_id uuid
) returns table (conversa_id uuid, turno_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_conversa uuid := p_conversa_id;
  v_existente private.agente_turnos%rowtype;
  v_turno uuid;
begin
  perform private.require_active_membership(p_workspace_id);
  if p_client_request_id is null or p_pedido is null or length(btrim(p_pedido)) not between 1 and 4000 then
    raise exception 'agente: invalid request' using errcode = '22023';
  end if;

  select * into v_existente from private.agente_turnos t
  where t.requested_by = v_user and t.client_request_id = p_client_request_id;
  if found then
    if v_existente.workspace_id <> p_workspace_id then
      raise exception 'agente: invalid request' using errcode = '22023';
    end if;
    return query select v_existente.conversa_id, v_existente.id, v_existente.status;
    return;
  end if;

  if v_conversa is null then
    insert into private.agente_conversas (workspace_id, owner_id, titulo)
    values (p_workspace_id, v_user, left(regexp_replace(btrim(p_pedido), '\s+', ' ', 'g'), 120))
    returning id into v_conversa;
  else
    perform 1 from private.agente_conversas c
    where c.id = v_conversa and c.workspace_id = p_workspace_id and c.owner_id = v_user
    for update;
    if not found then
      raise exception 'agente: conversation not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from private.agente_turnos t where t.conversa_id = v_conversa and t.status in ('fila', 'rodando')) then
      raise exception 'agente: conversation busy' using errcode = '55006';
    end if;
    update private.agente_passos p set estado = 'cancelado', updated_at = clock_timestamp()
    from private.agente_turnos t
    where p.turno_id = t.id and t.conversa_id = v_conversa and t.status = 'aguardando'
      and p.estado = 'aguardando_confirmacao';
    update private.agente_turnos t set status = 'concluido', finished_at = clock_timestamp(), lease_until = null
    where t.conversa_id = v_conversa and t.status = 'aguardando';
  end if;

  insert into private.agente_turnos (workspace_id, conversa_id, requested_by, client_request_id, pedido, lease_until)
  values (p_workspace_id, v_conversa, v_user, p_client_request_id, btrim(p_pedido), clock_timestamp() + interval '2 minutes')
  returning id into v_turno;
  update private.agente_conversas c set updated_at = clock_timestamp() where c.id = v_conversa;
  return query select v_conversa, v_turno, 'fila'::text;
end;
$$;
revoke all on function public.agente_iniciar_turno(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.agente_iniciar_turno(uuid, uuid, text, uuid) to authenticated;

create or replace function public.agente_listar_conversas(p_workspace_id uuid, p_limit integer default 30)
returns table (id uuid, titulo text, creditos_gastos numeric, updated_at timestamptz, ultimo_status text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select c.id, c.titulo, c.creditos_gastos, c.updated_at,
    (select t.status from private.agente_turnos t where t.conversa_id = c.id order by t.created_at desc limit 1)
  from private.agente_conversas c
  where c.workspace_id = p_workspace_id and c.owner_id = v_user
  order by c.updated_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke all on function public.agente_listar_conversas(uuid, integer) from public, anon;
grant execute on function public.agente_listar_conversas(uuid, integer) to authenticated;

-- A conversa para a tela: os últimos 50 turnos com os passos. A entrada e o `externo` dos passos ficam de fora.
create or replace function public.agente_ler_conversa(p_conversa_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_conversa private.agente_conversas%rowtype;
begin
  select * into v_conversa from private.agente_conversas c where c.id = p_conversa_id and c.owner_id = v_user;
  if not found then
    raise exception 'agente: conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_conversa.workspace_id);
  return jsonb_build_object(
    'id', v_conversa.id,
    'workspaceId', v_conversa.workspace_id,
    'titulo', v_conversa.titulo,
    'creditosGastos', v_conversa.creditos_gastos,
    'teto', private.agente_teto_do_workspace(v_conversa.workspace_id),
    'turnos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'pedido', t.pedido, 'status', t.status, 'origem', t.origem, 'resposta', t.resposta,
        'errorCode', t.error_code, 'criadoEm', t.created_at, 'concluidoEm', t.finished_at,
        'passos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'seq', p.seq, 'ferramenta', p.ferramenta, 'titulo', p.titulo, 'estado', p.estado,
            'motivoConfirmacao', p.motivo_confirmacao, 'resultado', p.resultado, 'custo', p.custo_creditos,
            'erro', p.erro, 'pendente', (p.estado = 'rodando' and p.externo is not null)
          ) order by p.seq)
          from private.agente_passos p where p.turno_id = t.id
        ), '[]'::jsonb)
      ) order by t.created_at)
      from (
        select * from private.agente_turnos t0 where t0.conversa_id = v_conversa.id order by t0.created_at desc limit 50
      ) t
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.agente_ler_conversa(uuid) from public, anon;
grant execute on function public.agente_ler_conversa(uuid) to authenticated;

create or replace function public.agente_teto(p_workspace_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return private.agente_teto_do_workspace(p_workspace_id);
end;
$$;
revoke all on function public.agente_teto(uuid) from public, anon;
grant execute on function public.agente_teto(uuid) to authenticated;

create or replace function public.agente_definir_teto(p_workspace_id uuid, p_teto integer)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_admin(p_workspace_id);
  if p_teto is null or p_teto not between 1 and 10000 then
    raise exception 'agente: invalid cap' using errcode = '22023';
  end if;
  insert into private.agente_config (workspace_id, teto_por_conversa, updated_by, updated_at)
  values (p_workspace_id, p_teto, auth.uid(), clock_timestamp())
  on conflict (workspace_id) do update
    set teto_por_conversa = excluded.teto_por_conversa, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return p_teto;
end;
$$;
revoke all on function public.agente_definir_teto(uuid, integer) from public, anon;
grant execute on function public.agente_definir_teto(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- A função (service_role).

-- Reserva um turno na fila para rodar: devolve o contexto (Workspace, quem pede, gasto e teto da conversa, o passo
-- confirmado que retoma, se houver) e o histórico dos últimos 6 turnos fechados. Null quando o turno não está na fila.
create or replace function public.agente_reservar_turno(p_turno_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_turno private.agente_turnos%rowtype;
  v_conversa private.agente_conversas%rowtype;
  v_retomar jsonb;
begin
  update private.agente_turnos t
  set status = 'rodando', started_at = coalesce(t.started_at, clock_timestamp()),
      lease_until = clock_timestamp() + interval '6 minutes'
  where t.id = p_turno_id and t.status = 'fila'
  returning * into v_turno;
  if not found then
    return null;
  end if;
  select * into v_conversa from private.agente_conversas c where c.id = v_turno.conversa_id;
  -- O membro que saiu do Workspace não roda mais nada.
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_turno.workspace_id and m.user_id = v_turno.requested_by and m.active
  ) then
    update private.agente_turnos t set status = 'falhou', error_code = 'membership_inactive', finished_at = clock_timestamp(),
      lease_until = null
    where t.id = v_turno.id;
    return null;
  end if;
  select jsonb_build_object('passoId', p.id, 'ferramenta', p.ferramenta, 'entrada', p.entrada) into v_retomar
  from private.agente_passos p
  where p.turno_id = v_turno.id and p.estado = 'rodando' and p.externo is null
  order by p.seq desc limit 1;
  return jsonb_build_object(
    'turnoId', v_turno.id,
    'conversaId', v_turno.conversa_id,
    'workspaceId', v_turno.workspace_id,
    'userId', v_turno.requested_by,
    'origem', v_turno.origem,
    'pedido', v_turno.pedido,
    'gastos', v_conversa.creditos_gastos,
    'teto', private.agente_teto_do_workspace(v_turno.workspace_id),
    'retomar', v_retomar,
    'passosFeitos', coalesce((
      select jsonb_agg(jsonb_build_object('ferramenta', p.ferramenta, 'estado', p.estado, 'resumo', p.resumo) order by p.seq)
      from private.agente_passos p where p.turno_id = v_turno.id and p.estado in ('ok', 'erro', 'cancelado')
    ), '[]'::jsonb),
    'historico', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pedido', h.pedido, 'resposta', h.resposta,
        'passos', coalesce((
          select jsonb_agg(jsonb_build_object('ferramenta', p.ferramenta, 'estado', p.estado, 'resumo', p.resumo) order by p.seq)
          from private.agente_passos p where p.turno_id = h.id
        ), '[]'::jsonb)
      ) order by h.created_at)
      from (
        select * from private.agente_turnos t0
        where t0.conversa_id = v_turno.conversa_id and t0.id <> v_turno.id and t0.status in ('concluido', 'aguardando', 'falhou')
        order by t0.created_at desc limit 6
      ) h
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.agente_reservar_turno(uuid) from public, anon, authenticated;
grant execute on function public.agente_reservar_turno(uuid) to service_role;

create or replace function public.agente_gravar_passo(
  p_turno_id uuid, p_ferramenta text, p_titulo text, p_estado text, p_motivo text, p_entrada jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_seq integer;
begin
  perform 1 from private.agente_turnos t where t.id = p_turno_id and t.status = 'rodando' for update;
  if not found then
    raise exception 'agente: turn not running' using errcode = '55000';
  end if;
  if p_estado not in ('rodando', 'erro', 'aguardando_confirmacao') then
    raise exception 'agente: invalid step state' using errcode = '22023';
  end if;
  select coalesce(max(p.seq), 0) + 1 into v_seq from private.agente_passos p where p.turno_id = p_turno_id;
  insert into private.agente_passos (turno_id, seq, ferramenta, titulo, estado, motivo_confirmacao, entrada)
  values (p_turno_id, v_seq, p_ferramenta, left(btrim(p_titulo), 200), p_estado,
    case when p_estado = 'aguardando_confirmacao' then p_motivo end, coalesce(p_entrada, '{}'::jsonb))
  returning id into v_id;
  update private.agente_turnos t set lease_until = greatest(t.lease_until, clock_timestamp() + interval '3 minutes')
  where t.id = p_turno_id;
  return v_id;
end;
$$;
revoke all on function public.agente_gravar_passo(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.agente_gravar_passo(uuid, text, text, text, text, jsonb) to service_role;

-- Muda o estado de um passo. O custo soma no gasto da conversa só na passagem para `ok` (uma vez).
create or replace function public.agente_atualizar_passo(
  p_passo_id uuid, p_estado text, p_resultado jsonb, p_resumo text, p_custo numeric, p_externo jsonb, p_erro text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_passo private.agente_passos%rowtype;
  v_conversa uuid;
begin
  select * into v_passo from private.agente_passos p where p.id = p_passo_id for update;
  if not found then
    raise exception 'agente: step not found' using errcode = 'P0002';
  end if;
  if p_estado not in ('rodando', 'ok', 'erro', 'aguardando_confirmacao', 'cancelado') then
    raise exception 'agente: invalid step state' using errcode = '22023';
  end if;
  if v_passo.estado in ('ok', 'erro', 'cancelado') and p_estado <> v_passo.estado then
    raise exception 'agente: step already closed' using errcode = '55000';
  end if;
  if p_estado = 'aguardando_confirmacao' and v_passo.estado <> 'aguardando_confirmacao' then
    raise exception 'agente: a step waits for confirmation only from its creation' using errcode = '22023';
  end if;
  if coalesce(p_custo, 0) < 0 then
    raise exception 'agente: invalid cost' using errcode = '22023';
  end if;
  update private.agente_passos p set
    estado = p_estado,
    resultado = coalesce(p_resultado, p.resultado),
    resumo = coalesce(left(p_resumo, 4000), p.resumo),
    custo_creditos = case when p_estado = 'ok' and v_passo.estado <> 'ok' then coalesce(p_custo, 0) else p.custo_creditos end,
    externo = case when p_estado = 'rodando' then coalesce(p_externo, p.externo) else p_externo end,
    erro = case when p_estado = 'erro' then left(coalesce(p_erro, 'falhou'), 500) end,
    updated_at = clock_timestamp()
  where p.id = p_passo_id;
  if p_estado = 'ok' and v_passo.estado <> 'ok' and coalesce(p_custo, 0) > 0 then
    select t.conversa_id into v_conversa from private.agente_turnos t where t.id = v_passo.turno_id;
    update private.agente_conversas c set creditos_gastos = c.creditos_gastos + p_custo, updated_at = clock_timestamp()
    where c.id = v_conversa;
  end if;
end;
$$;
revoke all on function public.agente_atualizar_passo(uuid, text, jsonb, text, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.agente_atualizar_passo(uuid, text, jsonb, text, numeric, jsonb, text) to service_role;

-- Só troca o resultado (os cartões) de um passo fechado: o estado de uma empresa depois de aceita ou descartada.
create or replace function public.agente_trocar_resultado(p_passo_id uuid, p_resultado jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' then
    raise exception 'agente: invalid result' using errcode = '22023';
  end if;
  update private.agente_passos p set resultado = p_resultado, updated_at = clock_timestamp() where p.id = p_passo_id;
  if not found then
    raise exception 'agente: step not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.agente_trocar_resultado(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agente_trocar_resultado(uuid, jsonb) to service_role;

-- O passo de quem pede, para a função decidir o que fazer (confirmar, cancelar, escolher num cartão, atualizar uma
-- tarefa longa). Recusa (P0002) o passo de outra pessoa ou de quem saiu do Workspace.
create or replace function public.agente_passo_do_usuario(p_passo_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'passoId', p.id, 'turnoId', t.id, 'conversaId', t.conversa_id, 'workspaceId', t.workspace_id,
    'turnoStatus', t.status, 'ferramenta', p.ferramenta, 'estado', p.estado, 'entrada', p.entrada,
    'resultado', p.resultado, 'externo', p.externo
  ) into v
  from private.agente_passos p
  join private.agente_turnos t on t.id = p.turno_id
  join public.workspace_memberships m on m.workspace_id = t.workspace_id and m.user_id = t.requested_by and m.active
  where p.id = p_passo_id and t.requested_by = p_user_id;
  if v is null then
    raise exception 'agente: step not found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.agente_passo_do_usuario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agente_passo_do_usuario(uuid, uuid) to service_role;

-- A decisão num passo que aguarda confirmação. Confirmar põe o turno de volta na fila com o passo `rodando` (a função o
-- retoma); cancelar fecha o turno. Só quem pediu decide, e só uma vez (55000 na segunda).
create or replace function public.agente_assumir_passo(p_passo_id uuid, p_user_id uuid, p_decisao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_passo private.agente_passos%rowtype;
  v_turno private.agente_turnos%rowtype;
begin
  if p_decisao not in ('confirmar', 'cancelar') then
    raise exception 'agente: invalid decision' using errcode = '22023';
  end if;
  select * into v_passo from private.agente_passos p where p.id = p_passo_id for update;
  if not found then
    raise exception 'agente: step not found' using errcode = 'P0002';
  end if;
  select * into v_turno from private.agente_turnos t where t.id = v_passo.turno_id for update;
  if v_turno.requested_by is distinct from p_user_id or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_turno.workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'agente: step not found' using errcode = 'P0002';
  end if;
  if v_passo.estado <> 'aguardando_confirmacao' or v_turno.status <> 'aguardando' then
    raise exception 'agente: step already decided' using errcode = '55000';
  end if;
  if p_decisao = 'cancelar' then
    update private.agente_passos p set estado = 'cancelado', resumo = 'A pessoa cancelou.', updated_at = clock_timestamp()
    where p.id = v_passo.id;
    update private.agente_turnos t set status = 'concluido', finished_at = clock_timestamp(), lease_until = null
    where t.id = v_turno.id;
  else
    update private.agente_passos p set estado = 'rodando', updated_at = clock_timestamp() where p.id = v_passo.id;
    update private.agente_turnos t set status = 'fila', finished_at = null, lease_until = clock_timestamp() + interval '2 minutes'
    where t.id = v_turno.id;
  end if;
  return jsonb_build_object('passoId', v_passo.id, 'turnoId', v_turno.id, 'conversaId', v_turno.conversa_id,
    'decisao', p_decisao);
end;
$$;
revoke all on function public.agente_assumir_passo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agente_assumir_passo(uuid, uuid, text) to service_role;

-- Fecha um turno que está rodando: concluido, aguardando (um passo espera a pessoa) ou falhou (com o código).
create or replace function public.agente_fechar_turno(p_turno_id uuid, p_status text, p_resposta text, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('concluido', 'aguardando', 'falhou') then
    raise exception 'agente: invalid turn status' using errcode = '22023';
  end if;
  update private.agente_turnos t set
    status = p_status,
    resposta = left(nullif(btrim(coalesce(p_resposta, '')), ''), 8000),
    error_code = case when p_status = 'falhou' then left(coalesce(nullif(p_error_code, ''), 'agent_failed'), 60) end,
    finished_at = case when p_status = 'aguardando' then null else clock_timestamp() end,
    lease_until = null
  where t.id = p_turno_id and t.status = 'rodando';
  if not found then
    raise exception 'agente: turn not running' using errcode = '55000';
  end if;
  update private.agente_conversas c set updated_at = clock_timestamp()
  from private.agente_turnos t where t.id = p_turno_id and c.id = t.conversa_id;
end;
$$;
revoke all on function public.agente_fechar_turno(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.agente_fechar_turno(uuid, text, text, text) to service_role;

-- O modelo do agente pela fila de IA do Hermes, com a finalidade própria `agente`: o worker diz ao modelo que o pedido é da
-- pessoa (para agir) e que os resultados das ferramentas são dado. O Workspace vem do turno que está rodando, nunca de
-- quem chama.
alter table private.signal_llm_requests drop constraint if exists signal_llm_requests_purpose_check;
alter table private.signal_llm_requests add constraint signal_llm_requests_purpose_check
  check (purpose in ('sinal', 'resposta', 'agente'));

create or replace function public.enqueue_agente_llm_request(
  p_turno_id uuid, p_system text, p_user text, p_max_tokens integer default 2000
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_workspace uuid;
  v_id uuid;
begin
  select t.workspace_id into v_workspace from private.agente_turnos t where t.id = p_turno_id and t.status = 'rodando';
  if v_workspace is null then
    raise exception 'agente: turn not running' using errcode = '55000';
  end if;
  -- Mesmas regras da fila (limpeza, prazo de 3 minutos, 50 pedidos por Workspace).
  v_id := public.enqueue_signal_llm_request(v_workspace, p_system, p_user, p_max_tokens);
  update private.signal_llm_requests set purpose = 'agente' where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.enqueue_agente_llm_request(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_agente_llm_request(uuid, text, text, integer) to service_role;

-- O turno que ficou preso (a função caiu no meio): falha com turn_expired, e os passos rodando sem tarefa longa viram
-- erro. Um passo com tarefa longa (externo) segue: a tela pode pedir a atualização dele depois.
create or replace function private.agente_expirar_turnos_vencidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_total integer;
begin
  with vencidos as (
    update private.agente_turnos t set status = 'falhou', error_code = 'turn_expired', finished_at = clock_timestamp(),
      lease_until = null
    where t.status in ('fila', 'rodando') and t.lease_until < clock_timestamp()
    returning t.id
  ), passos as (
    update private.agente_passos p set estado = 'erro', erro = 'O passo não terminou a tempo.', updated_at = clock_timestamp()
    from vencidos v where p.turno_id = v.id and p.estado = 'rodando' and p.externo is null
    returning p.id
  )
  select count(*) into v_total from vencidos;
  -- Quem confirmou e foi embora: o passo que aguardava há mais de um dia é cancelado.
  update private.agente_passos p set estado = 'cancelado', resumo = 'Expirou sem resposta.', updated_at = clock_timestamp()
  from private.agente_turnos t
  where p.turno_id = t.id and t.status = 'aguardando' and p.estado = 'aguardando_confirmacao'
    and p.updated_at < clock_timestamp() - interval '1 day';
  update private.agente_turnos t set status = 'concluido', finished_at = clock_timestamp()
  where t.status = 'aguardando' and not exists (
    select 1 from private.agente_passos p where p.turno_id = t.id and p.estado = 'aguardando_confirmacao'
  );
  return v_total;
end;
$$;
revoke all on function private.agente_expirar_turnos_vencidos() from public, anon, authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-agente-turnos-vencidos', '*/2 * * * *', 'select private.agente_expirar_turnos_vencidos()');
  end if;
end
$cron$;
