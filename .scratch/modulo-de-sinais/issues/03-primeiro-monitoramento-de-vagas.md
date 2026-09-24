# 03: Configurar o primeiro Monitoramento de vagas

**What to build:** transformar o percurso visual aprovado em uma experiência funcional simulada: acessar Sinais, encontrar Abertura de vagas, configurar um Monitoramento e salvar ou reabrir seu Rascunho.

**Blocked by:** 01 — Mockup visual do módulo Sinais para aprovação, incluindo aprovação visual explícita do usuário.

**Status:** closed

- [x] Conectar navegação, catálogo e página própria de configuração à fonte simulada assíncrona observável, injetada na aplicação e compatível com os padrões existentes de carregamento e data controlável.
- [x] Distinguir tipo de catálogo, Monitoramento e Sinal disparado. Um Monitoramento guarda identificação, nome, tipo, origem, público, critérios e estado; não usar o card como a própria configuração.
- [x] Buscar por nome e descrição e filtrar Todos / Externos / Internos / Originados, preservando a cobertura visual aprovada do catálogo. As configurações especializadas restantes serão conectadas nos tickets 05 e 06 e 07.
- [x] Abrir Abertura de vagas em página própria, com retorno explícito ao catálogo, nome do Monitoramento, cargos ou funções, localização e período aplicáveis.
- [x] Selecionar uma lista de Contas-alvo importadas e oferecer o público recomendado das configurações simuladas sem exigir integração ou criar outra área de configuração.
- [x] Salvar Rascunho e reabri-lo ao navegar para fora e voltar durante a sessão, preservando nome, público e critérios; persistência remota não faz parte da entrega.
- [x] Exibir Monitoramentos do tipo na mesma página e permitir continuidade quando não houver nenhum. Rascunhos não contam como ativos.
- [x] Oferecer estados de carregamento, busca sem correspondência, ausência de Monitoramentos e falhas recuperáveis, reutilizando componentes existentes e mantendo pt-BR e Demonstração.
- [x] Testar pela aplicação renderizada a navegação real, busca por nome/descrição, filtros e ida e volta ao Rascunho com a fonte injetada. Executar testes pertinentes, build e lint e conferir visualmente a fidelidade ao mockup aprovado.


