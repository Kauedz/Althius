# 02: Autorizar e executar caminhos independentes com limites

**What to build:** Autorizar caminhos completos e executar passos elegíveis com agenda e limites comuns da Conta.

**Blocked by:** 01 — Preparar passos e dependências na tela atual

**Status:** entregue no PR #249 (migration 20261111120000); 8/9 critérios verificados em 2026-10-24; pendente conferência visual humana.

## Objetivo e escopo

- Ativação, agendador e Executor existentes
- Controles de agenda na tela existente

## Fora do escopo

Análise de respostas por IA. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] Ativação parcial fixa passos, conteúdo, Contatos e destinos revisados; completar depois exige nova confirmação. Evidência: `supabase/tests/execucao_independente_da_sequencia.sql:287` (snapshot selecionado e apenas seus envios reservados).
- [x] Passos independentes avançam; predecessor só libera dependente após envio confirmado e espera. Evidência: `supabase/tests/execucao_independente_da_sequencia.sql:141`, `:162`.
- [x] Falha/incerteza não libera dependente; envio incerto não é repetido automaticamente. Evidência: `supabase/tests/execucao_independente_da_sequencia.sql:168`, `supabase/functions/sequence-runner/handler-ritmo.test.ts`.
- [x] Fuso, dias úteis, janela, máximo diário e intervalo são visíveis e confirmados antes de ativar. Evidência: `projeto-althius-frontend/src/raiz.test.tsx:1007` (agenda exibida; ativar fica desabilitado até confirmar fuso e envia os valores confirmados); pgTAP de limites em `supabase/tests/execucao_independente_da_sequencia.sql:358`.
- [x] Reservas concorrentes respeitam limites por Conta/canal, sem starvation ou duplicação. Evidência: `supabase/tests/execucao_independente_da_sequencia.sql:358` (37/37 pgTAP) e `supabase/functions/sequence-runner/handler-ritmo.test.ts`.
- [x] Guardas atuais de resposta/pausa permanecem efetivas até ticket 03; não abrir regressão de segurança intermediária. Evidência: `supabase/tests/retencao_por_resposta_da_conta.sql` (44/44) e `supabase/functions/sequence-runner/handler.test.ts`.
- [x] Ligar `LIBERACAO_DOS_PASSOS_NA_TELA` (escondida desde o ticket 01) só neste PR, junto com o Executor que respeita `liberacao` e `predecessorId`. — PR #249: constante retirada, seletores visíveis, e passo novo grava liberação explícita; ver `projeto-althius-frontend/src/paginas/detalhe-sequencia-liberacao.test.tsx:6`.
- [x] Liberação manual não dispensa autorização; retrocompatibilidade serial e Destino confirmado continuam válidos. Evidência: `supabase/tests/execucao_independente_da_sequencia.sql:152`, `:195`, `:268`; `projeto-althius-frontend/src/fonte/supabase-sequencias.test.ts:162`.
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais. pendente verificação humana: comparar a estrutura em desktop e viewport estreita; os relatórios não trazem capturas visuais.

## Pode mexer

- Ativação, agendador e Executor existentes
- Controles de agenda na tela existente
- Testes correspondentes, Fonte simulada para paridade e migrations novas aditivas estritamente necessárias.

## Não mexa

- Estrutura de layout, rotas/menu, módulos não relacionados, migrations antigas, produção e secrets.
- Canais/conectores sem alinhamento com Renan; escopo adicional exige decisão do Kauê.

## Reaproveitamento verificado

- `projeto-althius-frontend/src/fonte/sequencias-tipos.ts`
- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `supabase/functions/sequence-runner/`
- `supabase/functions/sequence-step-sends/`

Persistência existente a avaliar antes de criar qualquer equivalente: `public.sequences`, `private.sequence_documents`, `private.sequence_authorizations`, `private.sequence_step_sends`; contratos `create_sequence`, `update_owned_sequence` e leitura da Fonte de Sequências. Verificar assinaturas e última definição na main atual. Templates novos não reutilizam dados privados como catálogo público.

## Testes exigidos

pgTAP de relógio, autorização, destinos e concorrência; Deno de Executor/ritmo; Vitest de ativação.

## GATE e segurança

- Layout atual é GATE obrigatório: preservar estrutura, blocos, rotas e menu. Somente controles necessários nos componentes existentes; evidência visual antes/depois, sem redesenho.
- Não mesclar enquanto critérios do ticket, regressão da Demonstração e isolamento de Workspace/titular não estiverem comprovados. Quando houver UI, não basta testar texto para comprovar layout.
- RLS e papel no banco; dados sensíveis privados; RPC security definer com search_path vazio. Nenhum envio novo sem autorização humana. Teto interno nunca aparece; cliente vê créditos.
- IA usa contexto real e apenas propõe. Templates, mensagens e plano autorizado não mudam por recomendação sem aceite. Fluxo manual preservado.

## Prompt de execução

1. Ler spec, ADR-0031, CONTEXT.md, AGENTS.md e padrões/testes existentes. Revalidar a main atual: o Rhetor já propõe Sequência; não recriar essa capacidade. As instruções deste ticket de não mesclar/publicar prevalecem sobre orientações conflitantes do repositório.
2. Atualizar origin/main e abrir branch nova por ticket; usar git worktree próprio se houver outro agente ou árvore suja. Não mexer nas alterações locais desta branch de documentação. Iniciar somente após blockers concluídos e integrados em main.
3. Implementar uma fatia vertical com teste falhando antes da mudança. Reaproveitar os módulos listados e a última definição de cada RPC nas migrations; não copiar definição antiga. Novas tabelas/RPCs precisam de desenho mínimo aditivo, testes e registro no relatório, não nomes inventados por este ticket.
4. Migrations somente novas e aditivas; nunca editar antiga, executar SQL destrutivo, aplicar no Supabase ou fazer deploy. Não imprimir/comitar secrets.
5. Um PR por ticket contra main. Kauê mescla com merge commit; agente para depois de abrir PR. Não chamar ticket de concluído/closed antes de confirmar merge e critérios exatos.
6. Relatório final: PR, arquivos alterados, migrations criadas, resultados reais dos testes, evidências visuais, decisões, dúvidas, bloqueios e passos humanos. Não confundir testes locais com publicação ou E2E real.

### Comando de aceite completo (na raiz do repo)

```sh
(cd projeto-althius-frontend && npm run lint && npx tsc -b && npx vitest run --maxWorkers=2 && npm run build) &&
PATH="$HOME/.deno/bin:$PATH" deno check supabase/functions/sequence-runner/index.ts supabase/functions/sequence-step-sends/index.ts &&
PATH="$HOME/.deno/bin:$PATH" deno test --allow-all supabase/functions &&
supabase test db
```

Pré-condição: dependências instaladas e Supabase LOCAL de teste disponível com schema compatível. `supabase test db` sem alvo remoto; nunca substituir por linked/URL de produção. Acrescentar `deno check` nos entrypoints Deno alterados fora dos dois acima. Não rodar duas suites Vitest simultaneamente, mesmo em worktrees. Se ambiente/ferramenta faltar, registrar bloqueio e comando não executado; não fabricar aprovação. Capturar contagens reais e comparar falhas preexistentes na mesma base. Testes não justificam publicar.

## Passos humanos e publicação

Kauê: revisão do comportamento/layout e merge. Renan: alinhamento explícito antes de alterar recebimento, conectores ou envio pelos canais; nenhuma aprovação dele é presumida. Agente: implementação/testes/PR, sem operação remota.

Ordem após merge e autorização explícita: migration → Edge Functions → worker → frontend; omitir componentes sem alteração. Planejar CI de frontend para não expor contrato incompatível antes do backend. Antes de migration em produção: backup, aplicação transacional e registro em schema_migrations com md5 por operador autorizado. Preparar plano de retorno sem apagar dados. E2E real requer autorização, contas e Contatos de teste; nunca enviar a terceiros por conta própria.

## Comments

Divisão e dependências aprovadas pelo usuário. Reforço final aprovado: templates com assistência de IA e preservação integral da estrutura de layout.

2026-10-24 — Conferência dos PRs #249 e #251 e dos testes na `origin/main`. Rodei `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_mc01 supabase/tests/execucao_independente_da_sequencia.sql supabase/tests/retencao_por_resposta_da_conta.sql`: 37/37 e 44/44. Vitest direcionado: 13 arquivos/121 testes passaram; adicionalmente, `PATH=/workspace/tools/node22/bin:$PATH npx vitest run --maxWorkers=2 src/raiz.test.tsx -t 'a Vendedora ativa os envios'`: 1 passou (151 skipped). `deno test -A` nos handlers de `sequence-runner`/`sequence-step-sends` e ferramentas Rhetor: 60 testes passaram. Falta conferência visual humana; sem prova de publicação/E2E com provedor.
