# Ralph status — early-send (CRM × Auth × Canais)
Updated: 2026-09-25T20:40-03:00
Spend cap: USD 70 (estimativa por tokens reportados pelos halves; não é o gasto real faturado)
Goal: primeiro e-mail real (canais-04). Fonte: `.scratch/ORDEM-BUILD-FUNCIONAL.md`

## Queue
| Ticket | Status | Half/PR | Notes |
|--------|--------|---------|-------|
| CRM-01 | skipped | — | closed |
| CRM-02 | skipped | — | substituído por Auth-02…08 |
| Auth-01 | skipped | — | closed (PR #18, merged) |
| Auth-02 | done | ralph/auth-02-workspace-pessoal · PR #19 (draft) | AC 7/7; pgTAP 19/19; suíte 530/530; **pending-apply** migration 20260925140000 |
| Auth-03 | done (código) | ralph/auth-03-cadastro-com-senha · PR #20 (draft, base Auth-02) | AC 7/8; suíte 540/540; 1 AC depende de e-mail para conta existente (Send Email Hook → Auth-10) |
| Auth-04 | done | ralph/auth-04-entrar-com-senha-ou-codigo · PR #21 (draft, base Auth-02) | AC 5/5; suíte 537/537 |
| Auth-05 | done | ralph/auth-05-esqueci-a-senha · PR #22 (draft, base Auth-03; inclui junção com Auth-04) | AC 5/5; suíte 552/552 |
| Auth-06 | done | ralph/auth-06-senhas-vazadas · PR #24 (draft, base Auth-05) | AC 6/6; suíte 560/560; criou `ServicosDoNavegador` |
| Auth-07 | done | ralph/auth-07-continuar-com-google · PR #26 (draft, base Auth-06) | AC 6/6; suíte 570/570; pending-human: Client ID Google (Auth-10) |
| Integração 07+08 | done | ralph/auth-integracao · PR #27 (draft, base Auth-07) | junção feita pela matriz; suíte 579/579 |
| Auth-08 | done | ralph/auth-08-captcha-invisivel · PR #25 (draft, base Auth-06) | AC 4/4; suíte 569/569; pending-human: Turnstile (Auth-10) |
| CRM-04 | done | ralph/crm-04-contas-alvo-reais · PR #28 (draft, base integração Auth) | AC 7/7; pgTAP 24/24; suíte 591/591; **pending-apply** migration 20260925150000; sem CRM-17 (responsabilidade com UUID em texto) |
| CRM-05 | running | ralph/crm-05-contatos-e-vinculos | a partir do CRM-04 |
| CRM-17 | not-needed (até agora) | | só se a FK textual Seq↔Conta bloquear; Blocked by CRM-04 e **CRM-06 (fora do corte)** |
| canais-01 | gate-pending | — | in-progress; AC de código todos [x], falta validação com conta real |
| canais-02 | gate-fail | — | ready-for-human (AC de código todos [x]) |
| canais-03 | queued | | in-progress; 2 AC abertos (estados na interface, reconexão) |
| canais-04 | blocked | | Blocked by canais-02 (ready-for-human) e canais-03 |
| Auth-09 | out | — | fora do corte; exige CRM-03 |
| Auth-10 | human | — | ready-for-human; não spawnar |
| CRM-03, 16, 19, 20, 21, 22–24 | out | — | fora do corte / ponteiros |

## Parallel (max 3)
- Auth-03 ∥ Auth-04 e Auth-07 ∥ Auth-08, conforme pedido. O half seguinte (Auth-05, CRM-04) junta as duas branches e resolve conflitos.

## Spend (estimativa grosseira)
| Half | Tokens reportados |
|------|-------------------|
| Auth-02 | ~133k |
| Auth-03 | ~108k |
| Auth-04 | ~115k |
| Auth-05 | ~165k |
| Auth-06 | ~135k |
| Auth-08 | ~119k |
| Auth-07 | ~153k |
| CRM-04 | ~201k |

## Alerts
- ALERTA RALPH | CRM-17 | GATE (antecipado) | Blocked by CRM-06 (roleta), fora do corte. Se a FK textual travar CRM-04/05/canais, a cadeia para aqui até decisão humana.
- Pendências humanas acumuladas para o Auth-10: modelos de e-mail "Confirm signup", "Magic Link" e "Reset Password" com `{{ .Token }}` além do link; e-mail para quem tenta se cadastrar com e-mail existente (Supabase não envia; exige Send Email Hook); páginas `/termos` e `/privacidade` (hoje provisórias).
- ALERTA RALPH | CRM-04 | pending-apply | aplicar `supabase/migrations/20260925150000_contas_alvo_reais.sql` depois da do Auth-02.
- ALERTA RALPH | Auth-02 | pending-apply | aplicar `supabase/migrations/20260925140000_workspace_pessoal.sql` no Supabase ANTES de mergear o PR #19; sem ela o app real cai em "Tentar novamente" após o login.
- Pré-existente: `responsabilidade_exclusiva.sql` falha 7/12 localmente também na `main` (validação de canal em `validate_sequence_document`). Relevante para canais-01/02.
- ALERTA RALPH | canais-02 | GATE | ready-for-human: não spawnar. canais-04 depende dele; a cadeia para no gate do canais-04 se o canais-02 não for dado como done por um humano.
- ALERTA RALPH | canais-01 | GATE | in-progress com AC de código completos; pendente validação com conta real (humano). Decidir se conta como done para canais-02/03/04.
- Pré-existente: `20260925100000_documento_com_destinatarios_reais.sql` e `20260925120000_contas_remetentes_unipile.sql` dependem de `20260925130153_real_sequence_access.sql` (timestamp posterior). Um `supabase db reset` do zero falha.
- Pré-existente: `contas_remetentes_unipile.sql` e `documento_com_destinatarios_reais.sql` (pgTAP) falham num Postgres limpo com `permission denied for schema private`. (`responsabilidade_exclusiva.sql`: ver alerta acima, 7/12.)

## Loop de teste de banco
Postgres 16 + pgTAP locais, com schema `auth` mínimo do Supabase, via script de sessão (fora do repo): aplica `supabase/migrations/` (repetindo as fora de ordem) e roda `supabase/tests/`.
