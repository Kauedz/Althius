# Índice dos conectores do catálogo

Atualizado em 19/10/2026. Cada conector tem a sua pasta `.scratch/conector-<id>/` (spec mais tickets). As pesquisas de 19/10 foram feitas com acesso direto aos metadados OAuth e às documentações oficiais: [anúncios](pesquisa-2026-10-19-anuncios.md), [CRMs](pesquisa-2026-10-19-crms.md), [agenda e planilhas](pesquisa-2026-10-19-agenda-e-planilhas.md) e [comunicação e automação](pesquisa-2026-10-19-comunicacao-e-automacao.md).

## Situação por conector

| Conector | Caminho | Situação | Spec |
| --- | --- | --- | --- |
| HubSpot | MCP OAuth (app pré-registrado) | código pronto; falta o humano | `conexoes-funcionais/03` e `09` |
| Notion | MCP OAuth (dinâmico) | código pronto; falta o humano | `conexoes-funcionais/08` |
| Pipedrive | MCP OAuth e chave | código pronto; falta o humano | `conexoes-funcionais/14` |
| **Clay** | MCP OAuth (dinâmico), gasto | código pronto (PR #238); falta o humano | [conector-clay](../conector-clay/spec.md) |
| **Lusha** | chave (já existe) e OAuth (novo), gasto | para construir | [conector-lusha](../conector-lusha/spec.md) |
| **Apollo** | OAuth e chave pelo MCP, gasto | para construir | [conector-apollo](../conector-apollo/spec.md) |
| **Meta Ads** | MCP OAuth com o app Meta da Althius, só leitura | para construir | [conector-meta-ads](../conector-meta-ads/spec.md) |
| **TikTok Ads** | MCP OAuth (dinâmico), gasto, reautoriza a cada 30 dias | para construir | [conector-tiktok-ads](../conector-tiktok-ads/spec.md) |
| **Calendly** | MCP OAuth (dinâmico), revogação declarada | para construir | [conector-calendly](../conector-calendly/spec.md) |
| **Bitrix24** | MCP OAuth (dinâmico), portal fixo | para construir | [conector-bitrix24](../conector-bitrix24/spec.md) |
| **Make** | MCP OAuth (dinâmico), gasto | para construir | [conector-make](../conector-make/spec.md) |
| **Zapier** | MCP OAuth ou token de conexão, gasto | para construir; o real decide o caminho | [conector-zapier](../conector-zapier/spec.md) |
| **Google Calendar** | MCP OAuth (app Google), `access_type=offline` | para construir; clientes só depois do GA do Google | [conector-google-calendar](../conector-google-calendar/spec.md) |
| **Google Sheets** | igual ao Calendar | para construir; clientes só depois do GA | [conector-google-sheets](../conector-google-sheets/spec.md) |
| **Slack (Integração)** | MCP OAuth (o mesmo app do Canal) | para construir; clientes só depois do Marketplace | [conector-slack](../conector-slack/spec.md) |
| **RD Station** | chave (já existe); MCP a sondar | humano primeiro | [conector-rd-station](../conector-rd-station/spec.md) |
| **Zoho CRM** | MCP OAuth (dinâmico), mas URL fora da Índia não confirmada | "Em breve"; humano primeiro | [conector-zoho-crm](../conector-zoho-crm/spec.md) |
| **Salesforce** | MCP OAuth com app em cada org | depende de ADR | [conector-salesforce](../conector-salesforce/spec.md) |
| **Google Ads** | sem MCP público; a política proíbe proxy | "Em breve"; piloto e ADR | [conector-google-ads](../conector-google-ads/spec.md) |
| **Microsoft Teams** | Work IQ (Microsoft 365 inteiro) | depende de decisão | [conector-microsoft-teams](../conector-microsoft-teams/spec.md) |
| **LinkedIn Ads** | sem MCP; REST com OAuth | "Em breve"; depende de ADR | [conector-linkedin-ads](../conector-linkedin-ads/spec.md) |
| **Kommo** | sem MCP; token só de admin | "Em breve" | [conector-kommo](../conector-kommo/spec.md) |
| **Webhooks** | recurso da Althius, não conector | depende de ADR | [conector-webhooks](../conector-webhooks/spec.md) |

## Decisões a confirmar (cada spec já tem a escolha segura)

| # | Decisão | Escolha das specs | Alternativa |
| --- | --- | --- | --- |
| 1 | Padrão das Especialidades nas Integrações que gastam | Ler (não muda os testes antigos) | Propor (atualiza 3 pgTAP antigos) |
| 2 | Ferramentas que gastam (Clay, Lusha, Apollo, TikTok, Zapier, Make, Microsoft 365) | Todas pedem Aprovação, mesmo as de leitura | Confiar no `readOnlyHint` |
| 3 | Escopos do Meta Ads | `ads_mcp_management ads_read` (leitura) | Incluir `ads_management` |
| 4 | Escopos do Apollo | Nenhum explícito; o real decide | Escopos mínimos já listados na spec |
| 5 | OAuth do Lusha | Oferecer ao lado da chave; o real decide | Só a chave |
| 6 | Escrita no Calendar, Sheets e Calendly | Só leitura na primeira versão | Já pedir escrita |
| 7 | Google Ads | Piloto do MCP hospedado; ADR do cliente por Workspace como plano B | Esperar |
| 8 | Microsoft Teams | Cartão "Microsoft 365 (Work IQ)" | Manter "Em breve" |
| 9 | ADRs novos | Escrever sem implementar: cliente OAuth por Workspace (Google Ads, Salesforce), REST com OAuth (LinkedIn, Kommo), Webhooks | Não fazer agora |

## Trabalho comum, que serve a vários conectores

- `ferramentasGastam` e revogação ao desconectar: prontos no `conector-clay`.
- `parametrosDeAutorizacao` (Google): `conector-google-calendar/01`.
- Revogação declarada no perfil (Calendly): `conector-calendly/01`.
- Cliente pré-registrado público (Meta): `conector-meta-ads/01`.
- Motivo do "Em breve" no cartão: `conector-google-ads/03`.
- Follow-up do Clay: revogar ao retirar a Integração ou desativar uma Participação, e fechar a RPC antiga de desconectar.

## Ordem sugerida para construir

1. Os que só dependem de código, com o caminho já confirmado: Lusha, Apollo, Calendly, Bitrix24, Make e TikTok Ads.
2. Os que precisam de uma peça comum: Meta Ads (cliente público), Google Calendar e Sheets (`parametrosDeAutorizacao`).
3. Zapier, Slack (Integração) e RD Station (o caminho por chave).
4. Os ADRs (em paralelo, só para decisão).
