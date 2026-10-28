# 09: Página do Sinal e "Meus Sinais"

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita), a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (decisão 6 do corpo da Decisão, "'Agente de Sinal' e 'Agente de Contas' passam a existir para o Cliente") e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 08 (Composer cria o Sinal)

**Decisões:** D1 (o Agente de Sinal é a experiência central, não mais ao lado dos 4 Especialistas) e D7 (cada Sinal tem página própria; aparece em "Meus Sinais") da ADR-0033. Este ticket absorve e substitui o ticket [14 de `.scratch/agente-de-sinal/`](../../agente-de-sinal/issues/14-pagina-de-sinais-reorganizada.md) ("Página de Sinais reorganizada") — marcar aquele como apontando para este.

## O que construir

- A página de um Sinal (hoje `pagina-do-tipo.tsx`/`editor.tsx`, por trás de `/sinais/tipos/:tipoId` e `/sinais/.../:monitoramentoId`) passa a ser tratada, na interface, como a superfície do Agente de Sinal daquele pedido: nome editável em destaque, Briefing, Plano vigente e seu histórico de versões, Agenda, preço e o histórico de Rodadas — tudo que já existe hoje, organizado como "a página do meu Agente", sem exigir nova tela do zero.
- A tela de Sinais (`pagina-sinais.tsx`) se reorganiza em duas áreas: **"Meus Sinais"** (todo Sinal ativo do Workspace, criado pelo composer, por um Modelo ou pelo fluxo antigo de `/sinais/novo`) e **"Modelos"** (o catálogo, ticket 06). Um Sinal criado pelo composer (ticket 08) aparece em "Meus Sinais" assim que salvo, com o nome que o composer gerou.
- Nenhum Sinal muda de identidade por causa desta reorganização: o mesmo `private.signal_monitors` de sempre, só reapresentado.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/pagina-sinais.tsx`, `pagina-do-tipo.tsx`, `editor.tsx` e as rotas de `src/paginas/sinais/rotas.tsx`, com testes.
- Leitura de `list_signal_monitors` e da coluna de rastreabilidade do ticket 08, só para exibição (sem mudar o contrato dessas funções).
- `src/components/casca.tsx` (barra lateral), só para garantir que "Meus Sinais" e "Modelos" fiquem claros como destinos, sem remover nada que a trilha 10–15 ainda não tenha decidido remover.

## Não mexa

- `private.signal_monitors`, `signal-runner`, Agenda, preço e Rodada: nenhuma mudança de comportamento, só de apresentação.
- Os formulários antigos por tipo de Sinal: continuam existindo até a limpeza correspondente (fora desta frente, ver Further Notes da spec).
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- A grade dos 4 Agentes e o @menção: a retirada deles é a trilha 10–15, não este ticket.

## Critérios

- [x] Um Sinal criado pelo composer aparece em "Meus Sinais" com o nome gerado, editável ali mesmo.
- [ ] A página de um Sinal mostra Briefing, Plano vigente com histórico de versões, Agenda, preço e Rodadas, sem exigir navegação extra. Automated coverage for the complete composed page and per-version history is still missing; current data exposes only the current Plan version.
- [x] "Meus Sinais" e "Modelos" são destinos claramente distintos na mesma tela de Sinais.
- [x] Nenhum dado de Sinal muda de forma pela reorganização (mesmos valores, mesma tabela), verified by the Supabase source mapping and rename payload test.
- [ ] Vitest cobrindo a listagem de "Meus Sinais" com Sinais de origens diferentes (composer, Modelo, `/sinais/novo`); lint e build verdes; CI verde nos três jobs. Focused Vitest (37 tests), lint, and build pass; full `npm test` remains blocked by six pre-existing ticket-07 failures in `src/App.test.tsx`. CI-only portions stay unticked until the PR jobs are green.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot publica o frontend.

## Comments

### 2026-10-27

Reorganizei a tela de Sinais em áreas distintas de **Meus Sinais** e **Modelos**. Meus Sinais agora lista todo Monitoramento ativo do Workspace, independentemente do card de catálogo, com link para a página do Sinal e rótulo neutro para composer/Modelo; o fluxo antigo não exibe rótulo. A página do Sinal continua usando os componentes existentes para Briefing/Plano, Agenda, preço em créditos e Rodadas, sem alteração de dados ou SQL. O mapeamento aceita `created_via` opcional para integração com o ticket 08. Adicionei cobertura Vitest para as três origens e marquei o ticket 14 como absorvido.

Focused Vitest (37 tests), lint, and build pass. Full `npm test` still fails only in the known ticket-07 App tests (six failures); those tests were left unchanged. The Plan contract has no per-version history, so the page continues to show the current version and needs a read RPC in a follow-up; no migration, deploy, or remote database action was performed.
