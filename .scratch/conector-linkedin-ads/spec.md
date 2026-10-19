# Spec: Conector LinkedIn Ads

**Status:** needs-info (sem MCP oficial; o caminho depende de um ADR)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-anuncios.md#linkedin-ads). Substitui o ticket `conexoes-funcionais/25`.

## Problem Statement

- **Sem MCP.** O LinkedIn não tem servidor MCP oficial (os endereços candidatos dão 404; só existem servidores de terceiros).
- **A alternativa é a Marketing API (REST)**, com um app da Althius aprovado no programa Advertising API:
  - a camada Development permite leitura ilimitada, mas edição em no máximo 5 contas de anúncio;
  - a camada Standard é pedida por chamado;
  - escopos de leitura: `r_ads` e `r_ads_reporting`; `rw_ads` escreve e gasta.
- **Revogação.** `oauth/v2/revoke` responde ao vivo, mas não há página oficial (não confirmado).
- **ADRs.** Nenhum ADR cobre "REST pelo OAuth de um app da Althius": a 0017 é MCP, e a 0021 é chave de API.

## Escolha desta spec

O cartão continua **"Em breve"**, com motivo, pelo `conector-google-ads/03`. Se o produto quiser o LinkedIn Ads antes de existir um MCP oficial:
1. ADR "Integração por API REST com OAuth de app da Althius", com as ferramentas REST da Althius como as do HubSpot por chave (`rest.ts`), mas pelo token OAuth;
2. só leitura (`r_ads r_ads_reporting`) na primeira versão;
3. pedido de acesso ao Advertising API (humano).

## Tickets

- 01 (humano): inscrever o app da Althius no Advertising API, com o caso de uso de relatórios.
- 02 (agente, decisão): ADR do caminho REST com OAuth, sem implementar antes da aprovação.
