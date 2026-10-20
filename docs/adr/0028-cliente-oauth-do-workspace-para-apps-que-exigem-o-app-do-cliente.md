---
status: proposed
---

# Cliente OAuth do Workspace para apps que exigem o app do próprio Cliente

Complementa a [ADR-0017](./0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md). Pela 0017, a Althius tem **um** cliente OAuth por Integração, vindo do registro dinâmico ou de um app que a Althius cria no provedor. Alguns apps não aceitam isso:

- **Salesforce.** O servidor MCP oficial é o mesmo para todas as orgs, mas não há registro dinâmico: o admin de cada org cria um External Client App, com PKCE e JWT.
- **Google Ads.** A política da API proíbe servidor MCP ou proxy de terceiros que reexponha a API, e exige que cada anunciante ou agência use **o próprio projeto do Google Cloud**.

Para esses apps, o **cliente OAuth é do Workspace**. Um Administrador cadastra o client id e o secret do app que o Cliente criou na conta dele. Eles ficam no Vault e nunca voltam ao navegador, a uma resposta ou a um log. Cada participante continua conectando o **próprio** Acesso, com a própria conta, por esse cliente (ADR-0017). O perfil da Integração diz se o cliente é da Althius ou do Workspace (por exemplo, `cliente: 'do_workspace'`). Sem o cliente cadastrado, o cartão mostra "Precisa configurar" e diz o que o Administrador precisa criar no app.

## Regras

- Só um Administrador ativo cadastra, troca ou apaga o cliente do Workspace. Todo Participante vê só se ele existe, nunca os valores.
- Um Workspace nunca usa o cliente de outro. A tentativa de conexão guarda qual cliente abriu o consentimento, e a volta só troca o código com ele.
- Trocar o cliente do Workspace leva todos os Acessos daquela Integração a "Precisa reconectar", porque um token emitido para um cliente não renova com outro. Desconectar e revogar usam o cliente que emitiu o token.
- Retirar a Integração apaga o cliente do Workspace junto com os Acessos.

## Consequences

- O Cliente faz mais trabalho: criar o app na conta dele, cadastrar a URL de retorno da Althius e conceder as permissões. A tela precisa de um passo a passo por app.
- O Administrador passa a lidar com um segredo de app. É diferente do "token colado" que a ADR-0017 descartou: o segredo é do **app**, e nenhum Acesso de participante vem dele sem o consentimento da própria pessoa.
- No Google Ads, isso atende à letra da política (projeto próprio). Se agentes da Althius chamando a API por esse cliente contam como "proxy" **não está confirmado**: antes de construir, vale pedir parecer ao Google ou entrar no piloto do MCP hospedado (`conector-google-ads/01`).

## Considered Options

- **Um app da Althius para todos.** O Salesforce não oferece, e no Google Ads a política parece proibir.
- **Token colado pelo Administrador.** Descartado pela ADR-0017: expõe a todos o que só quem conectou enxerga.
- **Não oferecer esses apps.** Possível, mas o Salesforce é um CRM comum entre os Clientes da Althius.
