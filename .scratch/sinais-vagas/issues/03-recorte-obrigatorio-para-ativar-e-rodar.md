# 03: Recorte obrigatório para ativar e rodar (vagas no mercado endereçável)

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [spec](../spec.md) (decisão D1 do Renan, 26/10/2026). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main` **ou na branch do ticket 02** (este ticket é empilhado nela), mantendo grants, revokes e `search_path = ''`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** [02](02-varios-recortes-por-sinal.md) (formato `nichos`/`nichosCustom` e `recortesDoMonitoramento`). Base: a branch READY do 02.

**Decisões:** D1 da spec: pelo menos 1 recorte (nicho pronto ou setor escrito) para ativar e para rodar, validado no servidor. Rascunho pode ficar sem recorte, como já vale para cargo e país.

## O que construir

Vale para Abertura de vagas (`vaga_linkedin`, `vaga_indeed`) **no mercado endereçável** (`audience.escopo = 'mercado'`). Em Contas-alvo nada muda (a lista de Contas já é o recorte).

### Servidor (a regra que vale)

- Migration nova que redefine `private.validate_market_criteria` (a definição do ticket 02) para, quando o estado pedido é `ativo` (mesma condição que hoje exige cargo e país, `20261114120000_vagas_no_mercado_enderecavel.sql` ~L147), exigir **pelo menos um recorte**: `nichos` não vazio, ou `nichosCustom` com ao menos um texto não vazio, ou (formato antigo) `nicho` pronto conhecido, ou `nicho = 'custom'` com `nichoCustom` não vazio. `nicho = 'qualquer'`, ausente ou vazio **não** conta. Erro `22023` com mensagem própria (ex.: `'a market monitor needs at least one niche'`).
- Garanta que **todo caminho para `ativo`** passa pela regra: `public.save_signal_monitor` com `p_state = 'ativo'`, `public.set_signal_monitor_state(p_id, 'ativo')` (hoje confira se ele revalida os critérios; se não, faça a regra valer ali ou no gatilho `private.signal_monitor_market_guard`), e qualquer outro caminho que ative (Plano do Sinal aprovado, se ativar). Confira `git log -S` de cada função para redefinir da última versão.
- **Na hora de rodar:** `public.claim_due_signal_monitors` e `public.claim_signal_run_requests` (últimas definições em `20261120120000_ajustes_das_decisoes_do_agente_de_sinal.sql`; confira) não entregam ao runner um Monitoramento de vagas no mercado sem recorte; a rodada agendada dele não acontece e o pedido "Rodar agora" termina com a frase do produto (ex.: "Escolha ao menos um nicho ou setor para buscar as vagas."), sem debitar Crédito. Escolha o desenho mais simples (filtrar no claim e registrar a rodada como falha sem custo, ou equivalente) e explique no handoff. Não pause nem altere o Monitoramento por conta própria.

### Runner (defesa em profundidade)

- `linkedinVagasMercado.montarEntrada` (`_shared/cascata-de-sinais/passos/vagas-mercado.ts`) devolve `{ pular: 'Escolha ao menos um nicho ou setor para buscar as vagas.' }` quando `recortesDoMonitoramento` é vazio, antes de chamar actor (custo zero), e `executar` nunca aprova vaga sem recorte (remova o caminho `doNicho = null` → todas passam, ~L146–153).
- A rodada que chegar assim termina com erro amigável, sem Sinal, sem custo de actor.

### Tela

- No editor (`editor.tsx`) e no fluxo de ativar (`ativar-sinal.tsx`, se for ele quem ativa), em Abertura de vagas no mercado endereçável: sem recorte, o botão de ativar fica indisponível com a explicação "Escolha ao menos um nicho ou escreva um setor para ativar." Salvar como rascunho continua possível.
- `src/fonte/supabase-sinais.ts` traduz o erro novo do servidor para a mesma frase.
- Um Sinal pausado sem recorte (ex.: "Vagas BDR") abre, mostra o aviso e só ativa depois de marcar um recorte.

## Pode mexer

- Migration nova e pgTAP em `supabase/tests/` (ex.: ao lado de `vagas_no_mercado_enderecavel.sql`).
- `supabase/functions/_shared/cascata-de-sinais/passos/vagas-mercado.ts` e testes; `signal-runner` só se o claim exigir ajuste do lado da função.
- `projeto-althius-frontend/src/paginas/sinais/editor.tsx`, `ativar-sinal.tsx`, `mercado-enderecavel.ts`, `src/fonte/supabase-sinais.ts` e testes (`mercado-enderecavel.test.tsx`, `primeiro-monitoramento-vagas.test.tsx`, novos).

## Não mexa

- O formato dos recortes (ticket 02) e a regra sem IA (ticket 01), além de usar o que eles entregam.
- Contas-alvo: nenhuma exigência nova.
- Preço, crédito, custo; `private.signal_run_quote` e limites.
- Migrations já aplicadas; dados de produção (não escreva migration que pause, apague ou altere Monitoramentos existentes).
- ICP/Sinais first, `signal-plan/` além de aceitar a regra, arquivos do Kauê (lista na spec).

## Critérios

- [x] pgTAP: `save_signal_monitor` de vagas no mercado com `p_state = 'ativo'` e sem recorte (sem chave, `nicho: 'qualquer'`, `nichos: []`, `nichosCustom: ['  ']`) falha `22023` com a mensagem nova; em `rascunho` salva.
- [x] pgTAP: com `nichos: ['logistica-e-transporte']`, ou `nichosCustom: ['Seguros']`, ou o formato antigo `nicho: 'industria-fornecedores-b2b'`, ou `nicho: 'custom', nichoCustom: 'Naval'`, ativa.
- [x] pgTAP: `set_signal_monitor_state(id, 'ativo')` de um Monitoramento de vagas no mercado pausado sem recorte falha `22023`; com recorte, ativa.
- [x] pgTAP: um Monitoramento de vagas no mercado `ativo` sem recorte (inserido direto no teste, simulando dado antigo) não sai em `claim_due_signal_monitors` como rodada a executar nem gera custo/Crédito; o pedido "Rodar agora" dele termina com a frase do produto; Contas-alvo sem nicho continuam sendo entregues como hoje.
- [x] Deno: `montarEntrada` sem recorte devolve `pular` com a frase e não chama actor; `executar` sem recorte não aprova nenhuma vaga.
- [x] Vitest: no mercado, sem recorte, o botão de ativar fica indisponível com a frase; rascunho salva; marcar um recorte libera; o erro novo do servidor aparece com a frase do produto.
- [x] Três execuções completas do runner pgTAP local passaram; Deno, Vitest, lint, `tsc -b` e build passaram.

## Passos do Nan

Nenhum passo manual além da revisão. Depois da aplicação da migration, o SQL de rollback da pausa de "Vagas BDR" (README do backup no box) passa a falhar enquanto o Sinal não tiver recorte; reativar é pela tela, depois de marcar os recortes.

## Comments

### 2026-10-25 — Codex

Implementada a exigência de pelo menos um recorte para ativar e rodar vagas no mercado endereçável, com validação no servidor, filtros nas claims, defesa no runner e bloqueio/aviso na interface. Rascunhos continuam permitidos sem recorte; nenhum Monitoramento existente foi alterado pela migration. Migration aditiva criada: `20261216103000_recorte_obrigatorio_para_vagas.sql`.

Verificações: runner pgTAP local completo passou três vezes (incluindo 20/20 do teste novo); Deno completo passou (1904 testes); Vitest completo passou (231 arquivos, 2016 testes passaram e 4 ignorados); `npm run lint`, `npx tsc -b`, `npm run build` e `deno check supabase/functions/signal-runner/index.ts` passaram. Revisão Standards e Spec concluída, com apontamentos resolvidos. Migration não aplicada no remoto; nenhuma publicação/deploy feita.
