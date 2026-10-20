# 01: Abrir na tela de entrada, e não no Modo Protótipo

Spec: [../spec.md](../spec.md) (US 1–5).

**What to build:** em produção, app.althius.com.br abre na tela de entrada do Workspace operacional quando o navegador não tem escolha salva, e o banner "Modo Protótipo (Completo)" não aparece. A Demonstração continua por `?demo=true`, pelo link "Ver a Demonstração" na tela de entrada e para o visitante sem Contrato depois do login (ADR-0025). A escolha antiga do protótipo (`althius:modo_demo=true`) deixa de valer.

**GATE:** sem deploy, sem merge; só frontend; pt-BR; sem emojis; não mexer na Demonstração em si.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/raiz.tsx` (escolha do ambiente, banner, chave salva)
- `projeto-althius-frontend/src/auth/tela-de-entrada.tsx` só para o link "Ver a Demonstração"
- `projeto-althius-frontend/src/raiz.test.tsx` (casos novos)

## Não mexa

- fontes simuladas (`simulada-*`, `dados-demo`), `composicao.ts`
- testes existentes que não sejam da escolha do ambiente

## Critérios

- [ ] Build de produção sem nada salvo abre a tela de entrada, sem o banner "Modo Protótipo (Completo)"
- [ ] Build de desenvolvimento mantém o comportamento de hoje (Demonstração padrão, banner do protótipo)
- [ ] `?demo=true` e o link "Ver a Demonstração" abrem a Demonstração; `?auth=true`, `?demo=false` e as telas de acesso abrem o operacional, como hoje
- [ ] O valor antigo `althius:modo_demo=true` é ignorado em produção (chave nova; a antiga é apagada)
- [ ] O visitante sem Contrato continua vendo a Demonstração com "Você está vendo uma demonstração" (ADR-0025), sem regressão
- [ ] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/raiz.test.tsx`
- Playwright 1400×900: `npm run build && npx vite preview`, abrir sem localStorage → tela de entrada; com `?demo=true` → Demonstração. Prints em `issues/prints/01-*.jpg`.

## Evidência (auditoria, vertical A)

- `raiz.tsx:30-38`: sem escolha salva, `return 'demonstracao'` ("No protótipo, a Demonstração é o padrão").
- `raiz.tsx:67-71`: banner "Modo Protótipo (Completo)" no ramo Demonstração.
- Achado de tela de 2026-10-17: o app abre em "Modo Protótipo (Completo)" e manda para `/onboarding` (o onboarding simulado da Demonstração não concluído no navegador).

## Passos do Nan

- Deploy do frontend depois do merge; abrir app.althius.com.br numa janela anônima e conferir a tela de entrada.

## Comments

- 2026-10-17, decisão do Renan (dúvida 2 da fila): confirmado como está. Produção abre na tela de entrada, sem o banner "Modo Protótipo (Completo)"; Demonstração só por `?demo=true`, pelo link "Ver a Demonstração" e para o visitante sem Contrato (ADR-0025). Desenvolvimento segue como hoje.
