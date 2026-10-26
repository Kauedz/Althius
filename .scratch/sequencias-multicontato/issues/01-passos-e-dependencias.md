# 01: Preparar passos e dependências na tela atual

**What to build:** Criar, editar, salvar e reabrir passos com destinatários e condições explícitas, mantendo a execução antiga segura.

**Blocked by:** None (can start immediately)

**Status:** entregue no PR #244 (migration 20261106120000); 6/7 critérios verificados em 2026-10-24; pendente conferência visual humana.

## Como foi entregue

O banco, a migration 20261106120000 e as fontes gravam e validam `liberacao` e `predecessorId`. Na tela, os seletores "Após a ativação", "Após o envio de outro passo", "Liberação manual" e o seletor de predecessor ficam escondidos pela constante `LIBERACAO_DOS_PASSOS_NA_TELA` (`projeto-althius-frontend/src/fonte/liberacao-dos-passos-na-tela.ts`), porque o Executor ainda envia em série e ignora esses campos. Passo novo nasce sem `liberacao`, igual à execução atual. O ticket 02 liga a constante no mesmo PR que muda o Executor.

## Objetivo e escopo

- Contrato da Fonte e editor de Sequências
- Validação/persistência do documento e compatibilidade de propostas

## Fora do escopo

Execução paralela e templates novos. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] Sem Persona/Playbook, atribuir Contatos reais e salvar/reabrir o plano pela tela existente. Evidência: `projeto-althius-frontend/src/paginas/detalhe-sequencia-liberacao.test.tsx:6`, `supabase/tests/dependencias_dos_passos.sql:58`.
- [x] Validar no servidor no máximo um predecessor da mesma Sequência; rejeitar ciclos, autorreferência e referência ausente. Evidência: `supabase/tests/dependencias_dos_passos.sql:76` (15/15 pgTAP).
- [x] Reordenação visual não altera dependência nem autorização silenciosamente. Evidência: `supabase/tests/dependencias_dos_passos.sql:128`.
- [x] Documentos legados mantêm ordem serial, IDs, destinos e histórico, sem ativação por conversão. Evidência: `supabase/tests/dependencias_dos_passos.sql:30`, `supabase/tests/execucao_independente_da_sequencia.sql:268`.
- [x] Propostas pelo Rhetor e criação existente continuam funcionando; documento novo não executa paralelismo antes do ticket 02. Evidência: `supabase/functions/_shared/ferramentas-dos-agentes-sequencia.test.ts:81`; os seletores ficaram desligados no PR #244 e a tela passou a registrá-los no #249.
- [x] Demonstração acompanha contrato sem acessar dados operacionais. Evidência: `projeto-althius-frontend/src/fonte/simulada-sequencias.test.ts:12` e `:93`.
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais. pendente verificação humana: comparar visualmente a tela antes/depois em desktop e viewport estreita; os relatórios dos PRs não incluem capturas. Segurança/validação automatizada coberta em `supabase/tests/dependencias_dos_passos.sql`.

## Pode mexer

- Contrato da Fonte e editor de Sequências
- Validação/persistência do documento e compatibilidade de propostas
- Testes correspondentes, Fonte simulada para paridade e migrations novas aditivas estritamente necessárias.

## Não mexa

- Estrutura de layout, rotas/menu, módulos não relacionados, migrations antigas, produção e secrets.
- Canais/conectores sem alinhamento com Renan; escopo adicional exige decisão do Kauê.

## Reaproveitamento verificado

- `projeto-althius-frontend/src/fonte/sequencias-tipos.ts`
- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `supabase/functions/_shared/ferramentas-dos-agentes.ts`
- `supabase/functions/agent-conversation/`
- `supabase/functions/_hermes-worker/`

Persistência existente a avaliar antes de criar qualquer equivalente: `public.sequences`, `private.sequence_documents`, `private.sequence_authorizations`, `private.sequence_step_sends`; contratos `create_sequence`, `update_owned_sequence` e leitura da Fonte de Sequências. Verificar assinaturas e última definição na main atual. Templates novos não reutilizam dados privados como catálogo público.

## Testes exigidos

Vitest de documento/Fonte/tela; pgTAP de validação, proprietário e compatibilidade.

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

2026-10-24 — Conferência do merge #244 (migration `20261106120000`); implementação e testes correspondentes na `origin/main`. Rodei `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_mc01 supabase/tests/dependencias_dos_passos.sql supabase/tests/execucao_independente_da_sequencia.sql supabase/tests/retencao_por_resposta_da_conta.sql supabase/tests/templates_althius_de_sequencia.sql supabase/tests/templates_proprios_de_sequencia.sql`: cinco arquivos passaram (15/15, 37/37, 44/44, 19/19 e 34/34). Vitest direcionado: 13 arquivos, 121 testes passaram. Deno direcionado: 60 testes passaram. Critérios funcionais marcados acima; falta conferência visual humana, sem prova de publicação/produção.
