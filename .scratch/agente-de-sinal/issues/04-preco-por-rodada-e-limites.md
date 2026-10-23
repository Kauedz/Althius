# 04: Preço por rodada e limites

**Status:** ready-for-agent

**GATE:** Segue a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (Proposta) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com o número do prompt e pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; o Cliente vê só créditos; nada de letras de nicho A–H; nada envia mensagem, cria Conta-alvo ou Sequência sozinho. Prompt 30-05. Pede também a seção "Custo por rodada" no PR.

**Blocked by:** 01, 02, 03

**Decisões pendentes que pesam aqui:** 2 (Preço), 3 (limites), 4 (Teto), 14 (pausa), 12 (ordem).

## O que construir

- **Prévia antes de ativar**: o Cliente vê os créditos por Rodada, por dia e por mês, calculados do Plano aprovado e da Agenda. Só créditos na tela.
- **Cobrança por rodada** (decidida): cada Rodada reserva e debita créditos pelo caminho de créditos que já existe (`reserve_credits`), com a chave da Rodada, então repetir nunca cobra duas vezes. A Rodada que falha por culpa da Althius não é cobrada.
- **Preço por rodada** (decisão 2, `DECISÃO PENDENTE`; função única no servidor): fixo por fonte, isto é, por Conta verificada no escopo Contas e fixo por Rodada no mercado (hoje 4 créditos, `market_discovery_credits_per_run`). A Rodada sem novidade cobra o que foi verificado.
- **Limites seguros** (decididos na existência, com valores em aberto): intervalo mínimo e máximo de Rodadas por dia (ticket 03), **teto diário por Sinal** em créditos, e o comportamento quando o saldo acaba: a Rodada é pulada, registrada com o motivo, e nada roda pela metade.
- **Pausa automática** (decisão 14, `DECISÃO PENDENTE`): depois de 3 Rodadas seguidas puladas por falta de créditos, o Sinal pausa e mostra o motivo; a pessoa retoma quando houver saldo.
- O Teto mensal do automático continua valendo (decisão 4); o teto diário por Sinal é outro limite e não o substitui.

## Pode mexer

- Migration nova (cálculo da prévia, teto diário por Sinal, contador de Rodadas puladas, pausa) e pgTAP.
- `signal-runner` (reserva e débito por Rodada), com testes Deno.
- `projeto-althius-frontend/src/paginas/sinais/` e `src/fonte/`: a prévia e o aviso de pausa, com testes.

## Não mexa

- A tabela de créditos de outras ações (enriquecimento, Execuções de Agente) e o plano do Workspace.
- `stripe-billing` e `stripe-webhook`.
- A forma de cobrança da reativação mensal e do "Buscar Sinais de novo", que seguem como estão.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Rotas, casca, menu lateral e componentes base além do que o ticket pede.
- O motor dos Agentes e o worker do Hermes.
- O conteúdo da Demonstração, além do mínimo para os testes.

## Critérios

- [ ] A prévia bate com o que a Rodada realmente cobra (teste que compara prévia e débito no mesmo Plano).
- [ ] A Rodada repetida não cobra duas vezes; a Rodada que falha por erro nosso não cobra.
- [ ] Sem saldo, a Rodada é pulada com motivo; na terceira seguida o Sinal pausa e mostra por quê (teste com três Rodadas sintéticas).
- [ ] O teto diário por Sinal para a Rodada que o estouraria, sem cobrar parcial.
- [ ] O Cliente nunca vê US$, custo de fornecedor, nome de actor nem valor de Teto.
- [ ] O preço, os limites e a pausa ficam em constantes/funções únicas e entram no PR como `DECISÃO PENDENTE` 2, 3, 4 e 14.
- [ ] O PR traz "Custo por rodada" em créditos, por fonte.
- [ ] pgTAP determinístico (horários fixos, conjuntos ordenados), três ciclos verdes; Deno, Vitest, lint, build e CI verdes.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration, publica as Edge Functions tocadas e o worker, e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments
