# 04: Limite de usuários nos convites

**What to build:** `invite_to_workspace` bloqueia quando participantes ativos mais convites pendentes chegam a `max_users`.

**GATE:** redefinir a partir de `20260927115135`; a tela só traduz a mensagem.

**Blocked by:** 01.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016130000_limite_de_usuarios_nos_convites.sql`, `projeto-althius-frontend/src/fonte/supabase-participantes.ts`

## Critérios
- [x] Mensagem: "Seu plano permite até N usuários. Fale com a equipe Althius para ampliar."
- [x] Convite expirado, revogado ou aceito não conta como pendente; Workspace sem contrato ou ilimitado não tem limite.
- [x] O convidado de um Workspace contratado entra direto.
