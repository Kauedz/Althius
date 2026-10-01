-- Registro de actors depois da execução real (sinais-reais 03 a 06). Rode no SQL Editor do Supabase SÓ o bloco do actor
-- que passou no teste (`scripts/validar-sinais-reais.ts`: os campos vieram e o adaptador tirou Sinais que fazem sentido).
-- Cada bloco grava o preço vigente e a versão (lidos da API pública do Apify em 30/09/2026: `pricingInfos` e
-- `taggedBuilds.latest`), o teto de uma execução do tamanho da busca que o adaptador faz e passa o actor a "disponível".
-- O primeiro "disponível" libera o módulo Sinais no Workspace operacional. Se o custo observado na execução (em
-- `private.action_costs`) for outro, troque o preço antes de rodar.

-- 03 · Vaga aberta no LinkedIn (até 50 vagas: cerca de US$ 0,10 por Conta)
update private.signal_actors set max_cost_usd = 0.15,
  known_price = 'US$ 2,00 por 1.000 vagas na faixa Free (US$ 1,00 a partir da Bronze), mais US$ 0,00005 por execução. API pública do Apify, 30/09/2026.'
where actor_id = 'curious_coder~linkedin-jobs-scraper';
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', '1.7.17');

-- 03 · Vaga no Indeed Brasil (até 100 vagas: cerca de US$ 0,01 por Conta)
update private.signal_actors set max_cost_usd = 0.05,
  known_price = 'US$ 0,10 por 1.000 vagas na faixa Free, mais US$ 0,001 por execução. API pública do Apify, 30/09/2026.'
where actor_id = 'valig~indeed-jobs-scraper';
select public.set_signal_actor_state('valig~indeed-jobs-scraper', 'available', '0.0.16');

-- 04 · Contato mudou de emprego ou foi promovido (até 25 perfis: até US$ 0,10 por Conta)
update private.signal_actors set max_cost_usd = 0.12,
  known_price = 'US$ 4,00 por 1.000 perfis, sem busca de e-mail (a de US$ 10 nunca é pedida). API pública do Apify, 30/09/2026.'
where actor_id = 'harvestapi~linkedin-profile-scraper';
select public.set_signal_actor_state('harvestapi~linkedin-profile-scraper', 'available', '0.0.135');

-- 04 · Nova liderança (1 página de busca e até 25 perfis Full: cerca de US$ 0,20 por Conta)
update private.signal_actors set max_cost_usd = 0.25,
  known_price = 'US$ 0,10 por página de busca (até 25 perfis) mais US$ 0,004 por perfil no modo Full (tabela pública do Apify, 30/09/2026). Observado em 01/10/2026: 13 perfis custaram US$ 0,152 (página de busca 0,10 + 13 × 0,004). Pelo teto de 25 perfis, até US$ 0,20.'
where actor_id = 'harvestapi~linkedin-profile-search';
select public.set_signal_actor_state('harvestapi~linkedin-profile-search', 'available', '0.0.272');

-- 04 · Entradas na empresa (até 25 perfis curtos: cerca de US$ 0,10 por Conta)
update private.signal_actors set max_cost_usd = 0.12,
  known_price = 'US$ 0,02 por execução mais US$ 3,00 por 1.000 perfis curtos na faixa Free (US$ 8,00 no modo Full). API pública do Apify, 30/09/2026.'
where actor_id = 'harvestapi~linkedin-company-employees';
select public.set_signal_actor_state('harvestapi~linkedin-company-employees', 'available', '0.0.161');

-- 04 · Anúncio público de movimentação (até 40 posts: até US$ 0,08 por Conta)
update private.signal_actors set max_cost_usd = 0.10,
  known_price = 'US$ 0,002 por post mais US$ 0,00005 por execução (tabela pública do Apify, 30/09/2026). Observado em 01/10/2026: 23 posts custaram US$ 0,046. Pelo teto de 40 posts, até US$ 0,08.'
where actor_id = 'harvestapi~linkedin-post-search';
select public.set_signal_actor_state('harvestapi~linkedin-post-search', 'available', '0.0.114');

-- 05 · Anunciando na Meta (até 30 anúncios: cerca de US$ 0,02 por Conta)
update private.signal_actors set max_cost_usd = 0.05,
  known_price = 'US$ 0,75 por 1.000 anúncios mais US$ 0,00005 por execução (tabela pública do Apify, 30/09/2026). Observado em 01/10/2026, 2 execuções de 30 anúncios: o Apify cobrou só o início (US$ 0,00005) e contou 0 anúncios cobrados. O teto continua pelo preço de tabela.'
where actor_id = 'curious_coder~facebook-ads-library-scraper';
select public.set_signal_actor_state('curious_coder~facebook-ads-library-scraper', 'available', '2.7.26');

-- 05 · Anunciando no LinkedIn (até 20 anúncios com detalhe: cerca de US$ 0,08 por Conta)
-- Só depois de o signal-runner sair com a busca de 30 dias (a de 90 dias volta vazia).
update private.signal_actors set max_cost_usd = 0.10,
  known_price = 'US$ 0,004 por anúncio com detalhe (US$ 0,002 sem) mais US$ 0,00005 por execução (tabela pública do Apify, 30/09/2026). Observado em 01/10/2026: 20 anúncios com detalhe custaram US$ 0,08.'
where actor_id = 'silva95gustavo~linkedin-ad-library-scraper';
select public.set_signal_actor_state('silva95gustavo~linkedin-ad-library-scraper', 'available', '1.2.3');

-- 06 · Avaliações no Google Maps (a busca por nome pode trazer vários lugares: visto US$ 0,116 para 100 itens)
update private.signal_actors set max_cost_usd = 0.15,
  known_price = 'US$ 0,0006 por avaliação lida mais US$ 0,00005 por execução (tabela pública do Apify, 30/09/2026). Observado em 01/10/2026: a busca por "Magazine Luiza" trouxe vários lugares e o Apify cobrou 194 avaliações (US$ 0,116) para 100 itens devolvidos. Conta de um lugar só custa bem menos.'
where actor_id = 'compass~google-maps-reviews-scraper';
select public.set_signal_actor_state('compass~google-maps-reviews-scraper', 'available', '0.0.527');
