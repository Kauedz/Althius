begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

-- ICP B: os quatro Sinais do Mapa registrados (três de Conta e um de mercado, todos em teste), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'B'),
  array['cnpj_novo:testing:conta', 'entrada_de_socio:testing:conta', 'mudanca_de_porte_ou_regime:testing:conta', 'setor_afetado_cbs_ibs:testing:mercado'],
  'o estado e o escopo de cada Sinal do ICP B');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'cnpj_novo'),
  array['cnpj_novos_da_receita', 'casar_fatos_com_contas'], 'os passos de B1');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'mudanca_de_porte_ou_regime'),
  array['receita_fotografia', 'diff_porte_regime'], 'os passos de B2');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'entrada_de_socio'),
  array['receita_fotografia', 'diff_socios'], 'os passos de B3');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'setor_afetado_cbs_ibs'),
  array['receita_por_cnae', 'setor_afetado_cbs_ibs'], 'os passos de B4');

-- Os actors e as alternativas pelo relatório de preços de 12/10/2026 (conferido em 13/10/2026).
select is(
  (select s.actor_id from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  'johnatan029~cnpj-new-companies', 'o actor principal de B1');
select is(
  (select array_agg(a ->> 'actorId' order by o) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id,
     jsonb_array_elements(s.fallbacks) with ordinality as t(a, o) where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  array['brazilayer~brazilian-new-companies', 'epicscrapers~brazil-cnpj-scraper'], 'as alternativas de B1, nesta ordem');
select is(
  (select array_agg(s.actor_id order by c.signal_type) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type in ('mudanca_de_porte_ou_regime', 'entrada_de_socio') and s.ordem = 1),
  array['johnatan029~cnpj-empresas-brasil-scraper', 'johnatan029~cnpj-empresas-brasil-scraper'], 'B2 e B3 fotografam pela consulta de CNPJ já usada');
select is(
  (select s.fallbacks from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'entrada_de_socio' and s.ordem = 1),
  '[{"kind": "fonte_publica", "source": "brasilapi_fotografia_cnpj"}]'::jsonb, 'a reserva de B3 é a fonte pública aberta, sem custo');
select is(
  (select s.input_template from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'entrada_de_socio' and s.ordem = 1),
  '{"socios": true}'::jsonb, 'só B3 lê o quadro societário (para guardar contagem e código, nunca nome)');
select is(
  (select array_agg(s.actor_id order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'setor_afetado_cbs_ibs' and s.kind = 'actor'),
  array['epicscrapers~brazil-cnpj-scraper'], 'o actor principal de B4');

-- Só pagamento por evento ou grátis; a regra e a fonte aberta não custam à plataforma.
select ok(
  (select bool_and(s.price_model in ('PAY_PER_EVENT', 'FREE', 'NONE')) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'B'),
  'nenhum passo é aluguel');
select ok(
  (select bool_and((s.kind = 'regra') = (s.price_model = 'NONE')) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'B'),
  'regra sem custo; actor com modelo de preço');

-- Tetos: o pior caso do passo pago cabe no teto de cada cascata.
select ok(
  (select bool_and(s.est_fixed_usd + s.est_per_item_usd * s.max_items <= c.cap_usd) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'B' and s.kind = 'actor'),
  'o pior caso do passo pago cabe no teto');
select is(
  (select array_agg(signal_type || ':' || cap_usd || ':' || max_accounts order by signal_type) from private.signal_cascades where icp = 'B'),
  array['cnpj_novo:0.5000:200', 'entrada_de_socio:0.2500:100', 'mudanca_de_porte_ou_regime:0.2500:100', 'setor_afetado_cbs_ibs:0.1500:200'],
  'teto e número de Contas de cada cascata (100 CNPJs por fotografia: 0,15 de pior caso)');

-- Marca e estado.
select ok(
  (select bool_and(name !~* '(apify|\yactors?\y)' and coalesce(notes, '') !~* '(apify|\yactors?\y)') from private.signal_cascades where icp = 'B'),
  'nome e notas dos Sinais não citam fornecedor');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'B' and (c.state in ('available', 'sem_fonte'))),
  'nenhum Sinal do ICP B nasce disponível, e o Mapa não deixa nenhum sem fonte');

-- Entram no catálogo.
select is((select state from public.signal_cascade_catalog() where signal_type = 'setor_afetado_cbs_ibs'), 'testing', 'o catálogo mostra o Sinal de mercado em teste');

-- Em teste não roda sem o aval; com ele, reserva e a execução liquida sem cobrar o que não gerou Sinal.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e1000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'bia@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e2000000-0000-0000-0000-0000000000b1', 'empresa', 'Norte B');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('e2000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-0000000000b1', 'admin', true);
select public.grant_credits('e2000000-0000-0000-0000-0000000000b1', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000b1', null, 'entrada_de_socio', 'conversa', null, 'k-b3', 0.15005, null, false)),
  'em_teste', 'o Sinal em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000b1', null, 'setor_afetado_cbs_ibs', 'conversa', null, 'k-b4', 0.09005, null, true);
select is((select outcome || ':' || cap_usd from ab), 'go:0.1500', 'com o aval, a cascata de mercado reserva sob o teto dela');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'succeeded', 0.0059, 0, 0, 0, null)), 0,
  'sem Sinal novo, nada é cobrado');

select * from finish();
rollback;
