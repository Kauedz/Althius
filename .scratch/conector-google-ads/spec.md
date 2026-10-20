# Spec: Conector Google Ads

**Status:** needs-info (decisão de produto: qual caminho, ver abaixo)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-anuncios.md#google-ads). Substitui o ticket `conexoes-funcionais/24`.

## Problem Statement

O Google Ads é um dos conectores prometidos, mas hoje não existe um caminho limpo:

- **Sem MCP público hospedado.** O Google tem só um servidor de código aberto (`googleads/google-ads-mcp`), de leitura, com três ferramentas: `list_accessible_customers`, `search` (GAQL) e `get_resource_metadata`. Um **piloto de endpoint hospedado** existe só para quem está na lista; o guia dá 404 para os outros. Os endereços `*.googleapis.com` testados ao vivo dão 404.
- **A política da API do Google Ads proíbe** servidor MCP, wrapper ou proxy de terceiros que só reexponha a API ("programmatic proxy"). Ela exige que cada anunciante ou agência use **o próprio projeto do Google Cloud**. Hospedar o servidor aberto para todos os Workspaces é exatamente o que a política proíbe. Não está confirmado se os Agentes da Althius chamando a API pelo cliente OAuth da Althius contam como proxy, mas o risco é alto.
- **Escopo único.** `adwords` dá leitura **e** escrita. Não existe escopo só de leitura, então a trava fica nas ferramentas e na Aprovação.
- **Acesso por projeto.** O developer token acabou em 09/09/2026. O nível de acesso agora é do projeto do Google Cloud: Explorer (2.880 operações por dia), Basic (15.000 por dia) e Standard (sem teto, com revisão manual e verificação de marca).

## Caminhos possíveis

| Caminho | O que é | Prós | Contras |
| --- | --- | --- | --- |
| **A. Piloto do MCP hospedado** (recomendado para começar) | A Althius pede entrada no piloto e conecta pelo mecanismo genérico (ADR-0017) quando houver URL | Zero código novo e dentro da política | Depende de o Google aceitar, sem prazo |
| **B. Cliente OAuth do próprio Workspace** | Cada Cliente cria um cliente OAuth no **próprio** projeto do Google Cloud. O Administrador cadastra o client id e o secret no Workspace, e a Althius chama a API REST (`googleads.googleapis.com`) ou o servidor aberto com essas credenciais | Atende à letra da política (projeto próprio) | Exige um **ADR novo**: credencial de cliente OAuth por Workspace, fora das ADRs 0017 e 0021. O setup é pesado para o Cliente |
| **C. Cliente OAuth da Althius e API REST** | Um app da Althius para todos | É o mais simples para o Cliente | Provavelmente proibido pela política ("programmatic proxy"); não seguir sem parecer do Google |

## Escolha desta spec

**A agora, B como plano B.** O cartão continua "Em breve", com o motivo "aguardando o servidor oficial do Google". Fazem-se o pedido do piloto (ticket 01) e o ADR do caminho B (ticket 02), e o ADR só é implementado se o piloto não sair.

## Tickets

- 01 (humano): pedir entrada no piloto do endpoint hospedado.
- 02 (agente, decisão): ADR "Cliente OAuth por Workspace para apps que exigem projeto próprio", com as consequências de segurança (segredo do Workspace no Vault, só o Administrador cadastra, rotação).
- 03 (agente): o motivo do "Em breve" no cartão do Google Ads, se a tela ainda não mostrar motivos.

Os tickets de construção vêm depois da decisão: o perfil MCP, se o piloto sair, ou o caminho B.

## Fontes

- `googleads/google-ads-mcp` e o guia do Google Ads API Developer Toolkit (MCP), citados como [7][8] na pesquisa.
- A política da API do Google Ads, "Prohibited practices > Programmatic use", citada como [12] na pesquisa.
- Níveis de acesso [10][11]; revogação em `oauth2.googleapis.com/revoke` (lida ao vivo).
