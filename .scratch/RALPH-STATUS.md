# Ralph status — autenticacao-google-email
Updated: 2026-09-25T17:20-03:00
Spend cap: USD 70 (estimativa por tokens reportados pelos halves; não é o gasto real faturado)
Goal: Auth-02 … Auth-08 done (Auth-09 se CRM-03; Auth-10 human)

## Queue
| Ticket | Status | Half/PR | Notes |
|--------|--------|---------|-------|
| Auth-01 | skipped | — | closed na spec (PR #18, merged) |
| Auth-02 | running | ralph/auth-02-workspace-pessoal | Workspace pessoal + bootstrap |
| Auth-03 | queued | | após 02 (série, empilhado em 02) |
| Auth-04 | queued | | após 03 (série, empilhado em 03) |
| Auth-05 | queued | | |
| Auth-06 | queued | | HIBP k-anon |
| Auth-07 | queued | | Google GIS + One Tap |
| Auth-08 | queued | | Turnstile |
| Auth-09 | blocked | — | GATE: CRM-03 está ready-for-agent, não done |
| Auth-10 | human | — | ready-for-human; não spawnar |

## Parallel (max 3)
- Nenhum. Série empilhada: 03∥04 e 07∥08 mexem nos mesmos arquivos (telas de acesso, contexto de auth, Supabase falso); paralelo obrigaria o ticket seguinte a resolver conflitos.

## Alerts
- ALERTA RALPH | Auth-09 | GATE | Blocked-by faltando: CRM-03 (convites) não está done.
- Pré-existente: `20260925100000_documento_com_destinatarios_reais.sql` e `20260925120000_contas_remetentes_unipile.sql` dependem de `20260925130153_real_sequence_access.sql` (timestamp posterior). Um `supabase db reset` do zero falha. Fora do escopo desta corrida.
- Pré-existente: `contas_remetentes_unipile.sql` e `documento_com_destinatarios_reais.sql` (pgTAP) falham num Postgres limpo com `permission denied for schema private` (sem `grant usage on schema private to service_role`). `responsabilidade_exclusiva.sql` passa.

## Loop de teste de banco
Postgres 16 + pgTAP locais, com schema `auth` mínimo do Supabase, via script de sessão (fora do repo): aplica `supabase/migrations/` (repetindo as fora de ordem) e roda `supabase/tests/`.
