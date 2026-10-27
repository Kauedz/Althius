# 06: Modelos — card do catálogo lança um Plano-semente

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita), a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (decisão 4 do corpo da Decisão, "Modelos são planos-semente versionados") e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Primeiro corte no escopo Contas (ADR-0032, decisão 12).

**Blocked by:** nenhum (pressupõe os tickets 01–04 de [`.scratch/agente-de-sinal/`](../../agente-de-sinal/spec.md), já na `main`)

**Decisões:** D4 (o catálogo continua, como Modelos) da ADR-0033; ADR-0032 decisão 4 do corpo da Decisão. Este ticket absorve e substitui o ticket [11 de `.scratch/agente-de-sinal/`](../../agente-de-sinal/issues/11-modelos.md) ("Modelos") — marcar aquele como apontando para este. Decisão do Renan (26/10/2026), no fim deste ticket, que resolve o bloqueio da sessão de 26/10 (autoria e publicação dos planos-semente).

## O que construir

- Cada card do catálogo de Sinais (`public.signal_catalog`) passa a ser um **Modelo**: um plano-semente versionado, com Briefing pronto, Plano editável, Agenda sugerida e estimativa de créditos, **gerado a partir do que já existe** (Decisão do Renan, 26/10/2026): dos campos do próprio card (`name`, `phrase`, `family`, `source_label`, `collector_types`, `job_filters`, os nichos em `public.signal_catalog_niches`, o custo estimado) e das regras e dados atuais (o planejador determinístico `supabase/functions/signal-plan/planejador-por-regra.ts`, os padrões de Agenda e o preço por Rodada/`quote_signal_schedule` já construídos). Nenhum texto de plano-semente é escrito à mão pela equipe Althius, e o Modelo não depende de geração por IA em tempo real.
- **Versão e publicação:** a versão de um Modelo deriva do conteúdo do card, por uma impressão (hash) dos campos-fonte. Uma geração idempotente (função SQL em migration nova, ou função irmã do `signal-plan` sem chamada a fornecedor pago) percorre o catálogo: para cada card sem versão, ou cuja impressão mudou, grava uma versão nova do plano-semente e a torna vigente; rodar de novo sem mudança no card não cria versão; a versão anterior fica guardada, não é apagada. Publicar é isso: a versão gerada já é a vigente, sem passo de aprovação da equipe. Prefira gerar no banco, para que a própria migration semeie a primeira versão de todos os cards existentes sem passo manual; se for preciso reaproveitar o planejador em TypeScript, o ticket documenta em "Passos do Nan" o único comando de geração. Card cujos campos não bastam para o planejador gera um Plano mínimo (Briefing a partir de `name`/`phrase`, Agenda padrão), editável, sem inventar fonte, número ou preço. Clicar num Modelo abre a página de revisão do Plano já preenchida, do mesmo jeito que `/sinais/novo` abre hoje depois do Briefing — só que o Briefing já vem pronto.
- A pessoa pode ajustar o Plano, a Agenda e os critérios antes de aprovar, exatamente como um Plano criado do zero. Usar um Modelo não cria vínculo contínuo com o catálogo: o Sinal resultante é independente, e editá-lo depois não muda o Modelo original.
- Isso é a base que o composer (ticket 07) consulta para sugerir Modelos; este ticket entrega a experiência completa de usar um Modelo pela tela do catálogo, sem depender do composer ainda.

## Pode mexer

- Migration nova (versão do Modelo, plano-semente, estimativa) e pgTAP em `supabase/tests/`.
- `supabase/functions/signal-plan/` ou uma função irmã, para gerar/validar o plano-semente de um Modelo a partir do card (reaproveitando `planejador-por-regra.ts`), sem chamada a fornecedor pago.
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
- [ ] Todo card visível do catálogo tem uma versão vigente de plano-semente, gerada dos campos do card e das regras atuais; nenhum plano-semente é texto fixo escrito à mão (teste: mudar um campo-fonte do card e rodar a geração cria versão nova e a torna vigente; rodar de novo sem mudança não cria versão; a versão anterior continua guardada).
- [ ] A estimativa de créditos do Modelo vem do preço por Rodada já existente (`quote_signal_schedule`), nunca de um número fixo gravado no plano-semente.
- [ ] O Sinal criado a partir de um Modelo registra qual versão do Modelo foi usada.
- [ ] pgTAP: isolamento por Workspace; versão do Modelo lida por conjunto, sem depender de ordem de `created_at`; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica as Edge Functions tocadas.

## Decisão do Renan (26/10/2026)

Decidido pelo Renan em 26/10/2026, 21:29 BRT: os planos-semente versionados dos Modelos são GERADOS A PARTIR DO QUE JÁ EXISTE (catálogo e dados atuais), e não escritos pela equipe Althius.

Antes, o bloqueio dizia: "falta definir como os Modelos recebem e publicam seus planos-semente versionados (autoria e publicação)." Com a decisão, o ticket deixa de estar bloqueado: a autoria é a geração automática a partir do catálogo (`public.signal_catalog` e nichos) e das regras e dados atuais, e a publicação é a versão gerada virar a vigente quando a impressão do card muda. "O que construir", "Pode mexer" e "Critérios" acima já refletem a decisão.

## Comments
