# Pesquisa das fontes de jurimetria (ticket 01)

**Consulta das fontes abaixo:** 26/10/2026. Os links apontam para fontes primárias (CNJ, tribunais e documentação/páginas oficiais dos fornecedores). Nenhuma chamada autenticada a fornecedor nem consulta com dado real foi feita. Exemplos de identificadores são omitidos.

## Veredito: viabilidade dos Sinais JURI

| Sinal | Viabilidade encontrada | Motivo e limite |
| --- | --- | --- |
| **J — Janela** | **Viável em princípio pelo STJ; risco de atualização e mapeamento** | O STJ publica Temas em CSV sob licença Creative Commons Atribuição; em 09/10/2026 a página registrava atualização dos dados em 09/10/2026. O arquivo e o dicionário não foram lidos diretamente nesta consulta, então colunas, tema mais recente e regularidade futura continuam sem confirmação. Para relacionar tema a `segment`, a proposta compatível com o spec é uma tabela manual pequena. |
| **R — Recorrência** | **Tecnicamente possível por fornecedor pago, sob condição** | JUDIT e Escavador documentam monitoramento de CNPJ/novas distribuições. Não confirmei a cobertura por polo passivo em todos os retornos, o preço efetivo da operação necessária nem os termos para armazenar/exibir dados num SaaS. O DataJud não serve ao produto comercial conforme o termo de uso vigente consultado. |
| **U — Urgência** | **Não confirmada** | As fontes consultadas não demonstram uma integração e termos comerciais suficientes para detectar e exibir recuperação judicial ou execução fiscal por Conta-alvo. Não sei se os fornecedores atendem esse recorte com confiabilidade contratável. |
| **I — Impacto** | **Não confirmada** | As fontes consultadas não demonstram uma integração e termos comerciais suficientes para detectar condenação grande, ação coletiva ou ação civil pública contra a Conta-alvo. Não sei se os fornecedores atendem esse recorte com confiabilidade contratável. |

Este parecer trata de disponibilidade técnica e evidência pública, não aprova política jurídica ou de produto. Os limites de uso ético e a decisão sobre eventual contratação ficam fora deste ticket.

## 1. DataJud: partes, campos, CNPJ e nome

- **Campos documentados:** o [Glossário da API Pública do DataJud](https://datajud-wiki.cnj.jus.br/api-publica/glossario/) relaciona `id`, `tribunal`, `numeroProcesso`, `dataAjuizamento`, `grau`, `nivelSigilo`, `formato`, `sistema`, `classe`, `assuntos`, `orgaoJulgador`, `movimentos` (com código, nome e `dataHora`) e campos de controle interno `dataHoraUltimaAtualizacao` e `@timestamp`.
- **Partes, nome, CPF/CNPJ na resposta real:** **não sei**. O glossário da API consultado não enumera campos de parte. A [Portaria CNJ nº 374/2026](https://atos.cnj.jus.br/atos/detalhar/6972) passou a prever envio de polo ativo e passivo quando pessoas jurídicas, mas isso não comprova que a API pública já devolva esses campos em uma resposta real.
- **Busca/filtro por CNPJ ou nome de parte:** **não sei**. A documentação consultada não confirma nem nega esses filtros e nenhum exemplo autenticado foi executado.
- Fontes consultadas em 26/10/2026: [Glossário DataJud](https://datajud-wiki.cnj.jus.br/api-publica/glossario/), [Portaria CNJ nº 374/2026](https://atos.cnj.jus.br/atos/detalhar/6972).

## 2. DataJud: tribunais, atraso, limite, chave e termos

- **Cobertura documentada:** a página [Endpoints](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/) lista aliases por tribunal nas Justiças Estadual, Federal, do Trabalho, Eleitoral e Militar, além dos tribunais superiores. A lista de endpoints não é uma medição de completude nem de disponibilidade de cada tribunal.
- **Atraso:** **não sei** o atraso real por tribunal ou um prazo máximo. A [Portaria nº 374/2026](https://atos.cnj.jus.br/atos/detalhar/6972) determina remessa diária ao CNJ e dá 180 dias desde a publicação para adequações; isso não garante atualização diária observável na API durante nem após a transição.
- **Chave:** a [documentação de acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) exige o cabeçalho `Authorization: APIKey [Chave Pública]`. A chave publicada no site não foi reproduzida aqui.
- **Limite:** o [Termo de Uso v1.2](https://formularios.cnj.jus.br/wp-content/uploads/2023/11/Termos-de-uso-api-publica-V1.2.pdf), itens 3.13 e 3.14, estabelece teto de 120 requisições por minuto sem autorização escrita e permite ao CNJ limitar chamadas a qualquer tempo. **Cota diária: não sei.**
- **Uso comercial:** o [Termo de Uso v1.2](https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/) diz que a API é para fins legais, não comerciais (item 3.3) e veda exploração comercial da API ou de informação derivada (item 3.8). A Portaria CNJ nº 374/2026, art. 4º, também contém vedação à exploração comercial dos dados.
- **Prazo de guarda de dados não pessoais:** **não sei**; não identifiquei prazo no termo consultado.
- Fontes consultadas em 26/10/2026: [Endpoints DataJud](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/), [Acesso DataJud](https://datajud-wiki.cnj.jus.br/api-publica/acesso/), [Termo de Uso DataJud](https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/), [Portaria CNJ nº 374/2026](https://atos.cnj.jus.br/atos/detalhar/6972).

## 3. DJEN e diários dos tribunais

- O [CNJ descreve o DJEN](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/) como instrumento de publicação de atos judiciais. As [orientações aos tribunais](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/orientacoes-aos-tribunais/) descrevem APIs para autenticação, envio e consulta de comunicações de tribunais, com usuário e senha do sistema Corporativo.
- A documentação citada pelo CNJ é direcionada à integração dos tribunais. **Não sei** se existe uma interface pública distinta para leitura, se o DJEN ou os diários permitem busca por CNPJ, quais campos estruturados de partes expõem, quais limites de consulta se aplicam a um consumidor externo, ou se os termos permitem armazenamento e exibição comercial.
- A exigência de usuário e senha está confirmada para a API de integração descrita nas orientações aos tribunais; **não sei** se se aplica a eventual interface pública de leitura.
- Fontes consultadas em 26/10/2026: [Comunicações Processuais / DJEN — CNJ](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/), [Orientações aos Tribunais — CNJ](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/orientacoes-aos-tribunais/), [Swagger citado pelo CNJ](https://app.swaggerhub.com/apis-docs/cnj/pcp/1.0.0#/default/post_api_v1_comunicacao).

## 4. Temas, súmulas e teses que um programa possa ler

### STJ

- O [conjunto oficial Precedentes Qualificados](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados) disponibiliza `Temas.csv`, `Processos.csv` e dicionários; informa que o campo `sequencialPrecedente` liga temas a processos. A licença indicada é Creative Commons Atribuição.
- A página do recurso [`Temas.csv`](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados/resource/df29da13-7d6b-41ba-ad96-cd1a5bbd191c) registrava em 09/10/2026 que os dados foram atualizados pela última vez em 09/10/2026. **Não sei** qual é o tema mais recente, quais colunas estão no arquivo e qual será a frequência futura: o conteúdo binário do CSV não foi aberto nesta consulta. A página do conjunto também informa acesso automatizado via CKAN API.
- O portal oficial oferece [Súmulas, Súmulas Anotadas e Canceladas](https://processo.stj.jus.br/SCON/sumstj/) e PDFs consultáveis. **Não sei** se há feed ou API pública para novas súmulas; nenhum foi confirmado nas páginas consultadas.

### STF

- A página oficial [Listas de Repercussão Geral](https://portal.stf.jus.br/textos/verTexto.asp?pagina=listas_rg&servico=jurisprudenciaRepercussaoGeral) aponta relações completas de temas e listas por situação. O [Programa Corte Aberta](https://portal.stf.jus.br/hotsites/corteaberta/) tem painéis estatísticos sobre repercussão geral. A notícia oficial do lançamento menciona exportação CSV dos dados dos painéis ([STF lança o Programa Corte Aberta](https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=486780&ori=1)).
- **Não sei** se existe download CSV específico da lista de temas de repercussão geral, API ou feed de temas novos. A página das listas fornece relações para consulta, mas não documenta esses mecanismos. **Não sei** a frequência de atualização e não confirmei um esquema de campos apropriado ao J.
- Para súmulas, a [pesquisa de jurisprudência do STF](https://portal.stf.jus.br/textos/verTexto.asp?pagina=Dicas_de_pesquisa&servico=jurisprudenciaPesquisaGeralNovoPortal) inclui base de súmulas e exportação CSV dos resultados; a exportação é da pesquisa, não confirmação de feed/API de novas súmulas. **Não sei** se há feed ou API.

## 5. Agregadores pagos: dados, preço e licença de exibição

| Fornecedor e fonte oficial consultada | O que a fonte confirma | Preço encontrado | Armazenar e mostrar em SaaS |
| --- | --- | --- | --- |
| [JUDIT — documentação de monitoramento](https://juditdocs.mintlify.app/essentials/tracking), [preços da API](https://judit.io/planos-api/) | Consulta e monitoramento por CPF/CNPJ/OAB/CNJ e busca diária nos tribunais; a página de preços descreve novas ações e monitoramento via DJEN. | Para novas ações, a tabela lista cobrança mensal por faixa: de R$ 15,00 nas faixas de R$ 1 mil e R$ 3 mil a R$ 10,00 nas faixas de R$ 20 mil e R$ 35 mil, mais R$ 0,25 por processo capturado. Não informa uma quantidade de transações para esse serviço. A página indica atualização em abril de 2026. Não é cotação para a Althius. | **Não sei.** Os materiais consultados não confirmam licença para persistir e exibir resultados a clientes de outro SaaS. |
| [Escavador — monitoramento de novos processos](https://api.escavador.com/v2/docs/monitoramento-de-novos-processos), [serviços/API](https://api.escavador.com/servicos) | Permite monitorar termo que pode ser CPF/CNPJ em capas e envolvidos, selecionar tribunais e receber callback de novo processo. Limite padrão indicado: 10.000 movimentações/mês; ao exceder, captura pausa. Não garante que o resultado esteja no polo passivo. | A API aponta para página de serviços, sem preço unitário confirmado nesta consulta. **Não sei** o custo para a operação pretendida. | **Não sei.** A documentação consultada não confirma licença para persistir e exibir resultados a clientes de SaaS. |
| [Jusbrasil Soluções — dados e tipos de eventos](https://api.jusbrasil.com.br/docs/referencias/eventos.html), [webhooks](https://api.jusbrasil.com.br/docs/webhooks/index.html) | Documenta monitoramento por CPF/CNPJ de parte e eventos de distribuições, publicados via webhook. Não há garantia documentada de que o CNPJ consultado corresponde ao polo passivo. | **Não sei** o preço aplicável; a documentação consultada não o publica. | **Não sei.** A documentação consultada não confirma licença para persistir e exibir resultados a clientes de SaaS. |

Os materiais dos fornecedores confirmam recursos da API, não a contratação, a cobertura efetiva, precisão do polo ou direitos de redistribuição necessários ao produto. Não foi feita chamada autenticada nem consulta de processo real.

## 6. Ligar tema a `segment`

- O conjunto do STJ separa arquivos de temas e processos e traz `sequencialPrecedente` para relacioná-los ([conjunto oficial](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados)). **Não sei** se `Temas.csv`/seu dicionário trazem ramo do direito, assunto ou campo que corresponda a `segment`; não li o conteúdo desses arquivos nesta consulta.
- A alternativa inicial coerente com o spec é uma tabela editorial manual com três campos: identificador do tema (tribunal + número), `segment` permitido e justificativa/assunto revisado por advogado. Começar pelos 3–5 segmentos dos primeiros clientes jurídicos; não classificar por IA. Exemplos fictícios: tema tributário sobre ICMS → varejo e indústria; tema sobre planos de saúde → operadoras de saúde. A quantidade e o método manual são proposta de início, não mapeamento já validado.
- Fontes e decisão do escopo consultadas em 26/10/2026: [conjunto de Precedentes Qualificados do STJ](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados) e [spec Sinais de jurimetria](spec.md).

## Pendências que permanecem

1. Abrir diretamente os arquivos/dicionários do STJ para conferir cabeçalhos e data do tema mais recente.
2. Obter confirmação por resposta real do DataJud sobre partes e filtros por CNPJ; a documentação consultada não basta para confirmar o formato atualmente servido.
3. Confirmar se há interface pública de busca do DJEN por parte/CNPJ e seus termos de uso.
4. Pedir aos fornecedores cotação e termos escritos que autorizem o tratamento, armazenamento e exibição em SaaS; confirmar polo passivo e cobertura de U/I.
5. Advogado validar o conteúdo e a política jurídica conforme o ticket 02; esta nota não faz essa validação.
