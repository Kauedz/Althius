-- Ticket 12: a mesma experiência de descoberta de vagas, com a fonte do Indeed isolada da do LinkedIn.
do $$
declare
  v_id uuid;
begin
  if not exists (select 1 from private.signal_cascades where signal_type = 'vaga_indeed_mercado') then
    insert into private.signal_cascades (
      signal_type, icp, name, scope, state, price_multiplier, cap_usd, cap_credits, cadence_hours, max_accounts,
      market_discovery, notes
    )
    select 'vaga_indeed_mercado', '*', 'Vagas do Indeed no mercado endereçável', 'conta', 'available', price_multiplier,
      cap_usd, cap_credits, cadence_hours, max_accounts, true,
      'Empresas do mercado endereçável encontradas no Indeed; as que não são Conta viram candidatas da Caixa de Descobertas.'
    from private.signal_cascades where signal_type = 'vaga_mercado';
  end if;

  select id into v_id from private.signal_cascades where signal_type = 'vaga_indeed_mercado';
  if not exists (select 1 from private.signal_cascade_steps where cascade_id = v_id) then
    insert into private.signal_cascade_steps (
      cascade_id, ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price,
      est_fixed_usd, est_per_item_usd, est_items, max_items
    )
    select v_id, ordem, kind, handler,
      case when ordem = 1 then 'valig~indeed-jobs-scraper' else actor_id end,
      fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items
    from private.signal_cascade_steps s
    join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'vaga_mercado';
  end if;
end;
$$;
