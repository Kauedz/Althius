-- A3: promove a "available" só os 5 actors cuja execução real está registrada com o id do run e o dado devolvido
-- (decisão do Renan de 07/10, comentários de .scratch/sinais-reais/issues/04, 05 e 06). Os outros 7 do registro
-- continuam "testing" até terem o mesmo tipo de validação. Não preenche version nem known_price (ninguém conferiu
-- no console do Apify): a confirmação foi só de execução, não de preço ou versão publicados.
update private.signal_actors
set state = 'available', updated_at = now()
where actor_id in (
  'harvestapi~linkedin-profile-scraper',
  'harvestapi~linkedin-profile-search',
  'harvestapi~linkedin-post-search',
  'silva95gustavo~linkedin-ad-library-scraper',
  'compass~google-maps-reviews-scraper'
)
and state <> 'available';
