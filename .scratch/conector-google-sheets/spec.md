# Spec: Conector Google Sheets funcional

**Status:** ready-for-agent (código); bloqueado para clientes até o GA do Google

**Frente:** Conexões funcionais. Mesmo desenho do [Google Calendar](../conector-google-calendar/spec.md), que traz o `parametrosDeAutorizacao`. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-agenda-e-planilhas.md). Substitui o ticket `conexoes-funcionais/27`.

## Problem Statement

O perfil existe (`https://sheetsmcp.googleapis.com/mcp/v1`, pré-registrado, escopos `spreadsheets` e `drive.file`), mas:

- O servidor está em **Developer Preview**, como o do Calendar.
- O servidor **não tem ferramenta para listar ou buscar planilhas**: a pessoa (ou o Agente) precisa da URL da planilha.
- O metadado não anuncia `drive.file`. Também não se sabe se `drive.file` sozinho alcança planilhas que já existem.
- Não se pede `drive` nem `drive.readonly`: são escopos restritos, que exigem CASA anual e semanas de revisão.

## Solution

1. Escopos: `openid email https://www.googleapis.com/auth/spreadsheets.readonly` por padrão, no lugar de `spreadsheets` mais `drive.file`.
2. `parametrosDeAutorizacao` do Calendar (`access_type=offline`).
3. `writes = true`. As ferramentas de escrita (`update_values`…) pedem Aprovação pela regra padrão.
4. A tela de ferramentas explica que os Agentes precisam da URL da planilha (texto fixo do cartão do Sheets).

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Escopo | `spreadsheets.readonly` | `spreadsheets` (escrita) |

## Tickets

- 01: os escopos e a conta do Sheets (bloqueado pelo `conector-google-calendar/01`).
- 02: os testes do cartão e os prints.
- 03: humano, mesmo cliente OAuth do Calendar (os segredos `GOOGLE_SHEETS_MCP_*` podem ter o mesmo par) e validação interna.
