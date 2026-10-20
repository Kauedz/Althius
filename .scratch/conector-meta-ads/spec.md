# Spec: Conector Meta Ads funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Segue a spec geral [`conexoes-funcionais/spec.md`](../conexoes-funcionais/spec.md), as ADRs [0002](../../docs/adr/0002-permissoes-ler-propor-executar.md), 0017 e 0022 e o modelo da [leva do Clay](../conector-clay/spec.md). Substitui o ticket [`conexoes-funcionais/13`](../conexoes-funcionais/issues/13-conectar-o-acesso-ao-meta-ads.md).

## Problem Statement

O perfil do Meta Ads existe (OAuth no servidor MCP da Meta, registro "dinâmico" e nenhum escopo), mas:

- **Registro do cliente.** A documentação oficial diz que um cliente de terceiros usa **o próprio app de desenvolvedor Meta**: o `client_id` é o App ID, com o caso de uso *Create & manage ads with ads MCP server* e a URL de retorno em *Facebook Login for Business*. O metadado também anuncia registro dinâmico (`mcp.facebook.com/.well-known/register/ads`), mas a documentação não o oferece a terceiros.
- **Escopos.** O token precisa, no mínimo, de `ads_mcp_management` e de `ads_read` (ou `ads_management`). O perfil não pede nenhum, então o login não traria acesso útil.
- **Verba.** A Meta mostra 7 grupos de ferramentas, e "criação e gestão de anúncios" cria e edita campanhas, conjuntos e anúncios, ou seja, **gasta verba**.
- **Revogação.** O metadado não anuncia revogação; desconectar só apaga o Acesso.
- **Sem conferência.** Não há testes do cartão, prints nem teste real.

## Solution

1. **App Meta da Althius** (pré-registrado): `META_ADS_MCP_CLIENT_ID` é o App ID. Como o token aceita cliente público (`none`) com PKCE, o segredo é opcional. Sem o App ID, o cartão mostra "Precisa configurar", sem tentar o registro dinâmico.
2. **Escopos mínimos, só leitura:** `ads_mcp_management ads_read`. Com eles, os Agentes leem relatórios e contas. A gestão (`ads_management`, `catalog_management`, `business_management`) fica para uma decisão depois do primeiro uso.
3. **Toda ferramenta pede Aprovação** (`writes = true`, que o catálogo já tem, e `ferramentasGastam: true`). Mesmo quando a gestão entrar, nenhuma mudança de verba sai sem uma pessoa aprovar. As regras do servidor MCP no portfólio da Meta (*ads MCP server rules*) são uma segunda trava, configurada pelo dono do portfólio no Meta Business.
4. Desconectar só apaga o Acesso (`nao_suportado`, sem aviso). A pessoa remove a Althius nas integrações de negócios do Facebook, se quiser.
5. Testes do cartão e prints. "Disponível" só depois do teste real.

## Fluxo visível

Habilitar, como nos outros conectores. **Conectar no Meta Ads** abre o diálogo do Facebook Login for Business: a pessoa entra com a conta do Facebook ou Meta Managed Account e aprova as permissões. Na volta, aparece "Meta Ads conectado." e o cartão mostra "Conectado". Ver ferramentas lista todas como "Escreve ou gasta". As voltas de erro são as mesmas dos outros conectores. Sem o App ID configurado, o cartão diz "Precisa configurar".

## Isolamento e credenciais

O Acesso é por participante e enxerga só as contas de anúncio que a pessoa vê na Meta. Não há portal fixo, porque uma pessoa pode ter várias contas de anúncio. O token fica no Vault.

## Decisões a confirmar (já com a escolha segura)

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Escopos | `ads_mcp_management ads_read` (só leitura) | Já incluir `ads_management` (cria e edita campanhas) |
| Registro | App Meta da Althius (App ID como `client_id`) | Tentar o registro dinâmico anunciado no metadado |
| Gasto | Toda ferramenta pede Aprovação | Confiar no `readOnlyHint` |

## Passos humanos (resumo; detalhes no ticket 04)

Criar o app em developers.facebook.com/apps, adicionar o caso de uso do ads MCP server e configurar o Facebook Login for Business com a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`. Gravar o App ID como `META_ADS_MCP_CLIENT_ID`. **Não confirmado:** se `ads_mcp_management` pede revisão do app (Advanced Access) e verificação da empresa para contas fora do app.

## Fontes

- https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started.md
- https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview
- https://www.facebook.com/business/news/meta-ads-ai-connectors
- Metadados lidos em 19/10/2026: `mcp.facebook.com/.well-known/oauth-protected-resource/ads` e `www.facebook.com/.well-known/oauth-authorization-server/ads`.
