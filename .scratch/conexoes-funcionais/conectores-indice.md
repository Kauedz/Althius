# Índice dos conectores do catálogo

Atualizado em 19/10/2026 (fim do dia). O código está na branch local `conectores-em-construcao`, sem PR. O que falta em todos é a parte humana: aplicar as migrations, publicar as funções e o frontend, e testar com conta real. Cada conector tem a sua pasta `.scratch/conector-<id>/` (spec mais tickets). As pesquisas de 19/10 foram feitas com acesso direto aos metadados OAuth e às documentações oficiais: [anúncios](pesquisa-2026-10-19-anuncios.md), [CRMs](pesquisa-2026-10-19-crms.md), [agenda e planilhas](pesquisa-2026-10-19-agenda-e-planilhas.md) e [comunicação e automação](pesquisa-2026-10-19-comunicacao-e-automacao.md).

## Situação por conector

| Conector | Caminho | Situação | Spec |
| --- | --- | --- | --- |
| HubSpot | MCP OAuth (app pré-registrado) | código pronto; falta o humano | `conexoes-funcionais/03` e `09` |
| Notion | MCP OAuth (dinâmico) | código pronto; falta o humano | `conexoes-funcionais/08` |
| Pipedrive | MCP OAuth e chave | código pronto; falta o humano | `conexoes-funcionais/14` |
| **Clay** | MCP OAuth (dinâmico), gasto | código pronto (PR #238); falta o humano | [conector-clay](../conector-clay/spec.md) |
| **Lusha** | chave e OAuth, gasto | código pronto; falta o humano | [conector-lusha](../conector-lusha/spec.md) |
| **Apollo** | OAuth e chave pelo MCP, gasto | código pronto; falta o humano | [conector-apollo](../conector-apollo/spec.md) |
| **Meta Ads** | MCP OAuth com o app Meta da Althius (cliente público), `ads_read` | código pronto; falta o app Meta e o humano | [conector-meta-ads](../conector-meta-ads/spec.md) |
| **TikTok Ads** | MCP OAuth (dinâmico), gasto, reautoriza a cada 30 dias | código pronto; falta o humano | [conector-tiktok-ads](../conector-tiktok-ads/spec.md) |
| **Calendly** | MCP OAuth (dinâmico), revogação declarada, só leitura | código pronto; falta o humano | [conector-calendly](../conector-calendly/spec.md) |
| **Bitrix24** | MCP OAuth (dinâmico), portal fixo (`member_id`/`domain`, a confirmar) | código pronto; falta o portal real | [conector-bitrix24](../conector-bitrix24/spec.md) |
| **Make** | MCP OAuth (dinâmico), gasto | código pronto; falta o humano | [conector-make](../conector-make/spec.md) |
| **Zapier** | MCP OAuth e token de conexão, gasto | código pronto; o real decide o caminho | [conector-zapier](../conector-zapier/spec.md) |
| **Google Calendar** | MCP OAuth (app Google), `access_type=offline`, só leitura | código pronto; clientes só depois do GA do Google | [conector-google-calendar](../conector-google-calendar/spec.md) |
| **Google Sheets** | igual ao Calendar | código pronto; clientes só depois do GA | [conector-google-sheets](../conector-google-sheets/spec.md) |
| **Slack (Integração)** | MCP OAuth (o mesmo app do Canal), 30 escopos de usuário | código pronto; clientes só depois do Marketplace | [conector-slack](../conector-slack/spec.md) |
| **RD Station** | chave (já existe, agora com testes do cartão); MCP a sondar | humano primeiro | [conector-rd-station](../conector-rd-station/spec.md) |
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
| 1 | Padrão das Especialidades nas Integrações que gastam | **Decidido:** Propor no Clay (migration `20261104133000`). Lusha e Apollo seguem em Ler | Propor também no Lusha e no Apollo |
| 2 | Ferramentas que gastam (Clay, Lusha, Apollo, TikTok, Zapier, Make, Microsoft 365) | Todas pedem Aprovação, mesmo as de leitura | Confiar no `readOnlyHint` |
| 3 | Escopos do Meta Ads | `ads_mcp_management ads_read` (leitura) | Incluir `ads_management` |
| 4 | Escopos do Apollo | Nenhum explícito; o real decide | Escopos mínimos já listados na spec |
| 5 | OAuth do Lusha | Oferecer ao lado da chave; o real decide | Só a chave |
| 6 | Escrita no Calendar, Sheets e Calendly | Só leitura na primeira versão | Já pedir escrita |
| 7 | Google Ads | Piloto do MCP hospedado; ADR do cliente por Workspace como plano B | Esperar |
| 8 | Microsoft Teams | Cartão "Microsoft 365 (Work IQ)" | Manter "Em breve" |
| 9 | ADRs novos | **Escritos como propostas:** [0028](../../docs/adr/0028-cliente-oauth-do-workspace-para-apps-que-exigem-o-app-do-cliente.md) cliente OAuth do Workspace, [0029](../../docs/adr/0029-integracao-por-api-rest-com-oauth-quando-nao-ha-mcp.md) REST com OAuth, [0030](../../docs/adr/0030-webhooks-de-saida-assinados.md) webhooks de saída. Aguardam aprovação | Rejeitar ou ajustar |

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

## pgTAP antigos

Em 19/10/2026 o usuário autorizou atualizar asserções de pgTAP antigos quando o catálogo muda de propósito e isso está no ticket. Cada alteração fica registrada no `## Comments` do ticket: Lusha 02, Clay 01, Bitrix24 01, Make 01 e Zapier 01.

## Como os pgTAP foram rodados sem Docker

Num PGlite (Postgres 16.4 em WASM, `npm:@electric-sql/pglite@0.5.10`) com `npm:@electric-sql/pglite-pgtap@0.0.11`, pelo Deno, usando o esqueleto de `scripts/pgtap-local.sh` e as migrations em ordem. Com tudo da branch, foram 138 arquivos verdes. O executor ficou no scratchpad da sessão; se for útil, ele pode entrar em `scripts/` num ticket próprio.
