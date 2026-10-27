# 08: Composer cria o Sinal

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita), a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (decisões 2 e 5 do corpo da Decisão — "Só o Plano aprovado roda" e "Cobrança por rodada, em créditos" — e decisão 13 de "Decisões em aberto" — limite de 20 Planos por dia) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Primeiro corte no escopo Contas.

**Blocked by:** 07 (Composer classifica a intenção do pedido)

**Decisões:** D2 (spawn: composer → `signal-plan` → Plano com preço e Agenda → `save_signal_plan`), D6 (preço de sempre) e D7 (nome automático editável, página própria) da ADR-0033.

## O que construir

- Quando o composer (ticket 07) classifica o pedido como "precisa de um Plano novo", ele chama o `signal-plan` já existente (o mesmo que `/sinais/novo` usa) com o texto do pedido como Briefing, e mostra o Plano proposto, editável, dentro do próprio fluxo do composer — sem precisar a pessoa sair e re-digitar em `/sinais/novo`.
- A pessoa revisa e aprova o Plano, escolhe a Agenda e vê o preço por Rodada, por dia e por mês (a mesma prévia de `quote_signal_schedule` que já existe), exatamente como no fluxo de hoje. Só o Plano aprovado roda; o texto do pedido nunca vai ao `signal-runner` (ADR-0032, decisão 2).
- Ao salvar, chama `save_signal_plan` (já existente) para criar o Sinal (`private.signal_monitors`). O nome do Sinal é gerado a partir do pedido pela mesma IA que monta o Plano, e fica editável no campo `name` que já existe hoje.
- Uma coluna aditiva nova em `private.signal_monitors` registra que aquele Sinal nasceu do composer (nome definido neste ticket, ex. `created_via`), só para rastreabilidade — sem FK obrigatória para uma Conversa, porque este composer não abre Conversa com Agente.
- Depois de salvo, a pessoa é levada para a página do Sinal recém-criado (a página que já existe hoje para um Monitoramento, antes da reorganização do ticket 09).

## Pode mexer

- Migration nova (coluna de rastreabilidade em `private.signal_monitors`) e pgTAP em `supabase/tests/`.
- `projeto-althius-frontend/src/conversa/composer.tsx` e o fluxo de revisão de Plano (reaproveitando os componentes de `briefing.tsx`/`agenda.tsx` que já existem em `src/paginas/sinais/`), com testes.
- `supabase/functions/signal-plan/` só para aceitar a origem "composer" como um Briefing igual a qualquer outro (sem mudar seu contrato de validação).

## Não mexa

- `signal-runner`, `save_signal_monitor`, `quote_signal_schedule`, os limites de Agenda e de Teto: continuam exatamente como estão.
- O limite de 20 Planos por dia por Workspace (ADR-0032, decisão 13): o composer soma ao mesmo contador, não ganha um limite à parte.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes; `SIGNALS_LLM_PROVIDER` continua sendo o único motor configurado.

## Critérios

- [ ] Um pedido de Sinal no composer abre um Plano editável, com Agenda e preço por Rodada/dia/mês visíveis antes de ativar.
- [ ] O texto do pedido nunca chega ao `signal-runner`; só o Plano aprovado roda.
- [ ] O Sinal criado tem nome gerado automaticamente a partir do pedido, editável a qualquer momento.
- [ ] Salvar leva a pessoa para a página do Sinal recém-criado.
- [ ] A coluna de rastreabilidade identifica que o Sinal nasceu do composer, sem quebrar Sinais criados por `/sinais/novo` (que ficam com o valor padrão de "não veio do composer").
- [ ] pgTAP: isolamento por Workspace; coluna aditiva não quebra nenhuma leitura existente de `private.signal_monitors`; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica as Edge Functions tocadas.

## Comments
