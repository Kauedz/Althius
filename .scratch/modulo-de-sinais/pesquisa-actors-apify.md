# Actors do Apify para os Sinais da Althius

Pesquisa final, 29/09/2026. É a tabela provisória do catálogo de Sinais pré-definidos. Todo preço marcado "a confirmar" precisa ser conferido no console da Apify antes de entrar na conta de créditos (Q17).

## 1. Resumo

### O que o Apify dá de graça

Nenhum actor desta pesquisa tem cota grátis própria. O que existe de graça é o crédito de uso da plataforma.

- **Plano Free:** US$ 0 por mês, com US$ 5 de uso. Não pede cartão e renova todo mês. Fontes: use-apify.com, scrapegraphai.com e crawlworks.io, confirmadas por crafter-station/limon (14/07/2026) e canivibecodeit (14/08/2026).
- **O crédito é um teto fixo.** Quando acaba, as execuções param até o próximo ciclo, sem cobrança extra. O que sobra expira no fim do mês (use-apify.com, scrapegraphai.com).
- **Alguns actors têm teste grátis próprio:**
  - silva95gustavo/linkedin-ad-library-scraper: até 300 anúncios.
  - thirdwatch/linkedin-company-employees-scraper e lexis-solutions/tiktok-ads-scraper: "Try for free", sem condição detalhada.
  - jakubbalada/content-checker: título "Free content checker".
- **Limites do Free em actors específicos:**
  - harshmaur/reddit-scraper busca só os primeiros 40 termos por execução.
  - apidojo/tweet-scraper roda só em demonstração: 5 execuções por mês, 10 itens por execução.
  - harvestapi/linkedin-profile-scraper roda no Free (naveedharri/benai-skills).
  - kaitoeasyapi (X) foi o único actor de X, entre os que cobram por evento, que devolveu tweets reais no Free (ayushozha/shadow-launch, 18/04/2026).

### Total de créditos pagando um plano

Nos planos pagos, a mensalidade vira o mesmo valor em crédito de uso, e esse crédito também expira no fim do ciclo.

| Plano | Mensalidade | Crédito de uso por mês |
| --- | --- | --- |
| Free | US$ 0 | US$ 5 |
| Starter | US$ 29 | US$ 29 |
| Scale | US$ 199 | US$ 199 |
| Business | US$ 999 | US$ 999 |

Os valores vêm de crafter-station/limon (14/07/2026) e pfurini/furiai-skills (13/08/2026), que leram apify.com/pricing, e de canivibecodeit (14/08/2026). Só o Starter tem conflito: outras fontes dizem US$ 19 e manuia88/desarrollos_mvp_emergent diz US$ 49. Fica o US$ 29, porque vem da leitura direta da página de preços.

### O preço cai nos planos maiores

- **HarvestAPI:** o preço escrito na entrada do actor é o da faixa Free. O "a partir de" da loja é o preço da faixa Gold. Exemplo: o linkedin-post-search custa US$ 0,002 por post no Free e US$ 0,0015 no Gold (rszhd/signalscout). Ou seja, o Free paga cerca de 1,3 vez o "a partir de", e não de 2 a 3 vezes, como dizia o use-apify.com.
- **apify/facebook-ads-scraper:** US$ 5,80 por 1.000 anúncios no Free e US$ 3,40 no Business.

### Como os dados foram checados

- O site apify.com estava bloqueado pela rede, e a cota de buscas na web da sessão acabou (200/200).
- A checagem usou três fontes: o catálogo automationbyexperts (cópia da Apify Store de 28/09/2026), a lista cporter202/API-mega-list (23/07/2026) e esquemas e código publicados no GitHub.
- Os números de usuários e as notas vêm do catálogo de 28/09/2026, salvo quando indicado.

## 2. Tabelas por família

Legenda da coluna "Grátis?": **Crédito Free** quer dizer que o actor não tem cota própria e roda com os US$ 5 por mês do plano Free.

### Vagas e equipes

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Vaga aberta no LinkedIn (palavra-chave, local ou empresa) | [curious_coder/linkedin-jobs-scraper](https://apify.com/curious_coder/linkedin-jobs-scraper) | US$ 1,00 por 1.000 resultados. Segundo a listagem, o evento fixo e o uso da plataforma são cobrados à parte. O modelo de cobrança (por evento ou por resultado) está a conferir | Crédito Free | Sim, pelo filtro de local ou geoId. Há uma issue aberta chamada "Ignoring geoid": validar num teste | **Principal.** 164.248 usuários, 17.811 por mês, nota 4,6 (141 avaliações). Na nova busca por IA do LinkedIn (desde ago/2026), o filtro de Empresa (f_C) continua valendo e serve para monitorar Contas-alvo. Reserva: bebity/linkedin-jobs-scraper (40.166 usuários, 3.001 por mês, nota 4,3 com 72) |
| Vaga aberta no Indeed (br.indeed.com) | [valig/indeed-jobs-scraper](https://apify.com/valig/indeed-jobs-scraper) | US$ 0,10 por 1.000 vagas | Crédito Free | Sim. Cobre 62 países, entre eles o Brasil ("br") | **Complementar.** O Indeed cobre pouco o Brasil perto do Gupy e do LinkedIn. Nota e usuários não confirmados. Alternativa com uso conhecido: curious_coder/indeed-scraper (4.323 usuários, 266 por mês, nota 4,8 com 49; preço não levantado) |
| Vaga aberta no Gupy, inclusive na página de carreira de uma Conta-alvo | [zen-studio/gupy-jobs-scraper](https://apify.com/zen-studio/gupy-jobs-scraper) | A partir de US$ 2,99 por 1.000 vagas no Free. O valor aparece só no resumo do buscador: a confirmar | Crédito Free | Sim, exclusivo do Gupy | **Testar.** É o actor de Gupy mais usado, e ainda assim pouco: 111 usuários, 22 por mês, sem avaliação. Filtra por empresa e traz 90+ campos por vaga (68 segundo o catálogo). Alternativa: unfenced-group/gupy-scraper ("Gupy.io Scraper - Brazil Job Board", 64 campos, sem proxy nem chave, 2 usuários, preço a confirmar). Candidato a actor próprio |
| Vaga aberta no InfoJobs Brasil | [igolaizola/infojobs-brazil-scraper](https://apify.com/igolaizola/infojobs-brazil-scraper) | Provavelmente está no título do actor. O valor de US$ 0,9 por 1.000 está a confirmar | Crédito Free | Sim, exclusivo do InfoJobs Brasil | **Fraco.** 6 usuários, 1 por mês, sem avaliação. Os concorrentes têm 1 e 2 usuários. Opção de várias fontes: viralanalyzer/brazil-jobs-scraper (InfoJobs, Vagas.com, Gupy, APInfo e LinkedIn; 177 usuários, 32 por mês, nota 5,0 com 4; preço de US$ 2 por 1.000 a confirmar) |
| Vaga na página de carreira (ATS globais) | [fantastic-jobs/career-site-job-listing-api](https://apify.com/fantastic-jobs/career-site-job-listing-api) | Não encontrado | Não encontrado | Parcial. Cobre 175 mil páginas em 54 ATS (Workday, Greenhouse, Lever, SuccessFactors, iCIMS e outros), mas não cita o Gupy nem ATS brasileiros | **Para multinacionais.** É o mais usado da categoria: 7.627 usuários, 1.461 por mês, nota 4,1 (13). Existe uma versão feed, fantastic-jobs/career-site-job-listing-feed (228 por mês, nota 5,0 com 9). Veio da família Tecnologia |
| Crescimento de equipe (contagem de funcionários e vagas ativas) | riceman/linkedin-company-data-insights-scraper (link não registrado) | A confirmar | Não informado | LinkedIn global, sem teste no Brasil | **Testar.** 884 usuários, 87 por mês, nota 5,0 (2). Não precisa de cookie. A descrição cita "headcount growth, job openings". Como tira um retrato por vez, a Althius guarda os retratos semanais para calcular o crescimento. Alternativas: automation-lab/linkedin-company-scraper (971 usuários, 271 por mês) e atomus/linkedin-company-scraper (80 usuários, 40 por mês, cobra só a empresa encontrada) |
| Primeira contratação de uma função (contagem de funcionários por função, cargo ou local) | [freshdata/linkedin-company-custom-headcount](https://apify.com/freshdata/linkedin-company-custom-headcount) | US$ 1,80 por 1.000 funcionários: a confirmar | Crédito Free | Filtra por local. LinkedIn global, sem teste no Brasil | **Peça de composição.** O Sinal não sai pronto: é preciso cruzar a contagem por função com uma vaga nova. A descrição confirmada é "Discover the count of employees within a specific company who meet designated criteria". Existe um clone: bestscrapers/linkedin-company-custom-headcount |

### Movimentação profissional (LinkedIn)

Nenhuma fonte confirma teste destes actors com perfis ou empresas do Brasil. A cobertura vem de o LinkedIn ser global.

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Contato mudou de emprego ou foi promovido | [harvestapi/linkedin-profile-scraper](https://apify.com/harvestapi/linkedin-profile-scraper) | US$ 4 por 1.000 perfis, ou US$ 10 por 1.000 com busca de e-mail (preço da faixa Free) | Sim, roda no Free | Aceita URL de qualquer perfil | **Principal.** 74.324 usuários, 10.498 por mês, nota 4,6 (92). Não precisa de cookies. Não guarda a leitura anterior: a Althius salva e compara |
| Nova liderança nas Contas-alvo | [harvestapi/linkedin-profile-search](https://apify.com/harvestapi/linkedin-profile-search) | US$ 0,10 por página de busca (até 25 perfis curtos). Por perfil: US$ 0 no modo Short, US$ 0,004 no Full, US$ 0,01 no Full + e-mail | Crédito Free | Filtra por localização, inclusive por Geo ID | **Principal.** 45.517 usuários, 6.320 por mês, nota 4,4 (103). O filtro recentlyChangedJobs cobre os últimos 90 dias. O esquema também tem currentCompanies, currentJobTitles e seniorityLevelIds. Pede uma aprovação de permissão na primeira execução |
| Entradas e saídas de pessoas nas Contas-alvo | [harvestapi/linkedin-company-employees](https://apify.com/harvestapi/linkedin-company-employees) | Por 1.000 perfis: US$ 4 no Short, US$ 8 no Full, US$ 12 no Full + e-mail. No modo "One by one" soma uma taxa de início por consulta (US$ 0,02 segundo mmaglobal/MAVEN) | Crédito Free | Aceita URL ou nome da empresa e filtra por local | **Usar.** 5.714 por mês, nota 3,9 (47). O filtro yearsAtCurrentCompanyIds = 1 isola quem entrou há menos de 1 ano. O modo "All at once" junta até 10 empresas por página de busca |
| Anúncio público de movimentação ("novo cargo", "fui promovido", "novo CEO") | [harvestapi/linkedin-post-search](https://apify.com/harvestapi/linkedin-post-search) | Por 1.000 posts: US$ 2 no Free, US$ 1,75 no Silver, US$ 1,50 no Gold | Crédito Free | Filtra pela empresa do autor (authorsCompany). Busca com termos em português não testada | **Usar, com classificação.** 6.825 por mês, nota 5,0 (53). Para monitor diário: sortBy "date" com postedLimit "24h". Devolve texto livre, que a Althius classifica antes de virar Sinal |
| Nova liderança anunciada pela própria Conta-alvo | [harvestapi/linkedin-company-posts](https://apify.com/harvestapi/linkedin-company-posts) | US$ 2 por 1.000 posts no Free (o "a partir de US$ 1,50" é o preço Gold). Reações e comentários são cobrados à parte | Crédito Free | Qualquer página pública de empresa | **Usar, com classificação.** 3.608 por mês, nota 5,0 (21). Deixar scrapeReactions e scrapeComments desligados |
| Monitor pronto de novos funcionários | [thirdwatch/linkedin-company-employees-scraper](https://apify.com/thirdwatch/linkedin-company-employees-scraper) | US$ 3 por 1.000 perfis básicos. Modo Full e evento de monitoramento sem preço encontrado | "Try for free" na página, mais o Crédito Free | Acha os perfis pelo Google, então só entra perfil indexado. A cobertura no Brasil pode ser menor | **Só para teste rápido.** 1.019 usuários, 148 por mês, nota 5 (1 avaliação). Não foi confirmado como ele guarda a leitura anterior. Evitar george.the.developer/linkedin-company-employees-scraper (79 por mês, nota 1) |

### Anúncios ativos

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Conta-alvo anunciando no Facebook e no Instagram (Meta Ad Library) | [curious_coder/facebook-ads-library-scraper](https://apify.com/curious_coder/facebook-ads-library-scraper) | US$ 0,75 por 1.000 anúncios | Crédito Free | Sim, com URL country=BR e active_status=active. No Brasil só aparecem os anúncios ativos | **Principal.** 42.504 usuários, 5.869 por mês, nota 4,8 (110). Para saber se a Conta-alvo começou ou parou de anunciar, a Althius guarda uma foto por execução e compara |
| O mesmo sinal da Meta, como reserva | [apify/facebook-ads-scraper](https://apify.com/apify/facebook-ads-scraper) (oficial) | De US$ 5,80 por 1.000 no Free (confirmado numa execução real) a US$ 3,40 no Business | Crédito Free | Sim, com a mesma regra: só anúncios ativos | **Reserva.** 39.074 usuários, 6.277 por mês (o actor de Meta com mais usuários ativos), nota 4,2 (58). No Free custa cerca de 7,7 vezes o curious_coder |
| Conta-alvo anunciando no Google (Ads Transparency Center) | [silva95gustavo/google-ads-scraper](https://apify.com/silva95gustavo/google-ads-scraper) | A partir de US$ 0,90 por 1.000: a confirmar | Crédito Free | Provável, mas não confirmado para este actor | **Testar.** 4.427 usuários, 339 por mês, nota 4,9 (19). Aceita o domínio da Conta-alvo como entrada e processa até 400 anúncios por minuto. Alternativa: crawlerbros/google-ads-scraper (US$ 0,70 por 1.000, nota 5,0) |
| Conta-alvo anunciando no LinkedIn | [silva95gustavo/linkedin-ad-library-scraper](https://apify.com/silva95gustavo/linkedin-ad-library-scraper) | Cobra por evento desde 19/01/2026. No Free: US$ 0,002 por anúncio sem detalhes, US$ 0,004 com detalhes e US$ 0,00005 por execução. Com detalhe, dá cerca de US$ 4 por 1.000 | Teste grátis até 300 anúncios, mais o Crédito Free | Sim, o Brasil está na Ad Library do LinkedIn. Impressões e segmentação só aparecem para anúncios que rodaram na UE | **Principal, depois de um teste.** É o actor de LinkedIn Ads do repositório oficial apify/awesome-skills. Nota e usuários não confirmados. Reservas: sourabhbgp/linkedin-ad-library-scraper e solidcode/linkedin-ads-scraper (US$ 0,50 por 1.000, preço dito pelo próprio autor) e dz_omar/linkedin-ads-scraper |
| Conta-alvo anunciando no TikTok | [lexis-solutions/tiktok-ads-scraper](https://apify.com/lexis-solutions/tiktok-ads-scraper) | A partir de US$ 0,49 por 1.000: a confirmar | "Try it for free" na página, mais o Crédito Free | **Não.** A TikTok Ads Library cobre só UE/EEE, Suíça e Reino Unido | **Fora do lançamento**, ou marcado como "só Contas-alvo com operação na Europa". O ranking de top ads do Creative Center cobre o Brasil: brilliant_gum/tiktok-ads-library-scraper e data_xplorer/tiktok-ads-scraper, ambos sem preço confirmado |

### Notícias, capital e expansão

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Notícia recente sobre a Conta-alvo. Com termos como "adquire", "inaugura" e "rodada", cobre também aquisições, escritórios e investimentos | [thirdwatch/google-news-scraper](https://apify.com/thirdwatch/google-news-scraper) | US$ 0,90 por 1.000: a confirmar | Crédito Free | Provável. A descrição fala em vários idiomas e países, mas não cita pt-BR | **Testar.** O título atual é "Google News Scraper - Search Headlines, Sources & Articles". Uso e nota não confirmados. Devolve manchete, fonte, data e URL; a classificação do evento fica com a Althius. Mais caro: easyapi/google-news-scraper. Evitar brasildados/google-news-scraper-brasil-api (4 usuários) |
| Rodada de investimento nova (Crunchbase, modo Funding Monitor) | [memo23/crunchbase-scraper](https://apify.com/memo23/crunchbase-scraper) | Um título antigo cita "US$ 8", sem unidade: a confirmar | Crédito Free | Não confirmado | **Testar.** O título atual é "Crunchbase - 139K Company DB, Funding, Investors & News". 229 usuários, 109 por mês, nota 5,0 (2). O Funding Monitor devolve só as rodadas novas a cada execução |
| CNPJ recém-aberto (Receita Federal; filtros de UF, cidade, CNAE, porte e data) | [syncthornx06/brazil-new-companies](https://apify.com/syncthornx06/brazil-new-companies) | US$ 0,99 por 1.000: a confirmar | Crédito Free | Sim, usa os dados abertos da Receita | **Fraco.** 14 usuários, 1 por mês, sem avaliação. Para nova filial de uma Conta-alvo já conhecida: johnatan029/branch-network ("Mapa de Filiais por CNPJ", 3 usuários, preço a confirmar) |
| Menção à Conta-alvo no Diário Oficial da União | [brasildados/dou-monitor](https://apify.com/brasildados/dou-monitor) | US$ 0,10 por linha, sem cobrança quando não acha: a confirmar | Crédito Free | Sim, exclusivo do DOU | **Só para poucos termos**, como os nomes das Contas-alvo. 9 usuários, 2 por mês. Busca os últimos 3 dias e pode rodar todo dia. Se o preço se confirmar, equivale a US$ 100 por 1.000. Alternativa: jenko_systems/diario-oficial-uniao-dou (preço a confirmar) |
| Licitação pública nova (PNCP) | [latinamericadata/pncp-brasil](https://apify.com/latinamericadata/pncp-brasil) | A partir de US$ 1,00 por 1.000: a confirmar | Crédito Free | Sim, usa os dados oficiais do PNCP | **Testar.** O título é "PNCP Brazil Public Procurement Data Scraper". 3 usuários, 2 por mês. Busca por palavra-chave, UF, modalidade e data |

### Tecnologia e site

As duas linhas de página de carreira desta família (fantastic-jobs e zen-studio/Gupy) foram para Vagas e equipes.

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Tecnologia identificada no site, a base do sinal de troca de ferramenta entre varreduras | [bovi/builtwith-tech-stack-scraper](https://apify.com/bovi/builtwith-tech-stack-scraper) | US$ 0,0015 por domínio (cerca de US$ 1,50 por 1.000). Aparece só no resumo do buscador | Não encontrado | A entrada é o domínio, então em princípio aceita .com.br | **Testar pelo preço.** Os outros actors do mesmo autor (Vitalii Bondarev) custam US$ 1,50 por 1.000. Sem dado de uso. Alternativa: [proffera/tech-stack-detector](https://apify.com/proffera/tech-stack-detector), US$ 0,005 por site segundo o mesmo resumo |
| Tecnologia identificada no site (7.000+ tecnologias) | [misterkhan/website-tech-stack-scanner](https://apify.com/misterkhan/website-tech-stack-scanner) | Não encontrado | Não encontrado | A entrada é o site, então em princípio aceita .com.br | **Testar.** É o único da família com uso confirmado: 476 usuários, 34 por mês, nota 5 (3). Alternativa: [fullspeedtram/website-tech-stack-detector](https://apify.com/fullspeedtram/website-tech-stack-detector), que roda em navegador real e talvez registre o que muda entre varreduras (atribuição incerta) |
| Tecnologia identificada no site (base Wappalyzer) | [automation-lab/wappalyzer-technology-lookup](https://apify.com/automation-lab/wappalyzer-technology-lookup) | Não encontrado | Não encontrado | Recebe URLs ou domínios | **Não priorizar.** O actor existe, mas sem preço nem uso. Do mesmo autor, automation-lab/tech-stack-detector detecta 45+ tecnologias com uma requisição HTTP |
| Mudança no site: um trecho da página, escolhido por seletor CSS, com captura de tela antes e depois | [jakubbalada/content-checker](https://apify.com/jakubbalada/content-checker) | Não encontrado | O título diz "Free content checker"; o custo por execução não foi encontrado | Qualquer URL pública | **Com cautela.** O código não é atualizado desde 09/06/2021. Na Althius, chamar por webhook no fim da execução e deixar o LLM ler a diferença. Alternativas sem preço nem uso: tri_angle/website-changes-detector e signal-foundry/website-change-monitor (compara hash) |

### Reputação e intenção

| Sinal | Actor (link) | Preço | Grátis? | Brasil? | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Reputação da Conta-alvo no Reclame Aqui: nota, índices e reclamações novas, no modo incremental | [blackfalcondata/reclameaqui-scraper](https://apify.com/blackfalcondata/reclameaqui-scraper) | Não encontrado: testar no console | Não encontrado | Sim, feito para o reclameaqui.com.br | **Testar, com cuidado de LGPD**, porque coleta a reclamação completa. É o actor de Reclame Aqui mais usado, e ainda assim pouco: 153 usuários, 35 por mês, sem avaliação. Alternativas: viralanalyzer/reclameaqui-scraper (217 usuários, nota 3,8 com 9) e ing-karlen/reclame-aqui-company-reputation (só dados da empresa, 2 usuários). Evitar solidcode (US$ 40 por 1.000). Candidato a actor próprio |
| Avaliações novas ou negativas no Google Maps, da Conta-alvo ou de um concorrente local | [compass/google-maps-reviews-scraper](https://apify.com/compass/google-maps-reviews-scraper) | A partir de US$ 0,0006 por avaliação no Free (cerca de US$ 0,60 por 1.000) | Sim. Os US$ 5 pagam cerca de 8.300 avaliações | Aceita qualquer lugar do Google Maps, com controle de idioma. Nenhuma fonte fala do Brasil | **Principal.** Cerca de 47,1 mil usuários, 5,3 mil por mês, nota 4,83 e 99,8% de execuções bem-sucedidas. Indicado pelo apify/awesome-skills. Usar scrapeReviewsPersonalData=false. Os termos do Google Maps proíbem cópia em massa, e o risco é de quem usa. Mais barato: x_guru/google-maps-reviews-scraper (US$ 0,50 por 1.000 no Free) |
| Reviews de softwares concorrentes (G2, Capterra, TrustRadius, Gartner, Trustpilot) | [zen-studio/software-review-scraper](https://apify.com/zen-studio/software-review-scraper) | De US$ 4,99 por 1.000 no Free a US$ 3,99 no Gold | Sim. Os US$ 5 pagam cerca de 1.000 reviews | Fraco. G2 e Capterra concentram usuários dos EUA, e não há actor para o capterra.com.br | **Fora do lançamento.** 446 usuários, 76 por mês, nota 4,0 (1). Alternativas: zen-studio/capterra-reviews-scraper (US$ 1,99 por 1.000 no Free) e automation-lab/g2-scraper (exige o slug certo do G2) |
| Menções a marca, concorrente ou categoria no Reddit | [harshmaur/reddit-scraper](https://apify.com/harshmaur/reddit-scraper) | US$ 0,02 por execução mais US$ 0,002 por resultado (US$ 2 por 1.000). Com desconto, US$ 1,50. A análise de IA soma US$ 0,50 por 1.000 | Sim, com limite de 40 termos por execução. Os US$ 5 pagam cerca de 2.490 resultados | A busca é literal e aceita português. O volume de conversa B2B brasileira não foi verificado | **Opcional.** 14.463 usuários, 3.672 por mês, nota 4,5 (40). Definir sempre postedAfter e um teto de cobrança por execução |
| Menções e reclamações no X (Twitter) | [kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest) | O autor anunciava US$ 0,18 por 1.000 tweets. Um terceiro mediu US$ 0,00025 por tweet útil no plano Bronze | Sim, devolveu tweets reais no Free | Nenhuma fonte fala do Brasil. A medição usou só tweets em inglês | **Opcional.** 27.511 usuários, 4.415 por mês, nota 4,3 (84) |
| Interesse de busca por termo e região (Google Trends) | [data_xplorer/google-trends-fast-scraper](https://apify.com/data_xplorer/google-trends-fast-scraper) | US$ 0,02 por execução mais US$ 0,002 por resultado: cerca de US$ 0,022 por palavra-chave no Free | Sim. Os US$ 5 pagam cerca de 227 palavras-chave | Aceita regiões dentro de um país | **Contexto de mercado.** Mede a demanda por termo, não a de uma Conta-alvo, então não entra como Sinal. 510 usuários em 30 dias e 0,2% de falhas (dado de um concorrente) |

## 3. Catálogo recomendado para o lançamento

Entram aqui os Sinais cujo actor tem preço confirmado, uso comprovado e cobertura do Brasil, direta ou por ser uma fonte global. A ordem é a prioridade para uma empresa B2B brasileira. A coluna "Rende com US$ 5" é uma conta simples, US$ 5 divididos pelo preço, sem o custo de plataforma.

| # | Sinal | Actor | Preço no Free | Rende com US$ 5 | Brasil | O que fica com a Althius |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Vaga aberta no LinkedIn | curious_coder/linkedin-jobs-scraper | US$ 1 por 1.000 vagas | Até 5.000 vagas (menos, porque o uso da plataforma é cobrado à parte) | Filtro de local ou empresa. Validar o geoId | Monitorar por empresa (f_C) e tirar as vagas repetidas |
| 2 | Contato mudou de emprego ou foi promovido | harvestapi/linkedin-profile-scraper | US$ 4 por 1.000 perfis | 1.250 perfis | LinkedIn global | Guardar a leitura anterior, comparar e separar promoção de mudança de empresa |
| 3 | Nova liderança nas Contas-alvo | harvestapi/linkedin-profile-search | US$ 0,10 por página de 25 perfis | 50 páginas | Filtro de localização | Combinar recentlyChangedJobs (90 dias), senioridade e empresa, e classificar cargos em português |
| 4 | Conta-alvo anunciando no LinkedIn | silva95gustavo/linkedin-ad-library-scraper | Cerca de US$ 4 por 1.000 com detalhe | Cerca de 1.250 anúncios, mais os 300 do teste grátis | Sim, sem impressões | Validar numa execução real, porque o uso não foi confirmado. Guardar a foto para detectar campanha nova |
| 5 | Conta-alvo anunciando na Meta | curious_coder/facebook-ads-library-scraper | US$ 0,75 por 1.000 anúncios | Cerca de 6.600 anúncios | Sim, só anúncios ativos | Guardar a foto por execução e ligar a Conta-alvo à página dela na Meta |
| 6 | Entradas e saídas nas Contas-alvo | harvestapi/linkedin-company-employees | US$ 4 por 1.000 perfis (Short), mais a taxa de início | Até 1.250 perfis, menos as taxas | Filtro de local | Comparar com a execução anterior, usando yearsAtCurrentCompanyIds = 1 |
| 7 | Anúncio público de movimentação | harvestapi/linkedin-post-search, mais harvestapi/linkedin-company-posts por Conta-alvo | US$ 2 por 1.000 posts | 2.500 posts | Filtro por empresa do autor | Classificar o texto e testar termos em português |
| 8 | Avaliações novas ou negativas no Google Maps | compass/google-maps-reviews-scraper | Cerca de US$ 0,60 por 1.000 | Cerca de 8.300 avaliações | Qualquer lugar do Maps | Detectar queda de nota e reclamações repetidas, sem guardar dados pessoais |
| 9 | Vaga aberta no Indeed Brasil (complementar) | valig/indeed-jobs-scraper | US$ 0,10 por 1.000 vagas | 50.000 vagas | Sim (br) | Tirar as vagas repetidas com o LinkedIn |

**Entram depois de um teste:**
- **Anúncios no Google** (silva95gustavo): preço e Brasil a confirmar.
- **Vagas no Gupy** (zen-studio): pouco uso.
- **Notícia recente** (thirdwatch/google-news-scraper): preço e pt-BR a confirmar.
- **Crescimento de equipe** (riceman): preço a confirmar.
- **Tecnologia no site** (misterkhan ou bovi): sem preço ou sem uso confirmado.
- **Rodada de investimento** (memo23): cobertura do Brasil não confirmada.
- **Reclame Aqui** (blackfalcondata): sem preço e com questão de LGPD.
- **Reddit e X**: volume em português não verificado.

**Ficam fora do lançamento:**
- TikTok Ads: não cobre o Brasil.
- G2 e Capterra: cobrem pouco o Brasil.
- Google Trends: mede o mercado, não a Conta-alvo.
- CNPJ novo, DOU e PNCP: actors com uso mínimo e preço a confirmar (ver Lacunas).

## 4. Lacunas: candidatos a actor próprio

### Actor próprio: fonte brasileira sem actor maduro

1. **Reclame Aqui.** Nenhum actor é bem avaliado. É uma fonte central para o Brasil. Um actor próprio traria métricas no nível da empresa, cobraria só quando acha a empresa e não guardaria dado pessoal (LGPD).
2. **Gupy por Conta-alvo.** Os actors vão de 1 a 111 usuários. Os descritos usam a API interna do Gupy, sem navegador, então um actor fino, que lê as páginas de carreira de uma lista de empresas, tende a ser barato e mais confiável.
3. **Catho.** Os actors existentes têm adoção mínima (corvuslab/catho-scraper com 3 usuários, jobscrawler/catho-jobs-scraper com 1), e nenhum é comprovadamente mantido. Fazer um actor próprio, ou testar o corvuslab antes.
4. **ATS brasileiros fora do Gupy** (Solides, Recrutei, Pandapé, Kenoby) **e páginas de carreira próprias.** Nenhum actor encontrado. Fazer um actor próprio ou usar o verificador de mudança de conteúdo.
5. **Alvarás de funcionamento e de construção.** Nenhum actor encontrado, e cada prefeitura publica de um jeito. Começar pelas capitais-alvo.
6. **Diários oficiais municipais.** Nenhum actor confirmado. A pesquisa apontou a API pública do Querido Diário como fonte, mas ela não cobre todos os municípios.
7. **DOU em volume.** Se o preço de US$ 0,10 por linha se confirmar, fica caro para um catálogo. A Imprensa Nacional publica o DOU em formato aberto (INLABS), o que não foi verificado.
8. **Nova filial e CNPJ recém-aberto.** A base de CNPJ da Receita é aberta. Um job próprio que compare as bases mensais sai mais barato que o branch-network (US$ 10 por 1.000, a confirmar) e substitui o actor de CNPJ novo, que tem 1 usuário por mês.
9. **Rodadas de startups brasileiras.** O Crunchbase não tem cobertura do Brasil confirmada. Fazer um actor próprio que leia as fontes brasileiras de rodadas.
10. **Lançamentos imobiliários como sinal B2B.** Os scrapers de portais listam imóveis, não a incorporadora nem a data do lançamento. Fazer um actor próprio ou adaptar um existente para agrupar por incorporadora.
11. **Reviews de software no Brasil** (Capterra Brasil, B2B Stack). Nenhum actor encontrado.
12. **Nova liderança fora do LinkedIn** (imprensa de negócios, comunicados de RI na B3, mudança de sócio-administrador no QSA do CNPJ). Os actors encontrados cobrem só os EUA, via PR Newswire e SEC 8-K.
13. **Site fora do ar ou com erro** (HTTP 4xx/5xx, SSL vencido, lentidão). Nenhum actor bom: o único candidato, saswave/advanced-website-domain-name-validator, tem 7 usuários por mês e não mede a disponibilidade de forma contínua. É simples e barato de fazer (GET/HEAD, status, tempo de resposta, validade do SSL) e se encaixa como Sinal originado.
14. **Monitor de anúncios: começou ou parou de anunciar.** No Brasil, a Meta não guarda anúncios comerciais inativos. Um actor próprio agendado chamaria os scrapers de Meta, Google e LinkedIn, guardaria a foto e emitiria "nova campanha" ou "campanha encerrada". O mesmo actor pode entregar o resultado normalizado por domínio, porque não há actor multiplataforma confiável.

### Lógica na Althius, sobre actors que já existem

- **Primeira contratação de uma função:** cruzar a vaga nova com a contagem de funcionários por função (freshdata).
- **Mudança de emprego com estado:** nenhum actor maduro guarda a leitura anterior. A lógica fica sobre o harvestapi/linkedin-profile-scraper.
- **Tipo de movimento com cargos brasileiros** (Diretor, Gerente, Head, Sócio, Superintendente, C-level em português): regra ou LLM próprio.
- **Crescimento de equipe:** guardar os retratos semanais.
- **Vagas repetidas:** a mesma vaga aparece no LinkedIn, no Gupy e no Indeed. Tirar as repetidas por empresa e cargo.
- **Ligar a Conta-alvo (CNPJ, domínio) ao ID da página na Meta e do anunciante no LinkedIn,** antes de chamar os scrapers. Esses actors buscam por nome e geram falsos positivos.
- **Tecnologia com histórico:** comparar as varreduras.
- **Mudança de site com significado comercial** (preços, produto, clientes, parceiros): o LLM lê a diferença.
- **Expansão, novos escritórios e aquisições no Brasil:** Google News em pt-BR com classificação por LLM. Os actors de expansão e de M&A encontrados têm de 1 a 2 usuários e nenhuma evidência de cobertura do Brasil.

### Limites da fonte, que um actor próprio não resolve

- TikTok Ads de empresas que anunciam só no Brasil.
- Gasto, verba e impressões de anúncios comerciais no Brasil. A Meta e o LinkedIn só publicam esses dados para a UE ou para anúncios políticos.
- Intenção por Conta-alvo, no estilo Bombora.
- Gartner Peer Insights: o skill oficial da Apify diz que não há actor funcionando.
- TV, rádio, OOH e anúncios em marketplaces como o Mercado Livre: nenhum actor encontrado.
- Comunidades brasileiras fora do Reddit e do X (fóruns, Telegram, WhatsApp): não avaliadas.

## 5. Não verificado

**Plataforma**
- A página apify.com/pricing não foi aberta.
- O preço do Starter tem conflito (US$ 19, 29 ou 49).
- As 25 execuções simultâneas e a retenção de 7 dias no Free vêm só de terceiros.

**Preços a confirmar no console**
- **Vagas e equipes:** unfenced-group/gupy-scraper (US$ 1,49), zen-studio/gupy-jobs-scraper (US$ 2,99), igolaizola (US$ 0,9), viralanalyzer/brazil-jobs-scraper (US$ 2), bebity/linkedin-jobs-scraper (US$ 0,0015 por vaga), freshdata (US$ 1,80), riceman, automation-lab/linkedin-company-scraper (US$ 0,003 por empresa) e atomus (US$ 3,50).
- **Movimentação profissional:** modo Full e evento de monitoramento da thirdwatch, "a partir de US$ 1,50" do harvestapi/linkedin-company-employees e george.the.developer (US$ 20).
- **Anúncios:** silva95gustavo/google-ads-scraper (US$ 0,90), lexis-solutions (US$ 0,49), brilliant_gum e data_xplorer/tiktok-ads-scraper, e o Starter (US$ 5,00) e o Scale (US$ 4,20) do apify/facebook-ads-scraper.
- **Notícias:** thirdwatch/google-news-scraper (US$ 0,90), memo23 (US$ 8, sem unidade), syncthornx06 (US$ 0,99), branch-network (US$ 10), dou-monitor (US$ 0,10 por linha), jenko_systems e latinamericadata/pncp-brasil (US$ 1,00).
- **Tecnologia:** bovi (US$ 0,0015) e proffera (US$ 0,005), que aparecem só no resumo do buscador, e misterkhan, automation-lab/wappalyzer, jakubbalada e fantastic-jobs, sem preço encontrado.
- **Reputação:** blackfalcondata (sem preço), ing-karlen (US$ 0,01 por empresa), o preço atual do kaitoeasyapi (US$ 0,18 vem de um título antigo) e o apidojo/twitter-scraper-lite (US$ 0,18).

**Uso e nota não confirmados**
- valig (4,7 com 18 avaliações, 29 mil usuários).
- silva95gustavo/linkedin-ad-library-scraper (5,0 com 8, 2,7 mil usuários, e a issue de instabilidade de setembro de 2026).
- lexis-solutions (4,9 com 18).
- thirdwatch/google-news-scraper (5,0 com 1, 13 usuários).
- Os favoritos e a data de modificação do syncthornx06.
- O limite de 100 termos do dou-monitor.
- A issue "Missed posts" do harvestapi/linkedin-company-posts.
- Os números dos concorrentes do Google Trends (vêm do README de um concorrente).

**Funcionalidades não confirmadas**
- A amostra de perfis do freshdata.
- Como o monitor da thirdwatch guarda a leitura anterior.
- O monitor grátis de contratações e as "sessões autenticadas" da HarvestAPI, que só a Thirdwatch cita.
- A frase "tracks what changes between scans" do fullspeedtram.
- A base de 7.500 assinaturas do automation-lab/wappalyzer.
- A frase "não cobra domínio que falha" do bovi.
- A frase "não coleta texto de reclamação" do ing-karlen.
- A cobertura do Gartner pelo zen-studio.
- A atualização mensal do branch-network.

**Brasil**
- Nenhum actor de LinkedIn foi testado com perfis ou empresas brasileiras.
- Não foram confirmados:
  - o filtro geoId do LinkedIn Jobs;
  - o suporte a BR do Google Ads;
  - o pt-BR do Google News;
  - a cobertura do Brasil pelo Crunchbase;
  - a busca de posts com termos em português;
  - o volume de conversa em português no Reddit e no X.

**Citados sem nenhuma fonte, e por isso fora das tabelas**
- **Vagas e equipes:** harvestapi/linkedin-job-search, misceres/indeed-scraper, abotapi/gupy-io-scraper (aparece só num resumo de buscador), khadinakbar/linkedin-company-custom-headcount-scraper, webdata_labs/linkedin-company-scraper.
- **Anúncios:** scrapers_lat/tiktok-creative-center-scraper, seibs.co/ad-library-intel.
- **Notícias:** lhotanova/google-news-scraper, nexgenwatch/latam-startup-funding-tracker, datahyena/company-funding-rounds, johnatan029/cnpj-new-companies, johnatan029/pncp-licitacoes-brasil, johnatan029/pncp-award-vendor-intelligence, vivid_astronaut/pncp-licitacoes-brasil, joaosbp/licitacoes-pncp-br.

**Retirados desta versão (descartados na checagem):** northbell/linkedin-company-growth-scraper, accountable_eel/linkedin-profile-lookup, curly/linkedin-ad-library-scraper, dadosbr/diarios-municipais-busca.

**Fora da checagem:** os actors citados só nas lacunas não foram checados. São os de Catho, expansão, M&A e executivos nos EUA, e o saswave.

## Fontes

Os repositórios do GitHub foram citados pelo caminho dono/repositório. O endereço abaixo segue o padrão github.com/dono/repositório.

**Actors**
- https://apify.com/curious_coder/linkedin-jobs-scraper
- https://apify.com/valig/indeed-jobs-scraper
- https://apify.com/zen-studio/gupy-jobs-scraper
- https://apify.com/unfenced-group/gupy-scraper
- https://apify.com/igolaizola/infojobs-brazil-scraper
- https://apify.com/fantastic-jobs/career-site-job-listing-api
- https://apify.com/freshdata/linkedin-company-custom-headcount
- https://apify.com/harvestapi/linkedin-profile-scraper
- https://apify.com/harvestapi/linkedin-profile-search
- https://apify.com/harvestapi/linkedin-company-employees
- https://apify.com/harvestapi/linkedin-post-search
- https://apify.com/harvestapi/linkedin-company-posts
- https://apify.com/thirdwatch/linkedin-company-employees-scraper
- https://apify.com/curious_coder/facebook-ads-library-scraper
- https://apify.com/apify/facebook-ads-scraper
- https://apify.com/silva95gustavo/google-ads-scraper
- https://apify.com/silva95gustavo/linkedin-ad-library-scraper
- https://apify.com/lexis-solutions/tiktok-ads-scraper
- https://apify.com/thirdwatch/google-news-scraper
- https://apify.com/memo23/crunchbase-scraper
- https://apify.com/syncthornx06/brazil-new-companies
- https://apify.com/brasildados/dou-monitor
- https://apify.com/latinamericadata/pncp-brasil
- https://apify.com/bovi/builtwith-tech-stack-scraper
- https://apify.com/proffera/tech-stack-detector
- https://apify.com/misterkhan/website-tech-stack-scanner
- https://apify.com/fullspeedtram/website-tech-stack-detector
- https://apify.com/automation-lab/wappalyzer-technology-lookup
- https://apify.com/jakubbalada/content-checker
- https://apify.com/blackfalcondata/reclameaqui-scraper
- https://apify.com/compass/google-maps-reviews-scraper
- https://apify.com/zen-studio/software-review-scraper
- https://apify.com/harshmaur/reddit-scraper
- https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
- https://apify.com/data_xplorer/google-trends-fast-scraper

**Plano e preços da Apify**
- https://apify.com/pricing (não acessada: bloqueada pela rede)
- https://use-apify.com
- https://scrapegraphai.com
- https://crawlworks.io
- https://scrapecreators.com
- https://github.com/crafter-station/limon
- https://github.com/pfurini/furiai-skills
- https://github.com/manuia88/desarrollos_mvp_emergent

**Catálogos e listas**
- https://github.com/automationbyexperts/apis-scraping-geracao-de-leads
- https://github.com/cporter202/API-mega-list
- https://github.com/cporter202/job-data-apis-and-scrapers
- https://github.com/cporter202/agentic-ai-apis
- https://github.com/apify/awesome-skills
- https://github.com/apify/actor-content-checker
- https://raw.githubusercontent.com/apify/actor-content-checker

**Esquemas e código de terceiros**
- https://github.com/Davis1289/job-scraper
- https://github.com/eranganot/job-hunter
- https://github.com/girshovich/job-hunter
- https://github.com/rszhd/signalscout
- https://github.com/naveedharri/benai-skills
- https://github.com/monid-ai/monid
- https://github.com/mmaglobal/MAVEN
- https://github.com/kevinbadi/ai-os-skills
- https://github.com/omardeangelis/sevedemo-tools
- https://github.com/Dweeb1578/Events-Tracker
- https://github.com/Pawan-Prabhashana/CatalistMediaDashboard
- https://github.com/poojitha-rachuri/thirdwatch-landing
- https://github.com/iunikolaev-dot/tabby_google_ads_competitors
- https://github.com/Enriquefft/replik
- https://github.com/mksinha01/CrowdWisdomTrading
- https://github.com/galvza/lupai
- https://github.com/adunato/SideGig
- https://github.com/genfeedai/genfeed.ai
- https://github.com/AnshumanAtrey/google-trends-api-scraper
- https://github.com/ayushozha/shadow-launch
- https://github.com/andriidrok1/speedrun-agent
- https://www.npmjs.com/package/@harvestapi/scraper

**Sem endereço registrado:** canivibecodeit (14/08/2026), a lista kawsarlog, a lista ai-apis-you-can-ship-today, o benchmark da Xquik (27/09/2026), a comparação publicada pela Thirdwatch, os guias da Meta Ad Library e o template do n8n.

**Fontes internas do repositório:** /home/user/Althius/.scratch/crm-real-e-stack/issues/12-consultar-foto-de-contato-via-apify.md e /home/user/Althius/supabase/functions/contact-photo-lookup/README.md