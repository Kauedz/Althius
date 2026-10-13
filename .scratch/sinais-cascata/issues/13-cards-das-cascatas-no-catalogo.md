# 13: Cards das cascatas no catálogo de Sinais

**What to build:** a página Sinais mostra os Sinais em cascata do Mapa de Mercado (39 tipos, ICPs A–H) como cartões do catálogo, agrupados por ICP, com o selo de disponibilidade certo (Disponível, Em teste, Sem fonte com o motivo) e a marca de escopo (da Conta ou de Mercado). Hoje as cascatas existem no banco, no Hermes e nos Monitoramentos, mas **nenhum cartão as mostra**: o catálogo da tela é o mock estático `paginas/sinais/catalogo.ts` (ids em kebab-case) com o estado real sobreposto por `fonte/supabase-sinais.ts`, e os `signal_type` das cascatas (snake_case) não estão em `TIPO_DO_SINAL_REAL` nem em `TIPOS`/`FAMILIAS`. Esta lacuna foi registrada nas PRs [#189](https://github.com/Kauedz/Althius/pull/189) e [#190](https://github.com/Kauedz/Althius/pull/190) como "cartão para os tipos novos: não feito".

**Blocked by:** 12 (o Mapa e as cascatas semeadas, já na `main`). Para ver cartões reais em produção, depende também do Nan aplicar as migrações das cascatas (ver "Passos do Nan"); a implementação e os testes não dependem disso.

**Status:** ready-for-human

Commit: PR do ticket 13 (migração `20261014130000_catalogo_de_cascatas_para_a_tela.sql`, teste pgTAP `catalogo_de_cascatas_para_a_tela.sql`, `fonte/mapa-de-cascatas.ts`, `paginas/sinais/cascatas.tsx`)

## Diagnóstico (o que existe e o que falta)

- `public.list_signal_catalog()` (authenticated) devolve só `(signal_type, origin, state)`. Cascata `sem_fonte` ou `disabled` vira `out`; `testing` vira `testing`; `available` vira `available`. **Não** traz ICP, nome, escopo (conta/mercado) nem o motivo do `sem_fonte`.
- `public.signal_cascade_catalog()` traz tudo isso (`signal_type, icp, name, state, scope, sem_fonte_motivo, cadence_hours`), mas é só `service_role`: a tela não pode chamá-la, de propósito (o motivo e os campos técnicos não saem por RPC da tela sem revisão).
- O texto do Mapa (nome do ICP, gatilho, restrição) vive em `supabase/functions/_shared/mapa-de-sinais.ts` (Deno); o frontend não o importa.
- `disponibilidade.tsx` já sabe renderizar Disponível / Em teste / Em breve e decide `podeMonitorar`; falta o estado "Sem fonte" com motivo e o de Mercado.

## O que construir

1. **RPC nova de leitura para a tela** (migração nova, regras de `docs/agents/migrations.md`): `public.list_cascade_catalog()` para `authenticated`, `security definer`, `set search_path = ''`, `perform private.require_user()`. Devolve só o que o cartão precisa: `signal_type, icp, name, state, scope, sem_fonte_motivo`. **Sem** cap, passos, handler, multiplicador, `notes` ou qualquer campo técnico. `revoke all … from public, anon`. O motivo já é filtrado por `private.texto_sem_marca` na escrita, mas a RPC não depende disso para a marca.
2. **Frontend:** uma fonte nova (em `fonte/`, ao lado de `supabase-sinais.ts`) lê a RPC e alimenta uma seção "Sinais por fonte" no catálogo, **um cartão por cascata**, agrupada por ICP com o nome do ICP (A: Comex e importação … H) e, quando houver, a restrição regulatória em uma linha (OAB/LGPD no C, CFC no B, SUSEP/saúde no G, ANEEL no D, CVM/Bacen no H). O texto do ICP, gatilho e restrição vem de uma cópia tipada no frontend com **um teste de paridade** contra `mapa-de-sinais.ts` (lido do disco no vitest), para os dois não divergirem.
3. **Selos e comportamento do cartão:**
   - `available` → "Disponível". **Desvio do texto original:** não há tipo de Monitoramento de cascata na tela (os tipos de `catalogo.ts` são outros e criar Monitoramento de cascata é ticket à parte), então o cartão diz que o Monitoramento dele ainda não é criado por aqui, em vez de abrir um fluxo que não existe. Hoje nenhuma das 39 está `available`.
   - `testing` → "Em teste", **não** liga Monitoramento (igual hoje para Em teste), com a frase de que está em validação.
   - `sem_fonte` → "Sem fonte", mostra o motivo, sem botão de monitorar, sem custo. `disabled` → não aparece.
   - `scope = 'mercado'` → selo "Mercado": explica que mostra movimento do mercado, não de uma Conta sua, e **não** oferece "monitorar esta Conta".
4. **Ids e mapa:** os tipos vêm do banco (snake_case); não inventar ids novos em kebab-case nem duplicar os 39 em `TIPOS` à mão. Se `TIPO_DO_SINAL_REAL`/`SINAL_DO_TIPO` precisar conhecê-los, que seja derivado do resultado da RPC, não uma lista paralela a manter.
5. **Marca:** nenhum texto do cartão, do motivo, do tooltip ou de erro cita Apify, "actor", OpenAI/Anthropic/Claude/GPT/Codex. O teste `src/guarda-de-marca.test.ts` (regex só `apify|actor`) continua verde e **não** é afrouxado; se couber, um teste novo do cartão aplica a `MARCA_INTERNA` completa ao que o cartão renderiza.
6. **Estados vazios e erro:** RPC fora do ar ou sem linhas → a seção some ou mostra "indisponível agora", **sem** quebrar o catálogo atual; a página continua funcionando com o mock estático como hoje.

## Pode mexer

- Uma migração nova com `list_cascade_catalog()` e o teste pgTAP dela (`supabase/tests/`).
- `projeto-althius-frontend/src/fonte/` (fonte nova da RPC; ajuste mínimo em `supabase-sinais.ts` / `sinais-reais-mapa.ts` só se necessário).
- `projeto-althius-frontend/src/paginas/sinais/` (seção/cartão novos; ajuste em `pagina-sinais.tsx`, `disponibilidade.tsx`, `componentes.tsx` e seus testes).
- Tipos em `@/fonte/sinais-tipos` (campos novos opcionais).

## Não mexa

- O motor de cascata, as migrações já mergeadas (`20261013*`, `20261014*`), `signal_cascade_catalog()` (continua service-role) e `list_signal_catalog()` (contrato atual).
- O catálogo estático existente (`catalogo.ts`) e os cartões atuais dos tipos antigos.
- Hermes, `signal-runner`, `buscar_sinais` e o worker.
- Nada de aplicar migração, publicar função ou mexer em segredo em produção.

## Critérios

- [x] **Vermelho primeiro (vitest):** os testes dos cartões, da fonte Supabase e do mapa foram escritos e falharam antes do código (`evidencias/13-vermelho.txt`, `13-verde.txt`). O pgTAP da RPC foi escrito antes da migração, mas **não rodou local** (o Postgres local não foi iniciado nesta sessão): quem o roda é o job Banco do CI.
- [ ] pgTAP: `authenticated` lê a RPC; `anon` e `public` não; a resposta tem **só** as 6 colunas acordadas; `disabled` não aparece; o resultado bate com as cascatas semeadas (39 linhas, 8 de `mercado`, 12 `sem_fonte`) e `sem_fonte` sempre vem com motivo.
- [x] A página Sinais mostra, para cada ICP A–H, os cartões das suas cascatas na ordem do Mapa, com nome, selo de disponibilidade e (quando for o caso) selo de Mercado.
- [x] Cartão `sem_fonte` mostra o motivo e não permite monitorar; `testing` mostra "Em teste" e não permite monitorar; `available` segue o fluxo atual.
- [x] Os 39 tipos do Mapa aparecem; um teste de paridade falha se o frontend e `mapa-de-sinais.ts` divergirem em ICP, nome do ICP ou lista de tipos.
- [x] Nenhum texto renderizado cita fornecedor ou "actor" (teste com `MARCA_INTERNA` sobre o HTML do cartão e do motivo).
- [x] Com a RPC falhando ou vazia o catálogo atual continua intacto, sem erro na tela.
- [ ] Lint, vitest e build do frontend verdes; CI das três jobs verde.
- [ ] Verificação visual no navegador (é trabalho do agente, ver `docs/agents/triage-labels.md`) com a RPC servida por um fake local: print do desktop e do celular, com um cartão de cada estado e o de Mercado.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar no projeto Supabase de produção, **nesta ordem**, só depois de confirmar com o Nan: as migrações das cascatas (`20261013120000` em diante, ainda não aplicadas), `20261014120000_fila_de_ia_dos_sinais.sql` e a migração nova desta fatia (`list_cascade_catalog`). Sem as das cascatas, a RPC nova não tem de onde ler e a seção fica vazia.
2. Publicar o frontend (fluxo normal de deploy do repositório).
3. Abrir a página Sinais logado numa Workspace de teste e conferir: ICPs A–H com cartões; os 12 `sem_fonte` com o motivo; os 8 de Mercado com o selo; nenhum texto com o nome de fornecedor.
4. Ver o passo a passo e as regras que valem em todo ticket em `docs/visao-geral-da-plataforma.md`, seção 4 ("Passos do Nan").

## Comments

- Escopo mínimo de propósito: só leitura e exibição. Criar Monitoramento de cascata na tela, o feed de Sinais de Mercado e o "Reescanear" manual de cascata são tickets à parte.
- Decisão a confirmar com o Nan antes de codar: onde fica a seção (nova aba "Por fonte" ao lado de Todos/Externo/Interno/Originado, ou dentro de Externo agrupada por ICP). O ticket assume uma seção nova agrupada por ICP; mudar isso não muda a RPC.
