-- Coletor de anúncios do Google (PR-7, coletor-google-ads): o card "Anunciando no Google" ganha o tipo técnico
-- `anuncio_google`, lido na Central de Transparência de Anúncios do Google pelo actor público
-- solidcode~ads-transparency-scraper. O actor entra "em teste", sem preço nem versão (como os outros do registro): o
-- signal-runner não roda actor em teste, então nada é varrido nem cobrado até a validação com amostra real marcar o
-- actor "disponível" (`.scratch/sinais-reais/registro-apos-o-teste.sql`). Com o tipo em `collector_types`, o preço por
-- Conta varrida é o do card: 2 créditos (Faixa 2, família Anúncios). Aditiva e idempotente; o registro segue privado
-- (RLS ligada, sem acesso dos papéis do app) e o catálogo segue com as políticas por Workspace que já tem.

insert into private.signal_actors (actor_id, signal_type, max_cost_usd, notes)
values (
  'solidcode~ads-transparency-scraper', 'anuncio_google', 0.10,
  'Conta anunciando no Google (Central de Transparência de Anúncios). Até 40 anúncios por Conta.'
)
on conflict (actor_id) do nothing;

update public.signal_catalog
set collector_types = array_append(collector_types, 'anuncio_google')
where id = 'anuncios-google'
  and workspace_id is null
  and not ('anuncio_google' = any (collector_types));
