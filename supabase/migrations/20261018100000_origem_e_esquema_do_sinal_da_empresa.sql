-- Sinal vira candidata (sinal-candidata-e-descoberta, ticket 01): o esquema.
--
-- Um Sinal pode ser de uma empresa que ainda não é Conta-alvo. Nesse caso ele fica ligado à candidata da Caixa de
-- Descobertas (`discovered_account_id`) e, no aceite, migra para a Conta. Aqui ficam só as colunas, as tabelas e os
-- leitores que assumiam "todo Sinal tem Conta"; a regra que resolve o Sinal em Conta ou candidata é a migração seguinte.
--
-- Idempotente: cada passo confere o que já existe. Nada é apagado.

-- 1. A origem da candidata. `sincronizacao` é do Renan: por enquanto ninguém grava.
alter table private.discovered_accounts
  add column if not exists origin text not null default 'busca',
  add column if not exists reopened_by_signal_at timestamptz,
  add column if not exists reopened_decided_at timestamptz,
  add column if not exists reopened_discard_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.discovered_accounts'::regclass and conname = 'discovered_accounts_origin_check'
  ) then
    alter table private.discovered_accounts
      add constraint discovered_accounts_origin_check check (origin in ('busca', 'sinal', 'sincronizacao'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.discovered_accounts'::regclass and conname = 'discovered_accounts_reopened_reason_check'
  ) then
    alter table private.discovered_accounts
      add constraint discovered_accounts_reopened_reason_check
      check (reopened_discard_reason is null or length(reopened_discard_reason) <= 300);
  end if;
end
$$;

create index if not exists discovered_accounts_origin_idx on private.discovered_accounts (workspace_id, origin);

-- 2. O Sinal de uma empresa que ainda não é Conta. Exatamente um dos dois lados: a Conta ou a candidata.
alter table private.signals alter column target_account_id drop not null;
alter table private.signals
  add column if not exists discovered_account_id uuid,
  add column if not exists market_signal_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.signals'::regclass and conname = 'signals_discovered_account_fkey'
  ) then
    -- A candidata apagada (o gatilho de apagar a Conta) leva junto os Sinais que ainda eram dela.
    alter table private.signals
      add constraint signals_discovered_account_fkey
      foreign key (workspace_id, discovered_account_id)
      references private.discovered_accounts (workspace_id, id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.signals'::regclass and conname = 'signals_market_signal_fkey'
  ) then
    alter table private.signals
      add constraint signals_market_signal_fkey
      foreign key (market_signal_id) references private.market_signals (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.signals'::regclass and conname = 'signals_account_or_candidate_check'
  ) then
    alter table private.signals
      add constraint signals_account_or_candidate_check
      check (num_nonnulls(target_account_id, discovered_account_id) = 1);
  end if;
end
$$;

-- O mesmo acontecimento é um Sinal só dentro da candidata, como já é dentro da Conta.
create unique index if not exists signals_discovered_event_idx
  on private.signals (workspace_id, discovered_account_id, signal_type, event_key)
  where discovered_account_id is not null;
create index if not exists signals_discovered_account_idx
  on private.signals (workspace_id, discovered_account_id, fired_at desc)
  where discovered_account_id is not null;
create index if not exists signals_market_signal_idx
  on private.signals (market_signal_id)
  where market_signal_id is not null;

-- 3. Os motivos: por que a candidata está na Caixa. Um por Sinal. Não se mistura com `discovered_accounts.signals`
-- (jsonb), que continua sendo só o indício que a fonte da busca trouxe. O peso cheio do Sinal vem de `pontuacao.ts`
-- (account-discovery) na hora de gravar; a nota aplica o decaimento na leitura.
create table if not exists private.discovery_reasons (
  discovered_account_id uuid not null,
  signal_id uuid not null references private.signals (id) on delete cascade,
  workspace_id uuid not null,
  weight smallint not null default 20 check (weight between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (discovered_account_id, signal_id),
  foreign key (workspace_id, discovered_account_id)
    references private.discovered_accounts (workspace_id, id) on delete cascade
);

create index if not exists discovery_reasons_signal_idx on private.discovery_reasons (signal_id);
create index if not exists discovery_reasons_workspace_idx on private.discovery_reasons (workspace_id, discovered_account_id);

alter table private.discovery_reasons enable row level security;
revoke all on private.discovery_reasons from public, anon, authenticated, service_role;

-- 4. A Conta que nasce do aceite por CNPJ não tem site. A URL canônica deixa de ser obrigatória; o check de `https://`
-- continua valendo para quem a tem. Duas Contas sem site não podem ter o mesmo CNPJ.
alter table public.target_accounts alter column canonical_url drop not null;

create unique index if not exists target_accounts_cnpj_without_site_idx
  on public.target_accounts (workspace_id, (private.cnpj_key(legal_identifier)))
  where canonical_url is null and deleted_at is null and private.cnpj_key(legal_identifier) is not null;

-- 5. Os leitores que assumiam "todo Sinal tem Conta". Redefinidos a partir da definição mais recente
-- (20260930180000): só entra a condição de ter Conta. Os Sinais das candidatas têm leitura própria (migrações seguintes).
create or replace function public.list_account_signals(p_workspace_id uuid)
returns table (target_account_id uuid, valid_signals integer, hot boolean, last_phrase text, last_fired_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select g.target_account_id,
    (count(*) filter (where private.signal_is_valid(g.fired_at)))::integer,
    bool_or(private.signal_is_valid(g.fired_at)),
    (array_agg(g.phrase order by g.fired_at desc, g.id desc))[1],
    max(g.fired_at)
  from private.signals g
  where g.workspace_id = p_workspace_id and g.target_account_id is not null
  group by g.target_account_id;
end;
$$;

create or replace function public.list_signals(
  p_workspace_id uuid,
  p_target_account_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  target_account_id uuid,
  monitor_id uuid,
  signal_type text,
  event_key text,
  phrase text,
  fired_at timestamptz,
  source text,
  evidence text,
  seen_again_at timestamptz,
  seen_again_monitor_id uuid,
  valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select g.id, g.target_account_id, g.monitor_id, g.signal_type, g.event_key, g.phrase, g.fired_at, g.source, g.evidence,
    g.seen_again_at, g.seen_again_monitor_id, private.signal_is_valid(g.fired_at)
  from private.signals g
  where g.workspace_id = p_workspace_id and g.target_account_id is not null
    and (p_target_account_id is null or g.target_account_id = p_target_account_id)
  order by g.fired_at desc, g.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.list_account_signals(uuid) from public, anon;
revoke all on function public.list_signals(uuid, uuid, integer) from public, anon;
grant execute on function public.list_account_signals(uuid) to authenticated;
grant execute on function public.list_signals(uuid, uuid, integer) to authenticated;
