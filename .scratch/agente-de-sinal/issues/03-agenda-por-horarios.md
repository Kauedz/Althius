# 03: Agenda por horários

**Status:** ready-for-agent

**GATE:** Segue a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (Proposta) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com o número do prompt e pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; o Cliente vê só créditos; nada de letras de nicho A–H; nada envia mensagem, cria Conta-alvo ou Sequência sozinho. Prompt 30-04.

**Blocked by:** 01

**Decisões pendentes que pesam aqui:** 3 (Agenda), 12 (ordem).

## O que construir

- O Cliente escolhe a **Agenda** do Sinal: quantas Rodadas por dia e em quais horários, e em quais dias. Substitui o intervalo em horas (`every_hours`) na tela, sem apagar o campo.
- O relógio (`pg_cron` `althius-signal-runner`, a cada 10 minutos) continua o mesmo: ele acorda o `signal-runner`, que roda as Rodadas cujo horário chegou. A precisão da Agenda é a do relógio; a tela diz isso.
- **Limites da Agenda** (decisão 3, `DECISÃO PENDENTE`; constantes no servidor): intervalo mínimo de 2 h entre Rodadas, até 6 Rodadas por dia por Sinal, dias úteis como padrão. O servidor recusa Agenda fora disso, mesmo que a tela deixe passar.
- Fuso e virada de dia definidos neste ticket e escritos no PR; a hora marcada da Rodada é a chave de idempotência.
- A Agenda faz parte do que a pessoa revisa antes de ativar (a prévia de créditos vem no ticket 04).

## Pode mexer

- Migration nova (Agenda do Monitoramento e o cálculo da próxima Rodada) e pgTAP.
- `signal-runner` e a função do banco que devolve os Monitoramentos vencidos (`claim_due_signal_monitors`), redefinida a partir da última definição na `main`.
- `projeto-althius-frontend/src/paginas/sinais/` e `src/fonte/`, com testes.

## Não mexa

- O preço e a cobrança (ticket 04).
- O relógio e o token do runner (`configure_signal_runner`): não mudar o agendamento do `pg_cron`.
- Os Monitoramentos existentes: quem tem só `every_hours` continua rodando como hoje até migrar.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Rotas, casca, menu lateral e componentes base além do que o ticket pede.
- O motor dos Agentes e o worker do Hermes.
- O conteúdo da Demonstração, além do mínimo para os testes.

## Critérios

- [ ] A próxima Rodada é calculada pela Agenda e nunca gera duas Rodadas para o mesmo horário.
- [ ] Agenda com menos de 2 h entre Rodadas, mais de 6 por dia ou sem horário é recusada pelo servidor (pgTAP e Deno), com mensagem neutra.
- [ ] Os limites ficam numa constante/campo único e aparecem no PR como `DECISÃO PENDENTE` 3.
- [ ] Teste com horários fixos passados como parâmetro, nunca com `now()` implícito nem dependência de ordem de linhas.
- [ ] Monitoramento antigo sem Agenda segue a cadência de hoje (teste de regressão).
- [ ] pgTAP, Deno, Vitest, lint, build e CI verdes.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration, publica as Edge Functions tocadas e o worker, e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments
