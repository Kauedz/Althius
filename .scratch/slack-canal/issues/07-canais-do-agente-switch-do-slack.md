# 07: Canais do Agente: o switch do Slack

Spec: [../spec.md](../spec.md) (seção "Frontend"; US 17). Relacionado: 01 (instalação do Canal).

**What to build:** na Personalização de um Agente, o switch do Slack em Canais só pode ser ligado quando o Canal Slack está ativo no Workspace. Ligado, o Agente atende no Slack (o "slack" entra na lista de canais do Agente, a mesma que o 02 e o 03 conferem). Com o Canal retirado ou nunca instalado, o switch fica desabilitado, com o motivo. A Integração Slack pelo servidor MCP (ferramenta do Agente) **não** liga este switch: é outra coisa.

**GATE:** só frontend; sem migration, sem deploy.

**Blocked by:** 01 (Instalar e retirar o Canal Slack).

**Status:** ready-for-human (implementado em `6c87631` e `7bb2e8e`, no PR #224; Vitest verde no CI do PR)

## Pode mexer

- `projeto-althius-frontend/src/fonte/supabase-agentes.ts`, `supabase-conexoes.ts`, `catalogo-de-conexoes.ts`
- testes Vitest novos em `supabase-agentes.test.ts` e `paginas/agentes-reais.test.tsx`

## Não mexa

- a Integração Slack pelo MCP (`integration-*`, catálogo do conector)
- backend
- a Demonstração

## Critérios

- [x] Com o Canal Slack ativo no Workspace, o switch do Slack pode ser ligado e grava "slack" nos canais do Agente
- [x] Sem o Canal (nunca instalado ou retirado), o switch fica desabilitado
- [x] Ter a Integração Slack pelo MCP conectada não habilita o switch (pelo código: o estado vem de `lerCanaisDoWorkspace`, a instalação do Canal, não das Integrações; sem teste próprio)
- [x] Sem emojis na UI: só ícones da biblioteca existente (conferido no diff de `6c87631` e `7bb2e8e`)
- [x] lint, `tsc -b` e Vitest verdes (CI do PR #224, job "Frontend (lint, testes e build)")

## Passos do Nan

- Com o Canal instalado no Slack de teste: ligar o switch de um Agente e mencioná-lo no Slack; retirar o Canal e conferir que o switch fica desabilitado

## Comments

**2026-10-15, agente:** trabalho feito antes do ticket existir; o ticket registra o que já está no PR #224.
