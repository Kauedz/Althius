# 01: O card da Integração separa "Seu acesso" de "No Workspace"

Spec: [../spec.md](../spec.md) (US 1–3).

**What to build:** em Conexões, o bloco de Acesso de cada Integração mostra "Seu acesso: não conectado | Conectado como … | Precisa reconectar" e, separado, "No Workspace: N participante(s) conectado(s)". Some a leitura "Você ainda não conectou · 1 participante conectou".

**GATE:** só frontend; sem deploy; pt-BR; sem emojis.

**Blocked by:** None (can start immediately).

**Status:** done

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/paginas/conexoes.tsx` (bloco de Acesso, ~linhas 545–600)
- testes Vitest novos em `src/paginas/`
- nos testes existentes (`conexoes-acessos.test.tsx`, `conexoes-notion.test.tsx` e outros `conexoes-*.test.tsx`), só as asserções do texto antigo do Acesso

## Não mexa

- `fonte/supabase-conexoes.ts`, functions de Conexões, PR #48

## Critérios

- [x] "Seu acesso" e "No Workspace" aparecem rotulados, nos três estados de Acesso
- [x] Singular e plural corretos (0, 1, n)
- [x] Demonstração mostra o mesmo texto
- [x] Print 1400×900 do card do Notion em `issues/prints/01-notion.jpg`
- [x] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/conexoes`

## Evidência (auditoria, vertical F)

- `conexoes.tsx:557-568`: "Você ainda não conectou" (seu Acesso) e "1 participante conectou" (contagem do Workspace) lado a lado.
- Achado de tela de 2026-10-17 no card do Notion. A auditoria confirma que é por design, não estado cruzado.

## Comentário (2026-10-24)

Feito: `SeuAcesso` em `conexoes.tsx:563-603` agora rotula as duas leituras — "Seu acesso: não conectado | Conectado [como …] | Precisa reconectar" e, em linha separada, "No Workspace: N participante(s) conectado(s)" com singular/plural corretos em 0, 1 e n. Removida a leitura antiga sem rótulo.

Teste novo `conexoes-acesso-vs-workspace.test.tsx` cobre os três estados de Acesso cruzados com 0/1/3 participantes no Workspace; confirmei que falha sem a mudança em `conexoes.tsx` (via `git stash` só desse arquivo) antes de corrigir. Nos ~15 `conexoes-*.test.tsx` existentes só troquei as asserções do texto antigo pelo novo, sem mexer em lógica de teste.

Demonstração usa o mesmo componente `SeuAcesso` (não há texto duplicado fora dele), então mostra o mesmo texto por construção. Print 1400×900 do card do Notion tirado via Chrome headless, salvo em `issues/prints/01-notion.jpg`, mostrando "Seu acesso: não conectado" e "No Workspace: 1 participante conectado" lado a lado.

Testes: `npx vitest run --maxWorkers=2 src/paginas/conexoes` → 194 passed (21 arquivos, baseline 191 + 3 novos). `npx oxlint` e `npx tsc -b` sem erros.
