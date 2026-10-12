# Prompt para o Claude Code: Sinais via Apify como ferramenta do Hermes

Repositório: `Kauedz/Althius`, clone em `/workspace/Althius`, base `main` (74fcb8c ou mais nova). Abra **uma** branch e **um** PR. **Não faça merge. Não aplique nada em produção** (sem `supabase db push`, sem `functions deploy`, sem `secrets set`). Tudo que tocar prod vira passo nos "Passos do Nan".

## Objetivo (do Renan, fundador)

Hoje o Renan usa o Claude com um token do Apify e funciona assim: ele pede um sinal, o modelo busca na Apify Store o actor melhor e mais barato para aquele sinal, roda e devolve o resultado. Queremos isso **dentro do app**: o Hermes (o agente de IA do Althius) ganha o Apify como ferramenta, escolhe o actor por custo e aderência, roda com teto de crédito e transforma o resultado em **Sinais** de verdade (`private.signals`), visíveis na Conta.

Escopo: **só** os sinais dos ICPs prioritários do mapa de mercado (catálogo abaixo). Nada de sinal genérico fora dele.

## Antes de escrever código: leia e confirme (anote no PR o que achou)

- `supabase/functions/signal-runner/` (`handler.ts`, `adaptadores.ts`, `adaptadores/*`, `README.md`): varredura do relógio e fila de buscas (`signal_rescans`). Repare em `handler.ts` ~linha 399/425: o erro gravado é genérico (`'1 varredura falhou; tente de novo mais tarde.'` / `'A busca falhou; tentamos de novo na próxima.'`) e o `String(e)` só vai para log.
- `supabase/functions/signal-scan/` (`apify.ts`, `handler.ts`, `README.md`): roda um actor do registro com teto de custo; o run id vem de `/runs/last` (frágil; ver "Não conferido" no README).
- `supabase/functions/account-discovery/` e `supabase/functions/account-enrichment/` (`apify-do-enriquecimento.ts`): outros usos do Apify, para reaproveitar cliente e padrão de custo.
- `supabase/functions/_shared/apify-ambiente.ts`: rodízio `APIFY_TOKEN`, `APIFY_TOKEN_2..5`.
- Hermes: `supabase/functions/_hermes-worker/` (`worker.ts`, `main.ts`, testes `worker-*.test.ts`) e `_shared/ferramentas-dos-agentes.ts` (`CATALOGO` / `FERRAMENTAS`: `ler_contas_e_sinais`, `buscar_contas_pelo_icp`, `consultar_integracao`, `propor_envio_ao_crm`, `usar_conector`; playbook em `orquestracao.ts`, `orquestracao-playbook.test.ts`).
- Créditos: `public.reserve_credits` / `public.settle_credits` / `public.release_credits`, `public.claim_agent_run`, `begin_agent_round` / `end_agent_round` / `finish_agent_run` (migração `20261012143547_reserva_de_creditos_na_execucao.sql`, PR #184), `_shared/reserva-de-creditos.test.ts`.
- Tabelas (migrações): `private.signal_actors` (`20260930130000_registro_de_actors.sql`; **hoje `signal_type` é `unique`: um actor por Sinal**), `private.signal_monitors`, `private.signals` (unique `(workspace_id, target_account_id, signal_type, event_key)`), `private.signal_runner_settings` (`20260930180000_monitoramento_real_de_sinais.sql`), `private.signal_rescans` (`20260930200000_reativacao_de_sinais.sql`), `private.signal_monitor_runs` (`20261009050000_sinais_internos_das_interacoes.sql`), `private.discovery_runs` (`20261001170000_descoberta_de_contas_pelo_icp.sql`). Testes pgTAP em `supabase/tests/`.

## Problemas conhecidos (cada um vira teste vermelho antes da correção)

1. `private.signals` tem **0 linhas desde sempre**; o único Monitoramento existente **nunca rodou**. Descubra o porquê com evidência (cron `kick_signal_runner` configurado? `configure_signal_runner` rodou? actor em `testing`? Conta sem página do LinkedIn? teto/automático em "confirmar"?). Escreva o diagnóstico no PR; se depender de prod, deixe a consulta SQL de leitura pronta nos Passos do Nan.
2. A busca TOTVS (rescan `47723e73…`) falhou com mensagem genérica (`signal-runner/handler.ts` ~399) **sem run id do Apify e sem o erro real**. Corrigir: toda execução grava run id, actor, custo e erro real.
3. Três segredos do Apify convivem: `APIFY_TOKEN`, `APIFY_TOKEN_2`, `APIFY_API_TOKEN` (este último não é lido por nenhum código hoje). **Escolha um nome canônico** (sugestão: `APIFY_TOKEN`, mantendo o rodízio `_2.._5` de `apify-ambiente.ts`), documente no `functions/README.md` e liste nos Passos do Nan qual segredo apagar. Não leia nem imprima valor de segredo.
4. `signal-scan` tem commit não implantado (`bfef6c3`, "Corrige entrada LinkedIn, custo Apify e identidade de contatos"). Confirme o que está em `main` e coloque o deploy nos Passos do Nan; não implante.

## Requisitos

1. **Busca na Apify Store + escolha do actor.** Para um sinal do catálogo, buscar actors na Store (`GET /v2/store?search=…`), ranquear por aderência (o actor devolve o campo que o adaptador precisa? país BR? avaliações/uso) e custo (modelo de preço, custo estimado por item/execução). Resultado vai para uma **allowlist em cache por sinal** (nova tabela, ex. `private.signal_actor_candidates`, ou relaxar o `unique` de `signal_actors.signal_type` com um `rank`; decida e justifique). Actor fora da allowlist nunca roda. Actor novo entra como `testing` e só vira `available` após execução real validada (Passos do Nan), como já é a regra.
2. **Teto rígido de crédito por busca**, usando a reserva existente (`reserve_credits` → `settle_credits`/`release_credits`, e dentro do Hermes o `begin_agent_round`/`end_agent_round`). Reserva antes de chamar o Apify; `maxTotalChargeUsd` ≤ teto; falha ou abort libera a reserva; nunca cobra duas vezes (chave idempotente).
3. **Toda execução registra**: `apify_run_id`, `actor_id`, versão, custo real (USD e créditos), estado, e o **erro real** (status HTTP, mensagem do Apify, truncado e sem segredo) — em `signal_monitor_runs`/`signal_rescans` ou tabela de execuções nova. A mensagem para o usuário continua em palavras do produto, mas o erro real fica guardado. Pegue o run id de forma confiável (rodar assíncrono `POST /runs` + aguardar, em vez de `/runs/last`).
4. **Dedupe idempotente**: reusar `record_signal` e o unique `(workspace_id, target_account_id, signal_type, event_key)`; rodar duas vezes o mesmo resultado não cria Sinal novo.
5. **Isolamento por Workspace**: toda função recebe e confere `workspace_id`; teste pgTAP que um Workspace não lê nem grava Sinal/execução de outro.
6. **Token nunca em log nem no contexto do modelo**: o Hermes só vê nomes de actor, custo estimado e itens já normalizados; nada de URL com `?token=`; teste que varre logs e o prompt montado procurando o token falso.
7. **Ferramenta do Hermes** (nova em `ferramentas-dos-agentes.ts`, ex. `buscar_sinais`): entrada `{ sinal, icp, contas? | criterios?, teto_creditos? }`. Chamável da conversa ("busque sinais de X para o ICP Y") e dos Monitoramentos/rotinas (o `signal-runner` usa o mesmo núcleo, não um caminho paralelo). Atualize as instruções/playbook do Hermes para só oferecer sinais do catálogo abaixo.
8. **Testes com Apify mockado** (fetch falso): Store search, run com sucesso, 402/403 (troca de conta), timeout, abort por teto, item malformado.

## Catálogo inicial de Sinais (do "Mapa de Mercado · Out/2026")

Ordem = esteira de testes (Seção 05: TESTE 1 a 8). Nota do ranking ponderado (Seção 04) entre parênteses; o critério "Sinais replicáveis" pesa 25%. Fonte de cada linha: quadro "Sinais, gatilho e restrição" do CRI do ICP (Seção 08). **Não acrescente sinais fora desta lista.**

| Ordem | ICP | Sinais replicáveis (texto do documento) | Gatilho de timing | Restrição | Fonte |
|---|---|---|---|---|---|
| 1 | A · Comex e importação (95) | Novo importador no Comex Stat; habilitação Radar; NCM nova na pauta; aumento de volume por porto; vaga de analista de comex | Reforma tributária muda custo de importação e conta e ordem | Nenhuma relevante para outbound | Seç. 08, p.17 (também p.16 "Comex Stat, Radar, NCM nova"; p.8) |
| 2 | B · Contabilidade e tributário (70) | CNPJ novo; mudança de porte ou regime; entrada de sócio; empresa em setor mais afetado pela CBS/IBS | Transição CBS/IBS até 2033 | CFC: publicidade informativa, tom técnico | Seç. 08, p.19 (p.18 "sinais de mudança de porte e regime") |
| 3 | C · Jurídico empresarial (64) | Processos públicos; mudança regulatória; recuperação judicial de cliente do prospect (Seç. 09: também impacto da reforma tributária no CNAE, recuperação judicial de fornecedor) | Reforma gera contencioso e planejamento | OAB: só sinal por empresa/CNPJ, lista de contas sem dado pessoal, sem contato frio do escritório (LGPD) | Seç. 08, p.21; Seç. 09, p.32 |
| 4 | D · Energia e mercado livre (92) | Empresa Grupo A ainda cativa; vencimento de contrato de energia; nova planta ou filial; CNAE eletrointensivo; meta ESG publicada | Abertura da baixa tensão até nov/2027 | Regras ANEEL varejista; sem barreira a prospecção | Seç. 08, p.23 (p.22 "contrato vencendo") |
| 5 | E · Indústria fornecedores B2B (88) | Financiamento BNDES ou Finep; licença ambiental de instalação; expansão de planta; vaga de engenharia ou manutenção; importação de máquinas (NCM 84/85) | Nova Indústria Brasil ampliou crédito | Nenhuma relevante | Seç. 08, p.25; Seç. 05, p.9 |
| 6 | F · Logística e transporte (83) | Novo CD ou filial do embarcador; vaga de logística; crescimento de comex do embarcador; troca de sede | Mercado em consolidação; custo logístico em alta | Nenhuma relevante | Seç. 08, p.26–27 |
| 7 | G · Corretoras de benefícios (77) | Empresa cruzando faixa de headcount (vagas, CAGED); renovação anual de apólice; nova filial; frota crescendo | Muitas corretoras pequenas sem estrutura comercial | SUSEP; cuidado com dados de saúde (LGPD) | Seç. 08, p.29; Seç. 05, p.9 |
| 8 | H · Agro B2B (77) | CPR registrada; área no CAR; calendário de safra; liberação do Plano Safra; nova cooperativa | Crédito privado (CPR, LCA, Fiagro) cresce | Regras CVM/Bacen para quem oferta crédito | Seç. 08, p.31 (p.30 "CPR, CAR, Plano Safra") |

Observações para a implementação:
- Todos os 8 ICPs têm sinais no documento. Vários dependem de fonte pública que pode não ter actor na Apify Store (Comex Stat, Radar, CCEE/Grupo A cativo, BNDES/Finep, licenças ambientais, CAGED, CPR, CAR, Plano Safra). A busca na Store deve registrar "sem actor adequado" como resultado válido em vez de forçar um actor ruim; liste no PR quais sinais ficaram sem actor.
- Sinais que já têm adaptador hoje (vagas LinkedIn/Indeed) cobrem "vaga de analista de comex", "vaga de engenharia ou manutenção", "vaga de logística" e "vagas" do ICP G: comece por eles na primeira fatia.
- ICP C: só sinais por empresa; nenhum dado pessoal sai do actor.

## Como trabalhar (estilo Matt Pocock)

- **Test-first, sempre**: escreva o teste, rode e mostre **vermelho**; implemente o mínimo; mostre **verde**. pgTAP para banco (`supabase/tests/*.sql`), `deno test` para funções. Cole a saída real (resumida) no PR.
- **Fatias verticais pequenas**, um commit por fatia, cada uma verde sozinha. Sugestão de ordem:
  1. Execução registra `apify_run_id`, actor, custo e erro real (corrige o caso TOTVS) + teste.
  2. Segredo canônico do Apify + teste de "token nunca em log/contexto".
  3. Allowlist em cache por sinal + busca na Store mockada + ranking custo/aderência.
  4. Teto de crédito por busca com reserva/settle/release + idempotência.
  5. Ferramenta `buscar_sinais` do Hermes (conversa) usando o núcleo; dedupe; isolamento de Workspace.
  6. Monitoramentos/rotinas chamando o mesmo núcleo; diagnóstico do "monitor que nunca roda".
  7. Catálogo dos 8 ICPs no playbook/instruções do Hermes (tipos de sinal novos entram como `testing`).
- Não invente nomes de campo de actor: leia o esquema de entrada publicado; o que não der para conferir vai em "Não conferido".
- Não mude o que não precisa; não refatore fora do escopo.

## Entrega: um PR com relatório

Abra o PR (sem merge) com estas seções:

1. **Summary** — o que muda, em 5–10 linhas.
2. **Evidence before/after** — saída dos testes vermelhos e verdes; o diagnóstico de "0 sinais / monitor nunca rodou"; o que o rescan TOTVS teria gravado com a mudança.
3. **Merge Danger** — porta (reversível ou não: migrações, mudança do `unique` em `signal_actors`, segredos) e raio de impacto (signal-runner, signal-scan, Hermes, créditos).
4. **Passos do Nan** — deploy em ordem: migrações, `functions deploy` de `signal-scan` (inclui `bfef6c3`), `signal-runner`, worker do Hermes; segredo canônico e qual apagar; `configure_signal_runner` se faltar; execução real de validação de cada actor novo antes de `available`; consultas SQL de conferência.
5. **Decisões a confirmar** — com sua recomendação em cada uma (ver lista abaixo e o que surgir).

Decisões que já sabemos que precisam de confirmação:
- Ordem de prioridade: esteira (A, B, C, D, E, F, G, H) ou nota do ranking (A, D, E, F, G, H, B, C)?
- Teto padrão de créditos por busca e por dia/Workspace.
- Nome do segredo canônico e destino de `APIFY_API_TOKEN`.
- Allowlist: tabela nova vs. relaxar `unique` de `signal_actors`.
- Quem pode aprovar actor novo da Store (só Althius ou o cliente também?).
