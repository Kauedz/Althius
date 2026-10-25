# 03: Reter envios ao receber resposta e decidir em conjunto

**What to build:** Registrar respostas e reter a Conta antes da IA, permitindo decisão humana conjunta de pausa ou continuação.

**Blocked by:** 02 — Autorizar e executar caminhos independentes com limites

**Status:** entregue nos PRs #251 e #255 (migration 20261112120000; ajuste de teste); 5/7 critérios verificados em 2026-10-24; há lacuna de versão na retomada e pendente conferência visual humana.

## Objetivo e escopo

- Ingestão correlacionada, histórico privado e decisão de retenção
- Revalidação do Executor e controles na tela existente

## Fora do escopo

Retomada seletiva e classificação por IA. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] Resposta correlacionada persiste e retém a Conta antes de qualquer análise; não analisar caixa pessoal indiscriminadamente. Evidência: `supabase/tests/retencao_por_resposta_da_conta.sql` (44/44), registro/retenção sem chamada de IA.
- [x] Duplicata não recria resposta/retenção já resolvida; ausência automática não libera por conta própria. Evidência: `projeto-althius-frontend/src/fonte/simulada-sequencias.test.ts:191`; pgTAP de idempotência no arquivo de retenção.
- [x] Titular vê todas as respostas pendentes, decide e reabre a tela com histórico persistido. Evidência: `projeto-althius-frontend/src/paginas/revisao-da-retencao.test.tsx:6`, `supabase/tests/retencao_por_resposta_da_conta.sql`.
- [ ] Decisão obsoleta não libera Conta quando nova resposta chega; leitura/decisão valida versão ou conjunto revisado. `decide_sequence_retention` rejeita versão/conjunto obsoleto (`supabase/tests/retencao_por_resposta_da_conta.sql:255`), mas não cumprido na rota alternativa de retomada: `update_owned_sequence(..., 'ativa')` fecha a retenção e registra o conjunto pendente atual sem receber a versão/conjunto que foi lido (`supabase/migrations/20261112120000_retencao_por_resposta_da_conta.sql:1055`, `:1110`). A ressalva também está no relatório do PR #251. O PR #255 apenas estabiliza a ordem do teste.
- [x] Executor revalida retenção antes de liberar envio; envio já em trânsito é auditado sem repetição. Evidência: `supabase/functions/sequence-runner/handler.test.ts` (caso “retenção da Conta e envio em trânsito”) e pgTAP de retenção.
- [x] Outros participantes não leem conteúdo ou decidem em nome do titular; integração não exige IA. Evidência: `supabase/tests/retencao_por_resposta_da_conta.sql` (privacidade/decisão) e `projeto-althius-frontend/src/fonte/simulada-sequencias.test.ts:191`.
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais. pendente verificação humana: comparar o bloco atual de revisão em desktop e viewport estreita; sem capturas nos relatórios.

## Pode mexer

- Ingestão correlacionada, histórico privado e decisão de retenção
- Revalidação do Executor e controles na tela existente
- Testes correspondentes, Fonte simulada para paridade e migrations novas aditivas estritamente necessárias.

## Não mexa

- Estrutura de layout, rotas/menu, módulos não relacionados, migrations antigas, produção e secrets.
- Canais/conectores sem alinhamento com Renan; escopo adicional exige decisão do Kauê.

## Reaproveitamento verificado

- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `supabase/functions/sequence-runner/`
- `supabase/functions/sequence-step-sends/`

Persistência existente a avaliar antes de criar qualquer equivalente: `public.sequences`, `private.sequence_documents`, `private.sequence_authorizations`, `private.sequence_step_sends`; contratos `create_sequence`, `update_owned_sequence` e leitura da Fonte de Sequências. Verificar assinaturas e última definição na main atual. Templates novos não reutilizam dados privados como catálogo público.

## Testes exigidos

pgTAP de concorrência, idempotência e privacidade; Deno de recebimento/Executor; Vitest de revisão conjunta.

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

2026-10-24 — Conferência dos PRs #251 e #255. Rodei `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_mc01 supabase/tests/retencao_por_resposta_da_conta.sql`: 44/44. Vitest direcionado: `revisao-da-retencao.test.tsx` passou junto da suíte relevante (13 arquivos, 121 testes). `deno test -A` dos handlers de envio/Executor: 60 testes passaram. A RPC versionada tem teste de decisão obsoleta; a retomada alternativa mantém a lacuna descrita acima. Também falta conferência visual humana; não foi feita operação em produção.
