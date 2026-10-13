begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

-- ICP H: cinco Sinais (um de Conta e dois de mercado em teste, dois sem fonte), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'H'),
  array['area_no_car:sem_fonte:conta', 'calendario_de_safra:testing:mercado', 'cpr_registrada:sem_fonte:conta', 'liberacao_plano_safra:testing:mercado', 'nova_cooperativa:testing:conta'],
  'o estado e o escopo de cada Sinal do ICP H');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_cooperativa'),
  array['cooperativas_abertas', 'casar_fatos_com_contas'], 'os passos de nova_cooperativa');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'liberacao_plano_safra'),
  array['noticias_plano_safra', 'plano_safra_da_noticia'], 'os passos do Plano Safra');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'calendario_de_safra'),
  array['calendario_de_safra'], 'o passo do calendário de safra');
select is(
  (select s.actor_id || ' > ' || (s.fallbacks -> 0 ->> 'actorId') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_cooperativa' and s.ordem = 1),
  'johnatan029~cnpj-new-companies > epicscrapers~brazil-cnpj-scraper', 'empresas novas do agro e, na reserva, a base por natureza jurídica');
select is(
  (select s.actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'liberacao_plano_safra' and s.ordem = 1),
  'data_xplorer~google-news-scraper-fast', 'a busca de notícias do Plano Safra');
select is(
  (select array_agg(c.signal_type || ':' || s.kind || ':' || s.price_model order by c.signal_type, s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'H'),
  array['calendario_de_safra:regra:FREE', 'liberacao_plano_safra:actor:PAY_PER_EVENT', 'liberacao_plano_safra:regra:NONE', 'nova_cooperativa:actor:PAY_PER_EVENT', 'nova_cooperativa:regra:NONE'],
  'só preço por evento ou grátis, nunca aluguel');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type in ('cpr_registrada', 'area_no_car')),
  0, 'o Sinal sem fonte não tem passos');
select ok(
  (select bool_and(sem_fonte_motivo is not null and sem_fonte_motivo !~* '(apify|\yactors?\y)') from private.signal_cascades where state = 'sem_fonte' and icp = 'H'),
  'o motivo de não ter fonte existe e não cita fornecedor');
select ok(
  (select sem_fonte_motivo like '%B3%CERC%' from private.signal_cascades where signal_type = 'cpr_registrada')
    and (select sem_fonte_motivo like '%LGPD%' from private.signal_cascades where signal_type = 'area_no_car'),
  'os motivos de CPR (registradoras) e de CAR (dono não identificado, LGPD)');
select ok(
  not exists (
    select 1 from private.signal_cascades c left join private.signal_cascade_steps s on s.cascade_id = c.id
    where c.icp = 'H' and (
      c.name ~* '(apify|\yactors?\y)' or coalesce(c.notes, '') ~* '(apify|\yactors?\y)'
      or coalesce(s.input_template::text, '') ~* '(apify|\yactors?\y)' or coalesce(s.known_price::text, '') ~* '(apify|\yactors?\y)')),
  'nenhum texto do ICP H cita fornecedor ou actor (nome, notas, modelo do passo, preço)');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'H' and c.state = 'available'),
  'nenhum Sinal novo nasce disponível');

-- Tetos: o pior caso de cada fonte cabe no teto da cascata.
select is(
  (select array_agg(signal_type || ':' || cap_usd order by signal_type) from private.signal_cascades where icp = 'H' and state = 'testing'),
  array['calendario_de_safra:0.0500', 'liberacao_plano_safra:0.2500', 'nova_cooperativa:0.5000'], 'o teto de cada cascata');
select ok(
  (select s.est_fixed_usd + s.est_per_item_usd * s.max_items <= c.cap_usd
     and (s.fallbacks -> 0 ->> 'estFixedUsd')::numeric + (s.fallbacks -> 0 ->> 'estPerItemUsd')::numeric * (s.input_template ->> 'maxItensDoFallback')::numeric <= c.cap_usd
     from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_cooperativa' and s.ordem = 1),
  'nova_cooperativa: o pior caso da base principal e o da alternativa cabem no teto');
select ok(
  (select s.est_fixed_usd + s.est_per_item_usd * s.max_items <= c.cap_usd
     from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'liberacao_plano_safra' and s.ordem = 1),
  'Plano Safra: o pior caso da busca de notícias cabe no teto');

-- A tabela do calendário: datas conferidas na CONAB e as duas janelas.
select is(
  (select jsonb_array_length(s.input_template -> 'eventos') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'calendario_de_safra'),
  15, 'o calendário tem 13 levantamentos de grãos e 2 janelas');
select ok(
  (select bool_and(e ->> 'conferidoEm' is not null) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id,
     jsonb_array_elements(s.input_template -> 'eventos') e where c.signal_type = 'calendario_de_safra' and e ->> 'tipo' = 'divulgacao')
  and (select bool_and(e ->> 'conferidoEm' is null) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id,
     jsonb_array_elements(s.input_template -> 'eventos') e where c.signal_type = 'calendario_de_safra' and e ->> 'tipo' = 'janela'),
  'divulgações conferidas em fonte pública; janelas do Mapa marcadas como não conferidas');
select is(
  (select array_agg(e ->> 'de' order by e ->> 'de') filter (where e ->> 'id' like 'conab-graos-2026-27-%') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id,
     jsonb_array_elements(s.input_template -> 'eventos') e where c.signal_type = 'calendario_de_safra'),
  array['2026-10-15', '2026-11-13', '2026-12-15', '2027-01-14'], 'as datas do ano-safra 2026/27 do calendário da CONAB');

-- Entram no catálogo, e o catálogo do servidor devolve o motivo.
select is((select state from public.signal_cascade_catalog() where signal_type = 'cpr_registrada'), 'sem_fonte', 'o catálogo mostra o Sinal sem fonte');
select ok((select sem_fonte_motivo like '%registradoras%' from public.signal_cascade_catalog() where signal_type = 'cpr_registrada'), 'com o motivo');

-- Sem fonte nunca reserva crédito e nunca vira disponível; o de teste espera o aval e, com ele, reserva.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e1000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'ana@campo.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e2000000-0000-0000-0000-0000000000a1', 'empresa', 'Campo');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('e2000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-0000000000a1', 'admin', true);
select public.grant_credits('e2000000-0000-0000-0000-0000000000a1', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a1', null, 'area_no_car', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('cpr_registrada', 'available') $$, '55000', null, 'e não pode ser liberado');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a1', null, 'liberacao_plano_safra', 'conversa', null, 'k-m1', 0.16, null, false)),
  'em_teste', 'o Sinal de mercado em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a1', null, 'nova_cooperativa', 'conversa', null, 'k-c1', 0.2701, null, true);
select is((select outcome from ab), 'go', 'com o aval, a cascata de Conta reserva');

select * from finish();
rollback;
