# Spec: Conector Apollo funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Segue a spec geral [`conexoes-funcionais/spec.md`](../conexoes-funcionais/spec.md), as ADRs 0017, 0021 e 0022 e o modelo da [leva do Clay](../conector-clay/spec.md). Substitui o ticket [`conexoes-funcionais/10`](../conexoes-funcionais/issues/10-conectar-o-acesso-ao-apollo.md).

## Problem Statement

O Apollo já tem perfil: OAuth por registro dinâmico no servidor MCP e chave de API pela REST, com quatro ferramentas REST próprias. O seed traz `kinds = {oauth_mcp, api_key}`. Mesmo assim:

- **Créditos e envio.** O enriquecimento gasta créditos do Apollo do Cliente: 1 a 9 por pessoa, mais empresa e vagas. A busca e o CRM são gratuitos. Há ferramentas que **enviam e-mail e mexem em sequências** pela conta da pessoa. O próprio Apollo recomenda exigir aprovação para tudo o que gasta crédito. Hoje o catálogo marca `writes = false`, e o `readOnlyHint` decide sozinho.
- **Escopos.** O servidor anuncia dezenas de escopos, e o perfil não pede nenhum. Não se sabe o que o Apollo concede sem `scope`.
- **Chave de API.** O MCP do Apollo aceita a chave no cabeçalho `X-Api-Key`, mas **recusa chave com escopo**: só a chave mestra serve. A chave mestra dá acesso total à conta.
- **Sem conferência.** Não há testes do cartão, prints nem teste real.

## Solution

1. O Apollo conta como **gasto**: `writes = true` e `ferramentasGastam: true`. Toda ferramenta, inclusive a busca gratuita, pede Aprovação até o Administrador marcar as que quiser como "sempre" (ADR-0022). Assim, enviar e-mail ou enriquecer nunca sai sem uma pessoa ver.
2. **OAuth sem `scope` explícito**: o consentimento do Apollo mostra as permissões, e o teste real anota o que foi concedido. Se o Apollo exigir escopo, entra o conjunto mínimo de leitura e enriquecimento (abaixo), sem os de envio.
3. **A chave de API passa a ir pelo MCP** (`X-Api-Key`), como no Lusha, no lugar das quatro ferramentas REST da Althius. Assim, as ferramentas e regras são as mesmas nos dois caminhos. O tela avisa que a chave precisa ser a mestra, da própria conta.
4. Desconectar revoga em `mcp.apollo.io/api/v1/oauth/revoke`, pelo mecanismo do Clay.
5. Testes do cartão e prints. "Disponível" só depois do teste real.

## Fluxo visível

O cartão segue o mesmo fluxo do Lusha: dois caminhos, OAuth primeiro. Na chave, o diálogo diz: "Use a chave mestra da sua própria conta do Apollo; chaves com escopo não funcionam no MCP." O Apollo exige login com e-mail corporativo, e uma conta grátis com e-mail pessoal não usa busca nem enriquecimento. Se o erro vier do servidor, o cartão o mostra como "O Apollo recusou…", sem fingir conexão.

## Permissões, isolamento e credenciais

- Toda ferramenta pede Aprovação por padrão. Com Ler, nenhuma roda.
- O token e a chave ficam no Vault e não há portal fixo. O padrão das Especialidades segue a decisão pendente do Clay.

## Decisões a confirmar (já com a escolha segura)

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Apollo conta como gasto, inclusive a busca gratuita | Sim; o Administrador libera a busca uma a uma | Confiar no `readOnlyHint` |
| Escopos do OAuth | Nenhum explícito; o real decide. Se precisar: `read_user_profile contacts_search contact_read mixed_people_api_search mixed_companies_search organizations_search people_match organizations_enrich` | Todos, incluindo envio de e-mail |
| Chave de API | Pelo MCP (`X-Api-Key`), aposentando as ferramentas REST da Althius | Manter a REST |

## Testes

- **Deno**: `ferramentasGastam`; a chave pelo MCP com `X-Api-Key` (validação listando as ferramentas); a revogação no emissor `mcp.apollo.io`.
- **pgTAP**: `writes`.
- **App**: o cartão com os dois caminhos e o texto da chave mestra.
- **Real**: ticket 04.

## Fontes

- https://docs.apollo.io/docs/apollo-mcp
- https://www.apollo.io/developers
- https://knowledge.apollo.io/hc/en-us/articles/45119679436557
- Metadados lidos em 19/10/2026 em `mcp.apollo.io/.well-known/oauth-protected-resource/mcp` e `/.well-known/oauth-authorization-server` (registro dinâmico, revogação, PKCE S256, `none` aceito).
