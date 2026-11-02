begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(30);

-- O rollout só de vagas (migration 20261219010000) pôs "out" os actors e desligou as cascatas que não são de vagas, e a
-- cascata do Indeed no mercado (20261219020000) nasce disponível. Este teste é anterior aos dois e confere cada fonte no
-- estado que as migrations de antes deixavam, então volta a ele só nesta transação: os 5 actors validados disponíveis, os
-- outros em teste e as cascatas em teste.
update private.signal_actors
set state = case when actor_id in (
    'harvestapi~linkedin-profile-scraper', 'harvestapi~linkedin-profile-search', 'harvestapi~linkedin-post-search',
    'silva95gustavo~linkedin-ad-library-scraper', 'compass~google-maps-reviews-scraper'
  ) then 'available' else 'testing' end
where state = 'out';
update private.signal_cascades set state = 'testing' where state = 'disabled' or signal_type = 'vaga_indeed_mercado';

-- ICP F (logística e transporte): os quatro Sinais registrados (três em teste, um sem fonte), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'F'),
  array['crescimento_comex_embarcador:sem_fonte:conta', 'novo_cd_ou_filial:testing:conta', 'troca_de_sede:testing:conta', 'vaga_logistica:testing:conta'],
  'o estado e o escopo de cada Sinal do ICP F');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'F' and c.state = 'available'),
  'nenhum Sinal novo nasce disponível');

-- Os passos de cada cascata.
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'novo_cd_ou_filial'),
  array['logistica_escolher_raizes', 'logistica_filiais_da_raiz', 'logistica_novas_filiais', 'logistica_noticias_de_cd'], 'os passos de F1');
select is(
  (select array_agg(s.kind || ':' || coalesce(s.actor_id, '-') order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'novo_cd_ou_filial'),
  array['regra:-', 'actor:johnatan029~branch-network', 'regra:-', 'actor:data_xplorer~google-news-scraper-fast'], 'quem roda cada passo de F1');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'troca_de_sede'),
  array['logistica_escolher_raizes', 'logistica_endereco_da_matriz', 'logistica_mudanca_de_sede'], 'os passos de F2');
select is(
  (select s.fallbacks from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'troca_de_sede' and s.ordem = 2),
  '[{"kind": "fonte_publica", "source": "logistica_brasilapi_matriz"}]'::jsonb, 'a consulta de CNPJ da sede cai para a fonte pública aberta');
select is(
  (select actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'troca_de_sede' and s.ordem = 2),
  'johnatan029~cnpj-empresas-brasil-scraper', 'e usa a consulta de CNPJ já adotada');

-- F3 é a cascata do A1: os mesmos handlers, atores e alternativas, outro modelo de entrada.
select is(
  (select array_agg(s.handler || ':' || coalesce(s.actor_id, '-') || ':' || s.fallbacks::text order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_logistica'),
  (select array_agg(s.handler || ':' || coalesce(s.actor_id, '-') || ':' || s.fallbacks::text order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_comex'),
  'vaga_logistica tem os mesmos passos, atores e alternativas de vaga_comex');
select is(
  (select s.input_template -> 'termos' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_logistica' and s.ordem = 1),
  '["analista de logística", "supply chain", "coordenador de transportes"]'::jsonb, 'a busca leva os termos de logística do Mapa');
select ok(
  (select s.input_template ->> 'termosConfirmacao' !~* '(comex|comercio exterior|importacao|aduan)' and s.input_template -> 'termosConfirmacao' ? 'logistica'
     and s.input_template -> 'termosConfirmacao' ? 'supply chain'
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_logistica' and s.ordem = 2),
  'a confirmação lê termos de logística, sem os de comex');
select is(
  (select c.cadence_hours from private.signal_cascades c where c.signal_type = 'vaga_logistica'), 24, 'a vaga roda todo dia, como a de comex');

-- Diff mensal.
select is(
  (select array_agg(c.signal_type || ':' || c.cadence_hours order by c.signal_type) from private.signal_cascades c where c.signal_type in ('novo_cd_ou_filial', 'troca_de_sede')),
  array['novo_cd_ou_filial:720', 'troca_de_sede:720'], 'os dois diffs rodam uma vez por mês');
select is(
  (select array_agg(s.kind || ':' || s.price_model order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'troca_de_sede'),
  array['regra:NONE', 'actor:PAY_PER_EVENT', 'regra:NONE'], 'o rodízio e o diff não custam à plataforma; só a consulta de CNPJ');

-- Preço e teto.
select is(
  (select array_agg(s.est_per_item_usd order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'novo_cd_ou_filial' and s.kind = 'actor'),
  array[0.01, 0.004]::numeric[], 'o mapa de filiais custa US$ 0,01 por raiz e a notícia US$ 0,004 por item');
select is(
  (select s.est_per_item_usd from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'troca_de_sede' and s.kind = 'actor'),
  0.0015::numeric, 'a consulta de CNPJ custa US$ 0,0015');
select ok(
  not exists (
    select 1 from private.signal_cascades c where c.icp = 'F' and c.state <> 'sem_fonte'
      and (select coalesce(sum(case when s.kind = 'actor' then s.est_fixed_usd + s.est_per_item_usd * coalesce(s.max_items, s.est_items) end), 0)
           from private.signal_cascade_steps s where s.cascade_id = c.id) > c.cap_usd),
  'o pior caso de cada cascata (cada passo de actor no teto de itens) cabe no teto dela');
select ok(
  not exists (select 1 from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'F' and s.price_model = 'FLAT_PRICE_PER_MONTH'),
  'nenhum passo usa aluguel');
select ok(
  not exists (select 1 from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'F' and s.kind = 'actor' and (s.known_price is null or s.known_price ->> 'fonte' is null)),
  'todo passo de actor leva o preço conhecido e de onde veio');
select ok(
  (select bool_and(s.max_items is not null and s.max_items >= 1) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'F' and s.kind = 'actor'),
  'todo passo de actor tem teto de itens');

-- Sem fonte.
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'crescimento_comex_embarcador'),
  0, 'o Sinal sem fonte não tem passos');
select ok(
  (select sem_fonte_motivo like '%CMRI 467/2024%' and sem_fonte_motivo like '%sem empresa%' from private.signal_cascades where signal_type = 'crescimento_comex_embarcador'),
  'o motivo diz que a lista por CNPJ não é mais aberta');

-- Marca: nada que o usuário ou o Hermes lê cita fornecedor ou actor.
select ok(
  (select bool_and(name !~* '(apify|\yactors?\y)' and coalesce(notes, '') !~* '(apify|\yactors?\y)' and coalesce(sem_fonte_motivo, '') !~* '(apify|\yactors?\y)')
   from private.signal_cascades where icp = 'F'),
  'nome, notas e motivo não citam fornecedor');
select ok(
  not exists (select 1 from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'F' and s.input_template::text ~* '(apify|\yactors?\y)'),
  'o modelo de entrada dos passos não cita fornecedor');

-- Entram no catálogo, e o catálogo do servidor devolve o motivo.
select is((select state from public.signal_cascade_catalog() where signal_type = 'crescimento_comex_embarcador'), 'sem_fonte', 'o catálogo mostra o Sinal sem fonte');
select is((select count(*)::integer from public.signal_cascade_catalog() where icp = 'F'), 4, 'o catálogo tem os quatro Sinais de F');

-- Sem fonte nunca reserva crédito e nunca vira disponível; os de teste só rodam com o aval.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@rota.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f2000000-0000-0000-0000-000000000001', 'empresa', 'Rota');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('f2000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('f2000000-0000-0000-0000-000000000001', null, 'crescimento_comex_embarcador', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('crescimento_comex_embarcador', 'available') $$, '55000', null, 'e não pode ser liberado');
select is(
  (select outcome from public.begin_cascade_run('f2000000-0000-0000-0000-000000000001', null, 'novo_cd_ou_filial', 'conversa', null, 'k-f1', 0.3, null, false)),
  'em_teste', 'o Sinal em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('f2000000-0000-0000-0000-000000000001', null, 'troca_de_sede', 'conversa', null, 'k-f2', 0.05, null, true);
select is((select outcome from ab), 'go', 'com o aval, a cascata de F roda');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'succeeded', 0, 0, 0, 0, null)), 1,
  'concluída, cobra o preço fixo (faixa 1: 1 crédito por Conta), ache ou não um Sinal novo');

select * from finish();
rollback;
