# 06: Modelos — card do catálogo lança um Plano-semente

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita), a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (decisão 4 do corpo da Decisão, "Modelos são planos-semente versionados") e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Primeiro corte no escopo Contas (ADR-0032, decisão 12).

**Blocked by:** nenhum (pressupõe os tickets 01–04 de [`.scratch/agente-de-sinal/`](../../agente-de-sinal/spec.md), já na `main`)

**Decisões:** D4 (o catálogo continua, como Modelos) da ADR-0033; ADR-0032 decisão 4 do corpo da Decisão. Este ticket absorve e substitui o ticket [11 de `.scratch/agente-de-sinal/`](../../agente-de-sinal/issues/11-modelos.md) ("Modelos") — marcar aquele como apontando para este.

## O que construir

- Cada card do catálogo de Sinais (`public.signal_catalog`) passa a ser um **Modelo**: um plano-semente versionado, com Briefing pronto, Plano editável, Agenda sugerida e estimativa de créditos, pré-montado com a mesma IA do `signal-plan` (ou com um Plano de referência já validado, quando a geração em tempo real não for necessária). Clicar num Modelo abre a página de revisão do Plano já preenchida, do mesmo jeito que `/sinais/novo` abre hoje depois do Briefing — só que o Briefing já vem pronto.
- A pessoa pode ajustar o Plano, a Agenda e os critérios antes de aprovar, exatamente como um Plano criado do zero. Usar um Modelo não cria vínculo contínuo com o catálogo: o Sinal resultante é independente, e editá-lo depois não muda o Modelo original.
- Isso é a base que o composer (ticket 07) consulta para sugerir Modelos; este ticket entrega a experiência completa de usar um Modelo pela tela do catálogo, sem depender do composer ainda.

## Pode mexer

- Migration nova (versão do Modelo, plano-semente, estimativa) e pgTAP em `supabase/tests/`.
- `supabase/functions/signal-plan/` ou uma função irmã, para gerar/validar o plano-semente de um Modelo.
- `projeto-althius-frontend/src/paginas/sinais/pagina-sinais.tsx`, `catalogo.ts`/`catalogo-funcional.ts` e o fluxo de `/sinais/novo`, com testes, para abrir a revisão do Plano a partir de um Modelo.

## Não mexa

- `public.signal_catalog` como fonte dos metadados do card (nome, família, fonte): este ticket adiciona o plano-semente, não substitui o catálogo.
- A Agenda e o preço (já construídos nos tickets 03–04 de `agente-de-sinal`): reaproveitados, não refeitos.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [ ] Clicar num card do catálogo abre um Plano já preenchido (Briefing, critérios, Agenda sugerida, estimativa de créditos), editável antes de aprovar.
- [ ] Aprovar o Plano de um Modelo cria um Sinal independente; editar esse Sinal depois não muda o Modelo original.
- [ ] Só o Plano aprovado roda; o plano-semente do Modelo nunca roda sozinho.
- [ ] pgTAP: isolamento por Workspace; versão do Modelo lida por conjunto, sem depender de ordem de `created_at`; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica as Edge Functions tocadas.

## Comments
