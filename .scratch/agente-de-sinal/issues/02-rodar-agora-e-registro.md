# 02: Rodar agora e registro da Rodada

**Status:** ready-for-agent

**GATE:** Segue a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (Proposta) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com o número do prompt e pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; o Cliente vê só créditos; nada de letras de nicho A–H; nada envia mensagem, cria Conta-alvo ou Sequência sozinho. Prompt 30-03.

**Blocked by:** 01

**Decisões pendentes que pesam aqui:** 4 (Teto), 12 (ordem).

## O que construir

- Botão **Rodar agora** no Sinal ativo: uma Rodada do Plano aprovado por clique de uma pessoa, sem esperar a Agenda.
- **Registro da Rodada**: quem ou o que a iniciou (agendada ou Rodar agora), a versão do Plano, quando começou e terminou, quantas Contas foram verificadas, quantos Sinais novos saíram, quantos créditos gastou e, se parou antes, o motivo em palavras do produto. A tela mostra o histórico das Rodadas do Sinal.
- A Rodada é **idempotente**: a chave é o Sinal e a hora marcada (ou o pedido do clique), então repetir nunca cobra nem grava duas vezes.
- **Teto** (decisão 4, `DECISÃO PENDENTE`): o automático continua exigindo o Teto mensal; "Rodar agora" (clique humano) não exige, como o "Buscar Sinais de novo" manual de hoje. A regra fica numa única função/constante, fácil de trocar. O saldo de créditos continua sendo conferido sempre.
- Rodar agora reaproveita o caminho do `signal-runner` (fila de pedidos, como a das buscas de reativação); não nasce outro runner.

## Pode mexer

- Migration nova (registro da Rodada e o pedido de "Rodar agora") e pgTAP.
- `supabase/functions/signal-runner/` para atender o pedido e gravar o registro.
- `projeto-althius-frontend/src/paginas/sinais/` e `src/fonte/`, com testes.

## Não mexa

- A Agenda e o preço por fonte (tickets 03 e 04).
- A reativação mensal de Sinais e o "Buscar Sinais de novo" da Conta, que seguem como estão.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Rotas, casca, menu lateral e componentes base além do que o ticket pede.
- O motor dos Agentes e o worker do Hermes.
- O conteúdo da Demonstração, além do mínimo para os testes.

## Critérios

- [ ] "Rodar agora" roda só o Plano aprovado; sem Plano aprovado, o botão não faz nada e diz por quê.
- [ ] Duas pessoas clicando juntas ou um clique repetido geram uma Rodada só, cobrada uma vez.
- [ ] O registro mostra créditos, Contas verificadas, Sinais novos e o motivo quando a Rodada para (sem saldo, sem contrato, tempo da função); o erro real fica só no log técnico.
- [ ] Participação conferida: quem não é do Workspace não vê nem pede Rodada (pgTAP).
- [ ] A regra do Teto está isolada e listada no PR como `DECISÃO PENDENTE` 4.
- [ ] pgTAP determinístico, três ciclos verdes; Deno, Vitest, lint, build e CI verdes.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration, publica as Edge Functions tocadas e o worker, e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments
