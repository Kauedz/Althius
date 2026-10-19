# Spec: Conector Slack (Integração) funcional

**Status:** ready-for-agent (código); bloqueado para clientes até o Slack Marketplace

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-comunicacao-e-automacao.md#slack). Substitui o ticket `conexoes-funcionais/22`. Não confundir com o **Canal Slack** (`.scratch/slack-canal/`), onde se conversa com os Agentes.

## Problem Statement

O perfil do Slack em `conectores.ts` está certo:
- `https://mcp.slack.com/mcp`, com o metadado OAuth na raiz;
- sem registro dinâmico;
- `client_secret_post` com PKCE S256;
- os 30 escopos de usuário confirmados ao vivo, inclusive `emoji:read`.

O bloqueio é outro: **só apps internos ou listados no Slack Marketplace usam o servidor MCP**. Um app distribuído e não listado não serve. A listagem exige 10 workspaces instalados ativos durante toda a revisão.

## Solution

1. **Um app Slack só** para o Canal (bot, instalado pelo Administrador) e para a Integração (token de usuário de cada participante), com o MCP ligado. Os segredos `SLACK_MCP_CLIENT_*` recebem os mesmos valores de `SLACK_CHANNEL_CLIENT_*`. Os fluxos e as tabelas continuam separados.
2. **Até a listagem**, roda como app interno no workspace Slack da própria Althius (teste interno).
3. `writes = true`. Enviar mensagem e criar canal pedem Aprovação pela regra padrão.
4. Os itens "não confirmado" do perfil são resolvidos com o que a pesquisa leu ao vivo.

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| App | Um só para Canal e Integração | Dois apps |
| Escopos | Os 30 que o MCP lista (o Slack pede todos) | Subconjunto de leitura, se o Slack aceitar |

## Tickets

01 perfil e testes Deno · 02 cartão e prints · 03 (humano) MCP ligado no app, URL de retorno e teste interno · 04 (humano) submissão ao Marketplace.
