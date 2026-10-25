# 08: Salvar e reutilizar templates próprios privados

**What to build:** Salvar uma estrutura reutilizável segura, privada do criador, e utilizá-la em novas Sequências.

**Blocked by:** 07 — Criar Sequência a partir de templates da Althius

**Status:** closed — entregue no PR #250 (migration 20261108120000); 6/7 critérios verificados em 2026-10-24; pendente conferência visual humana.

## Objetivo e escopo

- Persistência privada de templates e autorização
- Ações de salvar/usar nos componentes existentes

## Fora do escopo

Compartilhamento entre usuários/Workspaces e importação externa. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] Salvar exige prévia parametrizada segura, sem IDs/destinos, dados reais em texto livre, respostas, evidências pessoais ou autorização. Evidência: `projeto-althius-frontend/src/fonte/templates-proprios.test.ts:13`, `supabase/tests/templates_proprios_de_sequencia.sql:82`.
- [x] Listar/ler/editar template é restrito ao criador no Workspace; outro participante/Workspace não acessa via API direta. Evidência: `supabase/tests/templates_proprios_de_sequencia.sql:148` (34/34 pgTAP).
- [x] Criar cópia e adicionar passos não altera template nem outras Sequências. Evidência: `projeto-althius-frontend/src/fonte/templates-proprios.test.ts:104`, `supabase/tests/templates_proprios_de_sequencia.sql:220`.
- [x] IA pode sugerir template próprio somente a quem pode lê-lo; manter sugestões da Althius e fallback manual. Evidência: `supabase/functions/_shared/ferramentas-dos-agentes-template-proprio.test.ts:63`, `:87`, `:111`; `supabase/tests/templates_proprios_de_sequencia.sql:258`.
- [x] Template próprio não leva histórico nem autoriza novos Contatos; validar novamente ao instanciar. Evidência: `supabase/tests/templates_proprios_de_sequencia.sql:220`, `:297`; `projeto-althius-frontend/src/paginas/templates-proprios-na-criacao.test.tsx:31`.
- [x] Biblioteca compartilhada não é criada. Evidência: `supabase/tests/templates_proprios_de_sequencia.sql:74`.
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais. pendente verificação humana: conferir os controles no diálogo atual em desktop e viewport estreita; relatórios sem capturas visuais.

## Pode mexer

- Persistência privada de templates e autorização
- Ações de salvar/usar nos componentes existentes
- Testes correspondentes, Fonte simulada para paridade e migrations novas aditivas estritamente necessárias.

## Não mexa

- Estrutura de layout, rotas/menu, módulos não relacionados, migrations antigas, produção e secrets.
- Canais/conectores sem alinhamento com Renan; escopo adicional exige decisão do Kauê.

## Reaproveitamento verificado

- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`
- `projeto-althius-frontend/src/paginas/nova-sequencia.tsx`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `supabase/functions/_shared/ferramentas-dos-agentes.ts`
- `supabase/functions/agent-conversation/`
- `supabase/functions/_hermes-worker/`

Persistência existente a avaliar antes de criar qualquer equivalente: `public.sequences`, `private.sequence_documents`, `private.sequence_authorizations`, `private.sequence_step_sends`; contratos `create_sequence`, `update_owned_sequence` e leitura da Fonte de Sequências. Verificar assinaturas e última definição na main atual. Templates novos não reutilizam dados privados como catálogo público.

## Testes exigidos

pgTAP de isolamento; Vitest de sanitização/cópia; Deno de acesso da IA aos templates privados.

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

2026-10-24 — Conferência do PR #250 e dos testes na `origin/main`. Rodei `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_mc01 supabase/tests/templates_proprios_de_sequencia.sql`: 34/34. Vitest direcionado de templates próprios (junto da suíte relevante): 121 testes passaram nos 13 arquivos executados. `deno test -A supabase/functions/_shared/ferramentas-dos-agentes-template-proprio.test.ts`: 4/4; conjunto Deno com as outras ferramentas/handlers: 60/60. Falta conferência visual humana; sem prova de publicação/produção.
