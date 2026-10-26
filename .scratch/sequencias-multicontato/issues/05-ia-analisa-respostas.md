# 05: Analisar respostas com IA e recomendar decisões

**What to build:** Analisar respostas reais e exibir interpretação, evidência e sugestões sob decisão humana.

**Blocked by:** 03 — Reter envios ao receber resposta e decidir em conjunto

**Status:** ready-for-human

## Objetivo e escopo

- Motor de Agentes e propostas existentes
- Apresentação de recomendação na tela/conversa existente

## Fora do escopo

Aplicar decisões automaticamente; retomada seletiva pertence ao 04. Nenhuma mudança estrutural de layout.

## Critérios de aceite

- [x] IA recebe somente contexto autorizado da Conta/Workspace e conteúdo correlacionado; texto recebido não vira instrução de ferramenta. (contexto RPC restrito + teste Deno de prompt sem ferramentas + pgTAP de contexto e privacidade)
- [x] Exibir interpretação e evidência, distinguindo resposta humana, automática e possível não contato. (componente na revisão atual; Vitest do detalhe passou)
- [x] Sugestões de mensagem/próximo passo não alteram documento nem ativam envios sem aceite humano. (recomendação só informativa; decisão manual segue disponível no Vitest/pgTAP)
- [x] Falha, limite ou créditos indisponíveis mantêm resposta, retenção e decisão manual funcionais. (fallback Vitest e falha de créditos pgTAP)
- [x] Execução paga respeita Teto e contabilização existentes, sem expor US$; evento duplicado não cobra de novo indevidamente. (pgTAP de teto, idempotência e contabilização)
- [x] Resultado de IA atrasado não desfaz decisão humana nem ignora nova resposta; privacidade do titular preservada. (gravação atualiza só a análise correlacionada; tabelas privadas e RPC titular; pgTAP de decisão e isolamento)
- [ ] GATE visual, segurança e testes abaixo cumpridos com evidências reais.
  - Pendente evidência visual humana antes/depois; sem navegador visual nesta sessão. Segurança e testes locais conferidos, com a limitação do worker Vitest registrada no comentário.

## Pode mexer

- Motor de Agentes e propostas existentes
- Apresentação de recomendação na tela/conversa existente
- Testes correspondentes, Fonte simulada para paridade e migrations novas aditivas estritamente necessárias.

## Não mexa

- Estrutura de layout, rotas/menu, módulos não relacionados, migrations antigas, produção e secrets.
- Canais/conectores sem alinhamento com Renan; escopo adicional exige decisão do Kauê.

## Reaproveitamento verificado

- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `supabase/functions/_shared/ferramentas-dos-agentes.ts`
- `supabase/functions/agent-conversation/`
- `supabase/functions/_hermes-worker/`

Persistência existente a avaliar antes de criar qualquer equivalente: `public.sequences`, `private.sequence_documents`, `private.sequence_authorizations`, `private.sequence_step_sends`; contratos `create_sequence`, `update_owned_sequence` e leitura da Fonte de Sequências. Verificar assinaturas e última definição na main atual. Templates novos não reutilizam dados privados como catálogo público.

## Testes exigidos

Deno de motor/propostas, falhas e conteúdo malicioso; pgTAP de custo/privacidade; Vitest de recomendação e fallback.

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

### 2026-10-24 — implementação do ticket 05

- Criada análise assíncrona por resposta correlacionada, com contexto mínimo, prompt sem ferramentas, validação de evidência literal, Teto/créditos existentes e leitura privada pelo Vendedor responsável. A IA recomenda; a decisão de pausar/continuar segue humana.
- A revisão de resposta na tela atual exibe classificação, interpretação, evidência e recomendação; a ausência/falha da análise não bloqueia a decisão manual.
- Testes: pgTAP específico 28/28 e suíte completa pgTAP; `deno test -A supabase/functions` 1846 passed; `deno check` dos dois arquivos do runner; Vitest do detalhe 27 passed; Vitest completo 1939 passed, 4 skipped, mas 1 worker expirou ao iniciar `pedir-sequencia-ao-rhetor.test.tsx` (esse arquivo isolado passou 5/5); `npm run lint` passou com avisos preexistentes; `npx tsc -b` passou.
- Sem aplicação remota de migration ou deploy. Evidência visual antes/depois continua pendente de conferência humana.
