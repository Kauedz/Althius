# 01: A Conversa coordenada volta como estava depois de recarregar (main verde)

Spec: [../spec.md](../spec.md) (US 1, 2).

**What to build:** abrir `/conversa` com uma Conversa coordenada salva mostra o pedido e a resposta guardados, sem reenviar nada; o teste que hoje falha na `main` passa. Se a causa estiver na Fonte de Conversas (não no teste), corrigir a Fonte.

**GATE:** sem deploy; sem mexer na Demonstração; diagnóstico registrado nos Comments antes da correção (`/diagnosing-bugs`).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/paginas/conversas-reais.test.tsx`
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` e `paginas/conversa-coordenada.tsx`, se a causa for do código

## Não mexa

- `agent-conversation`, `_hermes-worker`, migrations

## Critérios

- [ ] Causa registrada nos Comments (teste frágil, ordem de carregamento ou bug da Fonte), com a evidência
- [ ] "depois de recarregar, a Conversa coordenada volta como estava, sem reenviar o pedido" passa 10 vezes seguidas
- [ ] `npx vitest run --maxWorkers=2` inteiro verde (0 falhas)
- [ ] lint e `tsc -b` verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/conversas-reais.test.tsx` (repetir 10x) e a suíte inteira

## Evidência (auditoria, vertical H)

- Vitest 2026-10-17 em `origin/main` 1aff4ce: 1 failed | 1387 passed | 4 skipped; `conversas-reais.test.tsx:131` não acha "Temos a Alfa Incorporadora.".
