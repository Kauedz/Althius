begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(22);

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

-- ICP C: os cinco Sinais registrados (um sem fonte, dois de mercado, dois de Conta), todos em teste, nenhum disponível.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'C'),
  array['impacto_reforma_cnae:testing:mercado', 'mudanca_regulatoria:testing:mercado', 'processos_jusbrasil_datajud:sem_fonte:conta',
        'processos_publicos:testing:conta', 'recuperacao_judicial:testing:conta'],
  'o estado e o escopo de cada Sinal do ICP C');
select ok(not exists (select 1 from private.signal_cascades where icp = 'C' and state = 'available'), 'nenhum Sinal novo nasce disponível');

select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'processos_publicos'),
  array['jur_cnpjs_para_processos', 'jur_processos_por_cnpj', 'jur_saltos_de_processos'], 'os passos de C1');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_regulatoria'),
  array['jur_dou_publicacoes', 'jur_classificar_mudanca'], 'os passos de C2');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'recuperacao_judicial'),
  array['jur_noticias_recuperacao', 'jur_empresas_em_recuperacao', 'casar_fatos_com_contas', 'jur_confirmar_recuperacao'], 'os passos de C3');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'impacto_reforma_cnae'),
  array['jur_setor_da_reforma', 'jur_empresas_por_cnae', 'jur_sinal_impacto_reforma'], 'os passos de C4');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'processos_jusbrasil_datajud'),
  0, 'o Sinal sem fonte não tem passos');

-- Só actors do plano Free (sem aluguel) e os preços conhecidos.
select ok(
  (select bool_and(price_model in ('PAY_PER_EVENT', 'PRICE_PER_DATASET_ITEM', 'FREE', 'NONE')) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'C'),
  'nenhum passo é aluguel');
select is(
  (select array_agg(s.actor_id order by c.signal_type, s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'C' and s.kind = 'actor'),
  array['epicscrapers~brazil-cnpj-scraper', 'brasildados~dou-monitor', 'brasildados~cnpj-lawsuits-check', 'data_xplorer~google-news-scraper-fast', 'brasildados~cnpj-lawsuits-check'],
  'os actors de cada passo');
select ok(
  (select bool_and(s.known_price is not null and s.known_price ->> 'fonte' like '%12/10/2026%') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'C' and s.kind = 'actor'),
  'todo actor registra o preço conhecido e a fonte dele');
select is(
  (select coalesce(jsonb_array_length(s.fallbacks), 0)::text from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_regulatoria' and s.ordem = 1),
  '0', 'C2 não reserva a busca longa do Diário Oficial');
select is(
  (select sum(jsonb_array_length(s.fallbacks))::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type in ('processos_publicos', 'recuperacao_judicial')),
  0, 'o actor de processos individuais (traz partes) não é alternativa de nada');

-- O pior caso de cada cascata de Conta com custo por CNPJ cabe no teto.
select ok(
  (select s.max_items * s.est_per_item_usd <= c.cap_usd from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'processos_publicos' and s.ordem = 2),
  'C1: 10 CNPJs a US$ 0,10 cabem no teto');
select ok(
  (select sum(coalesce(s.max_items, 0) * s.est_per_item_usd) <= max(c.cap_usd) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'recuperacao_judicial'),
  'C3: o pior caso (notícias e confirmações) cabe no teto');
select ok(
  (select bool_and(cap_usd <= 1.00) from private.signal_cascades where icp = 'C'), 'nenhum teto passa de US$ 1,00');

-- Sem fonte: motivo em palavras do produto. Nenhum texto lido pelo usuário cita fornecedor.
select ok(
  (select sem_fonte_motivo ~ 'Jusbrasil' and sem_fonte_motivo !~* '(apify|\yactors?\y)' from private.signal_cascades where signal_type = 'processos_jusbrasil_datajud'),
  'o motivo de não ter fonte existe e não cita fornecedor');
select ok(
  (select bool_and(name !~* '(apify|\yactors?\y)' and coalesce(notes, '') !~* '(apify|\yactors?\y)' and coalesce(sem_fonte_motivo, '') !~* '(apify|\yactors?\y)')
   from private.signal_cascades where icp = 'C'),
  'nome, notas e motivo não citam fornecedor nem "actor"');

-- Entram no catálogo; o servidor devolve o motivo.
select is((select state from public.signal_cascade_catalog() where signal_type = 'processos_jusbrasil_datajud'), 'sem_fonte', 'o catálogo mostra o Sinal sem fonte');
select is((select scope from public.signal_cascade_catalog() where signal_type = 'mudanca_regulatoria'), 'mercado', 'e o escopo de mercado');

-- Sem fonte nunca reserva crédito; os demais esperam o aval de teste.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@juridico.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('c2000000-0000-0000-0000-000000000001', 'empresa', 'Juridico');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('c2000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'processos_jusbrasil_datajud', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'processos_publicos', 'conversa', null, 'k-c1', 1.0, null, false)),
  'em_teste', 'o Sinal em teste espera o aval');
-- Com o aval, C1 reserva o preço fixo (processos: faixa 1, 1 crédito por Conta, numa Conta) e o teto da execução é de US$ 1,00.
select is(
  (select est_credits || ':' || cap_usd from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'processos_publicos', 'conversa', null, 'k-c1b', 1.0, null, true)),
  '1:1.0000', 'com o aval, C1 reserva 1 crédito (preço fixo) e o teto da execução é US$ 1,00');

select * from finish();
rollback;
