# 05: Aderência nas empresas achadas por Sinais de mercado

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 01 (ICP estruturado único)

**Decisões:** D5 (Nível de Aderência nas empresas achadas por Sinais) da ADR-0033; [ADR-0006](../../../docs/adr/0006-aderencia-como-classificacao-unica.md) (Aderência como classificação única) e [ADR-0007](../../../docs/adr/0007-sinal-disparado-torna-conta-quente.md) (Sinal disparado torna Quente, sem determinar Fit).

## O que construir

- Um Sinal de escopo `mercado` entrega, hoje, uma empresa nova na Caixa de Descobertas (Candidata), sem nível de Aderência. Este ticket calcula e grava, para cada Candidata trazida por um Sinal de mercado, o mesmo **Nível de Aderência** (`fit_level`: alto, médio, baixo, sem dado) que `private.discovered_accounts` já calcula para a descoberta pelo ICP, usando o mesmo conceito de nota (`private.discovery_note`), agora contra o ICP estruturado único (ticket 01).
- Na tela, a Candidata trazida por Sinal passa a mostrar o Nível de Aderência do mesmo jeito que a Candidata trazida por descoberta de ICP já mostra — nunca a nota numérica, só o nível ([ADR-0006](../../../docs/adr/0006-aderencia-como-classificacao-unica.md)).
- O escopo `mercado` já existe no banco (`audience.escopo`) e depende de `vaga_mercado` ser validada em produção (ADR-0032, decisão 5, fora de código); este ticket prepara o cálculo de Aderência para quando esse escopo estiver ativo, sem depender da validação em si.

## Pode mexer

- A tabela/fluxo que já recebe as Candidatas trazidas por Sinal (o mesmo destino de hoje na Caixa de Descobertas), só para incluir a coluna de Aderência calculada.
- `private.discovery_note()` e `private.discovery_level()` (ou equivalente), reaproveitadas ou estendidas para aceitar uma Candidata de origem Sinal, além da origem ICP que já atendem.
- A tela da Caixa de Descobertas, para mostrar o Nível de Aderência nas Candidatas de origem Sinal, com testes.

## Não mexa

- A classificação de Aderência em Contas-alvo já existentes (Fit/Não fit) e a condição Quente: não mudam.
- `private.discovered_accounts` como fonte de verdade da descoberta por ICP: este ticket não funde as duas origens numa tabela só, só aplica o mesmo conceito de nível às duas.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- Nada neste fluxo aceita a Candidata sozinho: aceitar continua sendo decisão de uma pessoa.

## Critérios

- [ ] Uma Candidata trazida por um Sinal de escopo mercado mostra um Nível de Aderência (alto/médio/baixo/sem dado), nunca a nota numérica.
- [ ] O nível é calculado contra o ICP estruturado único do ticket 01; sem ICP preenchido, mostra "sem dado".
- [ ] Nada neste ticket aceita, descarta ou cria Conta-alvo sozinho.
- [ ] pgTAP: isolamento por Workspace; cálculo determinístico, sem depender de ordem de linhas; três `supabase db reset && supabase test db` verdes.
- [ ] Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica as Edge Functions tocadas.

## Comments
