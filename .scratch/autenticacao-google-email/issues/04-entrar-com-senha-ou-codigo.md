# 04: Entrar com senha ou com código

**What to build:** uma Conta de usuário entra em `/entrar` com e-mail e senha, ou com "Entrar com código" (código de 6 dígitos + link por e-mail), e chega ao Workspace certo.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 01: Rotas e casca visual das telas de acesso; 02: Workspace pessoal criado no primeiro acesso.

**Status:** closed

- [x] `/entrar` oferece e-mail e senha, "Entrar com código" e "Esqueci a senha", com link para `/cadastro`. O formulário de link antigo é substituído.
- [x] "Entrar com código" não cria Conta de usuário; pede o código na mesma tela e aceita o link no mesmo navegador.
- [x] Senha errada ou e-mail inexistente mostram só "E-mail ou senha incorretos".
- [x] Após o login: último Workspace usado com Participação ativa → Workspace pessoal. Nunca abre Workspace sem Participação ativa.
- [x] Testes de raiz cobrem senha certa, senha errada, código e a ordem de entrada no Workspace.

## Comments

- Auth-04 (branch `ralph/auth-04-entrar-com-senha-ou-codigo`): `/entrar` reescrita em `src/auth/tela-de-entrada.tsx` (senha com mostrar/ocultar, "Entrar com código" com etapa do código na mesma tela, links `/esqueci-a-senha` e `/cadastro`); `entrarComLink` substituído por `entrarComSenha`, `pedirCodigoDeEntrada` (`shouldCreateUser: false`) e `confirmarCodigoDeEntrada` (`verifyOtp` type `email`) no contexto; último Workspace por Conta de usuário em `localStorage` (`althius:ultimo-workspace:<id>`), só se tiver Participação ativa; cliente Supabase com `flowType: 'pkce'`. Evidência: `src/raiz.test.tsx` (describes "Entrar com senha ou com código" e "Workspace de entrada depois do login"; testes antigos de link migrados para o código) — 537/537 verdes, `tsc -b` limpo. Pendente humano: modelo do e-mail "Magic Link" no Supabase com `{{ .Token }}` e link (ticket 10). Fora do escopo: a etapa do código não sobrevive a atualizar a página.
- Revisão (ralph/revisao-correcoes): "Entrar com código" e "Esqueci a senha" tratam `over_email_send_rate_limit`/429 como sucesso (mesma resposta de um e-mail sem conta; o Auth só limita e-mail com conta) e nunca mostram `error.message` do Auth; Supabase falso simula o limite (`limiteDeEnvioAtingido`). Também: o bootstrap só grava o aceite dos Termos no primeiro acesso (migration 140000, não sobrescreve aceite existente) e a tela de falha do Workspace pessoal não mostra mais o erro cru da RPC. Loop: 2 vitest vermelhos → verdes (limite), 1 (erro cru) e pgTAP `workspace_pessoal.sql` 1 vermelho → 21/21.
