# Spec: Conector Google Calendar funcional

**Status:** ready-for-agent (código); bloqueado para clientes até o GA do Google

**Frente:** Conexões funcionais. Segue a spec geral de Conexões, as ADRs 0017 e 0022 e o modelo do [Clay](../conector-clay/spec.md). Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-agenda-e-planilhas.md). Substitui o ticket `conexoes-funcionais/20`.

## Problem Statement

O perfil existe em `conectores.ts` (`https://calendarmcp.googleapis.com/mcp/v1`, cliente pré-registrado), mas:

- O servidor MCP do Calendar está em **Developer Preview**. Os termos do programa proíbem usá-lo em app público e com usuários fora do domínio sem permissão do Google. Até o GA, só dá para testar internamente.
- Sem `access_type=offline` o Google não devolve refresh token, e o Acesso cai em uma hora. Hoje `urlDeConsentimento` não aceita parâmetros extras.
- Os escopos do perfil não são os mínimos. Os de Calendar são **sensíveis**: a verificação leva de 3 a 5 dias úteis, sem CASA.
- A revogação existe (`oauth2.googleapis.com/revoke`) e o mecanismo do Clay já a usa.

## Solution

1. O perfil OAuth ganha `parametrosDeAutorizacao` (por exemplo `{ access_type: 'offline', prompt: 'consent' }`). `urlDeConsentimento` passa a anexá-los. O Google Sheets usa o mesmo campo.
2. Escopos de leitura por padrão: `openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events.freebusy`. A conta vem do `email` (por exemplo, do `id_token` ou do userinfo; não confirmado com token real).
3. `writes = true`. Criar evento (`create_event`) só com a regra da ferramenta, e o escopo de escrita `calendar.events` fica para a decisão abaixo.
4. O catálogo segue `available = false` até o GA e a verificação.

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Escopo | Só leitura e disponibilidade | Já pedir `calendar.events` para os Agentes marcarem reunião |
| Usar no Preview | Só no Workspace da Althius (interno) | Esperar o GA para tudo |

## Testes

- **Deno**: `parametrosDeAutorizacao` na URL de consentimento; a troca devolve o refresh token; a revogação vai ao `oauth2.googleapis.com`.
- **App**: o cartão nos estados de sempre.
- **Real**: interno, com o projeto inscrito no Preview.

## Passos humanos

Estão na seção "Passos humanos" da pesquisa: inscrição no Developer Preview, as APIs ativadas, a tela de consentimento, o cliente OAuth com a URL de retorno e os segredos `GOOGLE_CALENDAR_MCP_CLIENT_ID`/`_SECRET`. Depois do GA, a verificação.
