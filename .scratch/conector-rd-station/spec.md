# Spec: Conector RD Station CRM

**Status:** ready-for-human (o próximo passo é uma conta de teste)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-crms.md). Substitui o ticket `conexoes-funcionais/17`.

## Problem Statement

O MCP oficial existe: é montado no catálogo de `mcp.rdstationmentor.com`. Sem login, não deu para ver o formato da URL, o metadado OAuth nem a revogação. Hoje a Althius conecta o RD Station por **chave de API** (perfil e ferramentas REST já existem). O plano B é a API v2 do CRM com OAuth e um app na App Store do RD.

## Escolha desta spec

Manter a chave de API, que já existe. Uma conta de teste gera a conexão MCP e sonda a URL. Se ela tiver OAuth utilizável, entra o caminho `oauth_mcp` ao lado da chave.

## Tickets

01 (humano) conta de teste: gerar a conexão MCP e anotar a URL e os metadados · 02 (agente) testes do cartão do RD Station por chave e prints, se faltarem · 03 (depois do 01) caminho MCP.
