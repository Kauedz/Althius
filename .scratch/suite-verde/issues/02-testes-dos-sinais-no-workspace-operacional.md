# 02: Testes dos Sinais no Workspace operacional

Spec: [../spec.md](../spec.md) (US 3).

**What to build:** testes Vitest que provam a regra do módulo Sinais no Workspace operacional: nada `available` → aviso de indisponível sem dados da Demonstração; só um Sinal interno `available` → módulo ligado; um actor `available` → módulo ligado e o Sinal aparece na Conta-alvo; erro de RPC → indisponível.

**GATE:** só testes; se um teste revelar bug, registrar nos Comments e abrir ticket, sem corrigir aqui.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** M.

## Pode mexer

- arquivos de teste novos em `projeto-althius-frontend/src/paginas/` e `src/fonte/` (ex.: `sinais-reais.test.tsx`)

## Não mexa

- código de produção; testes existentes

## Critérios

- [ ] Os quatro casos acima cobertos pela raiz/página, não por função interna
- [ ] Nenhum dado da Demonstração aparece no operacional nos casos de indisponível
- [ ] vitest verde

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/sinais*`

## Evidência (auditoria, vertical D e H)

- `supabase-sinais.ts:105-108` (regra do módulo); FE com ~2 arquivos de teste de Sinais.
