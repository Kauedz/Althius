# Conexão por chave de API quando o app não tem MCP utilizável

A ADR-0017 escolheu o servidor MCP oficial de cada app, com OAuth, como o caminho para conectar uma Integração, e descartou o token colado pelo Administrador como caminho principal. Para cobrir CRMs e fontes de dados sem servidor MCP utilizável por um cliente de terceiros (RD Station CRM, Pipedrive, Lusha) e, como alternativa, o HubSpot por Private App e o Apollo, a Althius aceita também a **chave de API do próprio participante**, a pedido do Nan. Ela continua sendo um Acesso por participante (nunca uma chave do Workspace inteiro): só é aceita de quem tem Participação ativa, é validada chamando o app antes de ser guardada, fica no Vault e nunca volta ao navegador, a uma resposta da API ou a um log. Quais caminhos cada Integração aceita é dado do banco (`private.integration_connection_profiles.kinds`) e dos perfis da Edge Function. Os Agentes usam a chave pelo mesmo módulo (`_shared/integration-access.ts`) e sob a mesma Permissão Ler, Propor ou Executar (ADR-0002).

## Consequences

- A chave age com as permissões da conta de quem a criou no app. Por isso a tela pede uma chave "da sua própria conta", e o cartão mostra a conta identificada.
- Uma chave revogada no app aparece como "Precisa reconectar" na próxima chamada recusada, igual ao Acesso por OAuth.
- No HubSpot e no Pipedrive o primeiro Acesso fixa o portal do Workspace pelos dois caminhos: uma chave de outro portal é recusada, como manda a ADR-0017.
