begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

-- Fase 1 (decisão 7): a busca de contas pelo LinkedIn foi validada numa execução real e está disponível para todos.
select is(
  (select row(state, version)::text from private.discovery_actors
    where purpose = 'buscar_contas' and actor_id = 'harvestapi~linkedin-company-search'),
  '(available,0.0.21)',
  'a busca de contas pelo LinkedIn está disponível, na versão validada'
);
select is(
  (select state from private.discovery_actors
    where purpose = 'buscar_contas' and actor_id = 'johnatan029~cnpj-empresas-brasil-scraper'),
  'testing',
  'a busca pela Receita segue em teste até ter a mesma validação'
);
select is(
  (select max_cost_usd from private.discovery_actors
    where purpose = 'buscar_contas' and actor_id = 'harvestapi~linkedin-company-search'),
  0.4500::numeric,
  'o teto de cobrança por execução não muda'
);
select is(
  (select count(*)::integer from private.discovery_actors where state = 'available'),
  1,
  'só este Actor de descoberta mudou de estado'
);

select * from finish();
rollback;
