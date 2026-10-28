# 09: Busca de contas por seleção

**Status:** ready-for-human

**GATE:** Sem migration e sem deploy de Edge Function.

## Problema

A confirmação da busca pelo ICP usa campos de texto para critérios que precisam ser escolhidos de listas, dificultando a revisão dos filtros e permitindo formatos inconsistentes.

## Solução

Usar seleções múltiplas pesquisáveis para setores, portes e regiões, chips para palavras-chave e excluir, e o seletor existente de CNAEs quando aplicável. Manter o contrato atual de `buscarContas`.

## Pode mexer

- `projeto-althius-frontend/src/paginas/descobertas.tsx` e testes do fluxo.
- `projeto-althius-frontend/src/paginas/sinais/perfil-personalizado.tsx` e testes relacionados.
- Novo componente compartilhado `projeto-althius-frontend/src/components/selecao-multipla.tsx`.
- Nova lista de opções em `projeto-althius-frontend/src/fonte/opcoes-da-busca.ts` somente se necessário.

## Não mexa

- Migrations, Edge Functions, conectores, canais, Hermes e arquivos de Kauê.
- Fluxos de aceitar, descartar e restaurar Descobertas.

## Critérios de aceite

- [x] Setores usam seleção pesquisável, pré-preenchida pelo ICP, sem descartar valores fora da lista.
- [x] Porte usa as faixas fixas e envia os valores atuais, incluindo `11-50`.
- [x] Região usa regiões brasileiras, UFs e cidades carregadas pelos dados existentes, mantendo o formato aceito pelo backend.
- [x] CNAEs usam o seletor existente quando aplicável.
- [x] Palavras-chave e Excluir usam chips; Confirmar exige setor ou palavra-chave.
- [x] Payload exato de `buscarContas` permanece compatível e testes do perfil continuam passando.
- [ ] CI e demais verificações exclusivas do CI passam.

## Comments

- 28/10/2026 — Extraído `SelecaoMultipla` para componente compartilhado e usado na confirmação de Descobertas e no Perfil Personalizado. A busca agora oferece setores pesquisáveis (incluindo valores já presentes no ICP), faixas de porte com rótulos pt-BR, regiões/UFs/cidades do Brasil com carregamento existente, CNAE para Receita e chips para Palavras-chave/Excluir. Nenhuma migration ou Edge Function foi alterada.
- 28/10/2026 — `npx tsc -b --noEmit`, lint e build passaram; lint mantém apenas avisos preexistentes e o build mantém o aviso de chunk grande. `npx vitest run src/paginas/descobertas.test.tsx` passou (16 testes). O comando amplo solicitado para os globs de `src/paginas/sinais src/components src/fonte` ficou sem concluir neste ambiente; a execução específica disponível passou. CI ainda precisa confirmar os critérios exclusivos de CI.


2026-10-28 15h18 — Revisão:
- `SelecaoMultipla` foi movida sem alteração para `components/selecao-multipla.tsx`. A versão do Codex tinha sido reescrita em linha única.
- Palavras-chave e Excluir agora usam `components/etiquetas-de-texto.tsx`.
- Região fica no formato que `account-discovery/regioes.ts` entende: "Brasil", a sigla da UF ou "Cidade, UF". Saíram as macrorregiões, que a busca não interpreta, e o formato "Cidade (UF)", que virava local inválido no LinkedIn.
- CNAE é escolhido pela mesma seleção, só entre as subclasses de 7 dígitos que a busca aceita. O seletor de níveis do Sinal tinha um "onde" sem efeito aqui.
- Novo teste ponta a ponta da caixa: pré-preenchimento, setor, porte, cidade, palavra-chave, exclusão e payload exato.
- Verificação: Vitest de `paginas/sinais` e `paginas/descobertas`, 343 testes verdes; tsc, lint e build verdes.
