# Sinais em cascata de fontes (ICPs A a H)

**Origem:** pedido do Renan (fundador) em 12-13/10/2026; anexos versionados em `.scratch/sinais/` (Mapa de Mercado, relatório de actors, prompt original). Diagnóstico: [`diagnostico.md`](diagnostico.md). Brief das fatias de ICP: [`brief-icps.md`](brief-icps.md). Handoff: `.scratch/handoffs/sinais-cascata.md`.

## Problema

1. `private.signals` está vazio desde sempre e o único Monitoramento nunca rodou: cinco elos podem falhar em silêncio (actor fora de `available`, `configure_signal_runner` sem URL, pg_cron/pg_net, função não implantada, dado da Conta). Ninguém via qual.
2. A busca TOTVS falhou sem rastro: o endpoint síncrono perde o corpo e o run id; o erro real só ia para o console.
3. Um Sinal era um actor só. Os Sinais do Mapa de Mercado (8 ICPs) precisam de vários passos (achar vaga → página da empresa → CNPJ → casar com a Conta), de fontes públicas abertas (Comex Stat, BNDES, CCEE) e de regras internas.
4. O nome do fornecedor de coleta ("Apify", "actor") aparecia para o usuário e podia ser repetido pelo Hermes.

## Modelo

**Um Sinal é uma cascata de 1..N passos** (actor | fonte pública aberta | regra interna), a saída normalizada de um passo é a entrada do seguinte.

- UMA reserva de crédito por execução (`reserve_credits`), liquidada no fim pelo custo real × 3 (arredondado para cima, nunca acima do reservado); `release_credits` se falha. Chave idempotente por execução.
- UM registro de execução (`signal_cascade_runs`) com o rastro de cada passo (`signal_cascade_run_steps`: run id, actor, versão, conta usada, custo, status HTTP, erro real truncado e sem segredo).
- Teto duro de dólar por cascata: o motor não começa um passo que passe do que resta.
- `record_signal` no fim (Conta) ou `record_market_signal` (escopo `mercado`, feed do Workspace, sem Conta).
- `sem_fonte` é estado válido, com motivo, sem reservar crédito.
- Só actors do plano Free (aluguel é recusado no registro). Rodízio de contas de coleta apenas por configuração (`APIFY_TOKEN`, `_2` a `_5`).
- Marca: usuário e Hermes só conhecem "fonte pública", "Receita Federal", "nossa busca". Guardas de teste em `_shared/guarda-de-marca.test.ts` e no frontend.
- O Hermes (`buscar_sinais`) e os Monitoramentos/rotinas (`signal-runner`) usam o mesmo núcleo (`rodarCascata`); o worker do Hermes pede a busca à Edge Function `signal-cascade`.

## Regras por ICP

- C (jurídico): só dado da empresa/CNPJ; nenhuma parte pessoa física, advogado ou CPF sai da fonte para o Sinal.
- B (sócio): só "entrou sócio", sem nome. G: nenhum dado de saúde.
- Actor novo, ou com menos de 20 usuários, entra `testing`; só vira `available` depois de uma execução real validada (`set_signal_cascade_state`), passo do Nan.

## Fatias (um commit cada, uma PR)

0. Diagnóstico. 1. Marca neutra + guardas. 2. Motor + A1 (vaga de comex) + `buscar_sinais` + `signal-runner`. 3. Infra de mercado/fotografias/LLM + ICP A (resto). 4 a 10. ICPs B, C, D, E, F, G, H (esteira do Mapa). 11. Catálogo e playbook do Hermes para os 8 ICPs.

Tickets: `issues/01..` neste diretório.

## Fora de escopo

Interface para o feed de Sinais de mercado; cartão de Conta para os tipos novos; Monitoramentos de cascata dentro do "Reescanear" manual; qualquer aplicação em produção.
