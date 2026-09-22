# Protótipo da aba de Agentes: só front-end, com dados simulados e marcas reais

O primeiro protótipo serve para desenhar e demonstrar a aba de Agentes inteira, e não para validar IA. Por isso é só front-end (React + Tailwind + shadcn/ui), com dados simulados em JSON, e a Conversa responde com roteiros pré-gravados (2 por Agente e 1 de Colaboração). Texto livre recebe uma resposta genérica. Isso vale **só para o protótipo**: no produto real, os Agentes precisam dar respostas robustas a qualquer entrada.

A demo usa um Workspace de uma empresa real (Databricks) e Contas-alvo reais, por decisão do fundador, que quer a demo com cara de real. Para limitar o risco, o app mostra um selo "Demonstração", e as pessoas dos Comitês de compra têm cargos reais com nomes fictícios. A interface e o conteúdo gerado são em pt-BR, só desktop, e o protótipo roda localmente.
