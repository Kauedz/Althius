-- Rodízio das contas de coleta: a espera de uma conta esgotada e o cursor da próxima partida ficam no banco, para a
-- instância seguinte não repetir a conta. Só o índice do segredo (0 = APIFY_TOKEN, 1 = APIFY_TOKEN_1, …, 5 = APIFY_TOKEN_5).
-- Nunca o valor. Quem mexe é a chave de serviço, pelas funções abaixo.

create table private.collection_account_cooldowns (
  slot smallint primary key check (slot between 0 and 5),
  exhausted_until timestamptz not null,
  reason text not null check (reason in ('credito', 'limite')),
  updated_at timestamptz not null default now()
);

comment on table private.collection_account_cooldowns is
  'Conta de coleta em espera. slot é o índice do segredo; reason é credito ou limite. Sem valor de segredo.';

create table private.collection_account_cursor (
  id smallint primary key check (id = 1),
  next_index integer not null default 0 check (next_index >= 0)
);

insert into private.collection_account_cursor (id, next_index) values (1, 0);

alter table private.collection_account_cooldowns enable row level security;
alter table private.collection_account_cursor enable row level security;
revoke all on private.collection_account_cooldowns from public, anon, authenticated, service_role;
revoke all on private.collection_account_cursor from public, anon, authenticated, service_role;

comment on column private.signal_cascade_run_steps.token_index is
  'Índice do segredo da conta de coleta: 0 = APIFY_TOKEN, 1 = APIFY_TOKEN_1, 2 = APIFY_TOKEN_2, até 5. Nunca o valor.';

create function public.list_collection_account_cooldowns()
returns table (slot smallint, exhausted_until timestamptz, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.slot, c.exhausted_until, c.reason
  from private.collection_account_cooldowns c
  where c.exhausted_until > now()
  order by c.slot;
$$;

create function public.mark_collection_account_cooldown(p_slot integer, p_until timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'slot invalido' using errcode = '23514';
  end if;
  if p_reason is null or p_reason not in ('credito', 'limite') then
    raise exception 'motivo invalido' using errcode = '23514';
  end if;
  if p_until is null then
    raise exception 'espera invalida' using errcode = '23514';
  end if;
  insert into private.collection_account_cooldowns (slot, exhausted_until, reason)
  values (p_slot, p_until, p_reason)
  on conflict (slot) do update
    set exhausted_until = excluded.exhausted_until, reason = excluded.reason, updated_at = now();
end;
$$;

create function public.next_collection_account_start(p_count integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if p_count is null or p_count < 1 then
    raise exception 'contagem invalida' using errcode = '23514';
  end if;
  select c.next_index into v
  from private.collection_account_cursor c
  where c.id = 1
  for update;
  update private.collection_account_cursor
    set next_index = (v + 1) % p_count
    where id = 1;
  return v % p_count;
end;
$$;

revoke all on function public.list_collection_account_cooldowns() from public, anon, authenticated;
revoke all on function public.mark_collection_account_cooldown(integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.next_collection_account_start(integer) from public, anon, authenticated;
grant execute on function public.list_collection_account_cooldowns() to service_role;
grant execute on function public.mark_collection_account_cooldown(integer, timestamptz, text) to service_role;
grant execute on function public.next_collection_account_start(integer) to service_role;
