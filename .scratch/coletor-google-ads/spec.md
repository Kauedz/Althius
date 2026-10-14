# Coletor de anúncios do Google (PR-7)

O card "Anunciando no Google" (`anuncios-google`, família Anúncios) ganha coletor: o tipo técnico `anuncio_google`, que
lê a Central de Transparência de Anúncios do Google (adstransparency.google.com) por um actor público da Apify Store.

## Actor escolhido

- **`solidcode~ads-transparency-scraper`** (build 1.0.27, cerca de 2.400 usuários na Store; lido na API pública do Apify em
  14/10/2026, sem execução).
- **Preço:** pagamento por evento. US$ 0,0015 por resultado (anúncio) na faixa Free (US$ 0,001 na Bronze, 0,0009 na
  Silver, 0,0008 da Gold em diante), mais US$ 0,001 por início de execução (por GB de memória).
- **Limite:** `maxResults` = `maxItems` = **40** anúncios por Conta: até US$ 0,061 por Conta na faixa Free. Teto do
  registro (`max_cost_usd`): **US$ 0,10**.
- Entrada: `searchQuery` (domínio, nome ou id do anunciante; o actor detecta), `region` (país, ISO), `maxResults`. Sem
  `dateFrom`: para saber se o anúncio é o primeiro, o adaptador precisa ver também os mais antigos.
- Saída (README): `advertiserId`, `advertiserName`, `creativeId`, `adFormat` (`text`, `image`, `video`), `firstShown`,
  `lastShown` (AAAA-MM-DD), `approxDaysShown`, `adUrl`, `imageUrl`, `previewUrl`.
- Alternativa considerada: `scrapesage~google-ads-transparency-scraper` (US$ 0,002 por anúncio, sem faixa): mais caro.

## Regra do Sinal

Busca pelo domínio da Conta (ou pelo nome, quando não há site), no primeiro país da Localização (Brasil por padrão).
Na busca por nome, o anunciante só conta quando o nome sem a forma jurídica é o da Conta (na dúvida, não é). Por
anunciante:

1. **Primeiro anúncio visto:** o anúncio mais antigo que veio (`firstShown`) está dentro do período do Monitoramento
   (30 dias por padrão). Frase: "Começou a anunciar no Google: N anúncios desde DD/MM/AAAA".
2. **Formato novo:** o anunciante já anunciava antes do período, mas um formato (Pesquisa = `text`, Display = `image`,
   YouTube = `video`) aparece pela primeira vez no período. Frase: "Novo formato de anúncio no Google: YouTube desde
   DD/MM/AAAA".

Chave do acontecimento: `anuncio_google|<anunciante>|primeiro` e `anuncio_google|<anunciante>|formato:<formato>` (o
primeiro anúncio e o primeiro de cada formato acontecem uma vez). Limite conhecido: o actor devolve no máximo 40
anúncios e não garante a ordem; se os 40 forem todos recentes, um anunciante antigo pode parecer novo. A validação com
amostra real confere isso. As palavras do formulário não filtram: a Central não traz o texto do anúncio.

(A regra da Meta, "de 0 para 3 ou mais anúncios ativos no Brasil, ou 2x no mês", fica fora deste PR: o adaptador da Meta
não muda.)

## Preço e custo

- 2 créditos por Conta varrida (Faixa 2, família Anúncios): o card já tem `credits_per_account = 2`; com
  `anuncio_google` em `collector_types`, `private.credits_per_account('anuncio_google')` passa a devolver 2.
- Custo real: o `signal-runner` já grava cada execução em `private.action_costs` por `record_signal_scan_cost`.

## Liberação

Migração nova: registra o actor em `private.signal_actors` como `testing` (sem preço nem versão) e põe `anuncio_google`
em `collector_types` do card. O `signal-runner` não roda actor `testing`, e a tela segue mostrando o card em
"Lançamentos" (o catálogo da tela não muda). Só depois da amostra real (`scripts/validar-sinais-reais.ts anuncio_google`)
o bloco do actor em `.scratch/sinais-reais/registro-apos-o-teste.sql` o marca "disponível", e um PR pequeno tira o card
de "Lançamentos" na tela.

## Fora

Conectores, segredos, deploy, aplicar migração, merge, mudança de layout, adaptador da Meta.
