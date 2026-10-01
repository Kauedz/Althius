# Pesquisa das fontes de jurimetria (ticket 01): primeiro rascunho

**Consulta:** 01/10/2026, por busca na web (WebSearch).

**Limite deste rascunho.** A rede do ambiente da IA bloqueia os domínios `*.jus.br` (CNJ, DataJud, STF, STJ, PJe) e alguns
sites de terceiros. Por isso **nenhuma fonte primária foi lida na íntegra**. O que está abaixo vem de resumos de busca,
com o link de onde saiu cada um. Tudo marcado **"a confirmar"** precisa ser lido na fonte oficial antes de virar código.
Para fechar o ticket, a rede do ambiente precisa liberar estes domínios: `cnj.jus.br`, `datajud-wiki.cnj.jus.br`,
`api-publica.datajud.cnj.jus.br`, `comunicaapi.pje.jus.br`, `dadosabertos.web.stj.jus.br`, `portal.stf.jus.br` e
`transparencia.stf.jus.br`.

## Veredito provisório (J, U, R, I)

| Sinal | Viável? | Por quê |
| --- | --- | --- |
| **J** (tese nova no setor) | **Provável, sim** | O STJ publica os temas repetitivos em dados abertos (CSV e API CKAN). O STF tem um painel de repercussão geral em "formato de dados abertos". Nada disso precisa da parte do processo. |
| **R** (volume de ações contra a Conta) | **Não pelo DataJud** | A API pública do DataJud, pelos resumos, não traz as partes nem busca por CNPJ. Só sairia por agregador pago (Escavador, JUDIT, Codilo, Jusbrasil), com preço e termos a conferir, ou pelo DJEN, se ele filtrar por parte (não sei). |
| **U** (recuperação judicial, execução fiscal) | **Só por agregador ou DJEN** | Mesmo motivo do R: precisa ligar o processo ao CNPJ da Conta. |
| **I** (condenação grande, ação coletiva) | **Só por agregador ou DJEN** | Mesmo motivo. |

**O que isso muda no spec:** a primeira entrega fica **só com o J** pelas fontes públicas. O R volta à mesa se o
Nan topar um agregador pago, depois de conferir preço e termos (pergunta 5).

## 1. O DataJud devolve as partes do processo?

- **Pelo que os resumos dizem, não.** O glossário público lista número do processo (padrão CNJ), tribunal, grau,
  órgão julgador, data de ajuizamento, nível de sigilo, formato (físico ou eletrônico), sistema de origem, classe e
  assuntos (Tabelas Processuais Unificadas), movimentos (data e complementos) e as datas de atualização do registro.
  Partes, busca por CPF ou CNPJ e documentos dos autos não aparecem.
  Fontes: [chatjuridico.com.br](https://chatjuridico.com.br/como-consultar-datajud-cnj/),
  [judit.io](https://judit.io/blog/artigos/datajud-cnj-api-publica-x-privada-comparacao/),
  [legalsuite.com.br](https://legalsuite.com.br/blog/datajud-api-cnj),
  [tutorial do CNJ (PDF, não lido)](https://www.cnj.jus.br/wp-content/uploads/2023/05/tutorial-api-publica-datajud-beta.pdf).
- **A confirmar** no glossário oficial (`datajud-wiki.cnj.jus.br`).

## 2. Cobertura, atraso, limites e chave do DataJud

- **Endereço:** `https://api-publica.datajud.cnj.jus.br/` seguido do alias de cada tribunal. Não há busca única em
  todos os tribunais: é uma requisição por tribunal.
- **Chave:** uma chave pública do CNJ no cabeçalho `Authorization: APIKey <chave>`, que o CNJ pode trocar a qualquer
  momento. A chave atual fica no wiki.
- **Limites:** há limite de requisições por chave, mas não sei o número.
- **Atraso:** varia por tribunal, de horas a dias. Não sei de cada um.
- Fontes: [datajud-wiki, página Acesso (não lida)](https://datajud-wiki.cnj.jus.br/api-publica/acesso/),
  [legalsuite.com.br](https://legalsuite.com.br/blog/datajud-api-cnj),
  [STJ, dataset da API DataJud](https://dadosabertos.web.stj.jus.br/dataset/api-publica-datajud).

## 3. O DJEN traz as partes? Dá para buscar por CNPJ?

- O Diário de Justiça Eletrônico Nacional (Resolução CNJ 455/2022) tem uma consulta programática **sem
  autenticação** em `comunicaapi.pje.jus.br/api/v1/comunicacao`, com filtros por OAB, número do processo, tribunal e
  janela de datas.
- **Não sei se filtra por nome ou CNPJ da parte.** Um resumo cita "nome", mas fica ambíguo se é nome da parte. Também
  não sei os termos de uso.
- **Cuidado LGPD:** a comunicação processual traz nomes de pessoas físicas. Se for usada, guardar só o que for da
  Conta (CNPJ), nunca de pessoa física.
- Fontes: [CNJ, Comunicações Processuais](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/),
  [chatjuridico.com.br](https://chatjuridico.com.br/api-do-djen-consulta-oficial-cnj/),
  [lexnode.com.br](https://www.lexnode.com.br/blog/api-do-djen),
  [Resolução CNJ 455/2022](https://atos.cnj.jus.br/atos/detalhar/4509).

## 4. Onde saem os temas repetitivos, súmulas e teses (STF e STJ)

- **STJ:** o Portal de Dados Abertos tem o conjunto **"Precedentes qualificados"** com `Temas.csv`, `Processos.csv` e
  os dicionários de cada um, ligados pelo campo `sequencialPrecedente`, e acesso automatizado pela **API CKAN**.
  Fontes: [dataset Precedentes qualificados](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados),
  [portal](https://dadosabertos.web.stj.jus.br/).
  **A confirmar:** os campos do `Temas.csv` (há data de afetação e de julgamento? ramo do direito?) e a frequência
  de atualização.
- **STF:** o programa **Corte Aberta** tem um painel de repercussão geral "em formato de dados abertos", com os temas,
  a situação, os processos representativos e as suspensões nacionais.
  **Não sei** se há download em CSV ou API, ou se é só o painel.
  Fontes: [painel de repercussão geral](https://transparencia.stf.jus.br/extensions/repercussao_geral/repercussao_geral.html),
  [Corte Aberta](https://portal.stf.jus.br/hotsites/corteaberta/),
  [listas de repercussão geral](https://portal.stf.jus.br/textos/verTexto.asp?servico=jurisprudenciaRepercussaoGeral&pagina=listas_rg).
- **Súmulas novas:** não pesquisado ainda.

## 5. Agregadores pagos

| Agregador | O que dizem os resumos | Preço | Termos (guardar e mostrar a terceiros?) |
| --- | --- | --- | --- |
| Escavador | API v1 e v2 com busca por CPF, CNPJ, OAB, nome ou número; documentação pública e SDK em Python | Não sei | Não sei |
| JUDIT | Busca por CPF, CNPJ, OAB ou número CNJ; monitoramento por webhook | Não sei | Não sei |
| Codilo | Busca por OAB, CPF, CNPJ, nome da parte e precatório; tribunais superiores, estaduais e federais | Não sei | Não sei |
| Jusbrasil Soluções | Consulta e monitoramento, distribuição de processos novos; contratação B2B consultiva, sem autosserviço | Não sei | Não sei |

Fontes: [api.escavador.com](https://api.escavador.com/), [judit.io](https://judit.io/blog/artigos/api-judit-consultas-monitoramento-processos/),
[codilo.com.br](https://www.codilo.com.br/), [conteudo.jusbrasil.com.br/api](https://conteudo.jusbrasil.com.br/api).

O "distribuição de processos novos" (Jusbrasil) e o monitoramento por webhook (JUDIT) são exatamente o que o R e o U
pedem. Antes de escolher um, falta saber o preço por consulta e se os termos deixam guardar o dado e mostrá-lo ao
cliente da Althius.

## 6. Como ligar tema a setor da Conta (`segment`)

- **Não sei** se o `Temas.csv` do STJ traz um campo de área ou ramo que ajude.
- Proposta para começar: uma **tabela mantida por gente**, de assunto ou tema para os segmentos de Conta que a Althius
  usa. Por exemplo, um tema de ICMS ligado a varejo e indústria, ou um tema de plano de saúde ligado a operadora de
  saúde. Começar com os 3 a 5 segmentos dos primeiros clientes jurídicos. Nada de classificação por IA no começo
  (decisão do spec).

## Próximos passos

1. O Nan libera os domínios da lista no topo, na configuração de rede do ambiente.
2. A IA lê as fontes oficiais e troca cada "a confirmar" e "não sei" por resposta com a fonte primária.
3. O Nan decide se vale cotar um agregador pago para o R e o U.
