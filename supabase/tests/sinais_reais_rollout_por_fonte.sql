begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

-- Num banco novo os coletores de vagas seguem em teste: quem os põe "available" é a equipe, pelo registro, depois de
-- validar no remoto. O rollout só garante que eles não saem do catálogo.
select is(
  (select array_agg(distinct signal_type order by signal_type)::text from private.signal_actors
    where state <> 'out' and signal_type in ('vaga_linkedin', 'vaga_indeed')),
  '{vaga_indeed,vaga_linkedin}',
  'os dois coletores de vagas continuam no catálogo'
);
select is(
  (select count(*)::integer from private.signal_actors where state <> 'out' and signal_type not in ('vaga_linkedin', 'vaga_indeed')),
  0,
  'nenhum outro actor externo fica liberado'
);
select is(
  (select count(*)::integer from private.signal_cascades
    where state in ('available', 'testing') and signal_type not in ('vaga_mercado', 'vaga_indeed_mercado')),
  0,
  'nenhuma cascata externa fora de vagas (LinkedIn e Indeed no mercado) reabre o catálogo'
);

select * from finish();
rollback;
