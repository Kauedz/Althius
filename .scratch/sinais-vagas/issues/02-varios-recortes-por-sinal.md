# 02: Vários recortes por Sinal

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [spec](../spec.md) (decisão D4 do Renan, 26/10/2026). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`, mantendo grants, revokes e `search_path = ''`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; nada de letras de nicho A–H visíveis ao Cliente.

**Blocked by:** nenhum

**Decisões:** D4 da spec (vários recortes por Sinal, guardados no Sinal e mostrados na tela do Sinal). A investigação do caso "transporte e seguros" está na spec.

## O que construir

### Formato dos critérios

- Abertura de vagas (`vaga_linkedin`, `vaga_indeed`, Contas-alvo e mercado endereçável) passa a guardar **uma lista de recortes**:
  - `nichos`: lista de slugs de nicho pronto (`projeto-althius-frontend/src/paginas/sinais/nichos.ts`, `NICHOS`), sem repetir;
  - `nichosCustom`: lista de setores escritos pelo usuário (ex.: "Seguros"), cada um com até 60 caracteres (`MAX_TEXTO_CUSTOM`), sem repetir (comparação normalizada), no máximo `MAX_RECORTES_CUSTOM` itens.
  - `MAX_RECORTES_CUSTOM` é uma constante fácil de trocar (padrão adotado: 5). Os prontos já são limitados pela lista de `NICHOS` (8). O SQL usa o mesmo número.
- **Compatibilidade:** critérios antigos com `nicho` (slug, `'custom'` ou `'qualquer'`) e `nichoCustom` continuam sendo lidos como um recorte (ou nenhum, em "Qualquer"), no front, no runner e no SQL. Ao salvar pela tela nova, grava `nichos`/`nichosCustom` e não grava mais `nicho`/`nichoCustom` (a chave antiga some do objeto salvo). Não faça migration que reescreva critérios existentes.
- Uma função única no front e uma no Deno (`recortesDoMonitoramento(criterios)` ou nome parecido) devolve os recortes já normalizados (nome legível do pronto + texto do escrito), lendo o formato novo e o antigo. Todo o resto usa só ela.

### Tela do Sinal

- No editor (`editor.tsx`, bloco de nicho de `abertura-de-vagas`, ~L533–575): o grupo de rádio vira **seleção múltipla** (`Opcao` com papel de checkbox, como os cargos) dos nichos prontos, mais um campo para **acrescentar setores escritos** (um por vez, vira etiqueta removível, mesmo limite e limpeza de `limparTextoCustom`). "Qualquer" deixa de ser opção marcável: nenhum recorte marcado é "nenhum recorte" (o ticket 03 é que impede ativar assim). Texto de ajuda: algo como "Escolha um ou mais nichos, ou escreva o setor. A busca fica só com as vagas deles."
- Os cargos sugeridos (`CARGOS_POR_NICHO`, `cargosDoNicho`, `manterCargosCustom`) passam a ser a união dos cargos dos nichos marcados; os cargos escritos pelo usuário ficam ao trocar a seleção.
- O resumo do Sinal (`resumos.ts`, `nichoFormatado`) mostra todos os recortes, pelo nome (nunca a letra), ex.: "Nichos: Logística e transporte, Seguros". Vale onde o resumo já aparece (lista de Monitoramentos, página do Sinal, Plano/briefing).
- O Plano do Sinal (`briefing.tsx`, que já reusa o bloco de critérios com `tipoId` de vagas) aceita e mostra os mesmos campos.
- Reproduza o caso do Renan como teste: marcar "Logística e transporte", escrever "Seguros", salvar, recarregar: os dois aparecem no editor e no resumo, e o objeto enviado ao `save_signal_monitor` tem `nichos: ['logistica-e-transporte']` e `nichosCustom: ['Seguros']`.

### Servidor

- Migration nova que redefine `private.validate_market_criteria` (última definição: `supabase/migrations/20261114120000_vagas_no_mercado_enderecavel.sql`, confira com `git log -S 'function private.validate_market_criteria'`) para validar `nichos` (array de strings, cada uma um slug conhecido, sem repetir) e `nichosCustom` (array de strings, cada uma 1–60 caracteres após `btrim`, sem repetir normalizado, até `MAX_RECORTES_CUSTOM`), além do `nicho`/`nichoCustom` antigos. Erro `22023` como hoje. Este ticket **não** exige recorte (é o 03).
- A validação equivalente para Contas-alvo, se houver (procure onde `nichoCustom` é validado fora do mercado), aceita os mesmos campos.
- `private.signal_plan_criteria_keys` e o validador do Plano (`20261116120000_briefing_e_plano_do_sinal.sql`, ~L64–80 e ~L190–215; confira a última definição) aceitam `nichos` e `nichosCustom` para `vaga_linkedin` e `vaga_indeed`, mantendo `nicho`/`nichoCustom`. Mantenha em sincronia `supabase/functions/_shared/plano-do-sinal/campos.ts` e `projeto-althius-frontend/src/paginas/sinais/campos-do-plano.ts` (há teste que confere).

### Runner

- `vagas.ts` (`nichoCustom`, `vagasDoNicho`) e `vagas-mercado.ts` (`nichoDoMonitoramento`, `termosDoMercado`, `executar`) passam a usar a lista de recortes:
  - busca: combina os recortes com os cargos dentro do limite de buscas que já existe (`MAX_BUSCAS`, `termosDaBusca`), sem aumentar o número de buscas por rodada; se não couber tudo, distribui de forma determinística e registra no handoff como ficou;
  - filtro: a vaga passa se pertence a **algum** dos recortes; o modelo recebe a lista (`{"nichos": [...]}`) no mesmo pedido, sem um pedido por recorte.
  - Mantenha a regra do ticket 01 se ele já estiver na `main` quando você começar (sem IA, não aprova). Se não estiver, não reimplemente: só troque o recorte único pela lista.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/editor.tsx`, `nichos.ts`, `criterios-custom.ts`, `resumos.ts`, `campos-do-plano.ts`, `briefing.tsx` (só o que for preciso para os campos novos), `src/fonte/sinais-tipos.ts`, `src/fonte/supabase-sinais.ts` (só mensagens de erro de critério e mapeamento, se precisar) e os testes deles (`criterios-custom.test.tsx`, `primeiro-monitoramento-vagas.test.tsx`, `mercado-enderecavel.test.tsx`, `campos-do-plano.test.ts` e novos).
- `supabase/functions/signal-runner/adaptadores/vagas.ts`, `vaga-linkedin.ts`, `vaga-indeed.ts`, `supabase/functions/_shared/cascata-de-sinais/passos/vagas-mercado.ts`, `supabase/functions/_shared/plano-do-sinal/campos.ts` (só as chaves) e testes.
- Migration nova e pgTAP em `supabase/tests/`.

## Não mexa

- Ler o ICP do Playbook no Sinal, pré-preencher recortes pelo ICP, vitrine/catálogo, composer: frente Sinais first (fila lu1).
- Exigir recorte para ativar/rodar: ticket 03.
- A lista de nichos prontos (não crie "Seguros" como nicho pronto; setor escrito resolve).
- Migrations já aplicadas. Preço, crédito, custo.
- Arquivos do Kauê (lista na spec).

## Critérios

- [x] Vitest (tela): marcar "Logística e transporte" + escrever "Seguros" e salvar envia `nichos: ['logistica-e-transporte']`, `nichosCustom: ['Seguros']`, sem `nicho`/`nichoCustom`; reabrir o Sinal mostra os dois marcados/listados; o resumo mostra "Logística e transporte, Seguros".
- [x] Vitest: Sinal antigo com `nicho: 'industria-fornecedores-b2b'` abre com esse nicho marcado; com `nicho: 'custom', nichoCustom: 'Naval'` abre com "Naval" escrito; com "Qualquer" abre sem recorte.
- [x] Vitest: cargos sugeridos = união dos nichos marcados; cargos escritos ficam ao desmarcar um nicho; repetir setor escrito (caixa/acento diferentes) não duplica; 61 caracteres e passar do teto mostram o erro da tela.
- [x] pgTAP: `save_signal_monitor` aceita `nichos`/`nichosCustom` válidos em rascunho e ativo; recusa slug desconhecido, item não texto, texto vazio ou > 60, repetido e acima do teto (`22023`); `nicho`/`nichoCustom` antigos continuam aceitos.
- [x] pgTAP: o Plano do Sinal aceita `nichos`/`nichosCustom` para `vaga_linkedin` e `vaga_indeed`; as chaves batem com `campos.ts` e `campos-do-plano.ts` (teste existente verde).
- [x] Deno: com dois recortes, a busca cobre os dois sem passar de `MAX_BUSCAS`; uma vaga de qualquer um dos recortes passa (com o modelo respondendo `true`), uma de fora não; o modelo recebe um pedido só, com a lista; critérios antigos (`nicho`/`nichoCustom`) dão o mesmo resultado de antes.
- [x] pgTAP: três `supabase db reset && supabase test db` verdes; Deno, Vitest, lint, `tsc -b` e build verdes.

## Passos do Nan

Nenhum passo manual além da revisão. Depois do merge e da aplicação da migration por quem publica, o Renan reabre "Vagas BDR" e marca os recortes (ex.: Logística e transporte + Seguros) antes de reativar.

## Comments

- 2026-10-25 — Implementados recortes múltiplos prontos e escritos no editor, resumo, Plano do Sinal, validação SQL e runner, preservando leitura e comportamento dos critérios antigos. Caso conferido: Logística e transporte + setor escrito Seguros. Migration aditiva criada em `supabase/migrations/20261216102000_varios_recortes_por_sinal.sql`; não aplicada no remoto. Vitest completo (231 arquivos, 2.014 testes passaram, 4 ignorados), Deno completo (1.903 passaram), pgTAP completo (3 execuções verdes; teste novo 19/19), lint, `tsc -b`, build e `git diff --check` passaram. Revisões de Standards e Spec sem achados pendentes. Revisão visual e reabertura de Vagas BDR após merge/publicação: pendente verificação humana.
