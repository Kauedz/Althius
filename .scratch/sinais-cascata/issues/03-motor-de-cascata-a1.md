# 03: Motor de cascata, Sinal A1 (vaga de comex), `buscar_sinais` e Monitoramento no mesmo núcleo

**What to build:** Um Sinal é uma cascata de 1..N passos com uma reserva de crédito, um registro por execução com o rastro de cada passo e `record_signal` no fim; o Hermes e o `signal-runner` usam o mesmo `rodarCascata`.

**Blocked by:** 02 (a ordem é a das fatias da spec).

**Status:** ready-for-human

Commit: fatia 2

## Pode mexer

- `supabase/migrations/20261013130000_cascatas_de_sinais.sql` e seu pgTAP.
- `_shared/cascata-de-sinais/` (motor, cliente da fonte, registro de passos A1).
- `signal-runner/`, `signal-cascade/`, `_shared/busca-de-sinais.ts`, `ferramentas-dos-agentes.ts` (`buscar_sinais`), `_hermes-worker/main.ts`, `supabase/config.toml`.

## Não mexa

- O motor (`_shared/cascata-de-sinais/motor.ts`) e os tipos, salvo o que o ticket nomeia.
- Migrações já aplicadas: conserta-se com migração nova.
- Segredos e Supabase Auth; nada é aplicado em produção pelo agente.

## Critérios

- [x] Uma reserva, liquidada pelo custo real ×3 sem passar do reservado; falha libera.
- [x] Teto de dólar duro por cascata; rodízio de conta só em 402/403.
- [x] Run id e erro real por passo em `signal_cascade_run_steps`.
- [x] `sem_fonte` não reserva crédito.
- [x] Apify sempre mockado nos testes.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migração do ICP, em ordem (`docs/agents/migrations.md`): validar no remoto com `execute_sql` dentro de `begin; ... rollback;` e rodar `scripts/pgtap-no-remoto.sh supabase/tests/<arquivo>.sql` (falhas 0, total = plano).
2. Publicar `signal-runner`, `signal-cascade` e o worker do Hermes (lista completa na PR).
3. Antes de `set_signal_cascade_state('<sinal>', 'available')`: uma execução real de cada actor do Sinal, com teto baixo, conferindo `signal_cascade_run_steps` (custo real, erro real, campos). Os formatos lidos só da documentação pública estão listados em "Não conferido" na PR.
4. Implantar `signal-cascade` (`verify_jwt = true` em `config.toml`); reiniciar o worker do Hermes com `HERMES_SINAIS` ligado (`off` desliga).
5. Segredos: `APIFY_TOKEN` (+ `_2`..`_5`), opcional `ANTHROPIC_API_KEY` para os passos com modelo.
6. `configure_signal_runner` e o cron, se faltarem (consultas do diagnóstico).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4. Aplicação de migração: `docs/agents/migrations.md`.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189 (rascunho; sem merge, nada aplicado em produção).
