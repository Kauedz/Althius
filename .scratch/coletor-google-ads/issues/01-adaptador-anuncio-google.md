# 01: Adaptador `anuncio_google` (Central de Transparência de Anúncios do Google)

**What to build:** o adaptador `anuncio-google.ts` do `signal-runner`, o registro do actor `solidcode~ads-transparency-scraper` (em teste) e `anuncio_google` no card `anuncios-google`, com a regra de primeiro anúncio e de formato novo.

**GATE:** só migração nova (versão maior que `20261020120000`), aditiva e idempotente, RLS mantida (o registro é `private`, sem acesso dos papéis do app); sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo; nenhum conector ou integração; sem execução paga de actor; UI sem mudança; sem emojis; pt-BR; sem a palavra "CRM"; sem as letras A–H dos nichos.

**Blocked by:** nenhum.

**Status:** closed

## Pode mexer

- `supabase/functions/signal-runner/adaptadores/anuncio-google.ts` (novo), `adaptadores.ts`, testes Deno novos e a lista de `adaptadores.test.ts`
- `supabase/functions/account-discovery/pontuacao.ts` (peso do tipo novo)
- `supabase/migrations/` (arquivo novo), `supabase/tests/` (arquivo novo; o mínimo em `registro_de_actors.sql`, que conta os actors)
- `scripts/validar-sinais-reais.ts` e `.scratch/sinais-reais/registro-apos-o-teste.sql` (o tipo novo)

## Não mexa

- `_shared/unipile`, `sender-accounts`, `unipile-account-status`, `_shared/integracoes`, `integration-*`, HubSpot, Pipedrive, Notion
- segredos, dado remoto, adaptador da Meta e do LinkedIn

## Critérios

- [x] Busca pelo domínio da Conta, ou pelo nome quando não há site; Conta sem nome e sem site é pulada
- [x] Primeiro anúncio no período e formato novo (Pesquisa, Display, YouTube) viram Sinal, um por acontecimento
- [x] Na busca por nome, anunciante com outro nome não conta
- [x] Actor registrado em teste; `credits_per_account('anuncio_google')` = 2
- [x] Deno e pgTAP cobrem o adaptador e a migração
