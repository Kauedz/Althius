## Summary

Um Sinal agora é uma **cascata de 1..N passos** (actor | fonte pública aberta | regra interna): UMA reserva de crédito (liquidada pelo custo real × 3 ÷ US$ 0,30, para baixo, nunca acima do reservado), UM registro de execução com o rastro de cada passo (run id, actor, build, conta usada, custo, status HTTP, erro real redigido) e `record_signal` no fim (`record_market_signal` para Sinais de mercado). O Hermes (`buscar_sinais`) e os Monitoramentos (`signal-runner`) usam o mesmo `rodarCascata`; o worker pede a busca à Edge Function `signal-cascade`.

- Nenhum texto lido pelo usuário ou pelo Hermes cita Apify/"actor" (guardas deno e vitest; dados existentes neutralizados por migração).
- 8 ICPs (A–H): **39 Sinais do Mapa de Mercado**: 27 com fonte (todos nascem `testing`; 8 de mercado) e 12 `sem_fonte` com motivo, sem reservar crédito.
- O Hermes só oferece os Sinais do Mapa, por ICP, com gatilho e restrição (OAB/LGPD, CFC, SUSEP, ANEEL, CVM/Bacen); só equipe valida um Sinal em teste (`validacao: true`).
- Diagnóstico: `.scratch/sinais-cascata/diagnostico.md`. Spec, 12 tickets e handoff em `.scratch/sinais-cascata/` e `.scratch/handoffs/sinais-cascata.md`. **Não fazer merge; nada foi aplicado em produção.**

Commits por fatia: 0 diagnóstico · 1 marca (`378eb88`) · 2 motor+A1+`buscar_sinais`+runner (`5f2387b`) · 3 infra de mercado/fotografias/LLM + ICP A resto · 4–10 ICPs B, C, D, E, F, G, H · 11 catálogo do Hermes.

## Evidence before/after

**Testes (TDD, vermelho→verde; saídas coladas em `.scratch/sinais-cascata/evidencias/`)**
- Vermelho antes de cada fatia (`fatia1-*`, `icp-b.txt` … `icp-h.txt`); verde final em `verde-final.txt`.
- `deno test supabase/functions` (como o CI, sem `-A`): **1270 passed, 0 failed, 32 ignorados**; os 32 leem migrações e rodam no passo próprio do CI (`--allow-read`; 67 passed). `deno check supabase/functions/*/index.ts`: ok.
- pgTAP, suíte inteira local: 94 arquivos, todos ok (cascatas 73+16+21+22+21+31+30+23+24+23; `marca_neutra_nos_dados` 11).
- vitest: 133 arquivos, 1219 testes, todos passaram.
- A 1ª rodada de CI nesta PR falhou por eu rodar `deno test -A` localmente (testes de G/H leem a migração, sem permissão no CI); corrigido com teste condicionado à permissão e passo próprio no CI.

**"0 Sinais / o Monitoramento nunca rodou"** (diagnóstico do código; confirmar em produção pelas consultas de leitura): o sintoma "sem `last_run_at` e sem `last_error`" só nasce de quatro elos silenciosos: actor fora de `available`, `configure_signal_runner` sem URL, `pg_cron`/`pg_net` ausentes ou função não implantada; o mais provável é `configure_signal_runner` (único passo 100% manual, sem retorno). Não é bug de código: é falta de observabilidade. Agora há `private.signal_runner_diagnostics()` (só leitura) e cada execução grava o erro real por passo.

**O que o rescan da TOTVS gravaria agora:** uma linha em `signal_cascade_runs` e uma por passo/tentativa em `signal_cascade_run_steps` com `apify_run_id`, actor, build, índice da conta (token), custo real em US$, `http_status` e `real_error` truncado e sem segredo (ex.: 402/403 de saldo → rodízio para a próxima conta; sem crédito em todas → `sem_credito_em_todas`), e a mensagem ao usuário em palavras do produto ("A fonte pública está indisponível agora."). Hoje o endpoint síncrono perdia o corpo e o run id; o erro só ia para o console.

**Tabela final** (custo = só fonte; créditos = custo × 3 ÷ 0,30 = custo × 10; estimativa por rodada típica, não medida em produção)

| ICP | Sinal | Escopo | Estado | Custo / 100 | Créditos / 100 |
|---|---|---|---|---|---|
| A | `vaga_comex` | conta | testing | US$ 0,40 (vagas) | 4 |
| A | `ncm_nova_na_pauta`, `volume_por_porto` | mercado | testing | 0 (API aberta Comex Stat) | 0 |
| A | `novo_importador`, `habilitacao_radar` | conta | sem_fonte | – | – |
| B | `cnpj_novo` | conta | testing | 0,40 | 4 |
| B | `mudanca_de_porte_ou_regime`, `entrada_de_socio` | conta | testing | 0,15 (CNPJs) | 1,5 |
| B | `setor_afetado_cbs_ibs` | mercado | testing | 0,09 | 1 (mín.) |
| C | `processos_publicos` | conta | testing | 10,00 (US$ 0,10/CNPJ; ≤10 CNPJ/rodada, teto 1,00) | 100 (1/CNPJ) |
| C | `mudanca_regulatoria` | mercado | testing | 0,06 | 1 |
| C | `recuperacao_judicial` | conta | testing | 0,40 (notícias) + 0,10/CNPJ | 4 + 1/CNPJ |
| C | `impacto_reforma_cnae` | mercado | testing | ~0,02/rodada | 1 |
| C | `processos_jusbrasil_datajud` | conta | sem_fonte | – | – |
| D | `cnae_eletrointensivo`, `grupo_a_cativo` (inferência) | conta | testing | 0,09 | 1 |
| D | `nova_planta_filial` | conta | testing | 1,04 | 10 |
| D | `meta_esg_publicada` | conta | testing | 0,14 | 1,4 |
| D | `vencimento_contrato_energia` | conta | sem_fonte | – | – |
| E | `financiamento_bndes_finep` | conta | testing | 0 (fontes abertas) | 1 (mín.) |
| E | `expansao_de_planta` | conta | testing | 0,42 | 4 |
| E | `vaga_engenharia_manutencao` | conta | testing | 0,34 | 3,4 |
| E | `licenca_instalacao_dou` | mercado | testing | 0,21 | 2 |
| E | `licenca_instalacao`, `importacao_de_maquinas` | conta | sem_fonte | – | – |
| F | `novo_cd_ou_filial` | conta | testing | 1,04 | 10,4 |
| F | `troca_de_sede` | conta | testing | 0,15 | 1,5 |
| F | `vaga_logistica` | conta | testing | 0,40 | 4 |
| F | `crescimento_comex_embarcador` | conta | sem_fonte | – | – |
| G | `cruzando_faixa_de_headcount` | conta | testing | 0,40 | 4 |
| G | `nova_filial_icp_g` | conta | testing | 1,00 | 10 |
| G | `renovacao_de_apolice`, `frota_crescendo`, `caged_por_empresa` | conta | sem_fonte | – | – |
| H | `nova_cooperativa` | conta | testing | 0,09 | 0,9 |
| H | `liberacao_plano_safra` | mercado | testing | 0,40 | 4 |
| H | `calendario_de_safra` | mercado | testing | 0 | 0 |
| H | `cpr_registrada`, `area_no_car` | conta | sem_fonte | – | – |

## Merge Danger

**Porta.** 11 migrações aditivas (`20261013120000` a `20261013220000`; só tabelas novas em `private`, sem alterar `signal_actors` nem seu `unique`). Duas coisas não são reversíveis só com o arquivo: (1) `20261013120000_marca_neutra_nos_dados` **reescreve dados em produção** (`receita_data->>'fonte'`, `proposed_contacts.source_provider`, `signal_actors.known_price`); (2) `20261013130000` **redefine** `signal_monitors_due`, `claim_due_signal_monitors` (agora devolve `cnpj`), `available_signal_origin` e `list_signal_catalog`. Segredos: nenhum novo obrigatório; `ANTHROPIC_API_KEY` é opcional (sem ela os passos com modelo usam regra de palavra-chave).

**Raio.** `signal-runner` (agora roda cascatas além de actors), `signal-scan`, `signal-cascade` (função nova, `verify_jwt = true`), worker do Hermes (nova ferramenta `buscar_sinais`; `HERMES_SINAIS=off` a desliga), créditos (chaves `cascade:*` em `credit_reservations`), `account-discovery`, `account-enrichment`, `contact-photo-lookup` e o frontend (rótulo "Receita Federal"). Nada muda para Sinal/Monitoramento de actor existente além das mensagens.

**Ordem de merge/aplicação.** 1) migrações em ordem; 2) funções; 3) frontend; 4) reiniciar o worker do Hermes; 5) só então liberar Sinais (`set_signal_cascade_state`). Sem a migração `20261013130000`, `signal-runner`/`signal-cascade` novos falham (RPC inexistente); sem as funções novas, as migrações são inertes.

## Passos do Nan

1. **Migrações** (em ordem, uma a uma; `docs/agents/migrations.md`): validar no remoto com `execute_sql` em `begin; ... rollback;` + `scripts/pgtap-no-remoto.sh` de cada arquivo de `supabase/tests/` correspondente (`marca_neutra_nos_dados`, `cascatas_de_sinais`, `cascatas_mercado_e_snapshots`, `cascatas_icp_a_resto`, `cascatas_icp_b` … `cascatas_icp_h`); aplicar cada uma com o bloco `do $apply$` do guia, depois de CI verde, e conferir o `md5`. **Confirme comigo antes de aplicar a `120000` (reescreve dados).**
2. **Deploy das funções**, nesta ordem: `signal-scan` (inclui `bfef6c3`, não implantado), `signal-runner`, **`signal-cascade` (nova)**, `account-discovery`, `account-enrichment`, `contact-photo-lookup`; depois reiniciar o **worker do Hermes** (README do worker).
3. **Frontend**: publicar o build.
4. **Segredos**: `APIFY_TOKEN` (+ `APIFY_TOKEN_2` a `_5` para rodízio); opcional `ANTHROPIC_API_KEY` na `signal-runner` e `signal-cascade`. **Apagar `APIFY_API_TOKEN`** (nenhum código o lê). Não imprimir valores.
5. **Relógio**: rodar as consultas de leitura do diagnóstico; se faltar, `select private.configure_signal_runner('https://<ref>.supabase.co')` e conferir o job `althius-signal-runner` (`private.signal_runner_diagnostics()`).
6. **Validação real de cada Sinal antes de `available`**, com teto baixo, num Workspace de teste: `POST /functions/v1/signal-cascade` com a chave de serviço do ambiente, corpo `{ "workspaceId", "userId", "sinal", "tetoCreditos": 2, "validacao": true }`; conferir `signal_cascade_run_steps` (custo real, erro real, campos devolvidos) e só então `select public.set_signal_cascade_state('<sinal>', 'available')`. Itens que dependem de teste real estão em "Não conferido".
7. **SQL de conferência** (leitura): Sinais gravados por tipo; custo por passo (`signal_cascade_run_steps`) e `action_costs`; reservas `settled`/`released` (`credit_reservations where action_key like 'cascade:%'`); e que nenhum campo lido pela UI contém Apify: `select count(*) from public.target_accounts where receita_data::text ~* 'apify'` (0) e `select count(*) from private.proposed_contacts where source_provider ~* 'apify'` (0).
8. Revisar com especialista as tabelas internas de CNAEs/impacto (B, C, D, H): são critério revisável, **não oficial**.

## Decisões a confirmar (defaults usados; recomendação)

1. Ordem das fatias: esteira A→H (default, usada).
2. Multiplicador 3×; mínimo 1 crédito quando há Sinal novo; sem Sinal, só o custo real arredondado para baixo (pode ser 0). Recomendo manter. Obs.: a rodada-base dos Sinais por fotografia (B2/B3, F, G, D3) cobra a consulta sem gerar Sinal; avaliar tornar a rodada-base gratuita ao usuário.
3. Teto por cascata US$ 0,50; **C1 ficou em US$ 1,00 / máx. 10 CNPJs por rodada** (o default dizia US$ 2,00 / 20): mais conservador até haver custo real. Recomendo manter.
4. 50 créditos/dia por Workspace; Monitoramento automático 1 execução/dia por Sinal.
5. Conversão: US$ 0,30 por crédito (`private.signal_cascade_settings`); confirmar o valor atual de `credit_action_prices`.
6. Rodízio só em sem-crédito (402/403 com mensagem de saldo); 429 não gira. Ressalva: um 403 de permissão que cite "limit/usage" também gira; recomendo manter até ver o erro real em produção.
7. Tabelas novas de cascata, `signal_actors` intacta (default).
8. Dados com "apify" em produção: migração que neutraliza (default).
9. Sinais de mercado: feed do Workspace (`list_market_signals`); **ainda sem tela** e `ler_contas_e_sinais` não os lê.
10. C1: salto ≥ 3 trabalhistas/tributários contra a fotografia anterior (a janela do actor é de 3 anos como réu, então pode subestimar); `cnpj-lawsuits-detail` desligado.
11. Aprovação de actor novo: só a equipe Althius (`set_signal_cascade_state` é de `service_role`).
12. **PR único com um commit por fatia** (em vez de empilhado). Recomendo manter: as fatias dependem da infra da fatia 2/3 e a revisão por commit já separa.

Novas decisões:
- 13. A origem `conversa` (Hermes) não consome o limite de automação `acao:varredura`; só `monitor` consome.
- 14. **Teto de dólar > reservado:** a reserva usa `least(estimativa, teto)`, mas o motor deixa gastar até o teto da cascata (US$ 0,50 no padrão); a liquidação corta no reservado e a Althius absorve a diferença (pior caso US$ 0,50 por execução). Alternativa: parar o motor no equivalente em US$ do reservado (resultados mais parciais). Recomendo manter e rever com o custo real.
- 15. Sócio (B3): o snapshot guarda hash truncado de CNPJ+nome do sócio (pseudonimização, não anonimização). Recomendo trocar por HMAC com segredo do servidor antes de liberar B3.
- 16. Sem Store/allowlist dinâmica: o pedido original previa buscar actors na Apify Store e ranquear; as cascatas ficam **fixas no banco** (cada passo e fallback é uma linha revisável; actor fora do registro nunca roda). Recomendo manter: custo e campos ficam auditáveis.
- 17. Nomes que o Mapa permitia ambíguos: Sinais além da tabela do prompt (`licenca_instalacao_dou`, `processos_jusbrasil_datajud`, `caged_por_empresa`, `impacto_reforma_cnae`, `setor_afetado_cbs_ibs`) vêm das seções 08/09 do Mapa ou registram `sem_fonte`; confirmar se ficam.
- 18. O rescan manual ("Reescanear") ainda não inclui Monitoramentos de cascata; cartão de Conta para os tipos novos não foi feito.

## Não conferido

- Esquemas de entrada e saída de todos os actors e seus preços: lidos na API pública da Store e nos README em 13/10/2026; **nenhum actor foi rodado**. Campos de custo real do run, `chargedEventCounts` e os nomes exatos dos erros 402/403 do Apify (WebFetch/WebSearch não os confirmaram).
- Endpoints abertos: CCEE respondeu 403 ao `curl` do sandbox (a URL do recurso é configurável); lista de importadoras por CNPJ do MDIC não é mais aberta (decisão CMRI 467/2024) → `sem_fonte`; Finep e CKAN do BNDES foram lidos em 13/10/2026, mas o tempo do leitor de planilha na Edge Function não foi medido.
- Preço da unidade de computação no plano Free (`website-content-crawler`).
- Cobertura trabalhista e de recuperação judicial do `cnpj-lawsuits-check`.
- Adaptador da Anthropic (`llm-anthropic.ts`) e preços por token: não testados contra a API real.
- Recall dos Sinais por CNAE/UF (D1/D2, H1): o actor devolve as primeiras N empresas, sem ordenação; passe `uf`/`cnae` no pedido.
- Tabelas internas de CNAEs e de impacto da reforma (B, C, D, H): critério interno; EC 132/2023 e LC 214/2025 não conferidas contra o texto legal.

## Revisão (code-review)

Padrões: sem violação das regras documentadas (migrações, RLS, `search_path`, marca). Dívida registrada: helpers duplicados entre os `passos/icp-*` (formatação de CNPJ, datas, `num`, hash, extração de CNPJs; sugestão: mover para `passos/comum.ts`) e `rodarCascata` longa; não refatorei para não mexer em código já verde sem pedido. Spec: achados tratados (caminho de validação real, texto de arredondamento) ou listados acima como decisão (14–18).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_017UPWqY2SyjqVdpt4ZMHZ1U
