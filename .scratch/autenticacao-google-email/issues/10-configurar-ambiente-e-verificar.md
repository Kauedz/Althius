# 10: Configurar o ambiente e verificar antes de liberar

**What to build:** o cadastro e o login funcionam de verdade no ambiente publicado, com Google, e-mails e CAPTCHA reais, verificados à mão.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 07: Continuar com Google; 08: CAPTCHA invisível (Turnstile).

**Status:** ready-for-human (depois das correções A e B do ticket 03; a parte de agente da lista manual já foi feita, ver Comments de 2026-10-07)

- [ ] Projeto no Google Cloud com tela de consentimento, Client ID Web, domínio verificado, página inicial e Termos de Uso e Política de Privacidade publicados; Client ID registrado no provedor Google do Supabase.
- [ ] Verificação de marca do Google pedida (minutos a 2–3 dias úteis).
- [ ] SMTP próprio (ex.: Resend) com domínio de envio, e modelos de e-mail com código + link para confirmação, código e redefinição.
- [ ] Site Turnstile na Cloudflare e chave secreta no Supabase Auth.
- [ ] "Confirm email" ligado, limites de taxa ajustados e URLs de redirecionamento de cada ambiente registradas.
- [ ] Lista manual da spec executada: Google e One Tap reais, entrega dos e-mails, link aberto em outro navegador, Turnstile real, layout no desktop e no celular (360px), teclado e leitor de tela.

## Comments

- 2026-09-25: pela revisão do [ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md), o cadastro público só abre no Supabase auto-hospedado, e a verificação final deste ticket vale para o ambiente da VPS.
  - A pré-produção (`ycbdilsmydvzezhlymty`) pode receber as mesmas configurações para teste.
  - Nela já estão configurados o SMTP pelo Resend, com o domínio `althius.com.br`, e a Redirect URL `http://localhost:5173/**`.
  - O bloqueio de senhas vazadas no servidor não entra aqui: no plano Free ele é feito na tela (Auth-06) e, na VPS, por configuração (`GOTRUE_PASSWORD_HIBP_ENABLED`).

- 2026-09-28 (QA manual): SMTP próprio ligado no Supabase (Resend, `contato@althius.com.br`). Modelo "Magic link or OTP" com `{{ .Token }}` e link, e tamanho do código em 6 dígitos: o código por e-mail do login e da troca de senha chega e é aceito. Falta conferir os modelos "Confirm signup" e "Reset Password" com o código.

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não conferi o remoto (o conector do Supabase não estava ligado nesta sessão); o estado vem dos Comments acima.
  - Feito pela IA, da lista manual: o layout no desktop (1400×900) e no celular (360px), com o app local sobre o dublê do Supabase: [entrar](prints/10-entrar-desktop.jpg), [entrar 360](prints/10-entrar-360.jpg), [cadastro](prints/10-cadastro-desktop.jpg), [cadastro 360](prints/10-cadastro-360.jpg), [esqueci a senha](prints/10-esqueci-a-senha-desktop.jpg), [esqueci 360](prints/10-esqueci-a-senha-360.jpg), [redefinir sem link 360](prints/10-redefinir-sem-link-360.jpg), [convite pendente](prints/10-convite-pendente-desktop.jpg), [convite 360](prints/10-convite-pendente-360.jpg), [cadastro pelo convite 360](prints/10-cadastro-pelo-convite-360.jpg). Nada estoura a 360px; o único erro no console é o favicon da página de teste.
  - Antes de liberar: as correções A (abrir as telas de acesso e os links do Auth no Workspace operacional) e B (rotas públicas `/termos` e `/privacidade`) do ticket 03. Sem a B, o Google recusa a tela de consentimento.
  - Passos do Nan, nesta ordem:
    1. Cloudflare (dash.cloudflare.com > Turnstile > Add widget): nome "Althius", hostnames `localhost` e o domínio de cada ambiente, modo Invisible. Copiar a site key e a secret.
    2. Google Cloud (console.cloud.google.com > Google Auth Platform): Branding com o nome "Althius", a página inicial, `https://<origem>/privacidade`, `https://<origem>/termos` e o domínio `althius.com.br`; Audience External; Data Access só `openid`, `email` e `profile`; Clients > Create client > Web application, com as origens `http://localhost:5173` e as de cada ambiente; verificar o domínio no Search Console e pedir Verify branding.
    3. Front, no PowerShell, na raiz:
       ```powershell
       Add-Content -Path projeto-althius-frontend\.env.local -Encoding ascii -Value "VITE_GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com"
       Add-Content -Path projeto-althius-frontend\.env.local -Encoding ascii -Value "VITE_TURNSTILE_SITE_KEY=<site-key>"
       npm --prefix projeto-althius-frontend run dev
       ```
    4. Supabase (`https://supabase.com/dashboard/project/ycbdilsmydvzezhlymty`): Authentication > Providers: Email com "Confirm email" ligado e código de 6 dígitos; Google ligado, com o Client ID Web e "Skip nonce checks" desligado. Authentication > Emails: "Confirm signup" e "Reset Password" com `{{ .Token }}` e `{{ .ConfirmationURL }}`. Authentication > URL Configuration: Site URL e `https://<origem>/**` de cada ambiente. Rate Limits de produção. Attack Protection: CAPTCHA com Turnstile e a secret, só depois do passo 3 (sem a site key no front, o Auth recusa tudo).
    5. O que só uma pessoa faz: Google e One Tap reais, entrega dos três e-mails, link aberto em outro navegador ("O link de redefinição expirou…"), ações do Turnstile na Cloudflare e leitor de tela.
