begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

-- ICP D: cinco Sinais registrados (quatro em teste, um sem fonte), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'D'),
  array['cnae_eletrointensivo:testing:conta', 'grupo_a_cativo:testing:conta', 'meta_esg_publicada:testing:conta', 'nova_planta_filial:testing:conta', 'vencimento_contrato_energia:sem_fonte:conta'],
  'o estado e o escopo de cada Sinal do ICP D');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'cnae_eletrointensivo'),
  array['cnpj_por_cnae', 'linkedin_empresa_por_cnae', 'fatos_cnae_eletrointensivo', 'casar_fatos_com_contas'], 'os passos de D1');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'grupo_a_cativo'),
  array['cnpj_por_cnae', 'ccee_agentes', 'provavel_cativo', 'casar_fatos_com_contas'], 'os passos de D2');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_planta_filial'),
  array['mapa_de_filiais', 'filiais_novas', 'noticias_de_expansao', 'casar_fatos_com_contas', 'gravar_fotografia_filiais'], 'os passos de D3');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'meta_esg_publicada'),
  array['busca_esg', 'paginas_esg', 'confirmar_esg_no_site', 'confirmar_esg'], 'os passos de D4');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vencimento_contrato_energia'),
  0, 'o Sinal sem fonte não tem passos');

-- Só o que o relatório de 12/10/2026 e a Store (13/10/2026) dizem; o plano Free não aceita aluguel.
select is(
  (select array_agg(s.actor_id order by c.signal_type, s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'D' and s.kind = 'actor'),
  array['epicscrapers~brazil-cnpj-scraper', 'harvestapi~linkedin-company', 'epicscrapers~brazil-cnpj-scraper', 'scraperlink~google-search-results-serp-scraper',
        'apify~website-content-crawler', 'johnatan029~branch-network', 'data_xplorer~google-news-scraper-fast'],
  'os actors de cada passo (só na coluna técnica)');
select ok(
  (select bool_and(private.modelo_de_preco_free(s.price_model)) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'D' and s.kind = 'actor'),
  'nenhum actor é de aluguel');
select is(
  (select array_agg(s.est_per_item_usd order by c.signal_type, s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'D' and s.kind = 'actor'),
  array[0.0009, 0.004, 0.0009, 0.0005, 0.002, 0.01, 0.004]::numeric[], 'os preços por item do relatório');
select is(
  (select s.kind || ':' || s.price_model || ':' || (s.input_template ->> 'maxPaginas') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'grupo_a_cativo' and s.handler = 'ccee_agentes'),
  'fonte_publica:FREE:8', 'a lista da CCEE é fonte aberta, sem custo');
select ok(
  (select s.input_template ->> 'url' like 'https://dadosabertos.ccee.org.br/api/3/action/datastore_search?resource_id=%' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'grupo_a_cativo' and s.handler = 'ccee_agentes'),
  'a URL da lista da CCEE fica configurável no modelo do passo');

-- O teto: o pior caso estimado de cada cascata cabe nele, e nenhum passa do padrão.
select ok(
  (select bool_and(c.cap_usd <= 0.50) from private.signal_cascades c where c.icp = 'D'), 'nenhum teto passa de US$ 0,50');
select ok(
  (select bool_and(coalesce((
      select sum(s.est_fixed_usd + s.est_per_item_usd * least(case when s.est_items > 0 then coalesce(s.max_items, s.est_items) else 0 end, coalesce(s.max_items, 1000)))
      from private.signal_cascade_steps s where s.cascade_id = c.id), 0) <= c.cap_usd)
   from private.signal_cascades c where c.icp = 'D'),
  'o pior caso estimado de cada cascata cabe no teto');
select ok(
  (select (c.max_accounts * 0.01 + 0.00005 + 10 * 0.004) <= c.cap_usd from private.signal_cascades c where c.signal_type = 'nova_planta_filial'),
  'o mapa de filiais, no máximo de Contas, cabe no teto');

-- Marca: nada que o usuário ou o Hermes leem cita fornecedor ou actor.
select ok(
  (select bool_and(c.name !~* '(apify|\yactors?\y)' and coalesce(c.notes, '') !~* '(apify|\yactors?\y)' and coalesce(c.sem_fonte_motivo, '') !~* '(apify|\yactors?\y)')
   from private.signal_cascades c where c.icp = 'D'),
  'nome, notas e motivo não citam fornecedor nem actor');
select ok(
  (select bool_and(c.name !~* '(apify|\yactors?\y)' and coalesce(c.sem_fonte_motivo, '') !~* '(apify|\yactors?\y)') from public.signal_cascade_catalog() c where c.icp = 'D'),
  'o catálogo do servidor também não');
select ok(
  (select sem_fonte_motivo like '%contratos de energia%' and sem_fonte_motivo is not null from public.signal_cascade_catalog() where signal_type = 'vencimento_contrato_energia'),
  'o motivo de não ter fonte está no catálogo');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'D' and c.state = 'available'), 'nenhum Sinal novo nasce disponível');

-- Sem fonte nunca reserva crédito nem vira disponível; em teste não roda sem o aval.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@energia.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('d2000000-0000-0000-0000-000000000001', 'empresa', 'Energia');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('d2000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('d2000000-0000-0000-0000-000000000001', null, 'vencimento_contrato_energia', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('vencimento_contrato_energia', 'available') $$, '55000', null, 'e não pode ser liberado');
select is(
  (select outcome from public.begin_cascade_run('d2000000-0000-0000-0000-000000000001', null, 'nova_planta_filial', 'conversa', null, 'k-t1', 0.1, null, false)),
  'em_teste', 'o Sinal em teste espera o aval');

select * from finish();
rollback;
