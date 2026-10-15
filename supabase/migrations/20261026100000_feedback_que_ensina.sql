-- Feedback que ensina (feedback-que-ensina): o aceite e o descarte com motivo ensinam a Descoberta de cada Workspace.
--
-- 1. Motivo estruturado do descarte (`discovered_accounts.discard_reason_code`), além do texto livre.
-- 2. Peso aprendido por Workspace (`private.discovery_learned_weights`), por dimensão e valor: cada aceite soma 2,5 nas
--    dimensões da candidata; cada descarte com motivo ligado a uma dimensão subtrai 2,5 nela.
-- 3. O ajuste só conta com 3 ou mais decisões, vale no máximo ±15 e cai pela metade a cada 60 dias sem evidência nova
--    (`private.discovery_learned_effective`, mesma regra de `ajusteEfetivo` em account-discovery/pontuacao.ts).
-- 4. A nota soma os ajustes ao Encaixe ICP, sem passar de 100 e sem cair abaixo da metade do Encaixe original
--    (`encaixeAjustado`). O nível continua o único número visível.
-- 5. RPCs: list_discovery_learning, reset_discovery_learning (só Administrador) e discard_discovered_account_with_code.
-- Sem custo em créditos. Nada é apagado: o reset remove só ajustes aprendidos, por pedido do Administrador.

alter table private.discovered_accounts add column if not exists discard_reason_code text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'discovered_accounts_discard_reason_code_check') then
    alter table private.discovered_accounts add constraint discovered_accounts_discard_reason_code_check check (
      discard_reason_code is null or discard_reason_code in (
        'setor', 'porte', 'regiao', 'cliente_ou_concorrente', 'sinal_fraco', 'outro'));
  end if;
end;
$$;

create table if not exists private.discovery_learned_weights (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dimension text not null check (dimension in ('setor', 'porte', 'regiao', 'tecnologia', 'tipo_de_sinal')),
  value text not null check (length(value) between 1 and 200),
  delta numeric not null default 0,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, dimension, value)
);
alter table private.discovery_learned_weights enable row level security;
revoke all on private.discovery_learned_weights from public, anon, authenticated;
drop policy if exists discovery_learned_weights_member_read on private.discovery_learned_weights;
create policy discovery_learned_weights_member_read on private.discovery_learned_weights
  for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = discovery_learned_weights.workspace_id and m.user_id = auth.uid() and m.active
  ));

-- O ajuste efetivo de um peso aprendido.
create or replace function private.discovery_learned_effective(p_delta numeric, p_count integer, p_updated_at timestamptz, p_now timestamptz)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_count, 0) < 3 then 0::numeric
    else greatest(-15::numeric, least(15::numeric, p_delta))
      * power(0.5::numeric, (greatest(0::numeric, extract(epoch from (p_now - p_updated_at))::numeric / 86400.0) / 60.0))
  end;
$$;
revoke all on function private.discovery_learned_effective(numeric, integer, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- O valor normalizado de uma dimensão.
create or replace function private.discovery_learning_value(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(lower(btrim(coalesce(p_value, ''))), 200), '');
$$;
revoke all on function private.discovery_learning_value(text) from public, anon, authenticated, service_role;

-- Os pares (dimensão, valor) de uma candidata.
create or replace function private.discovery_learning_pairs(p_discovered_account_id uuid)
returns table (dimension text, value text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.dimension, x.value from (
    select 'setor'::text as dimension, private.discovery_learning_value(d.sector) as value
      from private.discovered_accounts d where d.id = p_discovered_account_id
    union
    select 'porte', private.discovery_learning_value(d.size_label) from private.discovered_accounts d where d.id = p_discovered_account_id
    union
    select 'regiao', private.discovery_learning_value(d.uf) from private.discovered_accounts d where d.id = p_discovered_account_id
    union
    select 'tipo_de_sinal', private.discovery_learning_value(g.signal_type)
      from private.discovery_reasons r join private.signals g on g.id = r.signal_id
      where r.discovered_account_id = p_discovered_account_id
  ) x
  where x.value is not null;
$$;
revoke all on function private.discovery_learning_pairs(uuid) from public, anon, authenticated, service_role;

-- Soma uma evidência (+2,5 ou -2,5) num par.
create or replace function private.discovery_learn(p_workspace_id uuid, p_dimension text, p_value text, p_sign integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.discovery_learned_weights as w (workspace_id, dimension, value, delta, evidence_count, updated_at)
  select p_workspace_id, p_dimension, v, 2.5 * sign(p_sign), 1, now()
  from (select private.discovery_learning_value(p_value) as v) s where s.v is not null
  on conflict (workspace_id, dimension, value) do update set
    delta = w.delta * power(0.5::numeric, (greatest(0::numeric, extract(epoch from (now() - w.updated_at))::numeric / 86400.0) / 60.0))
      + excluded.delta,
    evidence_count = w.evidence_count + 1,
    updated_at = now();
$$;
revoke all on function private.discovery_learn(uuid, text, text, integer) from public, anon, authenticated, service_role;

-- O Encaixe ICP com os ajustes aprendidos do Workspace.
create or replace function private.discovery_fit_adjusted(p_fit_score integer, p_discovered_account_id uuid, p_now timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select least(100::numeric, greatest(coalesce(p_fit_score, 0) / 2.0, coalesce(p_fit_score, 0) + coalesce((
    select sum(private.discovery_learned_effective(w.delta, w.evidence_count, w.updated_at, p_now))
    from private.discovered_accounts d
    join private.discovery_learning_pairs(d.id) p on true
    join private.discovery_learned_weights w
      on w.workspace_id = d.workspace_id and w.dimension = p.dimension and w.value = p.value
    where d.id = p_discovered_account_id
  ), 0)));
$$;
revoke all on function private.discovery_fit_adjusted(integer, uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function private.discovery_note(p_fit_score integer, p_discovered_account_id uuid, p_now timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select private.discovery_fit_adjusted(p_fit_score, p_discovered_account_id, p_now) + least(60::numeric, coalesce((
    select sum(r.weight * private.discovery_signal_decay(g.fired_at, p_now))
    from private.discovery_reasons r
    join private.signals g on g.id = r.signal_id
    where r.discovered_account_id = p_discovered_account_id
  ), 0));
$$;

-- O aceite ensina: soma nas dimensões da candidata aceita.
create or replace function private.discovery_learn_from_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if new.state = 'aceita' and old.state is distinct from 'aceita' then
    for p in select * from private.discovery_learning_pairs(new.id) loop
      perform private.discovery_learn(new.workspace_id, p.dimension, p.value, 1);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.discovery_learn_from_accept() from public, anon, authenticated, service_role;

drop trigger if exists discovered_accounts_learn_from_accept on private.discovered_accounts;
create trigger discovered_accounts_learn_from_accept
  after update of state on private.discovered_accounts
  for each row execute function private.discovery_learn_from_accept();

-- O descarte com motivo estruturado: descarta (mesma regra de discard_discovered_account) e ensina na dimensão do motivo.
create or replace function public.discard_discovered_account_with_code(p_id uuid, p_reason_code text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d private.discovered_accounts%rowtype;
  p record;
  v_dim text;
begin
  if p_reason_code is null or p_reason_code not in ('setor', 'porte', 'regiao', 'cliente_ou_concorrente', 'sinal_fraco', 'outro') then
    raise exception 'invalid discard reason code' using errcode = '22023';
  end if;
  select d.* into v_d from private.discovered_accounts d where d.id = p_id;
  -- A autorização e as regras do descarte ficam em discard_discovered_account.
  perform public.discard_discovered_account(p_id, p_reason);
  if v_d.state is distinct from 'nova' then
    return;
  end if;
  update private.discovered_accounts set discard_reason_code = p_reason_code where id = p_id;
  v_dim := case p_reason_code when 'setor' then 'setor' when 'porte' then 'porte' when 'regiao' then 'regiao'
    when 'sinal_fraco' then 'tipo_de_sinal' end;
  if v_dim is not null then
    for p in select * from private.discovery_learning_pairs(p_id) where dimension = v_dim loop
      perform private.discovery_learn(v_d.workspace_id, p.dimension, p.value, -1);
    end loop;
  end if;
end;
$$;
revoke all on function public.discard_discovered_account_with_code(uuid, text, text) from public, anon;
grant execute on function public.discard_discovered_account_with_code(uuid, text, text) to authenticated;

-- O que a Descoberta aprendeu: os ajustes que contam hoje (3 ou mais decisões e efeito diferente de zero).
create or replace function public.list_discovery_learning(p_workspace_id uuid)
returns table (dimension text, value text, adjustment numeric, evidence_count integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select w.dimension, w.value,
      round(private.discovery_learned_effective(w.delta, w.evidence_count, w.updated_at, now()), 1),
      w.evidence_count, w.updated_at
    from private.discovery_learned_weights w
    where w.workspace_id = p_workspace_id
      and round(private.discovery_learned_effective(w.delta, w.evidence_count, w.updated_at, now()), 1) <> 0
    order by abs(private.discovery_learned_effective(w.delta, w.evidence_count, w.updated_at, now())) desc, w.dimension, w.value;
end;
$$;
revoke all on function public.list_discovery_learning(uuid) from public, anon;
grant execute on function public.list_discovery_learning(uuid) to authenticated;

-- Desfaz um ajuste (dimensão e valor) ou recomeça todo o aprendizado (nulos). Só Administrador.
create or replace function public.reset_discovery_learning(p_workspace_id uuid, p_dimension text default null, p_value text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.require_workspace_admin(p_workspace_id);
  delete from private.discovery_learned_weights w
  where w.workspace_id = p_workspace_id
    and (p_dimension is null or w.dimension = p_dimension)
    and (p_value is null or w.value = private.discovery_learning_value(p_value));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.reset_discovery_learning(uuid, text, text) from public, anon;
grant execute on function public.reset_discovery_learning(uuid, text, text) to authenticated;

-- A lista da Descoberta com o Encaixe ajustado (mesma assinatura e mesmo retorno).
create or replace function public.list_discovered_accounts(p_workspace_id uuid, p_state text default 'nova', p_limit integer default 200)
returns table (
  id uuid,
  run_id uuid,
  state text,
  name text,
  website text,
  domain text,
  cnpj text,
  linkedin_url text,
  location text,
  uf text,
  sector text,
  size_label text,
  employee_count integer,
  description text,
  tags text[],
  source_actor text,
  fit_level text,
  reasons jsonb,
  signals jsonb,
  target_account_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  discard_reason text,
  created_at timestamptz,
  origin text,
  reopened_by_signal_at timestamptz,
  reopened_discard_reason text,
  signal_reasons jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  perform private.require_active_membership(p_workspace_id);
  if p_state is not null and p_state not in ('nova', 'aceita', 'descartada') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  return query
    select d.id, d.run_id, d.state, d.name, d.website, d.domain, d.cnpj, d.linkedin_url, d.location, d.uf, d.sector,
      d.size_label, d.employee_count, d.description, d.tags, d.source_actor,
      private.discovery_level(private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso), d.fit_level),
      d.reasons, d.signals, d.target_account_id, d.decided_by, d.decided_at, d.discard_reason, d.created_at,
      d.origin, d.reopened_by_signal_at, d.reopened_discard_reason,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'tipo', g.signal_type,
            'frase', private.texto_do_sinal_para_a_tela(g.phrase, 'Sinal registrado.'),
            'fonte', private.texto_do_sinal_para_a_tela(g.source, null),
            'data', g.fired_at,
            'valido', private.signal_is_valid(g.fired_at),
            'mercado', g.market_signal_id is not null
          ) order by g.fired_at desc, g.id desc)
        from (
          select g2.* from private.discovery_reasons r2
          join private.signals g2 on g2.id = r2.signal_id
          where r2.discovered_account_id = d.id
          order by g2.fired_at desc, g2.id desc
          limit 50
        ) g
      ), '[]'::jsonb)
    from private.discovered_accounts d
    cross join lateral (
      select coalesce(sum(r.weight * private.discovery_signal_decay(g.fired_at, v_now)), 0) as peso,
        max(g.fired_at) as ultimo
      from private.discovery_reasons r
      join private.signals g on g.id = r.signal_id
      where r.discovered_account_id = d.id
    ) s
    where d.workspace_id = p_workspace_id and (p_state is null or d.state = p_state)
    order by private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso) desc, s.ultimo desc nulls last, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_discovered_accounts(uuid, text, integer) from public, anon;
grant execute on function public.list_discovered_accounts(uuid, text, integer) to authenticated;
