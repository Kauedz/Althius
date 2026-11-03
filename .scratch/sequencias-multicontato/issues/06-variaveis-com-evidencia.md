# 06: Personalizar passos com referências verificáveis entre Contatos

**What to build:** Revisar mensagens personalizadas com dados reais e referências comprovadas a outras pessoas da Conta.

**Blocked by:** 02 — Autorizar e executar caminhos independentes com limites

**Status:** ready-for-human — 6/7 critérios verificados em 2026-10-31; pendente conferência visual humana.

## Objetivo e escopo

- Resolver de variáveis e confirmação existentes
- Prévia/editor e verificação antes do envio

## Fora do escopo

Editor gráfico e inferência factual sem evidência. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] Variáveis usam Conta/Contato/Sinais reais e acessíveis; falta de evidência bloqueia passo com motivo. Evidência: `projeto-althius-frontend/src/fonte/variaveis-com-evidencia.test.ts:36`, `supabase/tests/variaveis_com_evidencia.sql:84`.
- [x] Envio, resposta e indicação são distintos: tentativa não vira conversa/indicação. Evidência: `projeto-althius-frontend/src/fonte/variaveis-com-evidencia.test.ts:92`, `:120`; `supabase/tests/variaveis_com_evidencia.sql:226`.
- [x] Prévia mostra mensagem resolvida antes de autorizar; mudanças posteriores não alteram silenciosamente mensagem aprovada. Evidência: `projeto-althius-frontend/src/fonte/variaveis-com-evidencia.test.ts:133`, `supabase/tests/variaveis_com_evidencia.sql:113`, `:160`.
- [x] Destino autorizado continua fixo e validado na execução. Evidência: `supabase/tests/variaveis_com_evidencia.sql:133`, `:183`.
- [x] Passo local bloqueado não impede independente elegível; nunca enviar variável vazia. Evidência: `supabase/functions/_shared/send-step-variaveis.test.ts:45`, `:60`; `supabase/tests/variaveis_com_evidencia.sql:128`.
- [x] Acesso a dados/evidências de outra Conta ou Workspace é recusado no servidor. Evidência: `projeto-althius-frontend/src/fonte/variaveis-com-evidencia.test.ts:60`, `supabase/tests/variaveis_com_evidencia.sql:270`.
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais. pendente verificação humana: conferir aviso de prévia e motivo de bloqueio em desktop e viewport estreita; testes unitários e de integração passaram.

## Pode mexer

- Resolver de variáveis e confirmação existentes
- Prévia/editor e verificação antes do envio
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

Vitest de prévia; pgTAP de autorização/evidência; Deno de bloqueio no envio.

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

Divisão e dependências aprovadas pelo usuário. Reforço final aprovado: templates com assistência de IA e preservação integral da estrutura de layout. Status indica ticket especificado, não implementação pronta; blockers e gates humanos continuam obrigatórios.
