# Spec: Conector Lusha funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais, leva 2. Segue a spec geral [`conexoes-funcionais/spec.md`](../conexoes-funcionais/spec.md), as ADRs [0017](../../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md), [0021](../../docs/adr/0021-conexao-por-chave-de-api-quando-nao-ha-mcp.md) e [0022](../../docs/adr/0022-permissao-por-ferramenta-do-conector.md), e o modelo da [leva do Clay](../conector-clay/spec.md), que trouxe o "gasta" e a revogação ao desconectar. Substitui o ticket [`conexoes-funcionais/12`](../conexoes-funcionais/issues/12-conectar-o-acesso-ao-lusha.md).

## Problem Statement

O Lusha já conecta por chave de API no servidor MCP (`x-api-key`), mas:

- As ferramentas gastam os **créditos do Lusha do Cliente** (e-mail verificado 1 crédito, telefone 5, empresa 1; busca sem resultado não cobra). O catálogo marca o Lusha como `writes = false`, então uma ferramenta marcada `readOnlyHint` rodaria sem Aprovação.
- O servidor passou a publicar OAuth (`auth.lusha.com`, com registro dinâmico, cliente confidencial, PKCE S256, escopo `mcp` e revogação). A documentação, porém, diz que o OAuth é para Claude, ChatGPT e Codex pelos diretórios de conectores. Não se sabe se um cliente registrado dinamicamente é aceito.
- O cartão não tem testes nem prints, e ninguém conectou uma conta real.

## Solution

1. O Lusha conta como **gasto**: `writes = true` e `ferramentasGastam: true`, como o Clay.
2. Entra o caminho **OAuth** pelo servidor MCP, com registro dinâmico (cliente confidencial, porque o Lusha não aceita `none`), mantendo a chave de API como alternativa: `kinds = {oauth_mcp, api_key}`.
3. Desconectar revoga o token OAuth no `auth.lusha.com` pelo mecanismo da leva do Clay. A chave de API só é apagada, e a pessoa a revoga no Lusha.
4. Testes do cartão e prints. Só fica "disponível" depois do teste real.

## Fluxo visível

- **Administrador**: Habilitar. **Membro**: "Só um Administrador habilita."
- **Participante sem Acesso**: dois botões, **Conectar no Lusha** (OAuth) e **Usar chave de API**, com o OAuth primeiro (ADR-0017).
- **OAuth**: o consentimento acontece em `auth.lusha.com/oauth-ui/authorize` e volta a Conexões com "Lusha conectado.". Se o Lusha recusar um cliente que não está no diretório, a volta mostra "Não foi possível conectar o Lusha" e o cartão continua oferecendo a chave.
- **Chave**: é validada listando as ferramentas antes de ser guardada no Vault. A chave recusada mostra "O Lusha recusou a chave".
- **Conectado**: "Conectado" (não há endpoint documentado da conta), Ver ferramentas (todas "Escreve ou gasta"), Desconectar.
- **Erros**: as mesmas voltas do Clay (recusada, expirada, indisponível). A chave revogada no Lusha vira "Precisa reconectar" na próxima chamada.

## Permissões, isolamento e credenciais

- Toda ferramenta do Lusha pede Aprovação até o Administrador decidir outra regra. Com Ler, nenhuma roda. As ferramentas de filtro e de uso da conta, que segundo o Lusha não gastam, também entram como gasto. É conservador por desenho: o servidor não diz quais gastam.
- A chave e o token são da conta de quem conectou e vivem no Vault. Não há portal fixo (`pins_portal = false`).
- O padrão das Especialidades segue a decisão pendente do Clay (ticket 01 de `conector-clay`): fica em Ler até lá.

## Decisões a confirmar (já com a escolha segura)

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Oferecer o OAuth mesmo sem garantia de que o Lusha aceita cliente de terceiros | Sim, ao lado da chave; o teste real decide se ele fica | Só a chave |
| Lusha conta como gasto | Sim | Confiar no `readOnlyHint` |
| URL do servidor | `https://mcp.lusha.com` (o metadado publica esse recurso) | `https://mcp.lusha.com/mcp`, citado num post do blog |

## Fora do escopo

Os Agentes usarem o Lusha numa Conversa (o caminho `usar_conector` já existe) e a identificação da conta no cartão.

## Testes

- **Deno**: perfil com OAuth confidencial por registro dinâmico (o registro manda `token_endpoint_auth_method` com segredo); `ferramentasGastam`; a chave continua validada por `x-api-key`; revogação no emissor `auth.lusha.com`.
- **pgTAP**: `writes` e `kinds` do Lusha.
- **App**: o cartão com os dois caminhos e em todos os estados.
- **Real**: ticket 04.

## Critérios de aceite para "disponível"

CI verde e migrations aplicadas. Teste real em ao menos um caminho (chave ou OAuth): conectar, ver ferramentas, uma chamada sob Aprovação, desconectar e reconectar. O caminho que falhar sai de `kinds` antes de ligar `available`.

## Fontes

- https://docs.lusha.com/user-guide/mcp/lusha-model-context-protocol-mcp-server
- https://docs.lusha.com/faq/mcp
- https://www.lusha.com/blog/usha-mcp-tools/
- Metadados lidos em 19/10/2026: `https://mcp.lusha.com/.well-known/oauth-protected-resource` e `https://auth.lusha.com` (via `mcp.lusha.com/.well-known/oauth-authorization-server`).
