# 03: Teste do caminho do Cliente, da entrada à Conversa

Spec: [../spec.md](../spec.md) (US 4).

**What to build:** um teste de integração na raiz do app: navegador sem nada salvo, build de produção → tela de entrada; entrar com sessão e Participação falsas → Workspace operacional; primeira vez → `/onboarding`, concluir, recarregar → Casca; Conversas disponíveis → composer na página de Agentes, sem "Disponível" contraditório.

**GATE:** só testes.

**Blocked by:** [entrada/01](../../entrada-no-workspace-operacional/issues/01-abrir-na-tela-de-entrada-e-nao-no-prototipo.md), [entrada/03](../../entrada-no-workspace-operacional/issues/03-day0-uma-vez-so-no-workspace-operacional.md), [conversas/03](../../conversas-pelo-hermes/issues/03-selo-do-agente-coerente-com-as-conversas.md).

**Status:** blocked

**Quem faz:** agente de código. **Esforço:** M.

## Pode mexer

- arquivo de teste novo `projeto-althius-frontend/src/caminho-do-cliente.test.tsx`

## Não mexa

- código de produção; testes existentes

## Critérios

- [ ] O caminho inteiro acima num só teste, pelo comportamento visível
- [ ] vitest verde

## Como testar

- `npx vitest run --maxWorkers=2 src/caminho-do-cliente.test.tsx`

## Evidência

- Achados de tela de 2026-10-17 (Modo Protótipo, `/onboarding` sempre, Conversas INDISPONÍVEL × card DISPONÍVEL).
