# 10: Configurar o ambiente e verificar antes de liberar

**What to build:** o cadastro e o login funcionam de verdade no ambiente publicado, com Google, e-mails e CAPTCHA reais, verificados à mão.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 07: Continuar com Google; 08: CAPTCHA invisível (Turnstile).

**Status:** ready-for-human

- [ ] Projeto no Google Cloud com tela de consentimento, Client ID Web, domínio verificado, página inicial e Termos de Uso e Política de Privacidade publicados; Client ID registrado no provedor Google do Supabase.
- [ ] Verificação de marca do Google pedida (minutos a 2–3 dias úteis).
- [ ] SMTP próprio (ex.: Resend) com domínio de envio, e modelos de e-mail com código + link para confirmação, código e redefinição.
- [ ] Site Turnstile na Cloudflare e chave secreta no Supabase Auth.
- [ ] "Confirm email" ligado, limites de taxa ajustados e URLs de redirecionamento de cada ambiente registradas.
- [ ] Lista manual da spec executada: Google e One Tap reais, entrega dos e-mails, link aberto em outro navegador, Turnstile real, layout no desktop e no celular (360px), teclado e leitor de tela.
