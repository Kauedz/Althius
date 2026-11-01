# 15: Retirada de schema dos quatro Agentes

**Status:** wontfix

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva/relaxante: **nenhum `drop table`, `truncate`, `delete` de linha nem `drop column` de dado existente.** Relaxa `CHECK` e guarda, nunca remove dado. Migration já aplicada nunca é editada; função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Este é o último ticket da trilha de retirada — não roda antes dos quatro anteriores estarem prontos.

**Blocked by:** 10 (Esconder os quatro Agentes da interface), 11 (Sequência sem exigir o Rhetor), 12 (Auditoria de presença em LLM como ferramenta interna), 13 (Parar de semear os quatro Agentes), 14 (Hermes: limpeza do mapa de personas)

**Decisões:** D9(d) (retirada de schema é o último passo, sem apagar dado) e D1 (dado existente fica só leitura, sem migração) da ADR-0033.

## O que construir

- O `CHECK` de `private.specialty_catalog` (`specialty in ('scopus', 'ethos', 'rhetor', 'oraculum')`) é **relaxado**, não removido: passa a aceitar qualquer valor que já exista, marcando as 4 linhas atuais como retiradas (uma coluna ou flag nova, aditiva, ex. `retired_at` ou equivalente — desenho deste ticket), sem apagar a linha nem o texto de cada Especialidade.
- A guarda `private.protect_default_agent` (que hoje recusa `delete` de um Agente `kind = 'padrao'`) é **relaxada** só o suficiente para permitir, no futuro, uma remoção deliberada e auditada — mas este ticket **não apaga nenhuma linha**. A guarda continua recusando um `delete` acidental; o que muda é a condição que ela verifica, documentada no próprio ticket.
- Os testes que contam "exatamente 4 Especialidades" (`projeto-althius-frontend/src/App.test.tsx`, pgTAP de `supabase/tests/agentes_e_permissoes.sql`) são atualizados para refletir que o catálogo está retirado, sem remover a cobertura de que as 4 linhas originais continuam no banco, só leitura.
- Nenhuma tabela, coluna ou linha é removida: `private.agents`, `agent_settings`, `agent_permissions`, `agent_memory_facts`, `agent_skills`, `agent_routines`, `agent_events`, `agent_conversations`, `agent_runs` continuam como estão, com todo o dado histórico das 4 Especialidades.

## Pode mexer

- Migration nova que relaxa o `CHECK` de `private.specialty_catalog` e a condição de `private.protect_default_agent`, com pgTAP cobrindo os dois comportamentos (relaxado, mas sem apagar).
- `projeto-althius-frontend/src/App.test.tsx` e `supabase/tests/agentes_e_permissoes.sql`, só nos asserts que contavam "exatamente 4".

## Não mexa

- Nenhuma tabela ou coluna com `drop`. Nenhum `delete` de linha. Nenhum `truncate`.
- `private.seed_default_agents`: já parou de semear no ticket 13; este ticket não precisa mexer nela de novo.
- O mapa de personas do Hermes (`orquestracao.ts`): já limpo no ticket 14.
- O gate de Sequência: já desacoplado no ticket 11.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.

## Critérios

- [ ] O `CHECK` de `private.specialty_catalog` aceita o estado retirado sem rejeitar as 4 linhas existentes.
- [ ] Nenhuma linha de `private.agents` ou tabela dependente é removida; um teste lê o total de linhas antes e depois da migration e confirma que não mudou.
- [ ] `private.protect_default_agent` continua recusando um `delete` acidental de Agente padrão.
- [ ] `App.test.tsx` e o pgTAP de `agentes_e_permissoes.sql` não dependem mais de "exatamente 4 Especialidades" como premissa de produto ativo, mas continuam cobrindo que o dado histórico existe.
- [ ] pgTAP: isolamento por Workspace; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments

31/10/2026: `wontfix`. O Sinais first foi desfeito pela ADR-0034; ver `.scratch/desfazer-sinais-first/`.
