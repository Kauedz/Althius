begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

select is(
  (select array_agg(signal_type order by signal_type)::text from private.signal_actors where state = 'available'),
  '{vaga_indeed,vaga_linkedin}',
  'somente os dois coletores de vagas ficam disponíveis'
);
select is(
  (select count(*)::integer from private.signal_actors where state <> 'out' and signal_type not in ('vaga_linkedin', 'vaga_indeed')),
  0,
  'nenhum outro actor externo fica liberado'
);
select is(
  (select count(*)::integer from private.signal_cascades where state in ('available', 'testing') and signal_type <> 'vaga_mercado'),
  0,
  'nenhuma cascata externa fora de vagas reabre o catálogo'
);

select * from finish();
rollback;
