begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- DOU: o monitor da Seção 1 é o principal das duas, com janela de 3 dias e reserva.
select is(
  (select s.actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  'brasildados~dou-monitor', 'mudança regulatória busca no monitor do Diário Oficial');
select is(
  (select s.fallbacks -> 0 ->> 'actorId' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  'jenko_systems~diario-oficial-uniao-dou', 'a busca longa fica de reserva');
select is(
  (select s.input_template -> 'termos' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  '["IBS","CBS","reforma tributária","agência reguladora"]'::jsonb, 'os termos exatos da mudança regulatória');
select is(
  (select (s.input_template ->> 'janelaDias') || ':' || (r.input_template ->> 'janelaDias') || ':' || c.cadence_hours
   from private.signal_cascade_steps s
   join private.signal_cascade_steps r on r.cascade_id = s.cascade_id and r.ordem = 2
   join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  '3:3:72', 'a janela e a cadência da mudança regulatória acompanham os 3 dias da busca');
select ok(
  (select s.known_price ->> 'fonte' like '%12/10/2026%' and s.est_fixed_usd + s.est_per_item_usd * s.max_items
        + (s.fallbacks -> 0 ->> 'estFixedUsd')::numeric <= c.cap_usd
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  'o preço conhecido segue datado e o pior caso do principal mais a reserva cabem no teto');

select is(
  (select s.actor_id || '>' || (s.fallbacks -> 0 ->> 'actorId') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1),
  'brasildados~dou-monitor>jenko_systems~diario-oficial-uniao-dou', 'a licença no DOU tem monitor e reserva');
select is(
  (select s.input_template ->> 'termo' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1),
  '"licença de instalação"', 'a frase exata da licença de instalação');
select is(
  (select (s.input_template ->> 'secao') || ':' || (s.input_template ->> 'janelaDias') || ':' || (r.input_template ->> 'janelaDias') || ':' || c.cadence_hours || ':' || c.cap_usd
   from private.signal_cascade_steps s
   join private.signal_cascade_steps r on r.cascade_id = s.cascade_id and r.ordem = 2
   join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1),
  'do1:3:3:72:0.5000', 'seção 1, janela de 3 dias, cadência de 72 horas e teto de US$ 0,50');
select ok(
  (select s.est_fixed_usd + s.est_per_item_usd * s.max_items + (s.fallbacks -> 0 ->> 'estFixedUsd')::numeric <= c.cap_usd
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1),
  'o pior caso do monitor mais a reserva da licença cabem no teto');

-- Grupo A: a lista aberta continua; sem URL inventada. A nota diz a degradação.
select ok(
  (select s.input_template ->> 'url' like 'https://dadosabertos.ccee.org.br/api/3/action/datastore_search?resource_id=%'
     and s.input_template -> 'urlReserva' is null
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'grupo_a_cativo' and s.handler = 'ccee_agentes'),
  'a lista de consumidores livres segue a URL aberta, sem reserva inventada');
select ok(
  (select notes like '%exclusão não foi feita%' and notes like '%limite de leitura%' from private.signal_cascades where signal_type = 'grupo_a_cativo'),
  'a nota do Grupo A diz que a lista indisponível marca o Sinal e que a lista incompleta não afirma');

-- Cooperativa: empresas novas do agro na frente; o pior caso cabe no teto.
select is(
  (select s.actor_id || '>' || (s.fallbacks -> 0 ->> 'actorId') || ':' || s.max_items || ':' || (s.input_template ->> 'somenteAgro')
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'nova_cooperativa' and s.ordem = 1),
  'johnatan029~cnpj-new-companies>epicscrapers~brazil-cnpj-scraper:100:true',
  'a cooperativa pede empresas novas do agro e guarda a base por natureza de reserva');
select ok(
  (select s.est_fixed_usd + s.est_per_item_usd * s.max_items <= c.cap_usd
     and (s.fallbacks -> 0 ->> 'estFixedUsd')::numeric + (s.fallbacks -> 0 ->> 'estPerItemUsd')::numeric * (s.input_template ->> 'maxItensDoFallback')::numeric <= c.cap_usd
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
   where c.signal_type = 'nova_cooperativa' and s.ordem = 1),
  'o pior caso das duas bases da cooperativa cabe no teto');

-- CNPJ novo: a nota registra o descarte de pessoa. Nenhum texto lido pelo usuário cita fornecedor.
select ok(
  (select notes ilike '%mei%' and notes like '%213-5%' and notes like '%empresário individual%' from private.signal_cascades where signal_type = 'cnpj_novo'),
  'a nota do CNPJ novo descarta MEI e empresário individual');
select ok(
  (select bool_and(coalesce(notes, '') !~* '(apify|\yactors?\y)' and name !~* '(apify|\yactors?\y)')
   from private.signal_cascades where signal_type in ('mudanca_regulatoria', 'licenca_instalacao_dou', 'grupo_a_cativo', 'nova_cooperativa', 'cnpj_novo')),
  'notas e nomes destas cascatas não citam fornecedor');
select ok(
  not exists (
    select 1 from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type in ('mudanca_regulatoria', 'licenca_instalacao_dou', 'nova_cooperativa')
      and coalesce(s.known_price::text, '') ~* '(apify|\yactors?\y)'),
  'o preço conhecido destas cascatas não cita fornecedor');

select * from finish();
rollback;
