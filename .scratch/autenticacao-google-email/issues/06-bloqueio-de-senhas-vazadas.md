# 06: Bloqueio de senhas vazadas

**What to build:** quem escolhe uma senha que já apareceu em vazamentos é avisado e precisa escolher outra, no cadastro e na redefinição. A verificação é feita pela tela, pela API Pwned Passwords do HaveIBeenPwned por k-anonimato, enquanto o projeto estiver no Supabase Free ([ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md)).

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 05: Esqueci a senha.

**Status:** closed

- [x] Só os 5 primeiros caracteres do hash SHA-1 saem do navegador. — `src/auth/servicos-do-navegador.test.ts`: o pedido é exatamente `GET …/range/5BAA6` com `Add-Padding: true`, sem o sufixo.
- [x] Senha vazada é recusada com mensagem clara no cadastro e na redefinição. — `raiz.test.tsx` › Bloqueio de senhas vazadas (cadastro: conta não criada; redefinição: senha não trocada).
- [x] Falha ou lentidão da consulta não bloqueia o cadastro. — idem: consulta que falha (cadastro e redefinição) e consulta que nunca responde (segue após 2 s).
- [x] O erro `weak_password` do Supabase é mostrado com a mesma mensagem, para quando o bloqueio passar ao servidor. — idem, com `senhasVazadasNoServidor` no Supabase falso.
- [x] Os serviços do navegador (Pwned Passwords agora; Google e Turnstile depois) entram no módulo de autenticação por uma única dependência injetada, que os testes substituem por versões falsas. — `ServicosDoNavegador` passada em `RaizDoAplicativo` → `AplicativoAutenticado` → `ContextoDeAutenticacao`; real em `main.tsx`, falsa em `src/test/servicos-do-navegador-falsos.ts`.
- [x] Testes de raiz cobrem senha vazada recusada e falha da consulta sem bloqueio.

## Comments

- Auth-06 (half Ralph): a verificação fica no `ContextoDeAutenticacao` (`cadastrar` e `definirNovaSenha`), com tempo limite de 2 s; a interface `ServicosDoNavegador` hoje só tem `senhaVazada(senha): Promise<boolean>`. Google (07) e Turnstile (08) entram como novos membros dela. Checks: `tsc -b` limpo, oxlint 34 avisos (base), vitest 560 verdes (552 + 8). Teste de raiz vermelho antes (5 falhas) e verde depois. A troca de senha logada (spec) ainda não existe; quando existir, usa o mesmo `recusarSenhaVazada`.

- 2026-10-07 (reconciliação contra a `main` 59e53a6): a branch `ralph/auth-06-senhas-vazadas` está na `main`. Rótulo `done` trocado por `closed`.
  - Só o prefixo de 5 caracteres sai: `src/auth/servicos-do-navegador.ts:156-159`; teste "só os 5 primeiros caracteres do SHA-1 saem do navegador, com preenchimento na resposta".
  - Recusa no cadastro e na redefinição: `src/auth/contexto.tsx:72,81-89,265,319`; testes "no cadastro, a senha vazada é recusada com mensagem clara e sem criar a conta; outra senha segue" e "na redefinição, a senha vazada é recusada com a mesma mensagem, sem trocar a senha".
  - Falha ou demora não bloqueia: `contexto.tsx:75,83-86`; testes "se a consulta de vazadas falhar, o cadastro e a redefinição seguem" e "se a consulta de vazadas demorar, o cadastro segue depois de um tempo curto".
  - `weak_password` com a mesma mensagem: `contexto.tsx:143,273`; teste "a recusa weak_password do Supabase Auth mostra a mesma mensagem, no cadastro e na redefinição".
  - Uma dependência injetada: `servicos-do-navegador.ts:6-20`, `src/raiz.tsx:17,41`, `src/auth/aplicativo.tsx:76-90`, `src/main.tsx:10`; o falso em `src/test/servicos-do-navegador-falsos.ts:28-62`.
  - Testes rodados: os 5 de "Bloqueio de senhas vazadas" (`src/raiz.test.tsx`) e os 10 de `src/auth/servicos-do-navegador.test.ts`, todos verdes.
