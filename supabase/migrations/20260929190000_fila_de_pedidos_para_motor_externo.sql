-- Fila de pedidos para um motor externo (CRM-14, motor Hermes).
-- Com o Hermes, quem roda a Execução é um worker fora do Supabase (no computador do Nan para o teste local, depois na
-- VPS): a Edge Function só guarda o pedido, e o worker busca os pedidos na fila e reserva cada um com claim_agent_run,
-- pelo mesmo contrato da ponte. Esta função só lista: a reserva continua única no claim.

create function public.list_queued_agent_runs(p_limit integer)
returns table (run_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.created_at
  from private.agent_runs r
  where r.status = 'queued'
  order by r.created_at, r.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

revoke all on function public.list_queued_agent_runs(integer) from public, anon, authenticated;
grant execute on function public.list_queued_agent_runs(integer) to service_role;

create index agent_runs_queued_idx on private.agent_runs (created_at, id) where status = 'queued';
