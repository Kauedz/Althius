# Handoff — canais 07

## Estado

Implementação do ticket `.scratch/canais-althius/issues/07-conversar-pelo-whatsapp.md` feita no worktree `ralph/canais-07-conversar-pelo-whatsapp`, em cima da base empilhada canais-05/06. O sandbox do runner impede `git add` e `git commit`; as alterações ficaram no worktree. Não aplicar migration remota nem publicar.

## O que mudou

- Webhook `canal-whatsapp-events` com assinatura, reserva do `wamid`, simulador, comandos de opt-out, recusa de número desconhecido, identificação, seleção de Workspace e abertura coordenada.
- `canal-delivery` entrega pelo adaptador simulado, trata falha e respeita a janela de 24 horas usando template de utilidade e resposta pendente.
- Migration `supabase/migrations/20261122130700_conversar_pelo_whatsapp.sql` para eventos, sessão, custos/status, janela/pendências, entrega, retry e RPCs do canal.
- Conversas WhatsApp aparecem com sua origem no frontend e abrem em modo somente leitura.
- Testes pgTAP, Deno e Vitest direcionados; ticket atualizado com AC e comentário datado.
- Corpo de PR em `/workspace/ralph-wt/_pr/canais-07.md`.

## Validação

- TDD: o teste inicial do webhook falhou por ausência do handler; passou após a implementação.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca07 supabase/tests/conversar_pelo_whatsapp.sql`: 17/17.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca07`: suíte completa passou.
- `deno test supabase/functions`: 1.807 passed, 0 failed, 39 ignored antes dos últimos refinamentos; após eles, testes focados dos handlers passaram (9 testes) e `deno check` focado passou.
- `npx vitest run --maxWorkers=2 src/paginas/conversa-do-slack.test.tsx src/fonte/supabase-conversas.test.ts`: 13/13.
- `npm run lint` e `npx tsc -b`: passaram; lint reportou avisos existentes.
- Suíte Vitest completa: 220 arquivos e 1.951 testes passaram, 4 ignorados; 1 teste falhou em `src/conversa/gaveta-de-historico.test.tsx:139`, ao esperar uma linha do Slack enquanto a lista ficou no estado de carregamento.
- `git diff --check`: passou.

## Revisão e lacunas conhecidas

- Standards: sem violações de padrão documentado; duplicação da forma do gatilho de entrega foi apenas observação heurística.
- Spec: a seleção de vários Workspaces, “nova conversa” e a janela de 24 horas foram completadas durante a revisão. A ligação explícita de Créditos e “quem respondeu” às ferramentas do Agente ainda não está implementada nesta fatia. A infraestrutura/tabela de `channel_notices` e seu escoamento também não foi implementada. Não considerar o controle total da spec concluído por causa dessas lacunas.
- Os quatro AC do ticket foram marcados conferidos por testes/código; validação visual em produção continua pendente de verificação humana e não foi executada.
- Nenhum arquivo de Sequência ou Sinais foi editado. Nenhuma chamada real à Meta/WhatsApp, nenhuma migration remota e nenhum deploy foram feitos.
- Decisão de seam pré-confirmada pela sessão headless: handler HTTP + adaptador simulado, RPC/migration testada por pgTAP e superfície pública de Conversa no frontend.

## Próximo passo

A matriz pode revisar e commitar o worktree segundo o fluxo do runner. Se for continuar a feature, resolver as lacunas de ferramentas de leitura e avisos em tickets próprios; não pegar automaticamente outro ticket nesta sessão.

## Suggested skills

- `code-review` para revisar a próxima fatia contra a spec e os padrões do repositório.
- `tdd` para implementar as ferramentas de leitura restantes e os avisos pelos seams públicos.
- `supabase:supabase` e `supabase:supabase-postgres-best-practices` para qualquer trabalho adicional em RPCs ou migrations.
