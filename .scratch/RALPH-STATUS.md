# Ralph status — early-send (CRM × Auth × Canais)
Updated: 2026-09-25T17:35-03:00
Spend cap: USD 70 (estimativa por tokens reportados pelos halves; não é o gasto real faturado)
Goal: primeiro e-mail real (canais-04). Fonte: `.scratch/ORDEM-BUILD-FUNCIONAL.md`

## Queue
| Ticket | Status | Half/PR | Notes |
|--------|--------|---------|-------|
| CRM-01 | skipped | — | closed |
| CRM-02 | skipped | — | substituído por Auth-02…08 |
| Auth-01 | skipped | — | closed (PR #18, merged) |
| Auth-02 | running | ralph/auth-02-workspace-pessoal | Workspace pessoal + bootstrap |
| Auth-03 | queued | | ∥ Auth-04, ambos a partir de Auth-02 |
| Auth-04 | queued | | ∥ Auth-03 |
| Auth-05 | queued | | junta Auth-03 e Auth-04 |
| Auth-06 | queued | | HIBP k-anon |
| Auth-07 | queued | | Google GIS + One Tap; ∥ Auth-08 |
| Auth-08 | queued | | Turnstile; ∥ Auth-07 |
| CRM-04 | queued | | Contas-alvo reais |
| CRM-05 | queued | | Contatos e vínculos |
| CRM-17 | conditional | | só se a FK textual Seq↔Conta bloquear |
| canais-01 | gate-pending | — | in-progress; AC de código todos [x], falta validação com conta real |
| canais-02 | gate-fail | — | ready-for-human (AC de código todos [x]) |
| canais-03 | queued | | in-progress; 2 AC abertos (estados na interface, reconexão) |
| canais-04 | blocked | | Blocked by canais-02 (ready-for-human) e canais-03 |
| Auth-09 | out | — | fora do corte; exige CRM-03 |
| Auth-10 | human | — | ready-for-human; não spawnar |
| CRM-03, 16, 19, 20, 21, 22–24 | out | — | fora do corte / ponteiros |

## Parallel (max 3)
- Auth-03 ∥ Auth-04 e Auth-07 ∥ Auth-08, conforme pedido. O half seguinte (Auth-05, CRM-04) junta as duas branches e resolve conflitos.

## Alerts
- ALERTA RALPH | canais-02 | GATE | ready-for-human: não spawnar. canais-04 depende dele; a cadeia para no gate do canais-04 se o canais-02 não for dado como done por um humano.
- ALERTA RALPH | canais-01 | GATE | in-progress com AC de código completos; pendente validação com conta real (humano). Decidir se conta como done para canais-02/03/04.
- Pré-existente: `20260925100000_documento_com_destinatarios_reais.sql` e `20260925120000_contas_remetentes_unipile.sql` dependem de `20260925130153_real_sequence_access.sql` (timestamp posterior). Um `supabase db reset` do zero falha.
- Pré-existente: `contas_remetentes_unipile.sql` e `documento_com_destinatarios_reais.sql` (pgTAP) falham num Postgres limpo com `permission denied for schema private`. `responsabilidade_exclusiva.sql` passa.

## Loop de teste de banco
Postgres 16 + pgTAP locais, com schema `auth` mínimo do Supabase, via script de sessão (fora do repo): aplica `supabase/migrations/` (repetindo as fora de ordem) e roda `supabase/tests/`.
