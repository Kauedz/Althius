# Handoff: Sinais em cascata de fontes (ICPs A a H)

Branch `claude/laughing-einstein-2y1gvz`, PR https://github.com/Kauedz/Althius/pull/189 (rascunho, sem merge, nada aplicado em produção). Spec, 12 tickets e diagnóstico em `.scratch/sinais-cascata/`; brief das fatias de ICP em `brief-icps.md`; evidências em `evidencias/`; texto completo do relatório da PR em `pr-body.md`.

## O que entrou

- **Motor** (`supabase/functions/_shared/cascata-de-sinais/`): `rodarCascata` (estimar → reservar → passos em ordem → teto de dólar → fallbacks → resultado parcial → liquidar pelo custo real). Pontas injetadas: `DbDaCascata` (`db.ts`, RPCs de `20261013130000`), `ClienteDaFonte` (`fonte-apify.ts`: POST /runs + espera, custo do run, rodízio só em saldo), fontes públicas (`fonte-publica.ts`, `comexstat.ts`), LLM opcional (`llm-anthropic.ts`). Passos: `passos/index.ts` junta o registro de cada ICP (`passos/icp-*.ts`); `passos/registro.test.ts` trava nomes repetidos.
- **Banco**: tabelas `private.signal_cascades`, `signal_cascade_steps`, `signal_cascade_runs`, `signal_cascade_run_steps`, feed de mercado (`record_market_signal`/`list_market_signals`), fotografias (`signal_snapshots_*`); `private.seed_signal_cascade(jsonb)` semeia cada cascata nas migrações `20261013130000` a `20261013220000`.
- **Superfícies**: `signal-runner` (Monitoramentos) e `buscar_sinais` do Hermes (via `signal-cascade`) usam o mesmo motor. `validacao: true` (só a chave de serviço) deixa a equipe rodar um Sinal em teste.
- **Marca**: `_shared/marca.ts`, guardas `guarda-de-marca.test.ts` (deno) e `src/guarda-de-marca.test.ts` (vitest); `20261013120000_marca_neutra_nos_dados.sql`.
- **Hermes**: `_shared/mapa-de-sinais.ts` (os 39 Sinais do Mapa por ICP com gatilho e restrição); `buscar_sinais` só oferece esses; teste confere que as migrações semeiam exatamente o Mapa.

## Armadilhas

- Rode `deno test supabase/functions` **sem `-A`**: o CI não tem permissão de leitura. Testes que leem migrações (`icp-c`, `icp-g`, `icp-h`, `mapa-de-sinais`) se ignoram sem a permissão e rodam num passo próprio do CI (`--allow-read=supabase/migrations,supabase/functions`).
- Todo Sinal novo nasce `testing`; `sem_fonte` não tem passos e nunca vira `available`.
- `signal_type` é único no banco: o Sinal "nova filial" do ICP G chama-se `nova_filial_icp_g`; D usa `nova_planta_filial`; F, `novo_cd_ou_filial`.
- O registro de passos usa `Object.assign`: nome de passo repetido entre ICPs sobrescreve em silêncio (o teste `passos/registro.test.ts` pega).
- `fotografias` (diff mensal): a 1ª rodada só grava a base e mesmo assim cobra a consulta (decisão 2 da PR).
- A mensagem "nada encontrado" também cobre a rodada-base; falta mensagem própria.

## Pendências (fora desta PR)

Tela do feed de Sinais de mercado e cartão de Conta para os tipos novos; Monitoramentos de cascata no "Reescanear"; consolidar helpers duplicados dos `passos/icp-*` em `passos/comum.ts`; HMAC no hash de sócio (B3); `itensCobrados` receber o `actorId` (estimativa por fallback); alternativa de actor em passo de fonte pública (BNDES); mensagem de "base gravada" nas rodadas-base; filtro "só com CNPJ" em `signal_cascade_accounts` (C1).
