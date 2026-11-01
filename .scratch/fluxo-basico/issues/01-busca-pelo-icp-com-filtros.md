# 01: Buscar contas pelo ICP com filtros confirmáveis

**Status:** em PR (Fase 1a)

**GATE:** Sem migration. Depois do merge, publicar a Edge Function `account-discovery` e rodar o smoke de produção.

## Problema

O botão de Descobertas chamava a busca sem critérios, recebia 422 e nunca permitia confirmar os filtros do ICP. Além disso, o fluxo não lia o ICP estruturado e escondia do usuário a mensagem real da Edge Function.

## Solução

Buscar os critérios antes de iniciar a varredura, combinar ICP estruturado e Playbook, permitir edição e confirmação dos filtros, mostrar custo e saldo em créditos e devolver as mensagens reais de erro em português.

## Pode mexer

- `supabase/functions/account-discovery/`
- `projeto-althius-frontend/src/fonte/descobertas-tipos.ts`
- `projeto-althius-frontend/src/fonte/supabase-descobertas.ts`
- `projeto-althius-frontend/src/fonte/simulada-descobertas.ts`
- `projeto-althius-frontend/src/paginas/descobertas.tsx` e testes do fluxo

## Não mexa

- Fluxos de aceitar, descartar e restaurar Descobertas.
- Migrations, banco remoto, segredos, deploy e publicação.
- Letras de fontes internas, valores em US$ ou emojis na interface.

## Critérios de aceite

- [x] `criteria` devolve setores, portes e regiões do ICP estruturado sozinho; `supabase/functions/account-discovery/handler.test.ts`, “criteria: ICP estruturado sozinho vira setores, portes e regiões”.
- [x] `criteria` combina ICP estruturado e Playbook, tolera falha da leitura estruturada e informa `temIcp: false` quando ambos estão vazios; `supabase/functions/account-discovery/handler.test.ts`, três testes “criteria: ...”.
- [x] A tela busca e pré-preenche os filtros, permite editar e envia os critérios editados com `icpVersion`; `projeto-althius-frontend/src/paginas/descobertas.test.tsx`, “buscar contas pelo ICP adiciona nova candidata e debita créditos”, e `src/fonte/supabase-descobertas.test.ts`.
- [x] A tela bloqueia Confirmar sem setor e palavra-chave, aponta para Configurações e aceita vírgula enquanto a pessoa digita; `descobertas.test.tsx`, “os filtros da busca aceitam vírgula ao digitar e exigem setor ou palavra-chave”.
- [x] Porte estruturado com várias faixas ("1-10, 11-50, EPP") mantém cada faixa inteira; o handler inteiro lê o ICP estruturado e, se a leitura falhar, segue com o Playbook; `handler.test.ts`, “criteria: Porte estruturado com várias faixas…”, “handler criteria: ICP estruturado entra nos filtros” e “handler criteria: falha no ICP estruturado volta ao Playbook, sem erro”.
- [x] Administrador em fonte `testing` envia `allowTesting: true`; não administrador não chama `search` e vê a mensagem de validação; `descobertas.test.tsx`, “administrador em testing confirma com allowTesting, filtros editados e versão do ICP”, “ator available confirma sem allowTesting” e “não administrador em testing não busca e mostra a validação”.
- [x] Erros 422 e 403 mostram o corpo real da Edge Function; `projeto-althius-frontend/src/fonte/supabase-descobertas.test.ts`, “transforma o corpo JSON do erro em mensagem e usa fallback quando não é JSON”.
- [x] O custo e o saldo aparecem somente em créditos, com `Ilimitado (interno)` no Workspace interno; `descobertas.test.tsx`, “mostra ilimitado interno no painel, nunca US$” e “mostra o custo normal em créditos no painel de confirmação”.
- [ ] CI e smoke de produção passam.

## Comments

- 28/10/2026 — A implementação não altera o contrato da ação `search`; a leitura estruturada usa o retorno mais recente de `get_my_workspace_icp` (`version`, `sector`, `companySize`, `geography`).
- 28/10/2026 — `npm run lint` passou com avisos existentes; o Vitest focado passou (2 arquivos, 15 testes); `npm run build` passou (`tsc -b` e Vite); `npm test` iniciou o Vitest, mas não produziu contagem nem terminou e foi interrompido após ficar pendente.
- 28/10/2026 — `~/.deno/bin/deno test supabase/functions/account-discovery` passou (53 testes, 0 falhas, 1 ignorado).
- 28/10/2026 — Revisão: `get_my_workspace_icp` devolve jsonb com `companySize` (camelCase), conferido na migration 20261214102000. O Porte estruturado era lido como uma só linha, e só a primeira faixa sobrevivia; agora cada item vira uma linha. Os campos do painel guardam o texto digitado e só viram lista ao confirmar.
