# 04: Catálogo "Para o seu nicho" ranqueado pelo ICP

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Nada de letra de nicho A–H visível ao Cliente.

**Blocked by:** 01 (ICP estruturado único)

**Decisões:** D4 (o catálogo continua, como Modelos) e D5 (o catálogo ranqueia pelo ICP) da ADR-0033; ADR-0032 decisão 4.

## O que construir

- A prateleira "Para o seu nicho", que já existe em `pagina-sinais.tsx` lendo "Segmentos do ICP da Memória", passa a ler o ICP estruturado único (ticket 01) em vez da leitura ad hoc de hoje. O comportamento visível (uma prateleira com os cards mais relevantes para o nicho do Cliente, e o texto de ajuda convidando a preencher o ICP quando ele estiver vazio) continua o mesmo; muda a fonte de dado por trás.
- Sem ICP preenchido, a prateleira se comporta como hoje quando a Memória também está vazia: mostra os Sinais que valem para qualquer nicho, com o convite a preencher o ICP.
- Este ticket não precisa esperar os Modelos (ticket 06): a prateleira ranqueia os cards do catálogo que já existem hoje (`public.signal_catalog`), e passa a ranquear também os Modelos assim que o ticket 06 estiver no ar, sem mudança adicional.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/pagina-sinais.tsx` (a prateleira "Para o seu nicho") e `catalogo.ts`/`catalogo-funcional.ts`, com testes.
- Uma função de leitura nova, só de consulta, que cruza `public.signal_catalog` com o ICP estruturado único do ticket 01 (sem mudar a tabela do catálogo).

## Não mexa

- `public.signal_catalog` e `public.signal_catalog_niches`/`public.signal_niches`: não ganham coluna de ICP; o cruzamento é feito na leitura, não no dado do catálogo.
- As cascatas de Sinal e a letra de nicho A–H: continuam uma classificação à parte, nunca exposta ao Cliente.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.

## Critérios

- [x] Com ICP preenchido, a prateleira "Para o seu nicho" mostra cards diferentes para Workspaces com ICPs diferentes.
- [x] Sem ICP preenchido, a prateleira mantém o comportamento de hoje (cards que valem para qualquer nicho, convite a preencher).
- [x] Nenhuma letra A–H nem termo técnico de cascata aparece na tela.
- [ ] pgTAP: isolamento por Workspace na leitura cruzada; três `supabase db reset && supabase test db` verdes.
- [ ] Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration (se houver) e publica o frontend.

## Comments

- 2026-10-27 — Criada a migration aditiva `20261217110000_catalogo_ranqueado_pelo_icp.sql` com a RPC somente de leitura `list_signal_catalog_for_my_icp`, que confere a participação ativa e cruza a versão vigente do ICP com os nichos do catálogo já existente. A prateleira operacional consome os IDs retornados; cards universais continuam aparecendo e a Demonstração preserva a Memória simulada. Incluído pgTAP para validar correspondência por ICP, diferença entre nichos, isolamento entre Workspaces e `security definer`. Vitest focado passou (33 testes), lint passou com avisos já existentes no repo, typecheck e build passaram (build avisa que o ID do Google está vazio e sobre o tamanho do bundle), e `deno check supabase/functions/*/index.ts && deno test supabase/functions` passou (1.873 testes, 39 ignorados). O Vitest completo ficou sem progresso após iniciar; pgTAP, os três `db reset && supabase test db` e CI continuam pendentes de execução em CI/ambiente com banco. Não houve deploy; depois do CI verde, a migration precisa ser aplicada e o frontend publicado conforme os Passos do Nan.
