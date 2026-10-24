# 02: A tela de entrada só fala do Google quando o botão existe

Spec: [../spec.md](../spec.md) (US 6).

**What to build:** sem o serviço do Google no build (sem `VITE_GOOGLE_CLIENT_ID`), a tela `/entrar` e o cadastro não citam o Google; com ele, o texto e o botão aparecem juntos. O build de produção avisa quando a variável falta.

**GATE:** só frontend; sem deploy; sem segredo; pt-BR.

**Blocked by:** None (can start immediately).

**Status:** done (implementado pelo Codex; print e commit feitos pela matriz Ralph em 2026-10-24; espera o PR)

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/auth/tela-de-entrada.tsx`, `auth/botao-do-google.tsx` e as outras telas de `auth/` que citam o Google
- testes Vitest novos em `src/auth/`
- `projeto-althius-frontend/vite.config.ts` só para um aviso no build de produção quando `VITE_GOOGLE_CLIENT_ID` está vazio (aviso, não erro)

## Não mexa

- `fonte/contexto.tsx` (quem cria `servicos.google`), Supabase Auth, `raiz.tsx` (é do ticket 01)

## Critérios

- [x] Sem o serviço do Google, nenhuma tela de acesso cita o Google
- [x] Com o serviço, texto e botão aparecem juntos, como hoje
- [x] `npm run build` sem `VITE_GOOGLE_CLIENT_ID` imprime um aviso claro
- [x] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/auth`
- Print 1400×900 da `/entrar` sem Client ID em `issues/prints/02-entrar.jpg`.

## Evidência (auditoria, vertical A)

- `botao-do-google.tsx:20`: `if (!iniciarGoogle) return null`.
- `tela-de-entrada.tsx:91-93`: "... com o Google, você vê a demonstração." mesmo sem botão.
- Achado de tela de 2026-10-17: o botão Google não aparece em `/entrar`, apesar do texto. A causa em produção (Client ID ausente no build) é do [autenticacao-google-email/10](../../autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md), do Nan.

## Comments

### 2026-10-24 — Codex (entrada-02)

Texto da entrada e orientação da recuperação de senha condicionados a `iniciarGoogle`, a mesma disponibilidade usada pelo botão. Cadastro por convite já ocultava o Google; agora tem cobertura com e sem serviço. Build de produção emite aviso quando o Client ID está vazio, sem falhar.

Verificações reais:
- Loop `npx vitest run --maxWorkers=2 src/auth/google-nas-telas-de-acesso.test.tsx`: vermelho na entrada e recuperação antes das respectivas correções; verde, 6 testes.
- `npx vitest run --maxWorkers=2 src/auth`: 5 arquivos, 57 testes verdes.
- `npx oxlint`: exit 0, avisos preexistentes; `npx tsc -b`: exit 0.
- `VITE_GOOGLE_CLIENT_ID= npm run build`: exit 0; aviso confirmado. Antes da mudança, build passava mas a asserção de presença do aviso falhava.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_entrada_02`: exit 0, 152 arquivos / 5.333 asserções.
- Revisão Standards: 0 achados; Spec: 0 achados. `git diff origin/main...HEAD` está vazio: revisão complementar feita no diff de trabalho e teste novo, pois não foi possível criar commit.

Pendências (não verificados):
- [x] Print 1400×900 em `prints/02-entrar.jpg`: tirado pela matriz com Chrome headless via CDP, Vite com `VITE_GOOGLE_CLIENT_ID=` vazio e Supabase local fictício, em `/entrar?auth=true`. A tela não cita o Google.
- [x] Commit na branch atual: feito pela matriz (o sandbox do Codex deixava o Git só leitura).

Handoffs: `.scratch/handoffs/entrada-02.md` e `.scratch/handoffs/entrada-02-pr.md`. AC 4/4 por testes; evidência visual pendente. O ticket permanece aberto para concluir as duas pendências em ambiente com suporte.
