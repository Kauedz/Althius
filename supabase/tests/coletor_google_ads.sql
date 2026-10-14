begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

-- Coletor de anúncios do Google (PR-7): o actor da Central de Transparência entra em teste, sem preço nem versão, e o
-- card "Anunciando no Google" passa a ter o tipo técnico `anuncio_google`, que custa 2 créditos por Conta varrida.
select is(
  (select row(a.signal_type, a.state, a.known_price, a.version, a.max_cost_usd)::text
   from private.signal_actors a where a.actor_id = 'solidcode~ads-transparency-scraper'),
  row('anuncio_google', 'testing', null::text, null::text, 0.1000::numeric(8, 4))::text,
  'o actor do Google entra em teste, sem preço nem versão, com teto de US$ 0,10');
select is(
  (select collector_types from public.signal_catalog where id = 'anuncios-google' and workspace_id is null),
  array['anuncio_google'], 'o card Anunciando no Google tem o coletor anuncio_google');
select is(private.credits_per_account('anuncio_google'), 2, 'cada Conta varrida custa 2 créditos (família Anúncios)');
select is(
  (select credits_per_account from public.signal_catalog where id = 'anuncios-google' and workspace_id is null), 2,
  'o preço do card não muda');

-- O actor em teste não varre: o registro de varredura o devolve como "testing".
select is((select state from public.signal_actor_for_scan('solidcode~ads-transparency-scraper')), 'testing',
  'o signal-runner vê o actor em teste e não o roda');

-- Idempotente: rodar a migração de novo não duplica nada.
insert into private.signal_actors (actor_id, signal_type, max_cost_usd, notes)
values ('solidcode~ads-transparency-scraper', 'anuncio_google', 0.10, 'x')
on conflict (actor_id) do nothing;
update public.signal_catalog
set collector_types = array_append(collector_types, 'anuncio_google')
where id = 'anuncios-google' and workspace_id is null and not ('anuncio_google' = any (collector_types));
select is((select count(*)::int from private.signal_actors where signal_type = 'anuncio_google'), 1, 'um actor só para o tipo');
select is(
  (select collector_types from public.signal_catalog where id = 'anuncios-google' and workspace_id is null),
  array['anuncio_google'], 'o coletor não se repete');

select * from finish();
rollback;
