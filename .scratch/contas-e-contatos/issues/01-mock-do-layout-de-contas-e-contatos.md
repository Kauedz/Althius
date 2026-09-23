# 01: Mock do layout de Contas e Contatos

**What to build:** um mock descartável do módulo Contas e Contatos, para aprovar o visual antes de levá-lo ao app. O mock usa a identidade do Manual da Marca: tokens, Oswald, raio 0 nos campos e os temas escuro e claro. Ele mostra:

- **A aba Contas:** título, descrição, contagem, busca, botão "Filtros", "Ordenar por" e a tabela compacta com as seis colunas (Empresa, Aderência, Contatos, Último sinal, Segmento, Último contato). Também mostra o menu de Filtros aberto, com chips ativos, e o pop-up da empresa com os links do site e do LinkedIn.
- **O detalhe de uma Conta-alvo:** cabeçalho, seções Sinais, Contatos e Interações, e uma Conta-alvo com as seções vazias.
- **A aba Contatos:** a tabela com os ícones de disponibilidade dos canais.

As linhas do mock exercitam os estados de ausência: sem logo, "Nenhum contato", "Nenhum sinal", "—" no segmento, "Nunca" e a Aderência não avaliada.

Se as capturas da Monaco e da Frontrunner forem adicionadas em `.scratch/contas-e-contatos/referencias/`, o mock deve consultá-las. O mock toma delas a intenção, sem copiar identidade visual, dados nem nomes de colunas.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] O mock mostra a aba Contas com a barra do topo, a tabela com cerca de 30 linhas de dados plausíveis, o menu de Filtros com chips e o pop-up da empresa
- [x] O mock mostra o detalhe de uma Conta-alvo com Sinais, Contatos e Interações, e os estados vazios das seções
- [x] O mock mostra a aba Contatos com os ícones de canal disponíveis e ausentes
- [x] A tabela é o foco visual, e as Quentes se destacam só pelo 🔥, sem selos coloridos, cartões, gradientes ou fundo especial
- [x] O mock aparece nos dois temas e segue o Manual da Marca
- [x] O mock não entra no app nem nos testes: é descartável
- [x] O fundador aprovou o visual, e os ajustes decididos foram registrados na spec

## Comments

- Mock navegável implementado em `.scratch/contas-e-contatos/mock/`. Para abrir localmente a partir da raiz do repositório: `python -m http.server 4175` e acessar `http://localhost:4175/.scratch/contas-e-contatos/mock/`.
- O mock inclui os estados Contas, Contatos e detalhe, filtros e ordenação demonstráveis, pop-up de empresa, Conta-alvo vazia (Banorte) e alternância de tema. Nenhuma rota, dependência ou teste do app foi alterado.
- Adicionadas fotos de perfil de exemplo (estilo LinkedIn) nos círculos de contatos (aba Contatos, coluna Contatos da aba Contas e detalhe da conta), mantendo o fallback com iniciais para contatos sem foto cadastrada.
- Substituídos os ícones monocromáticos em negativo pelos logos oficiais com as cores reais das empresas, agora exibidos em PNG/SVG 100% transparentes e sem fundo (sem caixas brancas ou bordas ao redor, flutuando diretamente sobre a linha da tabela como na referência).
- Corrigido o estilo do contador de contatos da tabela (`.contact-count`), removendo a caixa/borda cinza padrão do elemento button do navegador e tornando-o um texto limpo, integrado e sem fundo em ambos os temas.
- Visual do protótipo aprovado pelo fundador.
