begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(31);

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

-- ICP E: seis Sinais registrados (quatro com fonte, em teste; dois sem fonte), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'E'),
  array[
    'expansao_de_planta:testing:conta', 'financiamento_bndes_finep:testing:conta', 'importacao_de_maquinas:sem_fonte:conta',
    'licenca_instalacao:sem_fonte:conta', 'licenca_instalacao_dou:testing:mercado', 'vaga_engenharia_manutencao:testing:conta'],
  'o estado e o escopo de cada Sinal do ICP E');
select ok(not exists (select 1 from private.signal_cascades where icp = 'E' and state = 'available'), 'nenhum Sinal novo nasce disponível');

-- Os passos de cada cascata.
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'financiamento_bndes_finep'),
  array['financiamentos_publicos', 'casar_fatos_com_contas'], 'os passos do financiamento');
select is(
  (select array_agg(s.kind || ':' || s.price_model order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'financiamento_bndes_finep'),
  array['fonte_publica:FREE', 'regra:NONE'], 'a fonte aberta e a regra não custam à plataforma');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'expansao_de_planta'),
  array['noticias_expansao_planta', 'empresa_da_noticia_expansao', 'casar_fatos_com_contas', 'cnpj_da_conta'], 'os passos da expansão de planta');
select is(
  (select s.actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'expansao_de_planta' and s.ordem = 1),
  'data_xplorer~google-news-scraper-fast', 'a busca de notícias usa o actor de notícias');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'licenca_instalacao_dou'),
  array['licencas_dou', 'licencas_de_instalacao_dou'], 'os passos da licença no Diário Oficial');
select is(
  (select s.actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1),
  'brasildados~dou-monitor', 'a busca do Diário Oficial usa o monitor da Seção 1');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type in ('licenca_instalacao', 'importacao_de_maquinas')),
  0, 'o Sinal sem fonte não tem passos');

-- A vaga de E é a cascata do A1 com outros termos: os mesmos cinco passos, só o modelo de entrada muda.
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_engenharia_manutencao'),
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_comex'),
  'a vaga de E tem os mesmos passos do A1');
select is(
  (select s.input_template -> 'termos' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_engenharia_manutencao' and s.ordem = 1),
  '["engenheiro de manutenção", "PCM", "engenheiro de processos", "supervisor de manutenção"]'::jsonb, 'os termos de busca de E');
select ok(
  (select s.input_template -> 'termosConfirmacao' ?& array['pcm', 'engenheiro de manutencao', 'engenheiro a de manutencao', 'engenharia de processos']
     and not (s.input_template -> 'termosConfirmacao' ? 'comex')
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_engenharia_manutencao' and s.ordem = 2),
  'a confirmação usa os termos da indústria (com a forma "engenheiro(a)") e nenhum de comex');
select is(
  (select s.input_template -> 'termosConfirmacao' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_comex' and s.ordem = 2) ? 'comex',
  true, 'a cascata do A1 segue como estava');

-- Só actors do plano Free (nada de aluguel), também nas alternativas.
select ok(
  not exists (
    select 1 from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
    where c.icp = 'E' and (s.price_model ilike '%FLAT%' or s.fallbacks::text ilike '%FLAT%')),
  'nenhum passo de E é aluguel mensal');
select ok(
  (select bool_and(s.price_model in ('PAY_PER_EVENT', 'PRICE_PER_DATASET_ITEM', 'FREE')) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'E' and s.kind = 'actor'),
  'todo actor de E tem modelo de preço do plano Free');

-- O teto: o pior caso de cada cascata cabe no teto duro, e as de fonte aberta têm teto baixo.
select ok(
  (select bool_and(pior <= cap_usd) from (
     select c.cap_usd, sum(s.est_fixed_usd + s.est_per_item_usd * coalesce(s.max_items, s.est_items)) as pior
     from private.signal_cascades c join private.signal_cascade_steps s on s.cascade_id = c.id where c.icp = 'E' group by c.id, c.cap_usd) t),
  'o pior caso de cada cascata de E cabe no teto');
select ok(
  (select bool_and(cap_usd <= 0.30) from private.signal_cascades where signal_type = 'financiamento_bndes_finep'),
  'o teto da cascata de custo baixo é baixo');
select ok(
  (select bool_and(cap_usd <= 0.50) from private.signal_cascades where icp = 'E'), 'nenhum teto passa do padrão de US$ 0,50');

-- A alternativa registrada do BNDES: um actor, e o pior caso dela (início mais os registros do teto do passo) cabe no teto.
select is(
  (select s.fallbacks -> 0 ->> 'actorId' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'financiamento_bndes_finep' and s.ordem = 1),
  'nexgenwatch~brazil-bndes-financing-operations', 'o BNDES tem a alternativa registrada');
select ok(
  (select (s.fallbacks -> 0 ->> 'estFixedUsd')::numeric + (s.fallbacks -> 0 ->> 'estPerItemUsd')::numeric * s.max_items <= c.cap_usd
   from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'financiamento_bndes_finep' and s.ordem = 1),
  'a alternativa do BNDES, por ser cara, tem teto baixo de registros e cabe no teto da cascata');

-- Marca: nada que o usuário ou o Hermes leem cita fornecedor ou actor.
select ok(
  (select bool_and((name || ' ' || coalesce(notes, '') || ' ' || coalesce(sem_fonte_motivo, '')) !~* '(apify|\yactors?\y)') from private.signal_cascades where icp = 'E'),
  'nome, observação e motivo não citam fornecedor');
select ok(
  (select bool_and(sem_fonte_motivo is not null and sem_fonte_motivo !~* '(apify|\yactors?\y)') from private.signal_cascades where state = 'sem_fonte' and icp = 'E'),
  'o motivo de não ter fonte existe e não cita fornecedor');

-- O catálogo do servidor devolve estado, escopo e motivo; a leitura da definição traz os passos e a alternativa.
select is((select state from public.signal_cascade_catalog() where signal_type = 'licenca_instalacao'), 'sem_fonte', 'o catálogo mostra o Sinal sem fonte');
select ok((select sem_fonte_motivo like '%Diário Oficial da União%' from public.signal_cascade_catalog() where signal_type = 'licenca_instalacao'), 'com o motivo');
select is((select scope from public.signal_cascade_catalog() where signal_type = 'licenca_instalacao_dou'), 'mercado', 'e o escopo de mercado');
select is(
  (public.signal_cascade_for_type('financiamento_bndes_finep') -> 'steps' -> 0 -> 'fallbacks' -> 0 ->> 'actorId'),
  'nexgenwatch~brazil-bndes-financing-operations', 'a definição lida pelo servidor traz a alternativa');

-- Sem fonte nunca reserva crédito e nunca vira disponível; os com fonte reservam pelo custo estimado.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@serra.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e4000000-0000-0000-0000-000000000001', 'empresa', 'Serra');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('e4000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('e4000000-0000-0000-0000-000000000001', null, 'licenca_instalacao', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('importacao_de_maquinas', 'available') $$, '55000', null, 'e não pode ser liberado');
select is(
  (select outcome from public.begin_cascade_run('e4000000-0000-0000-0000-000000000001', null, 'financiamento_bndes_finep', 'conversa', null, 'k-t', 0.0, null, false)),
  'em_teste', 'o Sinal em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('e4000000-0000-0000-0000-000000000001', null, 'licenca_instalacao_dou', 'rotina', null, 'k-dou', 0.205, null, true);
select is((select outcome || ':' || est_credits from ab), 'go:3', 'o Diário Oficial, Sinal de Mercado, reserva o preço fixo de 3 créditos por execução');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'succeeded', 0.205, 0, 0, 0, null)), 3,
  'concluída sem Sinal novo, cobra o preço fixo de Mercado (3), seja qual for o custo da fonte');

select * from finish();
rollback;
