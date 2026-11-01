-- Ticket 11: qualquer fonte de Sinal explicitamente habilitada como descoberta pode alimentar o mercado.
-- A própria cascata continua responsável por coletar, normalizar, deduplicar e registrar a evidência; esta guarda
-- apenas impede que uma fonte de Conta seja ativada acidentalmente no mercado.
-- Vagas permanece compatível: o tipo público vaga_linkedin aponta para a cascata privada vaga_mercado.
create or replace function private.signal_monitor_market_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.monitor_scope(new.audience) <> 'mercado' then
    return new;
  end if;
  if not exists (
    select 1 from private.signal_cascades c
    where c.signal_type = case when new.signal_type = 'vaga_linkedin' then 'vaga_mercado' else new.signal_type end
      and c.market_discovery
  ) then
    raise exception 'the market scope requires a market discovery source' using errcode = '22023';
  end if;
  if new.state = 'ativo' and (tg_op = 'INSERT' or old.state <> 'ativo' or private.monitor_scope(old.audience) <> 'mercado')
    and private.automation_contract_block(new.workspace_id) is not null then
    raise exception 'the market scope needs an active contract' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.signal_monitor_market_guard() from public, anon, authenticated, service_role;
