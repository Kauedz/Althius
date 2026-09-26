# Integrações conectadas pelo servidor MCP oficial de cada app

Uma Integração se conecta ao Workspace do mesmo jeito que um app se conecta ao Claude ou ao ChatGPT: a Althius é cliente MCP do servidor MCP remoto oficial do app, e a autorização é por OAuth no próprio app. Como no plano Team do Claude, um Administrador habilita a Integração no Workspace e cada participante conecta a própria conta (o Acesso à Integração); a Althius age com o Acesso de quem pediu, nunca com o de outro participante. O primeiro Acesso fixa o portal do app no Workspace: um Acesso a outro portal é recusado, para que a Sincronização nunca misture dois CRMs, e só o Administrador troca o portal, retirando a Integração e habilitando de novo. Por esse mesmo caminho os Agentes leem e escrevem, sempre sob a Permissão Ler, Propor ou Executar ([ADR-0002](./0002-permissoes-ler-propor-executar.md)); por isso a Conexão é de duas vias mesmo com a Sincronização só lendo ([ADR-0016](./0016-sincronizacao-do-hubspot-so-le-e-respeita-o-responsavel.md)). O token fica só no backend e o retorno do OAuth cai numa Edge Function da Althius, nunca no navegador.

A escolha troca uma integração sob medida por app (API REST, app público, adapter próprio) por um mecanismo único: conectar, mostrar o estado real, listar as ferramentas que o servidor oferece e desconectar. Cada Integração nova passa a ser confirmar que o servidor MCP oficial existe e aceita um cliente de terceiros, e registrar o app de autorização no provedor. Uma Integração sem servidor MCP oficial confirmado aparece como "Em breve".

Neste corte, os Agentes ainda não usam as ferramentas: a Conexão fica pronta e só a Sincronização do HubSpot a consome. Se as ferramentas MCP do HubSpot não conseguirem ler um portal inteiro, ou se o token do MCP não valer para a API REST, a Sincronização usa um app OAuth separado, sem mudar a tela nem o cartão da Integração. Uma pesquisa com fonte oficial decide isso antes da implementação.

## Consequences

- O HubSpot limita um app de autorização MCP não listado no marketplace a 25 instalações; basta para a pré-produção, e a listagem entra antes dos primeiros clientes.
- O servidor MCP age com as permissões de quem autorizou no app, e não com as de um usuário técnico da Althius. Por isso o Acesso é por participante: uma conta com acesso total ao HubSpot não expõe ao Workspace o que os outros não veriam lá.
- Não sabemos se o HubSpot conta as 25 instalações por pessoa ou por portal; com um Acesso por participante, o limite pode chegar antes.

## Considered Options

- **API REST com app público por provedor.** Descartada: um adapter e um app por Integração, e os Agentes ainda precisariam de outra camada de ferramentas.
- **Uma Conexão por Workspace, com a conta de quem conectou valendo para todos.** Descartada: expõe a todos o que só quem conectou enxerga no app.
- **Token colado pelo Administrador (Private App).** Descartado: não é o fluxo de conectar um app que o Cliente conhece do Claude e do ChatGPT.
