begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

select ok(
  exists (select 1 from private.signal_cascades where signal_type = 'vaga_indeed_mercado' and market_discovery and state = 'available'),
  'Indeed tem uma cascata própria de descoberta disponível'
);
select is(
  (select actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'vaga_indeed_mercado' and s.ordem = 1),
  'valig~indeed-jobs-scraper',
  'a cascata de Indeed usa o actor do Indeed'
);
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'vaga_indeed_mercado'),
  4,
  'Indeed preserva as quatro etapas do fluxo de descoberta'
);
select ok(
  (select id from private.signal_cascades where signal_type = 'vaga_indeed_mercado') <>
    (select id from private.signal_cascades where signal_type = 'vaga_mercado'),
  'Indeed não compartilha a identidade da cascata de LinkedIn'
);

select * from finish();
rollback;
