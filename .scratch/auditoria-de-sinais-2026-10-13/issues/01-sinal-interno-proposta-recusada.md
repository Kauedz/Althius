# 01: Sinal interno "Proposta recusada"

## GATE

Confira antes de começar; se um item falhar, pare e avise o Nan.

- [x] `main` em `d4fbf05` (PR #194 mergeado). Última migração: `20261014170000_amostra_de_validacao.sql`. A nova usa timestamp maior que `20261014190000`.
- [x] A definição mais recente de `private.internal_signal_candidates` é a de `20261009050000_sinais_internos_das_interacoes.sql` (nenhuma migração depois a redefiniu; `20261013130000` e `20261013140000` só tocam o catálogo).
- [x] O único registro estruturado de recusa é `private.send_outcomes.outcome = 'resposta_negativa'` (migração `20261001100000`). Nenhuma Interação, e nenhum estágio do kanban, diz que a Conta recusou (`descartada` é decisão do vendedor ou da Aderência).
- [x] Sem sobreposição com o outro PR: nenhum arquivo de `src/**/sinais/**`, nenhuma RPC de `market_signals`.
- [x] Ambiente de teste: Postgres 16 local com pgTAP (`scripts/pgtap-local.sh`) e Deno.

**What to build:** o Sinal interno `proposta_recusada` ("Proposta recusada há X tempo"), no mesmo padrão de `sem_resposta` e `negociacao_parada`: gatilho, deduplicação, Sinal gravado, sem dado pessoal.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Regra

- **Acontecimento:** um Envio de passo de Sequência da Conta foi classificado como `resposta_negativa` (resposta negativa). Vale a recusa mais recente da Conta. A chave é `proposta_recusada|<id do Envio>`; reclassificar o mesmo Envio não cria outro Sinal.
- **Gatilho:** a recusa foi registrada (`classified_at`) há pelo menos o prazo do Monitoramento (1 a 365 dias). O Sinal dispara no dia em que o prazo venceu (`classified_at` + prazo), como os outros internos.
- **Superação:** se a Conta voltou a conversar depois do registro da recusa (e-mail ou mensagem recebidos, ligação ou reunião), a recusa deixou de ser o último estado e não gera Sinal. Envio nosso depois da recusa não a supera.
- **Sem dado pessoal:** a frase e a evidência trazem só o dia da recusa e o prazo. Nada de nome, e-mail, canal, texto da resposta nem de quem classificou.
- **Critério:** igual aos outros internos, só `prazo`. Qualquer outro campo é recusado.
- **Sem crédito, sem fornecedor:** avaliação no banco, pelo mesmo relógio (`althius-internal-signals`).
- **Regra de produto:** o Sinal é da Conta que recusou, uma Conta-alvo do Workspace, nunca do vendedor.

## Pode mexer

- Uma migração nova `supabase/migrations/20261015100000_sinal_proposta_recusada.sql` (catálogo e `private.internal_signal_candidates`, redefinida a partir de `20261009050000`).
- pgTAP novo `supabase/tests/sinal_proposta_recusada.sql`.
- As asserções de `supabase/tests/sinais_internos_das_interacoes.sql` que cravam "proposta recusada não existe" (três, avisadas no PR). Nada mais nesse arquivo.
- `projeto-althius-frontend/src/fonte/sinais-reais-mapa.ts` (só o mapeamento do tipo) e o teste dessa Fonte.
- Este ticket, a spec e `.scratch/RALPH-STATUS.md`.

## Não mexa

- Migrações já escritas.
- `projeto-althius-frontend/src/**/sinais/**` (outro PR) e qualquer RPC de `market_signals`.
- `sem_resposta` e `negociacao_parada` (a regra deles não muda).
- Remoto: nada aplicado, nada publicado.

## Critérios

- [x] Vermelho antes do verde: o pgTAP novo foi escrito e falhou antes da migração.
- [x] Gatilho: recusa dentro do prazo não gera Sinal; fora do prazo gera, no dia `classified_at` + prazo.
- [x] Superação: a Conta que voltou a conversar depois da recusa não gera Sinal; um Envio nosso depois não a supera.
- [x] Dedupe: reencontrar a recusa não conta de novo nem renova o prazo; reclassificar o mesmo Envio mantém a chave.
- [x] Recusa mais recente: duas recusas da Conta geram um Sinal só, na mais recente.
- [x] Só `resposta_negativa` conta (positiva, reunião e resposta simples não).
- [x] Sinal gravado com a Conta, a recusa de origem, a rodada e a fonte; a Conta fica Quente sem mexer na Aderência.
- [x] Sem dado pessoal na frase e na evidência (teste do texto).
- [x] Isolamento: Conta de outro Workspace não entra; Conta arquivada não recebe.
- [x] Catálogo traz `proposta_recusada` como interno disponível; `save_signal_monitor` aceita só o prazo.
- [x] Nenhuma execução cobra crédito nem chama fornecedor.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos, antes de declarar o ticket pronto. Nunca pula um passo manual e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar `supabase/migrations/20261015100000_sinal_proposta_recusada.sql` no projeto `ycbdilsmydvzezhlymty`, pelo `execute_sql`, em bloco atômico (`docs/agents/migrations.md`). A migração **não apaga dado e não tem `drop`**; ela insere uma linha no catálogo e redefine `private.internal_signal_candidates` com `create or replace`.
2. Conferir no SQL Editor: `select * from public.list_signal_catalog() where signal_type = 'proposta_recusada';` deve voltar `(proposta_recusada, interno, available)`.
3. Publicar o frontend, como de costume (o mapeamento `proposta-recusada` entra em `src/fonte/sinais-reais-mapa.ts`).

## Comments

- **Vermelho** (`evidencias/01-vermelho-pgtap.txt`): `sinal_proposta_recusada.sql` falhou no primeiro assert (catálogo sem `proposta_recusada`) e na criação do Monitoramento (`signal type is not available`). **Verde:** 40/40. O arquivo antigo `sinais_internos_das_interacoes.sql` continua 55/55 depois de três asserções que cravavam "proposta recusada não existe" (catálogo com 2 tipos, contagem 0 e Monitoramento recusado) serem atualizadas: a migração as torna falsas por desenho; o Monitoramento recusado passou a usar um tipo que continua fora do catálogo.
- **Decisão a confirmar com o Nan:** "proposta recusada" = resposta negativa registrada no desfecho de um Envio (único registro estruturado de recusa). Não há objeto Proposta no produto (Vendas e Oportunidades é fase 2). Quando existir, a regra pode ganhar uma segunda origem.
- **Decisão a confirmar:** a recusa registrada e a negociação parada podem coexistir na mesma Conta (a última Interação ser a resposta negativa recebida), cada uma com a sua chave. Não mexi na regra da negociação parada.
- Limite conhecido: a recusa é datada pelo registro do desfecho (`classified_at`), não pela hora da resposta; uma segunda resposta da Conta chegada entre a resposta e o registro não supera a recusa.
- **Frontend:** `proposta-recusada` entra em `SINAL_INTERNO_DO_TIPO` (`src/fonte/sinais-reais-mapa.ts`). O editor (`paginas/sinais/editor.tsx`, fora deste PR) precisa de uma entrada em `COMO_O_INTERNO_DISPARA` para o tipo; sem ela o editor mostra só o parágrafo genérico, que fala de Interações.
