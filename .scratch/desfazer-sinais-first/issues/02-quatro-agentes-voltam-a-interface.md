# 02: Os 4 Agentes voltam à interface

**Status:** ready-for-human

**Hermes:** não

**Blocked by:** 01 (os dois mexem em `agentes.tsx`, `casca.tsx` e `composer.tsx`)

**Decisões:** ADR-0034, decisão 1.

## O que construir

Desfazer o #311 (merge `360efb0c`), que foi só de interface. O banco e o motor nunca mudaram: a semeadura dos 4 Agentes e as personas do Hermes continuam ativas.

- Barra lateral "Especialistas" de volta em `casca.tsx`, a partir de `agentesPadrao`.
- Grade dos 4 Agentes (`CartaoDeAgente`) e botão "Novo agente" de volta em `agentes.tsx`, acima do composer da `/`. A faixa de Especialidades do composer (`comEspecialidades`) volta.
- `paginas/novo-agente.tsx` volta (`git show 360efb0c^1:projeto-althius-frontend/src/paginas/novo-agente.tsx`), com a rota.
- `mencao.tsx`: sai o filtro `ESPECIALIDADES_RETIRADAS`; a @menção volta a oferecer os 4.
- `agente.tsx` e `secoes/{conversa,atividade,habilidades,memoria,rotinas}.tsx` voltam a ser graváveis; `secoes/somente-leitura.tsx` sai.
- `gaveta-de-historico.tsx`, `aprovacao-na-conversa.tsx`, `conversa-coordenada.tsx`, `proposta-de-sequencia.tsx`, `cartao-de-revisao-do-playbook.tsx` voltam a mostrar o nome do Agente como antes.
- Referência de cada arquivo: `git show 360efb0c^1:<arquivo>`, preservando o que #327, #330 e #341 acrescentaram depois.

## Pode mexer

- Os arquivos acima, `test/navegar.ts` e os testes editados pelo #311 (cerca de 25, listados em `git diff --stat 360efb0c^1 360efb0c`).
- `e2e/tests/08-agentes-so-leitura.spec.ts` (remover ou trocar por um smoke de "a grade mostra os 4 Agentes").

## Não mexa

- Qualquer migration ou Edge Function.
- O gate de Sequência e `gerar-sequencia.tsx` (ticket 03).
- Arquivos do Kauê.

## Critérios

- [x] A `/` mostra a grade com Scopus, Ethos, Rhetor e Oraculum e o botão "Novo agente". (Vitest `App.test.tsx` "Grade de Agentes", `agentes-reais.test.tsx`.)
- [x] A barra lateral mostra "Especialistas" com os 4. (Vitest `App.test.tsx` "a sidebar tem ... os Especialistas".)
- [x] A @menção oferece os 4. (Vitest `App.test.tsx` "@menção mostra o autocompletar..." e "o autocompletar de @ lista os Agentes criados".)
- [x] A página de um Agente aceita novo pedido na Conversa e edição de Memória, Habilidades e Rotinas. (Vitest `App.test.tsx` "edita e apaga um fato da Memória", "desativa uma Habilidade", "cria e pausa uma Rotina".)
- [x] Criar um Agente a partir de uma Especialidade funciona. (Vitest `App.test.tsx` "Novo agente abre o formulário com as 4 Especialidades".)
- [ ] Smoke 09 (cadência) verde no build do PR.
