# Módulo de Sinais — mockup navegável

Status: ready-for-agent

## Problem Statement

O Cliente da Althius precisa identificar quais empresas apresentam evidências de uma necessidade comercial relacionada ao que vende, configurar o que acompanhar e priorizar Contas-alvo a partir desses acontecimentos. Hoje o protótipo mostra sinais fixos em Contas e Contatos, mas não oferece um catálogo, criação de Monitoramentos ou uma experiência para sinais personalizados.

A experiência deve contemplar empresas já importadas e novas empresas recomendadas, sinais de mercado, condições históricas internas e verificações realizadas para investigar necessidades. A primeira entrega serve para provar o mockup e sua navegação com dados simulados.

## Solution

Adicionar Sinais como módulo próprio da Althius, centrado num catálogo amplo de cards, com busca, filtros Todos / Externos / Internos / Originados e a ação Criar sinal personalizado. Cada card explica o que pode ser acompanhado e indica a quantidade de Monitoramentos ativos daquele tipo.

Clicar num card abre uma página própria de configuração, não um painel lateral. Tipos prontos apresentam campos específicos; o personalizado começa com uma descrição livre e simula a transformação do pedido em critérios editáveis. Cada Monitoramento tem nome, público, critérios e estado próprios. O Cliente pode configurar vários Monitoramentos do mesmo tipo.

Sempre que houver seleção de público, recomendar o público já definido nas configurações do Cliente, representado por uma simulação. Permitir acompanhar listas de Contas-alvo, descobrir empresas por perfil ou ambos. A tela de configurações de público não faz parte da entrega.

Sinais encontrados é um acesso discreto na página principal que alterna o catálogo por uma lista simples: empresa, sinal disparado e data. O mesmo Sinal alimenta Último sinal nas Contas-alvo e o histórico no detalhe da conta.

Cada Sinal disparado mantém a Conta-alvo Quente por 30 dias. O foguinho apresenta a quantidade de sinais válidos, separadamente da Aderência Fit / Não fit. Reencontrar o mesmo acontecimento não aumenta a contagem nem reinicia sua validade. A condição Quente indica uma razão para priorizar e aquecer a conta; não garante compra.

### Cobertura do catálogo

A coletânea deve ser ampla, contemplando as seguintes famílias e seus exemplos. Famílias organizam o conteúdo; não limitam o catálogo a um único card genérico por família. Tipos com configurações semelhantes podem compartilhar a mesma estrutura de formulário.

| Origem | Família | Cobertura |
| --- | --- | --- |
| Externos | Vagas e equipes | Abertura de vagas, primeira contratação de uma função, contratações de GTM e RevOps, crescimento ou redução de equipes, dores e projetos descritos em vagas |
| Externos | Movimentação profissional | Nova liderança, novas contratações, promoções e mudança de empresa de antigos compradores e Contatos |
| Externos | Capital e finanças | Rodadas de investimento, fusões e aquisições, investimentos anunciados, mudanças de situação financeira ou classificação de crédito, reestruturações |
| Externos | Expansão e registros | Novos escritórios e unidades, expansão geográfica, terrenos e imóveis, licenças e alvarás de obras, registros empresariais, licitações e contratos públicos |
| Externos | Tecnologia | Adoção, troca ou retirada de ferramentas, tecnologia identificada em registros, vagas ou sites, migrações anunciadas, certificações e incidentes públicos |
| Externos | Notícias e iniciativas | Notícias relevantes, lançamentos, projetos, mudanças estratégicas, parcerias e menções por parceiros ou investidores |
| Externos | Eventos e conteúdo | Fóruns econômicos, conferências, palestrantes, entrevistas, podcasts e publicações que mencionem dores ou procura de solução |
| Externos | Reputação e concorrência | Avaliações no G2 e outras plataformas, menções a marcas e concorrentes, relatos de problemas, indícios de saída de fornecedor ou de renovação não realizada |
| Externos | Comunidades e intenção | Discussões públicas, interesse em repositórios, pesquisa de temas e categorias via fornecedores de dados e interesse público em soluções concorrentes |
| Internos | Comportamento no site | Visitas ao site do Cliente e a páginas específicas, incluindo preços e produto |
| Internos | Histórico comercial | Negociação parada, ausência de resposta e proposta recusada há determinado tempo |
| Originados | Testes e verificações | Teste de atendimento ou lead oculto, verificação de erros ou indisponibilidade do site, testes de formulários e fluxos públicos, outras verificações personalizadas |

O catálogo é uma demonstração da abrangência desejada. Não promete integração operacional com todas essas fontes. Um personalizado pode pertencer a qualquer origem; usar uma API não transforma, por si só, um Sinal externo em originado.

## User Stories

1. Como usuário do Workspace, quero acessar Sinais pela navegação da Althius, para configurar o acompanhamento de oportunidades comerciais.
2. Como usuário, quero explorar cards com descrições claras dos tipos de sinais, para entender quais necessidades posso investigar.
3. Como usuário, quero uma coletânea externa ampla, para encontrar casos relevantes além de vagas e investimentos.
4. Como usuário, quero buscar tipos de sinais pelo nome e descrição, para localizar o que preciso.
5. Como usuário, quero filtrar Todos, Externos, Internos e Originados, para explorar cada origem.
6. Como usuário, quero identificar quantos Monitoramentos de um tipo estão ativos, para reconhecer o que já acompanho.
7. Como usuário, quero abrir uma página própria ao clicar num card, para configurar o sinal com espaço e clareza.
8. Como usuário, quero voltar dessa página ao catálogo, para continuar explorando outros tipos.
9. Como usuário, quero campos específicos para cada tipo pronto, para definir critérios sem escrever instruções técnicas.
10. Como usuário, quero selecionar cargos ou funções em vagas, para acompanhar contratações relevantes ao meu produto.
11. Como usuário, quero ajustar localização e período quando aplicáveis, para delimitar o acompanhamento.
12. Como usuário, quero configurar limites temporais dos sinais internos, para refletir o ciclo comercial do meu negócio.
13. Como usuário, quero criar vários Monitoramentos do mesmo tipo, para separar vagas de RH de vagas de engenharia, por exemplo.
14. Como usuário, quero dar um nome a cada Monitoramento, para reconhecer sua finalidade.
15. Como usuário, quero visualizar os Monitoramentos já criados na página do tipo, para gerenciá-los no mesmo contexto.
16. Como usuário, quero iniciar um Novo monitoramento nessa página, para adicionar outra configuração sem alterar as existentes.
17. Como usuário, quero editar os critérios de um Monitoramento, para adequá-lo ao meu negócio.
18. Como usuário, quero salvar uma configuração como Rascunho, para terminá-la antes de ativar.
19. Como usuário, quero revisar critérios e público antes de ativar, para entender o acompanhamento que estou configurando.
20. Como usuário, quero identificar Monitoramentos Ativos e Pausados, para saber quais estão em funcionamento na demonstração.
21. Como usuário, quero pausar um Monitoramento sem apagar os sinais anteriores, para interromper o acompanhamento preservando o histórico.
22. Como usuário, quero retomar um Monitoramento pausado, para continuar utilizando a configuração existente.
23. Como usuário, quero escolher uma lista de Contas-alvo importadas, para acompanhar empresas que já conheço.
24. Como usuário, quero descobrir empresas por perfil, para conhecer novas Contas-alvo com sinais relevantes.
25. Como usuário, quero combinar descoberta e acompanhamento, para cobrir os dois públicos no mesmo Monitoramento.
26. Como usuário, quero receber a recomendação de usar meu público das configurações, para evitar refazer uma definição existente.
27. Como usuário do mockup, quero ver esse público recomendado de forma simulada, para avaliar a experiência sem configurar uma nova área.
28. Como usuário, quero acessar Criar sinal personalizado em destaque, para investigar necessidades não cobertas pelos tipos prontos.
29. Como usuário, quero descrever em linguagem livre o que procuro e indicar uma fonte quando a conheço, para delegar a preparação à Althius.
30. Como usuário, quero visualizar critérios editáveis preparados a partir dessa descrição, para corrigir o entendimento antes de ativar.
31. Como usuário, quero identificar quando um personalizado está Em preparação, para compreender a etapa anterior à ativação.
32. Como usuário, quero configurar sinais personalizados sem fornecer código ou configurar uma API, para utilizar a experiência sem conhecimento técnico.
33. Como usuário, quero representar sinais internos baseados em tempo e histórico, para retomar contas sem resposta ou com negociações paradas.
34. Como usuário, quero preservar as Interações que fundamentam sinais internos, para consultar o contexto comercial.
35. Como usuário, quero representar verificações de atendimento e de erros no site, para identificar possíveis necessidades relacionadas ao que vendo.
36. Como usuário, quero ver Sinais encontrados por um acesso discreto, para consultar resultados sem perder o foco no catálogo.
37. Como usuário, quero uma lista com empresa, sinal e data de disparo, para reconhecer rapidamente o que aconteceu.
38. Como usuário, quero voltar dos resultados ao catálogo na mesma página principal, para continuar configurando o módulo.
39. Como usuário, quero que um resultado corresponda ao Último sinal da mesma Conta-alvo, para não encontrar informações divergentes.
40. Como usuário, quero acessar a Conta-alvo de um resultado, para consultar seu contexto e histórico.
41. Como usuário, quero consultar a fonte e a evidência disponíveis, para entender o fundamento do sinal.
42. Como usuário, quero que um Sinal disparado torne a conta Quente, para priorizá-la desde o momento do disparo.
43. Como usuário, quero ver um foguinho com a quantidade de sinais válidos, para distinguir uma conta com um sinal de outra com dois.
44. Como usuário, quero que múltiplos sinais mantenham a mesma condição Quente, para evitar níveis artificiais de temperatura.
45. Como usuário, quero manter Fit / Não fit separado do foguinho, para distinguir encaixe no ICP de acontecimentos que justificam prospecção.
46. Como usuário, quero que cada Sinal permaneça válido por 30 dias, para planejar o aquecimento da conta antes da abordagem.
47. Como usuário, quero que o foguinho desapareça quando não houver sinais válidos, para não priorizar indefinidamente um acontecimento antigo.
48. Como usuário, quero manter os sinais expirados no histórico, para preservar o contexto da conta.
49. Como usuário, quero que uma nova ocorrência tenha sua própria janela de validade, para manter a conta Quente enquanto houver motivo recente.
50. Como usuário, quero contar a mesma vaga ou acontecimento uma única vez, para que coletas repetidas não inflem a prioridade.
51. Como usuário, quero que reencontrar um acontecimento não renove sua data, para que a recência seja fiel ao disparo original.
52. Como usuário do protótipo, quero testar essas experiências com dados coerentes e simulados, para avaliar o produto antes das integrações.
53. Como responsável pelo produto, quero revisar visualmente a apresentação dos Monitoramentos, para simplificá-la se ela prejudicar a experiência do catálogo.
54. Como usuário, quero continuar usando Contas, Contatos, Agentes e Sequências, para que o módulo se integre à demonstração existente.

## Implementation Decisions

### Módulos e navegação

- Construir o módulo Sinais integrado à navegação e à linguagem visual existente. Manter a experiência em pt-BR, desktop e com a identificação de Demonstração já utilizada.
- Separar a página principal do catálogo e as páginas próprias de configuração. Não usar painel lateral para configurar um tipo ou um personalizado.
- Alternar catálogo e resultados no contexto da página principal, com retorno explícito. Resultados não ganham dashboard, gráficos ou uma experiência analítica extensa.
- Reutilizar os componentes, formulários, navegação e estados de carregamento já presentes. Apresentar estados vazios e falhas recuperáveis de forma simples.
- A página do tipo concentra seus Monitoramentos e a criação de outro. Sua densidade e apresentação serão avaliadas no mockup, conforme pedido explícito do usuário.

### Modelo e fronteira de dados

- Manter distintos o tipo de catálogo, o Monitoramento configurado e cada Sinal disparado. Um tipo pode ter vários Monitoramentos, e um Monitoramento pode produzir vários sinais.
- Cada Monitoramento guarda identificação, nome, tipo, origem, público, critérios e estado. Configurações prontas usam campos adequados ao tipo; personalizados guardam também a descrição e a fonte indicada quando houver.
- A evolução de Rascunho, Em preparação, Ativo e Pausado é simulada. O Cliente revisa os critérios antes da ativação. Permitir editar e pausar configurações independentemente.
- Seguir o padrão existente de fontes assíncronas observáveis, com injeção na aplicação e data controlável. Acrescentar as operações de catálogo, Monitoramentos, preparação simulada e resultados sem introduzir chamadas externas.
- Compartilhar o armazenamento lógico de sinais com a fonte de Contas e Contatos. Resultados globais, histórico por conta, Último sinal e quantidade de sinais válidos devem ser projeções dos mesmos registros, não cópias independentes.
- Cada Sinal identifica a Conta-alvo, o acontecimento, seu tipo ou Monitoramento de origem, descrição, data de disparo e fonte/evidência quando disponíveis. A data do acontecimento, se distinta, não substitui a data do disparo na regra de validade.
- Deduplicar pela identidade estável do acontecimento na Conta-alvo. Repetições em outra coleta, fonte ou Monitoramento não criam uma segunda ocorrência. No mockup, a identidade pode ser explícita nos dados simulados; não é necessário resolver deduplicação semântica de fontes reais.
- Os exemplos de descoberta serão associados a Contas-alvo simuladas de origem recomendada, respeitando a regra existente de que recomendações têm Fit. Contas importadas podem ser Fit, Não fit ou ainda não avaliadas.
- Preservar a fonte de Contas e Contatos como fronteira pública para seus consumidores atuais, adaptando as projeções sem criar regras diferentes em cada tela.

### Quente, Aderência e datas

- Aplicar o ADR 0007: Quente é derivado da existência de ao menos um Sinal válido, independentemente da avaliação de Aderência pelo Scopus.
- Separar a avaliação Fit / Não fit / não avaliada da quantidade de sinais válidos. Não substituir uma avaliação Não fit por Fit quando um sinal dispara.
- Na migração dos dados simulados antigos, as contas marcadas Quente tinham Fit por definição anterior; preservar esse Fit e passar a derivar o foguinho dos sinais. Não converter todas as contas com qualquer histórico em Quentes permanentes.
- O foguinho comunica Quente e a contagem, com singular e plural adequados. Não introduzir níveis adicionais, score de calor ou garantias de compra.
- Cada Sinal expira 30 dias após o disparo. Para eliminar ambiguidade nos testes, adotar a convenção técnica de expirar ao completar a janela, usando a mesma referência de tempo em todas as projeções.
- Uma duplicata mantém a data original. Um novo acontecimento recebe outra janela. A pausa interrompe novas detecções; não apaga nem expira antecipadamente os sinais existentes.
- O histórico e Último sinal podem mostrar um acontecimento expirado, mas o foguinho só considera os válidos. Uma data futura não representa um sinal já disparado.
- Revisar os filtros, ordenações e consumidores existentes que tratam Quente como valor de Aderência. Preservar a intenção de priorizar contas Quentes e o desempate por recência, sem ocultar Fit / Não fit. Não refazer a experiência de Sequências.

### Público, classificação e simulação

- Permitir acompanhamento de listas, descoberta por perfil ou ambos. Mostrar a recomendação de público das configurações sempre que houver escolha de público.
- Simular o público existente, sem criar sua área de configuração e sem exigir uma integração para prosseguir no mockup.
- Sinal externo vem de acontecimentos de mercado; interno vem de comportamento no site do Cliente ou de condições históricas comerciais; originado vem de uma verificação deliberada para investigar uma necessidade.
- Uma resposta comercial ou sua análise de conteúdo isolada não é um Sinal na filosofia definida. Ausência de resposta por tempo configurado, negociação parada e proposta recusada há determinado período são elegíveis.
- Exibir fatos observados e sua evidência sem apresentar uma hipótese de necessidade como certeza de causa ou compra.
- O Cliente define prazos e critérios de detecção conforme seu negócio. A validade de 30 dias após o disparo é uma regra distinta, fixa para esta entrega.
- A preparação de personalizados utiliza cenários e respostas simuladas, inclusive um retorno editável para descrição livre. Não apresentar essa demonstração como uma coleta real concluída.
- Apify e Actors são a direção prevista para integração futura, sem expor configuração técnica no fluxo do Cliente.
- Sinais é um módulo próprio que fornece informações aos agentes. A escolha de um agente executor e sua responsabilidade em verificações originadas ficam para uma fase futura.

## Testing Decisions

### Fronteira preferida e precedentes

- Priorizar uma única fronteira de integração: o aplicativo renderizado com navegação real entre suas telas e fontes simuladas injetadas. Testar o que o usuário faz e vê, evitando chamadas internas, classes CSS, estrutura privada e snapshots extensos.
- Reutilizar Vitest, React Testing Library, user-event e o helper existente que renderiza o aplicativo com fontes simuladas, sem atrasos, e data fixa.
- Há precedentes nos testes da listagem e do detalhe de Contas, de navegação em Agentes e de consistência entre Conversa, Sequências e Conta-alvo. Esses testes verificam comportamento por papéis acessíveis e conteúdo visível.
- Exercitar o novo módulo, a integração com Contas e Contatos e as projeções compartilhadas nessa mesma fronteira. Quando necessário para datas e deduplicação, usar a interface pública da fonte simulada para preparar cenários, sem testar sua estrutura interna.
- Os testes atuais que exigem Quente dentro da Aderência e quantidades fixas de contas por essa classificação precisam ser atualizados segundo o ADR 0007. Não remover cobertura de regressão apenas para acomodar a mudança.

### Cenários de aceitação

1. Acessar Sinais, buscar e filtrar o catálogo; abrir um card numa página própria e voltar.
2. Verificar a presença das famílias de catálogo acordadas e das três origens sem acoplar testes ao desenho de cada card.
3. Criar dois Monitoramentos do mesmo tipo, com nomes, critérios e públicos distintos; editar um sem alterar o outro.
4. Salvar rascunho, revisar e ativar; pausar e retomar um Monitoramento; refletir a quantidade de ativos no card.
5. Criar um personalizado por descrição, representar a preparação, editar os critérios e ativar sem API real.
6. Demonstrar listas, descoberta e ambos, com recomendação de público simulado nos três casos.
7. Abrir Sinais encontrados e navegar à Conta-alvo; confirmar a mesma descrição e data nos resultados, no Último sinal e no histórico.
8. Um sinal válido mostra foguinho com um; outro acontecimento válido da mesma conta mostra dois e mantém Quente.
9. Reencontrar o mesmo acontecimento não aumenta a contagem nem altera a data de disparo, mesmo com outra origem de coleta ou Monitoramento.
10. Com data controlada, verificar imediatamente antes, no instante e depois da expiração dos 30 dias; não usar esperas reais.
11. Ao expirar um de dois sinais, a contagem cai para um; ao expirar o último, o foguinho some e o histórico permanece.
12. Pausar o Monitoramento preserva os sinais e suas datas; não produz novos disparos simulados enquanto estiver pausado.
13. Uma conta importada Não fit ou não avaliada pode ficar Quente por sinal sem perder sua avaliação original.
14. Uma resposta comercial isolada continua sendo Interação e não gera Sinal automaticamente. Os exemplos internos utilizam os critérios temporais acordados.
15. Verificar catálogo sem correspondência na busca, ausência de Monitoramentos e ausência de resultados com ações de continuidade claras.
16. Confirmar que a navegação e os roteiros existentes de Contas, Agentes e Sequências continuam coerentes após a separação de Quente e Aderência.

### Revisão visual e verificações

- Inspecionar no navegador o catálogo, uma configuração pronta, um personalizado, a lista simples de resultados e a mesma conta com um e dois sinais.
- Avaliar principalmente hierarquia, espaçamento, legibilidade e apresentação dos Monitoramentos. Essa apresentação está sujeita à simplificação após avaliação visual, por solicitação do usuário.
- Na implementação, executar os testes pertinentes e os comandos de build e lint já existentes. Esta tarefa publica a especificação; não implementa o módulo nem afirma que esses testes foram executados.
- A seção de testes descreve a validação prevista para a implementação futura, baseada nos precedentes do repositório. O pedido desta entrega é somente produzir a spec; não executar essa validação.

## Out of Scope

- Coleta real, chamadas à Apify, criação ou execução de Actors, scraping e integrações operacionais com fontes externas.
- Envio de WhatsApp, LinkedIn ou e-mail, execução real de lead oculto, varreduras ou testes em sites de terceiros.
- Nova Especialidade de Agente, escolha obrigatória de executor ou desenho final da responsabilidade dos agentes na coleta.
- Implementação da área de configurações de público.
- Backend de produção, agendamento real, persistência remota, credenciais, cobrança e limites de consumo.
- Identificação real de visitantes, resolução de identidade entre pessoas e empresas e deduplicação semântica de fontes reais.
- Dashboard analítico de sinais, níveis adicionais de temperatura e alteração automática de Fit pelo disparo.
- Transformar respostas comerciais ou interpretação de seu conteúdo em sinais isolados.
- Garantia de cobertura universal de sinais do mercado ou de disponibilidade de todas as fontes no produto real.
- Redesenho amplo dos demais módulos e experiência móvel nesta entrega.
- Implementação do próprio módulo durante a publicação desta spec.

## Further Notes

- A referência visual e de catálogo é Frontrunner; as imagens orientam amplitude e apresentação por cards. A experiência deve manter a identidade da Althius.
- A coletânea complementar e suas fontes estão em [Catálogo de referência](catalogo.md).
- O histórico da entrevista foi preservado em [Decisões da entrevista](entrevista.md); em caso de divergência, esta síntese e o ADR 0007 representam as decisões finais.
- A separação entre Quente e Aderência substitui a classificação única anterior. O restante do vocabulário de Conta-alvo, Cliente, Workspace, Interação e Monitoramento segue o glossário do projeto.
- A origem recomendada continua exigindo Fit. Isso não impede que contas importadas Não fit tenham sinais e fiquem Quentes.
- Nos dados demonstrativos, usar fontes e evidências identificadas como simuladas, preservando o selo de Demonstração existente e evitando apresentar incidentes inventados como fatos verificados.
- Os detalhes de engenharia escolhidos aqui, como o limite exato da expiração e a reutilização da fronteira de testes, operacionalizam as decisões de produto; não são novas funcionalidades.


