# 08: CAPTCHA invisível (Turnstile)

**What to build:** bots não conseguem criar contas em massa nem testar senhas, e pessoas não veem nenhum desafio no fluxo normal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 05: Esqueci a senha; 06: Bloqueio de senhas vazadas.

**Status:** ready-for-agent

- [ ] Cloudflare Turnstile invisível em cadastro, login com senha, envio de código e redefinição; o token acompanha cada chamada ao Supabase Auth.
- [ ] Falha do CAPTCHA mostra mensagem clara e permite tentar de novo.
- [ ] O Turnstile entra pela dependência injetada dos serviços do navegador; testes de raiz cobrem token enviado e falha.
- [ ] A configuração necessária no Supabase Auth e na Cloudflare fica descrita para o ticket 10.
