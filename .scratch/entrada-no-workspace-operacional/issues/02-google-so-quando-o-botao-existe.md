# 02: A tela de entrada só fala do Google quando o botão existe

Spec: [../spec.md](../spec.md) (US 6).

**What to build:** sem o serviço do Google no build (sem `VITE_GOOGLE_CLIENT_ID`), a tela `/entrar` e o cadastro não citam o Google; com ele, o texto e o botão aparecem juntos. O build de produção avisa quando a variável falta.

**GATE:** só frontend; sem deploy; sem segredo; pt-BR.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/auth/tela-de-entrada.tsx`, `auth/botao-do-google.tsx` e as outras telas de `auth/` que citam o Google
- testes Vitest novos em `src/auth/`
- `projeto-althius-frontend/vite.config.ts` só para um aviso no build de produção quando `VITE_GOOGLE_CLIENT_ID` está vazio (aviso, não erro)

## Não mexa

- `fonte/contexto.tsx` (quem cria `servicos.google`), Supabase Auth, `raiz.tsx` (é do ticket 01)

## Critérios

- [ ] Sem o serviço do Google, nenhuma tela de acesso cita o Google
- [ ] Com o serviço, texto e botão aparecem juntos, como hoje
- [ ] `npm run build` sem `VITE_GOOGLE_CLIENT_ID` imprime um aviso claro
- [ ] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/auth`
- Print 1400×900 da `/entrar` sem Client ID em `issues/prints/02-entrar.jpg`.

## Evidência (auditoria, vertical A)

- `botao-do-google.tsx:20`: `if (!iniciarGoogle) return null`.
- `tela-de-entrada.tsx:91-93`: "... com o Google, você vê a demonstração." mesmo sem botão.
- Achado de tela de 2026-10-17: o botão Google não aparece em `/entrar`, apesar do texto. A causa em produção (Client ID ausente no build) é do [autenticacao-google-email/10](../../autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md), do Nan.
