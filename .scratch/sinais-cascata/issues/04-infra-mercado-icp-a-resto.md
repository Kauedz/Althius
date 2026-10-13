# 04: Sinais de mercado, fotografias, modelo de linguagem e ICP A (NCM nova, volume por porto; importador e Radar sem fonte)

**What to build:** Infra compartilhada pelos ICPs (feed de Sinais de mercado, fotografias para diff mensal, porta de LLM, cliente do Comex Stat, helpers de empresa) e as cascatas do ICP A fora a vaga.

**Blocked by:** 03 (a ordem é a das fatias da spec).

**Status:** ready-for-human

Commit: fatia 3

## Pode mexer

- `20261013140000_cascatas_mercado_e_snapshots.sql`, `20261013150000_cascatas_icp_a_resto.sql` e pgTAPs.
- `_shared/cascata-de-sinais/` (`comexstat`, `fonte-publica`, `llm-anthropic`, `passos/empresas`, `passos/icp-a-resto`).

## Não mexa

- O motor (`_shared/cascata-de-sinais/motor.ts`) e os tipos, salvo o que o ticket nomeia.
- Migrações já aplicadas: conserta-se com migração nova.
- Segredos e Supabase Auth; nada é aplicado em produção pelo agente.

## Critérios

- [x] Sinal de mercado vai para `record_market_signal`, não para uma Conta.
- [x] `novo_importador` e `habilitacao_radar` ficam `sem_fonte` com motivo.
- [x] Comex Stat: um pedido a cada 10 s.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migração do ICP, em ordem (`docs/agents/migrations.md`): validar no remoto com `execute_sql` dentro de `begin; ... rollback;` e rodar `scripts/pgtap-no-remoto.sh supabase/tests/<arquivo>.sql` (falhas 0, total = plano).
2. Publicar `signal-runner`, `signal-cascade` e o worker do Hermes (lista completa na PR).
3. Antes de `set_signal_cascade_state('<sinal>', 'available')`: uma execução real de cada actor do Sinal, com teto baixo, conferindo `signal_cascade_run_steps` (custo real, erro real, campos). Os formatos lidos só da documentação pública estão listados em "Não conferido" na PR.
4. Conferir uma consulta real ao Comex Stat a partir da Edge Function (a rede do sandbox só alcançou a API pelo proxy).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4. Aplicação de migração: `docs/agents/migrations.md`.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189 (rascunho; sem merge, nada aplicado em produção).
