# 07: Continuar com Google

**What to build:** um visitante cria a conta ou entra com Google em um clique, pelo botão oficial ou pelo One Tap, vendo "Althius" na escolha de conta, e chega à mesma Conta de usuário que teria com senha ou código.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 04: Entrar com senha ou com código; 06: Bloqueio de senhas vazadas.

**Status:** done (código e testes); Google real pending-human (Auth-10)

- [x] Botão oficial do Google Identity Services no topo de `/cadastro` e `/entrar`, com login por ID token e nonce; escopos só `openid`, `email` e `profile`. Evidência: `raiz.test.tsx` "cadastro pelo botão no topo de /cadastro…" e "o One Tap em /entrar…" (posição antes dos campos; o Supabase falso recusa se SHA-256(nonce cru) ≠ nonce do token); `servicos-do-navegador.test.ts` "desenha o botão oficial e o One Tap por FedCM com o hash do nonce, sem escopos…".
- [x] One Tap em `/entrar` e `/cadastro` quando há sessão Google no navegador; nunca dentro do app. Evidência: "o One Tap em /entrar…" e "o One Tap nunca aparece dentro do app" (com sessão, o Google nunca é iniciado; após entrar, a limpeza fecha o One Tap).
- [x] Cancelar a escolha de conta volta à tela sem mensagem de erro. Evidência: "cancelar a escolha de conta volta à tela sem mensagem de erro".
- [x] O nome da pessoa vem do Google; o aceite passivo dos Termos também vale aqui. Evidência: "cadastro pelo botão…" (`full_name` = nome do Google; bootstrap recebe `VERSAO_DOS_TERMOS`); /entrar mostra "Ao continuar com Google, você concorda com os Termos…".
- [x] Senha → Google e Google → definir senha (pelo "Esqueci a senha") chegam à mesma Conta de usuário, sem Workspace duplicado. Evidência: "o One Tap em /entrar leva quem se cadastrou com senha…" e "quem se cadastrou com Google define uma senha…" (uma só conta no Auth falso, uma só Participação). A vinculação real é do Supabase (pending-human na verificação manual).
- [x] O Google Identity Services entra pela dependência injetada dos serviços do navegador; testes de raiz cobrem cadastro, login, cancelamento e as duas vinculações. Evidência: membro `google?: ServicoDoGoogle` em `ServicosDoNavegador`; falso em `servicos-do-navegador-falsos.ts` (`navegador: { google }`); 7 testes em `describe('Continuar com Google')`.

## Comments

- Auth-07 (half Ralph): `ServicosDoNavegador.google?` (ausente sem `VITE_GOOGLE_CLIENT_ID`, e então nada do Google aparece); `ContextoDeAutenticacao.iniciarGoogle` gera o nonce, entrega o SHA-256 ao GIS e chama `signInWithIdToken({ provider: 'google', token, nonce })`; UI em `src/auth/botao-do-google.tsx`, só inserida nas telas. O script do GIS só carrega na implementação real. Checks: `tsc -b` limpo, oxlint 34 (base), vitest 570 verdes (560 + 10); raiz vermelho antes (4 falhas). Pending-human (Auth-10): Client ID Web real, origens autorizadas no Google Cloud, provedor Google no Supabase, verificação de marca e teste manual do botão/One Tap reais.
