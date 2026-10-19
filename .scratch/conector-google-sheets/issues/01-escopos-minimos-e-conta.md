# 01: escopos minimos e conta

**What to build:** Trocar os escopos do perfil do Sheets por `openid email spreadsheets.readonly`, com a conta pelo `email` (mesmo caminho do `conector-google-calendar/02`).

**Blocked by:** conector-google-calendar 01 e 02

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).** Escopos `openid email spreadsheets.readonly`, no lugar de `spreadsheets` e `drive.file`. Usa os mesmos `parametrosDeAutorizacao` e a mesma conta pelo userinfo do Calendar. Testado em `integration-connect/handler-google.test.ts`.
