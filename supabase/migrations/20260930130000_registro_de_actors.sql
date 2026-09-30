-- O registro de actors do Apify (sinais-reais, ticket 01): a lista dos actors que a Althius usa para coletar Sinais, a
-- conta é sempre a da Althius (ADR-0019). Um actor fora do registro, ou marcado "fora", nunca roda. O estado diz o que
-- o cliente vê no catálogo: disponível (passou no teste), em teste (ainda não) ou fora. Os 9 actors do lançamento entram
-- todos "em teste": nenhum foi rodado de verdade, então nenhum nasce "disponível". Preço e versão ficam como "a
-- confirmar" até alguém conferir no console do Apify (nunca um valor inventado).

create table private.signal_actors (
  actor_id text primary key check (actor_id ~ '^[A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+$'),
  -- O Sinal do catálogo que este actor atende: um actor por Sinal.
  signal_type text not null unique check (signal_type ~ '^[a-z][a-z0-9_]{1,60}$'),
  state text not null default 'testing' check (state in ('available', 'testing', 'out')),
  version text,
  -- O preço como o Apify o publica, em texto livre; nulo até alguém conferir.
  known_price text,
  -- O teto de cobrança de uma execução, em dólares: o Apify aborta a execução ao atingi-lo.
  max_cost_usd numeric(8, 4) not null default 0.5 check (max_cost_usd > 0 and max_cost_usd <= 50),
  notes text,
  updated_at timestamptz not null default now()
);

alter table private.signal_actors enable row level security;
revoke all on private.signal_actors from public, anon, authenticated, service_role;

insert into private.signal_actors (actor_id, signal_type, notes) values
  ('curious_coder~linkedin-jobs-scraper', 'vaga_linkedin', 'Vaga aberta no LinkedIn, filtro por empresa.'),
  ('valig~indeed-jobs-scraper', 'vaga_indeed', 'Vaga no Indeed Brasil.'),
  ('harvestapi~linkedin-profile-scraper', 'mudanca_de_emprego', 'Contato mudou de emprego ou foi promovido (compara com a leitura anterior).'),
  ('harvestapi~linkedin-profile-search', 'nova_lideranca', 'Nova liderança na Conta.'),
  ('harvestapi~linkedin-company-employees', 'entradas_e_saidas', 'Entradas e saídas de pessoas na empresa.'),
  ('harvestapi~linkedin-post-search', 'anuncio_de_movimentacao', 'Anúncio público de movimentação de pessoas.'),
  ('silva95gustavo~linkedin-ad-library-scraper', 'anuncio_linkedin', 'Conta anunciando no LinkedIn.'),
  ('curious_coder~facebook-ads-library-scraper', 'anuncio_meta', 'Conta anunciando na Meta.'),
  ('compass~google-maps-reviews-scraper', 'avaliacoes_google_maps', 'Avaliações novas ou negativas, sem guardar dado de quem avaliou.');

-- O que o catálogo mostra ao cliente: o Sinal e o estado. O preço, o teto e as notas são internos.
create function public.list_signal_actors()
returns table (signal_type text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query select a.signal_type, a.state from private.signal_actors a order by a.signal_type;
end;
$$;

-- Para a Edge Function: o actor do registro (com o teto), ou nada quando ele não está lá.
create function public.signal_actor_for_scan(p_actor_id text)
returns table (actor_id text, signal_type text, state text, version text, max_cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select a.actor_id, a.signal_type, a.state, a.version, a.max_cost_usd from private.signal_actors a where a.actor_id = p_actor_id;
$$;

-- Muda o estado de um actor depois de testado (ou o tira do ar). Só a função de serviço.
create function public.set_signal_actor_state(p_actor_id text, p_state text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('available', 'testing', 'out') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update private.signal_actors
  set state = p_state, version = coalesce(p_version, version), updated_at = now()
  where actor_id = p_actor_id;
  if not found then
    raise exception 'actor not found' using errcode = 'P0002';
  end if;
end;
$$;

-- O custo de uma varredura de Sinais (uma execução de actor numa Conta do Workspace), para o relatório de custos.
create function public.record_signal_scan_cost(
  p_workspace_id uuid,
  p_actor_id text,
  p_run_id text,
  p_items integer,
  p_cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.signal_actors a where a.actor_id = p_actor_id) then
    raise exception 'actor not found' using errcode = 'P0002';
  end if;
  if p_cost_usd is not null and (p_cost_usd < 0 or p_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  if p_run_id is null or length(btrim(p_run_id)) = 0 then
    raise exception 'run id required' using errcode = '22023';
  end if;
  insert into private.action_costs
    (workspace_id, action_type, provider, model_or_actor, input_units, cost_usd, source_ref)
  values (p_workspace_id, 'apify_actor', 'apify', p_actor_id, greatest(coalesce(p_items, 0), 0), p_cost_usd, p_run_id)
  on conflict (action_type, source_ref) do nothing;
end;
$$;

revoke all on function public.list_signal_actors() from public, anon;
revoke all on function public.signal_actor_for_scan(text) from public, anon, authenticated;
revoke all on function public.set_signal_actor_state(text, text, text) from public, anon, authenticated;
revoke all on function public.record_signal_scan_cost(uuid, text, text, integer, numeric) from public, anon, authenticated;
grant execute on function public.list_signal_actors() to authenticated;
grant execute on function public.signal_actor_for_scan(text) to service_role;
grant execute on function public.set_signal_actor_state(text, text, text) to service_role;
grant execute on function public.record_signal_scan_cost(uuid, text, text, integer, numeric) to service_role;
