# 11: Vincular a Rodada externa ao run do Apify e ao custo real

**What to build:** cada Rodada externa preserva os ids dos runs do Apify (run ids) e o custo real em USD por run e da Rodada, vindos da API do Apify no fim do run. Completar o vínculo persistente **Rodada → run id → custo USD**, consultável por quem audita, sem token no frontend. Este é um rascunho para o Renan aprovar, não autorização para implementar.

**Blocked by:** aprovação deste re-escopo pelo Renan. O PR #261 já foi mergeado na main e não é mais bloqueio; o ticket 10 também não é bloqueio técnico desta fatia.

**Status:** needs-triage (re-escopo proposto em 2026-10-24 sobre a main 6e384dc, espera o Renan)

## O que já existe na main

Referência: `main` em `6e384dc` (merge do PR #261), já mesclada neste worktree na branch `ralph/crm-11-rescope-apify`. Caminhos e linhas abaixo foram reconferidos no código mergeado, incluindo os PRs #257–#261.

As migrations do Kauê de `20261116120000` a `20261120120000` estão no código, mas ainda não foram aplicadas em produção. A implementação futura deve trazer uma migration aditiva posterior a `20261121110000` (e à última migration da main então vigente), aplicada somente depois das migrations do Kauê, em ordem. Isso é requisito de sequência da aplicação futura, não outro bloqueio de aprovação deste rascunho.

Cada critério antigo, na ordem original:

1. **Escolha do Actor e normalização:** já há `private.signal_actors` (`supabase/migrations/20260930130000_registro_de_actors.sql:7`) e adaptadores por fonte. A abertura de vagas monta entrada e normaliza a saída em `supabase/functions/signal-runner/adaptadores/vaga-linkedin.ts:21` e `:42`. Não é preciso escolher e construir outra integração inicial.
2. **Token no backend; estado, timestamps, custo/limites, erro e correlação:** já há cliente com Authorization no servidor e execução assíncrona nas cascatas (`supabase/functions/_shared/cascata-de-sinais/fonte-apify.ts:75` e `:189`), além do caminho síncrono legado (`supabase/functions/signal-scan/apify.ts:175`). O registro de Rodadas manuais/agendadas, timestamps e estado está em `supabase/migrations/20261117120000_rodar_agora_e_registro_da_rodada.sql:339`; o histórico é servido pela definição vigente em `supabase/migrations/20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql:765`. O runner lê e grava custo por run em `supabase/functions/signal-runner/handler.ts:445` e `supabase/functions/signal-runner/index.ts:160`. **Parcial:** essa gravação recebe Workspace/Actor/run do fornecedor, mas não a Rodada; `rodadaId` liga os achados, não o custo (`supabase/functions/signal-runner/handler.ts:441`). Falta fechar a correlação auditável.
3. **Somente resultado real com referência verificável:** o runner passa os itens retornados pelo Apify ao adaptador e só então grava os Sinais (`supabase/functions/signal-runner/handler.ts:425`). O adaptador de vagas constrói o link da vaga e filtra os itens (`supabase/functions/signal-runner/adaptadores/vaga-linkedin.ts:15` e `:42`). Fonte/evidência já são persistidas (`supabase/migrations/20260930180000_monitoramento_real_de_sinais.sql:232`). Não há nova coleta ou resultado simulado a construir nesta fatia.
4. **Idempotência e falhas:** a deduplicação do evento já é por Workspace/Conta/tipo/chave (`supabase/migrations/20260930180000_monitoramento_real_de_sinais.sql:238`); a mesma Rodada é reaberta na continuação (`supabase/migrations/20261117120000_rodar_agora_e_registro_da_rodada.sql:339`). Custos já deduplicam por referência (`supabase/migrations/20260930130000_registro_de_actors.sql:109`). Falhas manuais fecham o pedido como falhou (`supabase/functions/signal-runner/handler.ts:909`). Não há callback novo a implementar; a nova associação também precisa ser idempotente e permitir completar custo pendente, sem repetir coleta.
5. **Limites, pausa e fonte habilitada:** o runner só executa Actor disponível (`supabase/functions/signal-runner/handler.ts:829`), envia `maxTotalChargeUsd` (`:420`) e já aplica o limite diário (`supabase/functions/signal-runner/index.ts:171`). Preço por rodada, limites e pausa por falta de créditos estão em `supabase/migrations/20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql:512`. Plano e agenda já entraram pelas migrations `20261116120000_briefing_e_plano_do_sinal.sql` e `20261118120000_agenda_do_sinal.sql`. O #261 já incorpora lote/rotação, Rodada perdida, Teto sugerido e limites do Plano; são a base a preservar.
6. **Sinais em Sinais/Contas, evidência, dedupe e Quente:** a consulta por Conta já existe (`supabase/migrations/20260930180000_monitoramento_real_de_sinais.sql:367`), assim como a manutenção de Quente (`:410`); os achados da Rodada são consultáveis (`supabase/migrations/20261117120000_rodar_agora_e_registro_da_rodada.sql:975`) e exibem fonte/evidência (`projeto-althius-frontend/src/paginas/sinais/rodadas.tsx:173`). Preservar esse comportamento.

As cascatas já guardam `apify_run_id` por passo e custo, e alimentam `action_costs` (`supabase/migrations/20261013130000_cascatas_de_sinais.sql:267`, `:614` e `:638`). O cliente assíncrono já retorna run id e custo (`supabase/functions/_shared/cascata-de-sinais/fonte-apify.ts:246`). Reaproveitar esse rastro; falta ligá-lo à Rodada do Monitoramento, sem duplicar a contabilização.

## Recorte proposto

Uma Rodada pode executar vários runs por lote (Contas, passos de cascata e continuação). O lote respeita `maxEmpresasPorRodada`: padrão 25, de 1 a 100, com até 500 Contas escolhidas no Plano (`supabase/migrations/20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql:94`). A Rodada agendada mantém o lote e o horário nas continuações; `round_attempted` acumula as tentativas e a rotação avança ao fechar (`:462` e `:512`). A manual preserva `start_offset` e avança o cursor quando o pedido fica `feita` (`:642` e `:718`). O runner mantém o mesmo lote na continuação das cascatas (`supabase/functions/signal-runner/handler.ts:628`). A associação deve usar a identidade da Rodada, sem abrir outra Rodada por chamada do runner nem confundir seu id com o run id do fornecedor. Preservar cada associação e apresentar o total real da Rodada como soma dos runs únicos vinculados. O custo do Apify não é o preço em créditos do produto, o teto enviado ao Actor nem o custo do modelo (`supabase/functions/signal-runner/handler.ts:453`).

Rodada perdida (`supabase/migrations/20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql:404`) registra o horário que não rodou, sem compensação, com 0 créditos: não iniciou Apify, portanto não recebe run id nem custo USD inventado. Distinguir esse caso de run iniciado com custo pendente e de legado sem informação.

O Teto mensal sugerido é a estimativa mensal em créditos pelo lote mais 20%, limitada à faixa do contrato (`supabase/migrations/20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql:929`); só o Administrador libera a automação e a função não reduz limite existente (`:976`). Esse Teto e o limite diário continuam sendo guardas do produto, sem servir como custo USD de um run.

Ler o custo final informado pela API para o run identificado; não usar o fallback “última execução” de um Actor para estabelecer este vínculo, inclusive quando não houver concorrência aparente. O legado usa esse fallback (`supabase/functions/signal-scan/apify.ts:243`, função `ultimaExecucao` em `:234`), que não basta como prova inequívoca da associação. Reaproveitar a identificação da criação assíncrona onde couber, sem criar outro runner.

Sem custo final disponível, manter run id e estado de custo pendente/indisponível, distinguindo de zero confirmado. Permitir completar a leitura posteriormente de forma idempotente, sem executar o Actor outra vez; um total incompleto deve ser identificado como incompleto. Falhas/timeouts após criar run também precisam preservar o vínculo e permitir consultar o custo final. Rodada que não iniciou run não recebe id nem custo inventado. Registros antigos permanecem explicitamente sem informação, sem backfill por estimativa.

A auditoria proposta é uma consulta de backend/banco com leitura restrita ao Administrador do Workspace, contendo Rodada, Workspace, run id, estado e custo USD por run e total; não exige tela nova. O Renan deve confirmar esse meio de consulta ao aprovar. A UI comercial continua mostrando créditos (contrato atual em `projeto-althius-frontend/src/fonte/rodadas-do-sinal.ts:1`).

## Pode mexer

Na implementação futura, após aprovação:

- `supabase/functions/signal-runner/handler.ts`, `index.ts` e testes Deno próprios do vínculo/custo.
- `supabase/functions/signal-scan/apify.ts` e `supabase/functions/_shared/cascata-de-sinais/{fonte-apify,tipos,db,motor}.ts`, somente para transportar identificação/custo e associar o rastro existente; testes Deno correspondentes.
- Uma migration aditiva nova em `supabase/migrations/`, posterior a `20261121110000` e à última migration da main então vigente, aplicada somente depois das migrations do Kauê de `20261116120000` a `20261120120000`, e um pgTAP próprio em `supabase/tests/`, seguindo `docs/agents/migrations.md`: associação persistente e consulta restrita de auditoria, com isolamento por Workspace e RLS explícita em tabela nova. Redefinições partem da versão mais recente da main.

Neste re-escopo, a única edição autorizada é este ticket.

## Não mexa

- Qualquer outro arquivo neste trabalho; migrations existentes (inclusive as do #261) e testes SQL antigos na implementação futura.
- Plano, briefing, agenda, lotes/rotação, preço em créditos, tetos, saldo, limites ou decisões do agente de sinal.
- Escolha/habilitação de novos Actors, catálogo, monitoramento inicial, regras de evidência, deduplicação, Quente e cascatas fora do transporte do rastro.
- Frontend de produto, Demonstração, conexões/canais, enriquecimento, fotos de Contato, Auth, segredos e configurações remotas. Nenhum token, entrada bruta ou segredo em payload de auditoria, browser ou logs.

## Critérios de aceite do recorte

- [ ] Deno + pgTAP: Rodada agendada e manual que iniciam Apify persistem o vínculo com o run id exato retornado na criação e o custo final USD lido da API ao fim; duas execuções concorrentes do mesmo Actor não trocam run id/custo.
- [ ] Deno + pgTAP: vários runs na mesma Rodada, inclusive runs por Conta no lote, passos de cascata e continuação, ficam consultáveis individualmente; total soma cada run uma vez. Retry de gravação/leitura não duplica vínculo, custo, cobrança em créditos ou Sinal.
- [ ] Deno + pgTAP: lote/rotação e continuação preservam a mesma Rodada e os runs individuais, sem interferir no cursor, nos limites do Plano ou no Teto; Rodada perdida permanece sem run e sem custo atribuído, distinta de custo pendente e de legado sem dados.
- [ ] Deno: fixtures da API cobrem sucesso com itens, sucesso vazio, zero confirmado, custo tardio/ausente, falha e timeout após criar run. Run id é conservado mesmo sem Sinal; releitura completa o custo sem nova coleta. Custo final não é substituído por teto, estimativa ou custo de LLM.
- [ ] pgTAP: consulta de auditoria retorna Rodada → run id → custo por run e total, sinaliza incompletude e registros legados sem dados; escrita é restrita ao backend e leitura restrita ao Administrador do Workspace (convenção de `supabase/migrations/20260930120000_custos_por_acao.sql:116`), sem acesso anônimo ou cruzado entre Workspaces.
- [ ] Deno + Vitest de regressão: nenhum token aparece em resposta/erro/log; a UI operacional mantém créditos e não passa a chamar a API do Apify nem exibir custo do fornecedor. Preservar testes existentes de fonte/evidência, dedupe, Quente e limites.

## Como testar

Na implementação futura, usar API simulada nos testes, sem token real. Com a pilha local preparada, aplicar todas as migrations do zero e executar `npx supabase test db` (incluindo o novo pgTAP e os existentes de Rodadas, cascatas e limites).

Executar `deno test --allow-env --allow-read supabase/functions/signal-runner/ supabase/functions/signal-scan/ supabase/functions/_shared/cascata-de-sinais/` e `deno check supabase/functions/signal-runner/index.ts`. No frontend, executar `npx vitest run` em `projeto-althius-frontend/`, incluindo `src/paginas/sinais/sem-dolar-na-ui.test.ts` e os testes de Rodadas/limites; concluir os checks exigidos pelo guia da plataforma antes do PR de implementação.

Conferir pela consulta restrita uma Rodada com dois runs de custos distintos e outra com custo pendente: validar ids, soma, isolamento e posterior atualização sem outra chamada de execução. Este ticket documental não aplica migration, não executa coleta real e não requer deploy; somente a aprovação do Renan continua pendente para o re-escopo.

## Escopo original (2026-09)

Texto original preservado abaixo apenas como histórico; seu status e seus critérios não representam o recorte proposto.

# 11: Coletar o primeiro Sinal externo com Apify

**What to build:** participante configura o Monitoramento externo de abertura de vagas já previsto no produto e acompanha uma coleta real via Apify Actor até os Sinais evidenciados aparecerem no histórico da Conta.

**Blocked by:** 10: Registrar Sinais internos a partir de Interações reais.

**Status:** ready-for-agent

- [ ] Um Actor Apify compatível com a fonte selecionada é escolhido e sua entrada/saída é normalizada no contrato de Sinais.
- [ ] Token Apify fica no backend; execução assíncrona registra estado, timestamps, custo/limites disponíveis, erro e correlação.
- [ ] Somente resultado retornado pelo Actor com referência verificável é persistido como Sinal externo.
- [ ] Retry, callback e repetição do mesmo evento são idempotentes; falha não vira resultado de demonstração.
- [ ] A execução respeita limites/custos configurados e pode ser pausada; nenhum Monitoramento sem Actor habilitado promete coleta.
- [ ] Sinais aparecem nos módulos de Sinais e Contas com fonte/evidência, preservando regra de deduplicação e Quente.

