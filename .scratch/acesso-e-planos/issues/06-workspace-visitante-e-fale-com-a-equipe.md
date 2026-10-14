# 06: Workspace visitante e "Fale com a equipe Althius"

**What to build:** o visitante vê a Demonstração só leitura com banner fixo; ação paga abre o modal; o pedido vai para `private.access_requests` e para o e-mail da equipe.

**GATE:** sem tocar em conectores/integrações; destino do e-mail fixo no servidor; `resendMail` reaproveitado; RLS ligado em tudo.

**Blocked by:** 01.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016150000_pedidos_de_acesso.sql`, `supabase/functions/access-request-notify/`, `supabase/config.toml`, `supabase/functions/README.md`
- `src/auth/aplicativo.tsx`, novos arquivos de visitante, `src/fonte/composicao.ts`

## Critérios
- [x] Banner "Você está vendo uma demonstração" fixo.
- [x] Monitoramento, Descoberta, Comitê, revelar contato, Agentes e Sequência abrem o modal; nada vai ao servidor.
- [x] Formulário com nome, empresa, telefone e mensagem; limite de envios por usuário; e-mail só pela Edge Function.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Depois das migrações, publicar a função nova (com JWT, sem `--no-verify-jwt`):

```powershell
npx supabase functions deploy access-request-notify --project-ref ycbdilsmydvzezhlymty
```

2. Os segredos `RESEND_API_KEY`, `APP_ORIGIN` e `INVITE_EMAIL_FROM` já existem (os mesmos de `workspace-invitation-email`). Nada novo.
3. Conferir no navegador: entrar com uma conta Google sem Workspace, ver o banner, tentar uma ação paga e enviar o formulário; o e-mail deve chegar em althius.relacionamento@gmail.com.
