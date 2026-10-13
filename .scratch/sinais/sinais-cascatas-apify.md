# Sinais como cascata de actors — Althius (ICPs A–H)

Data: 12/10/2026 (BRT). Fonte dos preços: API pública da Apify Store (`GET /v2/store`, faixa **FREE** do preço por evento), consultada hoje. Nenhum actor foi executado (sem custo). Preços mudam: o registro (`private.signal_actors.known_price`) deve ser revalidado antes de liberar cada actor.

**Plano Free da Apify:** US$ 5/mês de crédito de plataforma. Actors *pay-per-event* (PPE) e *pay-per-result* rodam no Free (o preço da faixa Free costuma ser o mais alto). Actors *rental* (mensalidade) não aparecem na busca da Store e **ficaram de fora**. Actors "FREE" da própria Apify (Website Content Crawler, Web Scraper, Cheerio Scraper) cobram só computação (~US$ 0,40/CU no Free — conferir; 1 página leve ≈ 0,001–0,005 CU).

Legenda: **Free?** = roda no plano Free sem aluguel. Custo = só Apify (sem LLM). "u" = usuários totais/30 dias; "ok" = execuções com sucesso/total nos últimos 30 dias.

## Tabela-resumo

| ICP | Sinal | Cascata (passos) | Actor principal | Custo estimado / 100 resultados | Free? | Viabilidade |
|---|---|---|---|---|---|---|
| A | Vaga de analista de comex | 3 | curious_coder/linkedin-jobs-scraper → harvestapi/linkedin-company → johnatan029/cnpj-empresas-brasil-scraper | ~US$ 0,40 | sim | **Alta** (já tem adaptador) |
| A | Novo importador (Comex Stat) | 3 | Lista oficial MDIC de empresas importadoras (CSV, grátis) → CNPJ lookup → LinkedIn company | ~US$ 0,60 (sem custo de fonte) | sim | Média (anual) |
| A | NCM nova na pauta / volume por porto | 1–2 | API Comex Stat (grátis) ou scrapers_lat/latam-customs-manifests-scraper | US$ 0 (API) / US$ 1,20 | sim | Só sinal de **mercado** (não por empresa) |
| A | Habilitação Radar | — | sem actor; consulta da Receita é individual e com captcha | — | — | **Inviável em massa** |
| B | CNPJ novo | 2 | johnatan029/cnpj-new-companies (ou brazilayer/brazilian-new-companies) → harvestapi/linkedin-company-search | ~US$ 0,40–0,60 | sim | Alta |
| B | Mudança de porte/regime; entrada de sócio | 2 | snapshot mensal com johnatan029/cnpj-empresas-brasil-scraper + diff interno | ~US$ 0,15 | sim | Alta (diff feito por nós) |
| B | Setor mais afetado CBS/IBS | 2 | tabela interna CNAE → epicscrapers/brazil-cnpj-scraper (busca por CNAE/UF) | ~US$ 0,10 | sim | Alta |
| C | Processos públicos (jurimetria por CNPJ) | 2–3 | contas → brasildados/cnpj-lawsuits-check | ~US$ 10,00 (US$ 0,10/CNPJ) | sim | Média (caro, actor pequeno) |
| C | Mudança regulatória | 2 | jenko_systems/diario-oficial-uniao-dou → classificação CNAE (LLM) | ~US$ 0,06/run | sim | Alta (sinal de mercado) |
| C | Recuperação judicial de cliente/fornecedor | 3–4 | data_xplorer/google-news-scraper-fast → extração (LLM) → CNPJ lookup → cnpj-lawsuits-check | ~US$ 0,60 + 0,10/CNPJ | sim | Média/baixa (relação cliente↔prospect não é pública) |
| D | CNAE eletrointensivo | 1–2 | epicscrapers/brazil-cnpj-scraper → harvestapi/linkedin-company | ~US$ 0,50 | sim | Alta |
| D | Grupo A ainda cativo | 2 | lista de agentes CCEE (dados abertos, grátis) × base CNAE/porte | US$ 0,10 | sim | Média (inferência) |
| D | Vencimento de contrato de energia | — | não é público | — | — | **Inviável** |
| D | Nova planta/filial | 2 | johnatan029/branch-network ou diff de filiais + google news | ~US$ 1,00 | sim | Média |
| D | Meta ESG publicada | 2 | scraperlink/google-search-results-serp-scraper → apify/website-content-crawler | ~US$ 0,30 | sim | Média |
| E | Financiamento BNDES/Finep | 1–2 | API dados abertos BNDES/Finep (grátis); actor nexgenwatch/brazil-bndes-financing-operations só como fallback | US$ 0 / US$ 5,00 | sim | Alta (fonte oficial) |
| E | Licença ambiental de instalação | 2 | dou-monitor/diários estaduais por palavra-chave; órgãos estaduais sem actor | ~US$ 0,10–1,10 | sim | Baixa (fonte fragmentada) |
| E | Expansão de planta | 3 | google news → LLM → CNPJ lookup | ~US$ 0,60 | sim | Média |
| E | Vaga de engenharia/manutenção | 2–3 | linkedin-jobs (+ gupy) → linkedin-company | ~US$ 0,40 | sim | **Alta** |
| E | Importação de máquinas NCM 84/85 | — | Comex Stat não abre por empresa | — | — | Só mercado |
| F | Novo CD/filial; troca de sede | 2 | diff de filiais/endereço (CNPJ lookup) + google news | ~US$ 0,15–0,60 | sim | Média/alta |
| F | Vaga de logística | 2–3 | linkedin-jobs → linkedin-company | ~US$ 0,40 | sim | **Alta** |
| F | Crescimento de comex do embarcador | 1 | lista MDIC (faixa de valor por ano), grátis | US$ 0 | — | Média (anual) |
| G | Cruzando faixa de headcount | 2 | harvestapi/linkedin-company (snapshot mensal, diff de funcionários) + vagas | ~US$ 0,40 | sim | Alta |
| G | Nova filial | 1 | johnatan029/branch-network ou diff | ~US$ 0,15–1,00 | sim | Alta |
| G | Renovação de apólice; frota; CAGED | — | não público por empresa (CAGED sem CNPJ; RENAVAM fechado) | — | — | **Inviável** |
| H | Nova cooperativa | 1–2 | epicscrapers/brazil-cnpj-scraper (natureza jurídica 214-3) ou cnpj-new-companies | ~US$ 0,10–0,40 | sim | Alta |
| H | CPR registrada; área no CAR | — | CPR em registradoras (B3/CERC), sem dado aberto por empresa; SICAR sem identificação do dono (LGPD) | — | — | **Inviável** |
| H | Calendário de safra; Plano Safra | 1 | calendário CONAB (estático) + google news | ~US$ 0,05 | sim | Gatilho de mercado |

**Preço sugerido de crédito por execução:** custo Apify da cascata × ~3 (margem + falhas + LLM de classificação). Ex.: sinal de vaga ≈ US$ 0,004/empresa sinalizada → 1 crédito por 10 empresas; jurimetria ≈ US$ 0,10/CNPJ → 1 crédito por CNPJ (≈ mesmo patamar da "consulta de CNPJ" hoje, que custa 1 crédito e US$ 0,0002 de Apify).

---

## Catálogo de actors usados (dados da Store em 12/10/2026)

| Actor | Faz | Preço (faixa Free) | u (total/30d) | Nota | ok 30d |
|---|---|---|---|---|---|
| curious_coder/linkedin-jobs-scraper | vagas LinkedIn | US$ 0,002/vaga + 0,00005/start | 170.756 / 16.797 | 4,5 | 479.794/486.412 |
| valig/linkedin-jobs-scraper | vagas LinkedIn (fallback barato) | US$ 0,0004/vaga + 0,001/start | 29.783 / 4.983 | 4,7 | 359.963/365.178 |
| zen-studio/gupy-jobs-scraper | vagas Gupy (por empresa/palavra) | US$ 0,003/vaga | 129 / 28 | – | 1.376/1.376 |
| viralanalyzer/brazil-jobs-scraper | InfoJobs, Vagas, Gupy, APInfo, LinkedIn | US$ 0,005/vaga | 197 / 38 | 5 | 1.219/1.221 |
| harvestapi/linkedin-company | página da empresa (site, funcionários) | US$ 0,004/empresa | 25.673 / 6.192 | 4,5 | 1.834.224/1.834.670 |
| harvestapi/linkedin-company-search | busca empresas por nome/filtro | US$ 0,002 curta / 0,004 completa + 0,001 start | 10.807 / 3.353 | 4,4 | 299.216/299.374 |
| johnatan029/cnpj-empresas-brasil-scraper | lookup CNPJ (já usado em prod) e descoberta por CNAE/UF | US$ 0,0015/item | 151 / 49 | – | 608/619 |
| epicscrapers/brazil-cnpj-scraper | base Receita (minhareceita) por UF, CNAE, município, natureza jurídica | US$ 0,0009/item | 164 / 39 | 5 | 1.433/1.439 |
| johnatan029/cnpj-new-companies | empresas recém-abertas (mês, UF, CNAE, porte) | US$ 0,004/lead | 2 / 0 | – | 32/32 |
| brazilayer/brazilian-new-companies | idem (base mensal da Receita) | US$ 0,002/empresa | 10 / 5 | – | 56/59 |
| johnatan029/branch-network | mapa de filiais por CNPJ | US$ 0,01/mapa | 2 / 2 | – | 31/31 |
| brasildados/cnpj-lead-scraper-search | empresas por CNAE/UF/porte | US$ 0,01/item + 0,10/start | 180 / 27 | 5 | 425/443 |
| brasildados/historico-empresa-cnpj-api | histórico 5 anos (capital, CNAE, sócios) | US$ 0,80/CNPJ + 0,10/start | 2 / 1 | – | 1/1 |
| brasildados/cnpj-lawsuits-check | resumo de processos por CNPJ | US$ 0,10/CNPJ | 29 / 10 | 5 | 69/84 (82%) |
| brasildados/processos-judiciais-cnpj-quantidade-api | contagem/distribuição de processos por CNPJ (5 anos, réu) | US$ 1,00/CNPJ + 0,10/start | 2 / 1 | – | 15/15 |
| brasildados/cnpj-lawsuits-detail | processos individuais por CNPJ (traz partes) | US$ 0,20/processo | 5 / 2 | – | 39/39 |
| jungle_synthesizer/brazil-jusbrasil-court-scraper | Jusbrasil por OAB, nº de processo ou palavra-chave (não por CNPJ) | US$ 0,002/registro + 0,10/start | 55 / 6 | 5 | 41/52 |
| normdata/datajud-scraper | DataJud por nº de processo (monitorar carteira) | US$ 0,02/resultado + 0,003/start | 3 / 2 | – | 21/21 |
| jenko_systems/diario-oficial-uniao-dou | DOU por palavra-chave/órgão | US$ 0,0001/item + 0,05/start | 24 / 4 | – | 37/37 |
| brasildados/dou-monitor | DOU últimos 3 dias por termo | US$ 0,01/item + 0,10/start | 10 / 2 | – | 49/49 |
| data_xplorer/google-news-scraper-fast | Google News | US$ 0,004/item | 2.270 / 607 | 4,9 | 37.507/37.740 |
| scraperlink/google-search-results-serp-scraper | Google Search | US$ 0,0005/item | 13.216 / 3.411 | 4,9 | 3.967.633/3.970.605 |
| apify/website-content-crawler | lê site público (confirmação) | só computação | 167.833 / 14.185 | 4,6 | 2.888.664/2.995.646 |
| apify/cheerio-scraper / apify/web-scraper | scraper genérico de site público | só computação | 25.304 / 125.799 | 4,7 | alto |
| scrapers_lat/latam-customs-manifests-scraper | estatística de comércio BR por NCM/país/modal (agregado) | US$ 0,012/resultado | 2 / 1 | – | 37/37 |
| nexgenwatch/brazil-bndes-financing-operations | operações não automáticas do BNDES | US$ 0,05/registro + 0,02/start | 2 / 1 | – | 25/25 |
| paulovitor18/esg-delta-monitor-br | Lista Suja + autos/embargos IBAMA por CNPJ | US$ 0,06/CNPJ + 0,20/run | 2 / 1 | – | 26/26 |

Todos acima são PAY_PER_EVENT ou FREE (sem aluguel) → **compatíveis com o plano Free**. Actors com < 20 usuários (brasildados, johnatan029/cnpj-new-companies, nexgenwatch, jenko_systems) devem entrar como `testing` e passar por execução real antes de `available`.

---

## ICP A · Comex e importação (detalhado)

### A1. Vaga de analista de comex — **prioridade 1 (Alta)**
| Passo | Actor | O que faz | Entrada | Preço | Free? |
|---|---|---|---|---|---|
| 1 | `curious_coder/linkedin-jobs-scraper` (https://apify.com/curious_coder/linkedin-jobs-scraper) | busca vagas "analista de comércio exterior", "comex", "importação", "despachante" em Brasil, últimos 7 dias | URL de busca LinkedIn (keywords + location=Brasil + f_TPR=r604800) | US$ 0,002/vaga | sim |
| 2 | `harvestapi/linkedin-company` | dados da empresa (site, nº funcionários, setor) | `companyLinkedinUrl` de cada vaga (dedupe por empresa) | US$ 0,004/empresa | sim |
| 3 | `johnatan029/cnpj-empresas-brasil-scraper` (modo discovery) ou Google Search (`"<empresa>" CNPJ`) → lookup | casa a empresa a um CNPJ (porte, CNAE, UF) | nome + cidade (passo 2) | US$ 0,0015/item (+0,0005 busca) | sim |
| (conf.) | – | confirmação: vaga publicada ≤ 7 dias e título contém termo de comex | – | – | – |

- Fallback passo 1: `valig/linkedin-jobs-scraper` (US$ 0,0004/vaga, nota 4,7) e `zen-studio/gupy-jobs-scraper` (US$ 0,003, muitas importadoras recrutam pela Gupy).
- Custo: 100 vagas ≈ 30 empresas → 0,20 + 0,12 + 0,06 ≈ **US$ 0,40/run** (~US$ 0,013 por empresa sinalizada). Free: ~12 runs/mês com o crédito de US$ 5.
- Já existe adaptador (`vaga_linkedin`, `available` em prod) — é só um novo critério de palavra-chave.

### A2. Novo importador (Comex Stat)
- **Sem actor**: Comex Stat (api-comexstat.mdic.gov.br) é agregado por NCM/UF/país, **sem CNPJ**.
- Alternativa pública: lista anual do MDIC "Empresas Brasileiras Exportadoras e Importadoras" (CSV com CNPJ, UF e faixa de valor FOB) no portal da balança comercial — baixar por fetch simples na edge function (grátis) e comparar com o ano anterior (CNPJ novo = novo importador; faixa maior = crescimento).
- Cascata: (1) download/diff do CSV MDIC (grátis) → (2) `johnatan029/cnpj-empresas-brasil-scraper` lookup (US$ 0,0015) → (3) `harvestapi/linkedin-company-search` (US$ 0,002–0,004). Fallback (2): `epicscrapers/brazil-cnpj-scraper` (US$ 0,0009) ou BrasilAPI (grátis, já usado como fallback em prod).
- Custo: ~US$ 0,60/100 empresas. Cadência anual (a lista é anual) — sinal fraco de timing. Conferir URL/estrutura atual do CSV antes de implementar.

### A3/A4. NCM nova na pauta; aumento de volume por porto
- Sinal de **mercado**, não por empresa. API oficial Comex Stat (grátis, JSON) por NCM × URF/porto × mês. Fallback Apify: `scrapers_lat/latam-customs-manifests-scraper` (US$ 0,012/resultado; 2 usuários — testar). Combinar com A2 (importadores da UF/porto) para gerar lista de contas. Viável como "gatilho de conteúdo/timing", não como Sinal em Conta.

### A5. Habilitação Radar
- **Sem actor e sem fonte aberta em massa**: consulta da Receita é por CNPJ, com captcha. Raspar captcha = fora de política. Proxy aceito: CNPJ novo com CNAE de comércio atacadista/importação (B1 com filtro CNAE). Registrar como "sem actor adequado".

---

## ICP B · Contabilidade e tributário
- **B1 CNPJ novo:** (1) `johnatan029/cnpj-new-companies` (US$ 0,004/lead; filtro mês/UF/CNAE/porte) — fallback `brazilayer/brazilian-new-companies` (US$ 0,002) ou `epicscrapers/brazil-cnpj-scraper`; (2) `harvestapi/linkedin-company-search` (opcional). ~US$ 0,40–0,60/100. Atenção: base da Receita é mensal (atraso de até ~30 dias).
- **B2 Mudança de porte/regime e B3 entrada de sócio:** guardar snapshot mensal do lookup (`johnatan029/cnpj-empresas-brasil-scraper`, US$ 0,0015; fallback BrasilAPI grátis) e comparar `porte`, `opcao_pelo_simples/MEI`, QSA. ~US$ 0,15/100 contas. Alternativa pronta (cara): `brasildados/historico-empresa-cnpj-api` (US$ 0,80/CNPJ). QSA tem nome de pessoa: guardar só "entrou sócio" na evidência.
- **B4 Setor mais afetado CBS/IBS:** tabela interna de CNAEs afetados → `epicscrapers/brazil-cnpj-scraper` por CNAE/UF (US$ 0,0009/item). Fallback `brasildados/cnpj-lead-scraper-search` (US$ 0,01 + 0,10/start).

## ICP C · Jurídico empresarial (jurimetria) — detalhado

Regra (OAB/LGPD): só dados **da empresa/CNPJ**; nada de dado pessoal (partes PF, advogados) sai do actor para o Sinal; sem contato frio feito pelo escritório (o Sinal serve à lista de contas). Base legal: dados de processos são públicos, mas tratamento por terceiros exige finalidade legítima (LGPD art. 7º IX / §3º-4º); agregar por CNPJ e descartar partes PF. Jusbrasil proíbe raspagem nos termos de uso — preferir fonte oficial/API.

### C1. Processos públicos (jurimetria por CNPJ)
| Passo | Actor | O que faz | Entrada | Preço | Free? |
|---|---|---|---|---|---|
| 1 | Contas-alvo do Workspace (já têm CNPJ) ou `epicscrapers/brazil-cnpj-scraper` por CNAE/UF | lista de CNPJs | ICP | US$ 0,0009/CNPJ | sim |
| 2 | `brasildados/cnpj-lawsuits-check` (https://apify.com/brasildados/cnpj-lawsuits-check) | resumo de risco litigioso: totais e estatística agregada por CNPJ | lista de CNPJs | **US$ 0,10/CNPJ** | sim |
| 3 (opcional) | `brasildados/processos-judiciais-cnpj-quantidade-api` | distribuição por tipo (trabalhista, tributário, cível), tribunal, situação, UF — 5 anos como réu | CNPJs com volume alto no passo 2 | US$ 1,00/CNPJ + 0,10/start | sim |
| (conf.) | regra interna | Sinal = salto de processos novos (ex.: ≥ N novos trabalhistas/tributários em 90 dias vs. snapshot anterior) | – | – | – |

- Fallback: `brasildados/cnpj-lawsuits-detail` (US$ 0,20/processo; traz partes → **filtrar PF antes de gravar**). Escavador e Jusbrasil têm API oficial paga (fora da Apify; contrato próprio) — melhor qualidade e base legal mais clara se o volume justificar.
- **Não servem para jurimetria por CNPJ:** `jungle_synthesizer/brazil-jusbrasil-court-scraper` e `trev0n/jusbrasil-court-scraper` (buscam por OAB, nº de processo ou palavra-chave/jurisprudência); actors DataJud (`normdata`, `scrapers_lat`, `recordsdata`, `parseforge`) e a própria API pública do DataJud — **não trazem as partes nem permitem buscar por CNPJ**; servem só para monitorar processos cujo número já se conhece (US$ 0,02/processo, ou grátis direto na API do CNJ).
- Custo: 100 CNPJs ≈ **US$ 10** (passo 2); com detalhe em 10% (passo 3) +US$ 10. Caro para o crédito Free (US$ 5 ≈ 50 CNPJs/mês). Preço sugerido: 1 crédito por CNPJ no resumo, 5–10 créditos no detalhamento. Actor pequeno (29 usuários, 82% de sucesso em 30 dias): entra como `testing`.

### C2. Mudança regulatória
- (1) `jenko_systems/diario-oficial-uniao-dou` (US$ 0,05/start + 0,0001/item) por palavras-chave (IBS, CBS, "reforma tributária", agência reguladora) → (2) classificação por CNAE afetado (LLM interno) → (3) lista de contas por CNAE (B4). Fallback: `brasildados/dou-monitor` (US$ 0,10 + 0,01/item) ou INLABS da Imprensa Nacional (XML do DOU, grátis com cadastro). ~US$ 0,06/run. Sinal de mercado.

### C3. Recuperação judicial de cliente/fornecedor do prospect
- (1) `data_xplorer/google-news-scraper-fast` ("recuperação judicial" OR "pedido de falência", últimos 7 dias; US$ 0,004/item) → (2) extração do nome/CNPJ (LLM) → (3) `johnatan029/cnpj-empresas-brasil-scraper` lookup → (4) `brasildados/cnpj-lawsuits-check` para confirmar. Diários de Justiça estaduais não têm actor; generic `apify/website-content-crawler` nos DJe é frágil (captcha/PDF).
- Limitação: o vínculo "cliente/fornecedor do prospect" não é público; só dá para cruzar com a carteira que o próprio cliente Althius informar, ou usar o setor/região como proxy. Viabilidade média/baixa. ~US$ 0,60 + US$ 0,10/CNPJ confirmado.

### C4. Impacto da reforma no CNAE
- Sem actor: tabela interna CNAE → impacto; lista por CNAE via `epicscrapers/brazil-cnpj-scraper`. ~US$ 0,10/100.

## ICP D · Energia e mercado livre
- **Grupo A ainda cativo:** sem actor. CCEE publica a lista de agentes (consumidores livres/especiais) em dados abertos (grátis; conferir endpoint). Cascata: (1) `epicscrapers/brazil-cnpj-scraper` por CNAE eletrointensivo + porte (US$ 0,0009) → (2) excluir CNPJs presentes na lista CCEE (grátis) = "provável cativo". Inferência, não confirmação.
- **Vencimento de contrato de energia:** não público → inviável.
- **Nova planta/filial:** `johnatan029/branch-network` (US$ 0,01/CNPJ) ou diff mensal de filiais (lookup US$ 0,0015) + `data_xplorer/google-news-scraper-fast`. ~US$ 1/100 contas.
- **CNAE eletrointensivo:** `epicscrapers/brazil-cnpj-scraper` (CNAE/UF) → `harvestapi/linkedin-company`. ~US$ 0,50/100.
- **Meta ESG publicada:** `scraperlink/google-search-results-serp-scraper` ("<empresa> relatório de sustentabilidade" / "net zero"; US$ 0,0005) → `apify/website-content-crawler` no site (computação, ~US$ 0,002/página) para confirmar. ~US$ 0,30/100.

## ICP E · Indústria fornecedores B2B
- **Financiamento BNDES/Finep:** fonte oficial grátis — portal de dados abertos do BNDES (CKAN, operações não automáticas com CNPJ do cliente; automáticas com menos detalhe) e dados abertos da Finep (contratos). Fallback Apify: `nexgenwatch/brazil-bndes-financing-operations` (US$ 0,05/registro — caro e só 2 usuários). Recomendação: fetch direto da API oficial.
- **Licença ambiental de instalação:** sem actor; IBAMA (SISLIC, só federal) e órgãos estaduais (CETESB, FEAM, etc.) com portais distintos. Parcial: DOU/diários estaduais por "licença de instalação" (`jenko_systems/diario-oficial-uniao-dou`). Generic `apify/cheerio-scraper` por órgão estadual = 1 scraper por estado (manutenção alta). Baixa viabilidade.
- **Expansão de planta:** google news → LLM → lookup CNPJ. ~US$ 0,60/100 notícias.
- **Vaga de engenharia/manutenção:** igual A1 com termos "engenheiro de manutenção", "PCM", "engenharia de processos". ~US$ 0,40/100 vagas.
- **Importação de máquinas NCM 84/85:** Comex Stat sem CNPJ → só mercado.

## ICP F · Logística e transporte
- **Novo CD ou filial; troca de sede:** diff mensal de filiais/endereço via lookup CNPJ (US$ 0,0015) + google news ("novo centro de distribuição"). ~US$ 0,15–0,60/100.
- **Vaga de logística:** igual A1 ("analista de logística", "supply chain", "coordenador de transportes").
- **Crescimento de comex do embarcador:** lista anual MDIC (faixa de valor por CNPJ), grátis; anual.

## ICP G · Corretoras de benefícios
- **Cruzando faixa de headcount:** `harvestapi/linkedin-company` (US$ 0,004) mensal, guardar `employeeCount`, Sinal quando cruza 50/100/200; reforço por volume de vagas (A1). CAGED **não** tem CNPJ nos microdados → inviável por empresa. ~US$ 0,40/100 contas.
- **Nova filial:** `johnatan029/branch-network` ou diff.
- **Renovação anual de apólice, frota crescendo:** não públicos (RENAVAM fechado; ANTT/RNTRC só cobre transportadoras — conferir se o dado aberto traz frota). Saúde: não tratar dado de saúde (LGPD).

## ICP H · Agro B2B
- **Nova cooperativa:** `epicscrapers/brazil-cnpj-scraper` com natureza jurídica 214-3 (cooperativa) + data de abertura, ou `johnatan029/cnpj-new-companies` filtrando CNAE. ~US$ 0,10–0,40/100.
- **CPR registrada:** registro em B3/CERC; sem dado aberto por emissor → inviável.
- **Área no CAR:** SICAR publica perímetros por município sem CPF/CNPJ do dono → inviável por empresa (e LGPD).
- **Calendário de safra / Plano Safra:** calendário CONAB (estático) + `data_xplorer/google-news-scraper-fast` para liberação do Plano Safra. Gatilho de mercado.

---

## Sinais sem actor adequado (registrar como resultado válido)
Radar (A), Comex por empresa (A/E/F — usar lista MDIC), vencimento de contrato de energia (D), Grupo A cativo (D — só inferência CCEE), licença ambiental estadual (E), CAGED por empresa (G), apólice e frota (G), CPR e CAR (H), Jusbrasil/DataJud por CNPJ (C).

## Não conferido
- Esquemas de entrada exatos de cada actor (usar `fetch-actor-details` antes de escrever adaptador).
- Endpoints atuais: CSV de empresas importadoras do MDIC, lista de agentes da CCEE, CKAN do BNDES/Finep.
- Preço de computação no plano Free (US$/CU) para os actors genéricos.
- Se `brasildados/cnpj-lawsuits-check` cobre Justiça do Trabalho e indica recuperação judicial.

---

# Parte 2 — Vazamento da marca "Apify" (main 74fcb8c)

O texto literal "coletado via Apify" não existe no código. O que aparece na tela é **"(Apify)"** ao lado da Razão Social.

| # | Arquivo:linha | String / onde aparece | Quem vê |
|---|---|---|---|
| 1 | projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx:76 | `({receita.fonte === 'apify' ? 'Apify' : 'BrasilAPI'})` depois da Razão Social | usuário, na Conta (dado da Receita). **É o caso que o Renan viu.** A única Conta com receita_data em prod tem `fonte='apify'` |
| 2 | supabase/functions/account-discovery/handler.ts:177-179 | 'O Apify não respondeu a tempo.' / 'A conta do Apify da Althius está sem crédito.' / 'O Apify não conseguiu rodar o Actor.' → gravado em `discovery_runs.last_error` (l.257, 282) e lido em `supabase-contas.ts:512` (`motivo`) | usuário (busca de contas) e Hermes |
| 3 | supabase/functions/contact-photo-lookup/handler.ts:215, 217 | 'O Apify não respondeu a tempo…' / 'O Apify não conseguiu buscar a foto agora…' (resposta 504/502) | usuário (toast da foto do Contato) |
| 4 | supabase/functions/signal-scan/handler.ts:136 | 'O Apify não respondeu a tempo.' / 'O Apify não conseguiu rodar o actor.' | quem chama a função (UI/Hermes) |
| 5 | supabase/functions/signal-scan/handler.ts:48, 55; contact-photo-lookup/handler.ts:65, 73 | `Apify respondeu HTTP ${status}` / 'O actor do Apify não respondeu a tempo' (mensagem de Error) | pode vazar se o erro for repassado |
| 6 | projeto-althius-frontend/src/fonte/supabase-contas.ts:644 | `motivoDaFalhaDaFuncao('contact-photo-lookup', error, 'APIFY_TOKEN e APP_ORIGIN')` → vira "Confira os segredos APIFY_TOKEN e APP_ORIGIN" (falha-da-edge-function.ts:24) | usuário, quando a função não sobe |
| 7 | supabase/functions/_shared/ferramentas-dos-agentes.ts:356 | '…(o Actor está em teste ou fora do ar).' no retorno de `buscar_contas_pelo_icp` | Hermes (pode repetir "Actor") |
| 8 | supabase/functions/signal-runner/handler.ts:242, 392 | 'O actor deste Sinal não está disponível.' / 'O actor do Sinal dos Monitoramentos ativos não está disponível.' → `signal_monitors.last_error` → `supabase-sinais.ts:155` (`ultimaFalha`) | usuário e Hermes (jargão "actor") |
| 9 | supabase/functions/_shared/provedor-de-contatos.ts:274, 332; account-enrichment/index.ts:100, 150 | fonte gravada `apify:harvestapi~linkedin-company-employees`, `apify:<actor>`, default `'apify'` | banco: `private.proposed_contacts.source_provider` = `apify:harvestapi~linkedin-company-employees` (5 linhas em prod). Mapeado em supabase-contas.ts:738 (`sourceProvider`); não achei render direto em .tsx, mas está no objeto e pode chegar ao Hermes/UI futura |
| 10 | projeto-althius-frontend/src/fonte/contas-tipos.ts:302, simulada-contas.ts:124/137/518/639 | tipo `'apify' \| 'brasilapi'` e dados do modo demonstração com `sourceProvider: 'apify'` / `fonte: 'apify'` | demo mostra "(Apify)" pelo item 1 |
| 11 | DB `private.signal_actors.known_price` (9 linhas) | textos "…API pública do Apify…", "o Apify cobrou…" | hoje **não** exposto: `list_signal_actors` só devolve `signal_type, state` |
| 12 | DB `public.target_accounts.receita_data->>'fonte'` = 'apify' (1 linha) | alimenta o item 1 | usuário |

Hermes (prompts/playbook `_hermes-worker`, `orquestracao*.ts`): nenhuma menção a "Apify"/"harvestapi" no texto; risco vem dos itens 2, 7, 8 e 9 (resultados de ferramentas e last_error). Fontes de Sinal gravadas pelos adaptadores usam nomes neutros ("LinkedIn", "Biblioteca de anúncios da Meta") — ok.

Correção sugerida (não feita): rótulo neutro "Receita Federal" no item 1 (independe do provedor); mensagens em palavras do produto ("A busca externa não respondeu a tempo", "sem saldo no provedor de dados"); trocar "actor" por "fonte de dados"; guardar provedor/actor só em coluna técnica não exibida.

# Parte 3 — Enriquecimento Receita Federal (CNPJ)

- **Fluxo:** Conta → painel Comitê e enriquecimento (`comite-e-enriquecimento.tsx:51-98`, `fonte.enriquecerReceita`) → `supabase-contas.ts:833` invoca `account-enrichment` com `action: 'cnpj-receita'` → `handler.ts:430+`: `begin_cnpj_receita` (reserva 1 crédito, chave idempotente) → Apify `johnatan029~cnpj-empresas-brasil-scraper` (`mode: lookup`, teto US$ 0,05) → se falhar, **BrasilAPI** (grátis) → `save_receita_enrichment` (grava `target_accounts.receita_data`) → `finish_cnpj_receita` (settle 1 se achou, 0 se não) → `record_discovery_cost` (custo real em `private.action_costs`).
- **Preço:** `credit_action_prices.cnpj_receita` = 1 crédito ("Uma consulta de CNPJ na Receita Federal"). Custo Apify observado: US$ 0,0002.
- **Deploy:** `account-enrichment` v10 publicada em 09/10 19:54 BRT; último commit que toca a função e seus imports (`2fef958`, 09/10 19:17 BRT) é anterior e não há diferença desde então até main → **implantado = main**. (`signal-scan` v25 é de 08/10 e não tem `bfef6c3`, mas o account-enrichment empacota a versão nova de `signal-scan/apify.ts`.)
- **Uso em prod:** 1 consulta em toda a história (09/10, reserva `settled` 1 crédito; 1 custo Apify US$ 0,0002; 1 de 19 Contas com `receita_data`, fonte `apify`). Nenhuma consulta nos últimos 3 dias; nenhum erro registrado (não há reserva `released` de cnpj_receita). `target_account_enrichments` vazia (essa consulta não grava ali).
- **Veredito:** integrado ponta a ponta e funcionou na única execução real; volume baixo demais para chamar de validado. Pendência visível: rótulo "(Apify)" na tela.
