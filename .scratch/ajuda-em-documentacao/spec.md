# PR-14 — Ajuda em formato de documentação

## GATE
1. Dentro da rota atual `/configuracoes/ajuda/:pagina`: barra lateral com grupos recolhíveis (Começar, Usar a
   Althius, Informações), conteúdo central até 720 px e "Nesta página" com as âncoras. Tela estreita: menu de seleção.
2. Busca local (Ctrl+K / Cmd+K) em títulos e texto, sem acento, com destaque do termo.
3. Conteúdo em Markdown versionado em `projeto-althius-frontend/src/ajuda/*.md`, carregado na build
   (`import.meta.glob ?raw`), com "Atualizado em" e blocos de nota e atenção (ícones Info e TriangleAlert).
4. Rota antiga `/configuracoes/ajuda/central` leva a `/configuracoes/ajuda/comecar`. Termos e Privacidade mantêm o texto.
5. Testes Vitest: leitor de Markdown, navegação, âncoras, busca e rota antiga.

## Fora do escopo
Conectores, Hermes, segredos, migrações, Edge Functions, rotas novas e menu lateral do app.
Sem valores internos (teto em dólar) no texto de cliente.
