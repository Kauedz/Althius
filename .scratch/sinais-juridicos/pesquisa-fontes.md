# Pesquisa das fontes de jurimetria (ticket 01)

**Consulta:** 01/10/2026.

**Como foi feita.** O primeiro rascunho saiu de busca na web. A rede do ambiente da IA bloqueia `*.jus.br`. Por isso o
Nan refez a pesquisa no Antigravity, direto nas fontes primárias: páginas oficiais `.jus.br` e documentação oficial
dos fornecedores. Cada resposta traz o trecho literal da página, e é esse trecho que vai abaixo, entre aspas. A IA não
abriu as páginas; só transcreveu e organizou.

**Legenda.**

- **Confirmado:** há trecho literal em página oficial.
- **Não sei:** a fonte consultada não comprovou o ponto. Isso não quer dizer que o recurso não existe.

**Links.** O texto colado veio sem os endereços de várias páginas. Os que faltam estão marcados "(link a incluir)".
Nenhum endereço foi deduzido.

## Veredito (J, U, R, I)

| Sinal | Viável? | Por quê |
| --- | --- | --- |
| **J** (tese nova no setor) | **Provável, sim, com um risco** | O STJ publica o `Temas.csv` em dados abertos, com licença Creative Commons Atribuição e link de download direto. O risco é o frescor: a página do arquivo diz que os dados foram atualizados pela última vez em 24/10/2025. Também falta conferir as colunas. No STF, só o painel e a consulta foram confirmados, sem CSV ou API dos temas. Súmula nova não tem feed nem API em nenhum dos dois tribunais. |
| **R** (volume de ações contra a Conta) | **Só por agregador pago** | O DataJud fica fora: a norma do CNJ **veda a exploração comercial** dos dados (confirmado), e a Althius é um software comercial. O DJEN também fica fora: a API documentada é a dos tribunais, com usuário e senha, e não foi confirmada uma rota pública de leitura. JUDIT e Jusbrasil confirmam aviso por webhook de processo novo **vinculado** a um CNPJ. Nenhum dos dois garante que a Conta está no polo passivo. Preço e licença para mostrar o dado a clientes: não sei, para todos. |
| **U** (recuperação judicial, execução fiscal) | **Só por agregador pago** | Mesmo caminho do R. Também depende da política do ticket 02. |
| **I** (condenação grande, ação coletiva) | **Só por agregador pago** | Mesmo caminho do R. Também depende da política do ticket 02. |

**O que isso muda no spec (proposta, quem decide é o Nan).** O spec diz "Primeira entrega: J e R". Pela pesquisa, o R
só sai com um agregador contratado. A proposta é a primeira entrega ser **só o J**. O R entra depois que um agregador
for cotado e os termos dele permitirem mostrar o dado ao cliente da Althius (decisão 4 do Nan).

## 1. O DataJud devolve as partes do processo? Que campos traz?

- **Campos do glossário oficial (confirmado).**
  - Do processo: `id`, `tribunal`, `numeroProcesso`, `dataAjuizamento`, `grau` e `nivelSigilo`.
  - Formato e sistema: `formato` (`codigo`, `nome`) e `sistema` (`codigo`, `nome`).
  - Classe e assuntos: `classe` (`codigo`, `nome`) e `assuntos` (`codigo`, `nome`).
  - Órgão julgador: `orgaoJulgador` (`codigo`, `nome`, `codigoMunicipioIBGE`).
  - Movimentos: `movimentos` (`codigo`, `nome`, `dataHora`).
    - `complementosTabelados`: `codigo`, `descricao`, `valor` e `nome`.
    - `orgaoJulgador`: `codigoOrgao` e `nomeOrgao`.
  - Controle interno: `dataHoraUltimaAtualizacao` e `@timestamp`. O glossário diz: "Os atributos abaixo são utilizados
    para controle interno da aplicação".
- **Partes: não sei se a API devolve.** O glossário não lista parte, polo, nome, CPF nem CNPJ.
  - A Portaria CNJ nº 374/2026, de agosto de 2026, passou a prever o dado: "XI – polo ativo e polo passivo, quando
    pessoas jurídicas."
  - A pesquisa não comprovou que esses campos já aparecem na resposta da API.
  - Para a Althius, isso não muda o veredito, por causa da vedação comercial (item 2).
- **Busca por CNPJ ou nome de parte: não sei.** A documentação não confirma o filtro, nem a falta dele.
- Fontes:
  - Glossário do DataJud (link a incluir).
  - Portaria CNJ nº 374/2026 (link a incluir).

## 2. Cobertura, atraso, limites, chave e termos do DataJud

- **Cobertura (confirmado).** A API tem um endereço por tribunal. A página "Endpoints" lista os tribunais superiores e
  as Justiças Federal, Estadual, do Trabalho, Eleitoral e Militar, com o alias de cada um. Exemplos: `api_publica_stj`,
  `api_publica_trf1`, `api_publica_tjsp` e `api_publica_trt2`. A página diz: "A url principal de acesso é a url
  https://api-publica.datajud.cnj.jus.br/ e deverá ser seguida de um aliase correspondente ao Tribunal que deseja obter
  os dados processuais." Fonte: página Endpoints do wiki (link a incluir).
- **Chave (confirmado).** O cabeçalho é `Authorization: APIKey [Chave Pública]`. A chave vigente fica na seção "API Key"
  da [página Acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso/). Ela não foi copiada para cá.
- **Limite.**
  - Confirmado, pelo termo de uso v1.2, itens 3.13 e 3.14: "O usuário concorda em não realizar mais de 120 requisições
    por minuto, a menos que tenha autorização expressa por escrito do CNJ." O termo diz também: "O CNJ se reserva o
    direito de limitar o número de requisições por usuário ou por chave de API a qualquer momento e sem aviso prévio."
  - Cota diária: não sei.
- **Atraso por tribunal.**
  - Não sei: não há tabela oficial do atraso de cada tribunal.
  - A Portaria 374/2026 manda remessa diária: "Os dados do DataJud serão encaminhados ao CNJ de forma diária." Ela dá
    aos tribunais 180 dias, contados da publicação, para se adequarem. Isso não garante um atraso máximo na API.
- **Termos de uso: uso comercial vedado (confirmado).** Os trechos são da Portaria 374/2026 (art. 4º) e do termo v1.2
  (itens 3.8 e 4.2):
  - "Os dados são fornecidos exclusivamente para fins legais, não comerciais e autorizados"
  - "É vedada a modificação, distribuição, venda ou qualquer tipo de exploração comercial dos dados disponibilizados."
  - Prazo de guarda para dados não pessoais: não sei.
- Fontes: termo de uso v1.2 (link a incluir) e Portaria CNJ nº 374/2026 (link a incluir).

## 3. O DJEN traz as partes? Dá para buscar por CNPJ? Quais os termos?

A API documentada pelo CNJ é a interface dos tribunais. Ela serve para autenticar, enviar e consultar comunicações. A
pesquisa não a tratou como API pública de busca.

- **Autenticação (confirmado para a integração dos tribunais).** O CNJ diz: "Para autenticação na API, é necessária a
  disponibilização de usuário e senha no sistema de controle de acesso do CNJ (Corporativo) com permissão de acesso à
  plataforma." Não sei se a mesma exigência vale para uma rota pública de leitura.
- **Filtros, campos da resposta e busca por parte ou CNPJ: não sei.** O CNJ aponta a
  [documentação em Swagger](https://app.swaggerhub.com/apis-docs/cnj/pcp/1.0.0#/default/post_api_v1_comunicacao), mas a
  página não abriu. A pesquisa também não usou os filtros do Domicílio Judicial Eletrônico, que é outro sistema.
- **Limite de requisições: não sei.**
- **Uso comercial: não sei.** Nenhum termo encontrado autoriza guardar, redistribuir ou usar comercialmente as respostas.
- **LGPD (vale se um dia for usado):** a comunicação processual traz nomes de pessoas físicas. Só o que for da Conta
  (CNPJ) pode ser guardado.
- Fonte: orientações do CNJ aos tribunais (link a incluir).

## 4. Onde saem os temas repetitivos, súmulas e teses de forma que um programa leia

### STJ: "Precedentes qualificados"

- **O arquivo existe (confirmado).** O conjunto tem o `Temas.csv` ("Temas - informações gerais a respeito dos temas") e
  o `dicionario-temas.csv`. O download direto publicado é
  `https://dadosabertos.web.stj.jus.br/dataset/4238da2f-c07b-4c1a-b345-4402accacdcf/resource/df29da13-7d6b-41ba-ad96-cd1a5bbd191c/download/temas.csv`.
  Fontes: o [conjunto](https://dadosabertos.web.stj.jus.br/dataset/precedentes-qualificados) e o
  [portal](https://dadosabertos.web.stj.jus.br/).
- **Licença (confirmado).** "Licença | Creative Commons Atribuição". A licença CC BY permite uso comercial, desde que a
  fonte seja citada. A versão exata da licença não foi informada.
- **Frescor.**
  - Confirmado: a página do arquivo diz "Dados atualizados pela última vez | 24 de outubro de 2025".
  - A página do conjunto mostra metadados atualizados em 23/09/2026, mas isso não é o dado.
  - A frequência de atualização não é declarada.
- **Colunas: não sei.** O dicionário não abriu. Não se sabe se há data de afetação, data de julgamento, situação do tema
  ou ramo do direito.
- **API CKAN.**
  - Confirmado que existe: "é possível o acesso automatizado aos dados em formato legível por máquina, por meio da CKAN
    API".
  - A chamada ao conjunto não respondeu na pesquisa, então nenhum endpoint foi testado.

### STF: repercussão geral

- **Exportação em CSV (confirmado para o programa Corte Aberta em geral).** O STF diz: "Outra novidade é a possibilidade
  de baixar os dados no formato .csv, o que atende aos requisitos de dados abertos."
  - Download da lista completa de temas e API de temas: não sei.
  - O [painel de repercussão geral](https://transparencia.stf.jus.br/extensions/repercussao_geral/repercussao_geral.html),
    as [listas](https://portal.stf.jus.br/textos/verTexto.asp?servico=jurisprudenciaRepercussaoGeral&pagina=listas_rg)
    e a página "Todos os temas" não abriram na pesquisa.
- **Campos (número, título, situação, datas, ramo) e frequência de atualização: não sei.**
- Fontes: [Corte Aberta](https://portal.stf.jus.br/hotsites/corteaberta/) e a notícia oficial sobre o Corte Aberta
  (link a incluir).

### Súmulas novas

- **STF.**
  - Confirmado: a pesquisa de jurisprudência busca em "Acórdãos, Súmulas, Decisões monocráticas e Informativos".
  - Ela ordena por mais recentes e exporta em CSV.
  - Feed, RSS ou API de súmulas novas: não sei.
  - Fontes: "Dicas de pesquisa" do STF e a notícia sobre a base de súmulas (links a incluir).
- **STJ.**
  - Confirmado: o portal tem consulta a "Súmulas · Súmulas Anotadas · Enunciados · Súmulas Canceladas".
  - Conjunto aberto, RSS ou API de súmulas novas: não sei.
  - Fonte: portal do STJ (link a incluir).

### TST: IRR e IAC (extra)

- **Confirmado:** há uma página oficial de consulta e um índice em PDF dos IRR e IAC. A notícia do TST diz: "Os
  usuários podem identificar a tese jurídica em incidentes de recursos de revista repetitivos já julgados, a questão
  jurídica afetada e os processos representativos das controvérsias".
- CSV, API ou dicionário de campos: não sei.
- Fontes: a notícia do TST e o índice em PDF (links a incluir).

## 5. Agregadores pagos

| | Escavador | JUDIT | Codilo | Jusbrasil Soluções |
| --- | --- | --- | --- | --- |
| **Busca por CNPJ** | Confirmado | Confirmado | Confirmado | Confirmado |
| **Aviso de processo novo por CNPJ** | Não sei | Confirmado | Não sei | Confirmado |
| **Preço** | Sob consulta | Por CNPJ: sob consulta | Sob consulta | Sob consulta |
| **Pode guardar e mostrar a clientes de um SaaS?** | Não sei | Não sei | Não sei | Não sei |
| **Cláusula de LGPD para o contratante** | Não sei | Não sei | Não sei | Não sei |

O que dizem os trechos sobre o aviso de processo novo:

- **Escavador.** Monitora "processos, nomes, e documentos em tribunais", com callbacks "para enviar atualizações do
  processo". Não garante que avisa só processo novo.
- **JUDIT.** "O Monitoramento por Documento detecta o nascimento de novos processos vinculados a um CPF, CNPJ ou OAB."
  Também diz: "Sempre que um novo processo for ajuizado e a Judit detectar, você recebe a notificação por webhook."
- **Codilo.** Só monitora um processo já identificado: "Este endpoint permite cadastrar um novo processo (CNJ) para
  monitoramento contínuo."
- **Jusbrasil.** "Quando um processo novo é detectado para um documento monitorado, a API envia um evento via webhook
  contendo os dados do processo."

Sobre preço, a JUDIT publica um exemplo: "Monitoramento processual: R$ 0,69/mês". Ele é **por processo** (número CNJ),
não por CNPJ monitorado, e não deve ser usado para estimar o R.

**O que isso quer dizer para o R e o U.**

- **Quem atende:** JUDIT e Jusbrasil são os dois que confirmam aviso de processo novo por CNPJ.
- **O polo:** nenhum dos dois garante que a Conta está no polo passivo ("contra"). O adaptador teria de conferir o polo
  no dado de cada processo.
- **O que falta saber:** o preço por CNPJ monitorado e se o contrato deixa mostrar o dado ao cliente da Althius.
- **LGPD:** a Jusbrasil entrega "informações das partes". O adaptador descarta toda parte pessoa física (decisão do
  spec).

Fontes:

- Escavador: suporte oficial, API Business e documentação Business (links a incluir).
- JUDIT: consulta histórica, monitoramento por documento, relatório de consumo e introdução à API (links a incluir).
- Codilo: site oficial, cadastro de monitoramento, casos de uso e política de privacidade (links a incluir).
- Jusbrasil: página da API e documentação do monitoramento de CPF/CNPJ (links a incluir).

## 6. Como ligar tema a setor da Conta (`segment`)

- **Não sei** se o `Temas.csv` do STJ traz ramo do direito ou área; o dicionário não abriu.
- **Proposta para começar:** uma **tabela mantida por gente** que liga assunto ou tema aos segmentos de Conta da
  Althius. Exemplos fictícios:
  - um tema de ICMS ligado a varejo e indústria;
  - um tema de plano de saúde ligado a operadora de saúde.
- Começar com os 3 a 5 segmentos dos primeiros clientes jurídicos. Nada de classificação por IA no começo (decisão do
  spec).

## O que falta

1. **Links:** colar os endereços marcados "(link a incluir)", tirados da pesquisa original.
2. **`Temas.csv` do STJ:** abrir o arquivo e o dicionário, e anotar as colunas e a data do tema mais recente. Isso
   confirma o frescor do J. Pode virar o primeiro passo do ticket 03, se o ticket 01 fechar antes.
3. **Agregador (decisão do Nan):** cotar JUDIT e Jusbrasil. Perguntar o preço por CNPJ monitorado, se dá para filtrar
   pelo polo passivo, e se o contrato deixa guardar o dado e mostrá-lo a clientes de um SaaS.
