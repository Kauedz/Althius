---
status: proposed
---

# Integração por API REST com OAuth quando o app não tem servidor MCP

Complementa a [ADR-0017](./0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md) e a [ADR-0021](./0021-conexao-por-chave-de-api-quando-nao-ha-mcp.md). A 0017 conecta pelo servidor MCP oficial, e a 0021 aceita a chave de API do próprio participante quando não há MCP utilizável. Alguns apps prometidos no catálogo não têm MCP **nem** chave pessoal, só uma API REST com OAuth: o **LinkedIn Ads** (Marketing API, com app aprovado no Advertising API) e, talvez, o **Kommo**.

Para esses apps, a Althius conecta o Acesso pelo **OAuth de um app da própria Althius**, como na 0017 (consentimento no app, token no Vault, um Acesso por participante). Os Agentes usam **ferramentas REST definidas pela Althius** (`_shared/integracoes/rest.ts`), as mesmas do caminho por chave da 0021, agora autenticadas com o token OAuth. As ferramentas seguem a regra da [ADR-0022](./0022-permissao-por-ferramenta-do-conector.md): cada uma declara se escreve ou gasta, e na dúvida escreve. A primeira versão de cada app é **só de leitura** (no LinkedIn, `r_ads r_ads_reporting`, sem `rw_ads`).

## Regras

- Só vale para app sem servidor MCP oficial. Quando o app ganhar um, a Integração migra para a 0017 e as ferramentas REST saem.
- Só vale se o OAuth do app for **por usuário**. Um app cujo OAuth só dá acesso de administrador da conta (o Kommo, pelo que a pesquisa de 19/10/2026 mostrou) não serve: cada participante tem de agir com a própria conta. Nesse caso, a Integração continua "Em breve".
- O pedido de acesso ao programa do app (o Advertising API do LinkedIn) é passo humano, antes de qualquer código.

## Consequences

- Volta a existir código por app (as ferramentas REST), o que a 0017 queria evitar. O custo fica restrito a poucos apps e a poucas ferramentas de leitura.
- As ferramentas da Althius podem divergir da API do app. Cada uma precisa de teste contra a documentação e de uma validação real antes de ficar disponível.
- No LinkedIn, a camada Development limita a edição a 5 contas de anúncio, e a Standard sai por chamado. Basta para a leitura.

## Considered Options

- **Servidor MCP de terceiros** (código aberto que embrulha a API). Descartado: não é oficial, e a Althius passaria a depender de um intermediário com os tokens do Cliente.
- **Esperar o MCP oficial.** É o padrão enquanto o produto não precisar desses apps. Este ADR só vale se o produto decidir que precisa.
