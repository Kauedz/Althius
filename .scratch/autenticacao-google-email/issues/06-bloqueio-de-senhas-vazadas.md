# 06: Bloqueio de senhas vazadas

**What to build:** quem escolhe uma senha que já apareceu em vazamentos é avisado e precisa escolher outra, no cadastro e na redefinição. A verificação é feita pela tela, pela API Pwned Passwords do HaveIBeenPwned por k-anonimato, enquanto o projeto estiver no Supabase Free ([ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md)).

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 05: Esqueci a senha.

**Status:** ready-for-agent

- [ ] Só os 5 primeiros caracteres do hash SHA-1 saem do navegador.
- [ ] Senha vazada é recusada com mensagem clara no cadastro e na redefinição.
- [ ] Falha ou lentidão da consulta não bloqueia o cadastro.
- [ ] O erro `weak_password` do Supabase é mostrado com a mesma mensagem, para quando o bloqueio passar ao servidor.
- [ ] Os serviços do navegador (Pwned Passwords agora; Google e Turnstile depois) entram no módulo de autenticação por uma única dependência injetada, que os testes substituem por versões falsas.
- [ ] Testes de raiz cobrem senha vazada recusada e falha da consulta sem bloqueio.
