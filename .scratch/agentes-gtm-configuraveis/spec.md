# Spec: Agentes pessoais e configuráveis para GTM na Althius

**Status:** ready-for-agent
**Decisão do produto:** decisões confirmadas em conversa em 06/11/2026; mapa de limites do Hermes, conflitos com Contexto da empresa e ADRs, padrões do composer e do kanban e estratégia de testes confirmados em 07/11/2026.
**Depende de:** `.scratch/contexto-da-empresa/` na `main` (fonte do contexto do Workspace) e de uma ADR nova que substitui as Especialidades (ver Implementation Decisions).

## Problem Statement

O usuário quer delegar trabalho comercial a agentes da Althius sem conhecer configurações técnicas ou explicar cada passo. A experiência atual impõe quatro Especialidades, nomes e ferramentas vinculados a essas categorias. O usuário também relata respostas pouco proativas, como negar acesso à internet em vez de investigar e realizar o pedido.

O objetivo é democratizar o uso do Hermes configurado para GTM através da Althius. O problema é funcional: não há autorização para redesenhar o aplicativo, reorganizar sua navegação ou substituir seu layout.

## Solution

Preservar a experiência visual existente e disponibilizar Agentes pessoais, com nomes livres, funções e instruções configuráveis pela Conversa ou pelos controles existentes. Um primeiro Agente já fica disponível ao usuário elegível e pode assumir qualquer responsabilidade de GTM. Ele não constitui uma categoria especial de coordenador.

Qualquer participante com acesso operacional pode criar Agentes diretamente ou pedir a um Agente que crie outro. O Agente entende o objetivo, consulta o contexto permitido, pesquisa na internet quando necessário, usa arquivos e Integrações, entrega resultados e respeita Aprovações e autorizações vigentes.

Os quatro especialistas tornam-se configurações reutilizáveis de uma biblioteca, com nomes funcionais. Compartilhar uma dessas configurações com a equipe permite criar outro Agente independente, sem transferir Conversas, Memória pessoal ou acessos. Chamaremos essa configuração de Modelo de Agente nesta spec, distinguindo-a de modelos de Sinais, modelos de Sequências e modelos de IA.

Hermes permanece invisível para o usuário. A interface mostra Agentes da Althius e preserva a apresentação das ferramentas utilizadas. A primeira versão inclui o fluxo completo, inclusive configuração, execução, Aprovações, criação, biblioteca e Rotinas.

### Diretriz de produto: Hermes plenamente disponível através da Althius

Para o usuário, Hermes e Althius devem formar uma única experiência: ele utiliza a capacidade do Hermes pela interface e identidade da Althius, já configurada para GTM. Não precisa conhecer, instalar ou configurar o motor. A Althius democratiza o acesso a esse agente com contexto comercial, mantendo os controles do produto.

“Capacidade máxima” significa aproveitar a amplitude de capacidades pertinentes do Hermes na versão efetivamente implantada, sem reduzi-lo a um gerador de respostas ou a quatro funções fixas. Não significa consumo ilimitado, maior modelo em toda chamada ou retirada de permissões e Aprovações. O Agente deve pesquisar, produzir textos e entregas extensas quando o pedido exigir, realizar tarefas em várias etapas e responder com agilidade compatível com o trabalho.

Essa evolução é requisito da presente spec e condição para o aceite do fluxo completo. Pode ser dividida em tickets técnicos dependentes, mas não adiada como melhoria opcional posterior. Uma spec técnica complementar, se necessária para detalhamento, permanece vinculada a este mesmo resultado e não reduz seu escopo.

A implementação deverá produzir um inventário de capacidades da versão instalada, indicar quais são nativas, quais dependem de configuração e quais exigem integração com a Althius, e demonstrar seu funcionamento pelas superfícies reais do produto. Capacidades não verificadas não podem ser prometidas como disponíveis. Restrições artificiais de ferramentas, tamanho de entrega, etapas ou tempo devem ser identificadas e ajustadas quando impedirem tarefas acordadas, preservando limites operacionais justificados, cancelamento e controle de Créditos.

Velocidade e produção extensa são critérios observáveis: medir tempo até o primeiro progresso e até a conclusão em tarefas representativas; verificar que entregas longas não sejam truncadas silenciosamente e possam ser consultadas integralmente. Não há meta numérica de latência acordada, nem promessa de execução instantânea. Resultados e estados de progresso devem ser apresentados pelos componentes existentes, sem redesenho.

### Evolução obrigatória da integração Hermes

A limitação atual do Hermes dentro da Althius é parte central do problema. O escopo não se encerra em renomear Agentes, liberar categorias ou ajustar instruções. É obrigatório disponibilizar uma estrutura funcional de execução: pesquisa e leitura da internet, consulta de contexto e arquivos, seleção e execução de ferramentas, continuidade entre etapas, instruções e Memória persistentes, entregas, Rotinas e Aprovações.

A implementação deve levantar as capacidades disponíveis na versão efetivamente utilizada do Hermes, confrontá-las com o que a integração expõe e corrigir as lacunas necessárias aos fluxos desta spec. Para cada capacidade obrigatória, registrar se está disponível de ponta a ponta, se existe no motor mas está bloqueada ou ausente na integração, ou se exige uma ferramenta adicional. Uma lacuna descoberta é trabalho de implementação; não reduz automaticamente o escopo acordado.

O aceite exige concluir tarefas reais com essas capacidades combinadas. Ter uma ferramenta cadastrada, mencionar uma capacidade no prompt ou receber uma resposta dizendo que o Agente pode agir não comprova funcionamento. O layout permanece preservado; a integração interna pode ser reformulada. Autonomia continua limitada pelas autorizações e controles do produto.

### Onde a integração limita o Hermes hoje

Levantamento do código em 07/11/2026 (branch `contexto-da-empresa-03-onboarding`, igual à `main` nesses arquivos). Hoje a Althius usa o Hermes como gerador de texto: as capacidades do motor ficam desligadas por configuração, proibidas no prompt ou sem caminho de entrada. Cada item abaixo é lacuna a resolver ou limite a justificar; números são os valores atuais, não metas.

1. **Ferramentas nativas desligadas.** O guia de instalação do worker (`supabase/functions/_hermes-worker/README.md`) manda desligar `terminal`, `file`, `code_execution`, `browser`, `computer_use` e `cronjob` em `disabled_toolsets`, por segurança num teste com dados de clientes. Pesquisa web, memória, habilidades e delegação do Hermes não estão desligadas, mas nada as usa.
2. **Prompt que proíbe investigar.** As regras do worker (`_hermes-worker/worker.ts`, `REGRAS_COM_FERRAMENTAS` e o prompt sem Integração) dizem para agir só pelas ferramentas da Althius, não usar terminal, arquivos "nem outras ferramentas", usar só o que está no prompt, na conversa ou no resultado das ferramentas, e responder "não sei" quando faltar. Os prompts da fila de Sinais (`sinais-ia.ts`) mandam não usar ferramentas próprias. É a origem direta do comportamento "não tenho acesso à internet".
3. **Ferramentas da Althius por ponte de texto.** `POST /v1/runs` recebe só `input`, `instructions` e `conversation_history` e não aceita ferramentas externas. O modelo responde um JSON `{"ferramenta","entrada"}` e o worker executa (`_shared/ferramentas-dos-agentes.ts`). O catálogo tem 10 ferramentas, filtradas por Especialidade e por Permissão; nenhuma pesquisa a web ou lê uma página. A rota por servidor MCP recomendada em `.scratch/motor-hermes/pesquisa-hermes.md` não foi implementada.
4. **Limites fixos de execução:**
   - até 6 chamadas de ferramenta por pedido, 90 s por ferramenta, resultado cortado em 6.000 caracteres (`ferramentas-dos-agentes.ts`);
   - até 4 chamadas ao Hermes por Agente por rodada, 8 min por chamada com `/stop` no prazo, e a Execução vira falha aos 10 min (`worker.ts`, `README.md`);
   - Coordenação com no máximo 3 rodadas, 4 Agentes acionados e 3 escolhidos (`orquestracao.ts`);
   - só 10 Contas-alvo entram no prompt; anexos chegam só como texto, até 60 mil caracteres; Playbook até 24 mil e cada texto de contexto até 12 mil; imagens não são enviadas;
   - fila de prompts com 40 mil caracteres de sistema e 60 mil de texto; `maxTokens` é lido mas nunca enviado ao Hermes;
   - Execuções processadas uma por vez, até 5 por ciclo do worker.
5. **Memória, Habilidades e Rotinas desligadas do motor.** São tabelas da Althius (`private.agent_memory_facts`, `private.agent_skills`, `private.agent_routines`). O worker não lê Memória nem Habilidades; elas só aparecem listadas na tela. As Rotinas são disparadas pelo `pg_cron` da Althius para a mesma fila. A memória e as habilidades nativas do Hermes só aparecem na pesquisa e na spec do motor; o ticket correspondente segue `needs-info`.
6. **Versão e modelo indefinidos.** A versão do Hermes não está fixada em nenhum lugar. O modelo é configurado no próprio Hermes e diverge entre o README do worker, a ADR-0018 e a spec do motor.

O Hermes roda com `hermes gateway` e `API_SERVER_ENABLED=true`, acessado pelo worker em `HERMES_URL` com chave Bearer, numa máquina compartilhada entre Workspaces. Religar uma capacidade nativa precisa considerar esse isolamento.

## User Stories

1. Como usuário com acesso operacional, quero encontrar um primeiro Agente disponível, para começar sem configurar uma estrutura técnica.
2. Como usuário, quero atribuir qualquer função de GTM ao primeiro Agente, para adaptá-lo ao meu trabalho.
3. Como usuário, quero nomear e renomear meus Agentes livremente, para reconhecê-los pela sua finalidade.
4. Como Membro, quero criar Agentes pessoais sem ser Administrador, para organizar meu trabalho.
5. Como usuário, quero criar um Agente pela interface existente, para utilizar os controles que já conheço.
6. Como usuário, quero pedir a um Agente que crie outro, para realizar a configuração pela Conversa.
7. Como usuário, quero discutir uma possível configuração sem criar automaticamente um Agente, para explorar ideias antes de decidir.
8. Como usuário, quero que um pedido de criação resulte em um Agente persistido e utilizável, para continuar o trabalho nele.
9. Como usuário, quero definir instruções pela Conversa, para ensinar como o Agente deve trabalhar.
10. Como usuário, quero que orientações duradouras sejam aplicadas em Conversas futuras, para evitar repetições.
11. Como usuário, quero consultar e corrigir instruções salvas, para manter controle da Personalização.
12. Como usuário, quero que o Agente reconheça o contexto autorizado do Workspace, para não fornecer novamente informações da empresa.
13. Como usuário, quero que cada Agente preserve sua própria Memória e Conversas, para manter responsabilidades distintas.
14. Como usuário, quero fornecer arquivos, para fundamentar as entregas nos meus materiais.
15. Como usuário, quero fornecer um endereço de página e receber uma análise do conteúdo, para não precisar copiá-lo manualmente.
16. Como usuário, quero que o Agente pesquise informações atuais quando necessário, para receber resultados fundamentados.
17. Como usuário, quero que o Agente consulte fontes disponíveis antes de me perguntar, para reduzir interrupções.
18. Como usuário, quero que o Agente escolha ferramentas adequadas, para pedir resultados em linguagem natural.
19. Como usuário, quero que a função do Agente oriente seu trabalho sem impedir tarefas auxiliares, para que ele conclua objetivos completos.
20. Como usuário, quero que o Agente utilize meus Acessos às Integrações autorizados, para trabalhar com os sistemas que utilizo.
21. Como usuário, quero entender qual acesso está faltando quando uma tarefa não pode continuar, para resolver o impedimento.
22. Como usuário, quero que o Agente tente uma alternativa adequada após uma falha, para evitar abandonos prematuros.
23. Como usuário, quero receber entregas acessíveis e verificáveis, para utilizar o trabalho realizado.
24. Como usuário, quero acompanhar ferramentas utilizadas e o andamento da Execução na interface atual, para entender o progresso.
25. Como usuário, quero distinguir resultado concluído de ação pendente, para saber o que ainda precisa de mim.
26. Como pessoa autorizada a decidir uma Aprovação, quero revisar a ação concreta antes da execução, para controlar seus efeitos.
27. Como usuário, quero que autorizações já concedidas sejam respeitadas sem perguntas repetidas, para delegar com fluidez.
28. Como usuário, quero que o Agente nunca declare uma operação concluída sem confirmação real, para confiar no histórico.
29. Como usuário, quero escolher Modelos de Agente com nomes funcionais, para entender sua utilidade.
30. Como usuário, quero adaptar um Modelo de Agente depois de utilizá-lo, para adequá-lo à minha necessidade.
31. Como usuário, quero disponibilizar um Modelo de Agente à equipe, para reutilizar uma configuração útil.
32. Como destinatário de um modelo, quero receber um Agente independente, para desenvolver minhas próprias instruções e Memória.
33. Como autor de um modelo, quero preservar minhas Conversas, Memória e acessos pessoais, para compartilhar apenas a configuração reutilizável.
34. Como destinatário, quero que alterações no Agente de origem não modifiquem o meu, para manter previsibilidade.
35. Como usuário, quero pedir que uma tarefa seja repetida em uma agenda, para criar uma Rotina pela Conversa.
36. Como usuário, quero consultar, editar, pausar e retomar Rotinas, para controlar o trabalho recorrente.
37. Como usuário, quero que definir uma função não agende tarefas por conta própria, para manter controle sobre execução e consumo.
38. Como usuário existente, quero preservar minhas Conversas e configurações na migração, para não perder trabalho.
39. Como usuário, quero continuar usando o mesmo layout e navegação, para aproveitar as melhorias sem reaprender o aplicativo.
40. Como participante de um Workspace, quero que permissões e limites permaneçam válidos em qualquer Agente, para proteger dados e recursos.
41. Como usuário, quero que recarregar a página não duplique uma operação, para evitar Agentes, Rotinas e ações repetidas.
42. Como usuário, quero que uma falha real seja apresentada com precisão, para distinguir indisponibilidade de falta de autorização.

## Implementation Decisions

- Evoluir substancialmente a forma como a Althius utiliza o Hermes. A integração atual não é uma restrição de arquitetura a preservar: adaptar ou substituir suas partes limitantes quando necessário para entregar um Agente plenamente funcional. Aproveitar o motor Hermes e os contratos úteis existentes, sem treinar um novo modelo de IA ou construir um motor equivalente desnecessariamente.
- Preservar layout, navegação, grade/seção de Agentes e apresentação das ferramentas. Alterar funcionalidades, nomes e estados nas superfícies existentes. Uma necessidade de redesenho fica fora desta autorização.
- Evoluir os módulos de Agentes e Personalização, Conversas, execução Hermes, catálogo de ferramentas, Memória, Habilidades, Rotinas e Aprovações. Reutilizar as Fontes do frontend; a interface continua consumindo dados persistidos.
- Substituir o catálogo fechado como fundamento da identidade. Nome, função e instruções não dependem de uma das quatro Especialidades. Quantidade de funções não é limite de concorrência: preservar controles operacionais e de consumo.
- Vincular Agentes pessoais à Conta de usuário dentro do Workspace operacional pertinente. Não criar um novo Workspace pessoal nem alterar as regras de contrato. Preservar isolamento entre Workspaces e acrescentar isolamento entre usuários para conteúdo pessoal.
- Criação pessoal deixa de depender do papel de Administrador, sem conceder poderes administrativos, acesso a Integrações ou capacidade de decidir Aprovações reservadas a outros papéis. Observadores e Demonstração continuam sujeitos às restrições existentes.
- Manter um primeiro Agente configurável para novos usuários elegíveis. Reentradas não duplicam esse Agente; seu nome não é uma identidade técnica nem fica fixado como “Bot”. Não converter a tela inicial em uma nova experiência de agente único.
- Criação pela interface e pela Conversa utiliza a mesma operação autorizada. Distinguir intenção de explorar/configurar da intenção de criar. Registrar sucesso apenas após persistência e proteger contra repetição de pedidos.
- Separar Modelo de Agente reutilizável de instância pessoal. A cópia começa com a configuração selecionada, sem histórico pessoal, Memória, credenciais ou autorizações herdadas. Rotinas ativas não são transferidas silenciosamente. Mudanças posteriores não propagam para cópias existentes.
- Manter o compartilhamento restrito à equipe nesta versão. Validar a Participação no Workspace e o acesso do destinatário. Selecionar explicitamente o conteúdo reutilizável e excluir referências privadas que concederiam acesso indevido.
- Persistir instruções duradouras por intenção do usuário e apresentar o resultado da atualização. Texto de páginas, arquivos e resultados de ferramentas não concede autorização nem altera instruções por conta própria.
- Usar contexto autorizado do Workspace junto à Personalização do Agente. A fonte comercial do Workspace é o Contexto da empresa vigente (Empresa, Perfil de cliente ideal e Personas, com sua versão), pela mesma interface de contexto vigente que a spec `contexto-da-empresa` entrega aos consumidores; Playbook e mini-ICP não voltam como fonte. O Agente lê o Contexto da empresa; só o Administrador o altera, pelas Configurações, e um Agente não grava nele por instrução de Conversa. Não confundir instruções pessoais com revisão da Memória do Workspace ou do Contexto da empresa: revisões compartilhadas continuam seguindo suas regras administrativas.
- Disponibilizar ferramentas conforme capacidade real, autorização e acesso, substituindo restrições arbitrárias por Especialidade. A descrição de uma função não concede permissões.
- Garantir pesquisa web, leitura de páginas, consulta de contexto e arquivos, Integrações disponíveis, entregas, criação de Agentes e Rotinas no fluxo completo. Validar o contrato real do Hermes implantado e disponibilizar capacidades pela integração; recursos existentes no Hermes não são presumidos disponíveis no aplicativo.
- Fixar a versão do Hermes e o modelo de IA usados em produção e registrá-los num lugar só. O inventário de capacidades vale para essa versão; atualizar o Hermes refaz o inventário.
- Decidir, por capacidade nativa, o que religar e com qual proteção, considerando que o Hermes atende vários Workspaces na mesma máquina. Pesquisa web e leitura de páginas entram no fluxo completo. Terminal, arquivos do servidor, execução de código e controle do computador continuam desligados enquanto não houver isolamento por Workspace comprovado. Registrar essa decisão numa ADR, porque muda a regra atual de desligar os toolsets.
- Substituir a ponte de texto por um caminho em que o Hermes enxergue as ferramentas da Althius como ferramentas de verdade (por exemplo, o servidor MCP recomendado na pesquisa do motor), mantendo a revalidação de Permissão, Aprovação e Créditos no servidor da Althius a cada chamada.
- Reescrever as regras do prompt do worker: o Agente investiga com as ferramentas disponíveis antes de responder que não sabe ou de perguntar, e diz qual acesso falta quando não consegue. Manter "nunca inventar" e "nunca declarar feito o que depende de Aprovação".
- Revisar cada limite fixo listado em "Onde a integração limita o Hermes hoje". Cada um é ampliado ou ganha uma justificativa registrada (custo, segurança, isolamento). Resultado de ferramenta ou entrega cortado avisa o corte e permite consultar o conteúdo inteiro. `maxTokens`, quando existir, chega de fato ao Hermes.
- Ligar Memória, Habilidades e instruções salvas à execução: o worker passa a usá-las em cada Execução do Agente dono, seja pelas tabelas da Althius, seja pelos recursos nativos do Hermes, desde que isolados por Workspace e por usuário.
- Preservar o contrato público de Execuções baseado em iniciar, reservar, registrar eventos e finalizar. Reutilizar os pontos existentes de persistência, idempotência, retomada, cancelamento e registro de custo.
- Não fixar uma nova API, tabela ou formato de payload sem necessidade comprovada. A persistência deve representar titularidade pessoal, configuração reutilizável, instruções e operações autorizadas. Alterações de schema devem seguir migrations aditivas e as definições mais recentes do projeto.
- Aplicar Ler, Propor e Executar, revalidando autorização no servidor antes do efeito. Preservar Aprovações, Créditos, Teto, contrato e autorizações específicas de Sequências. Um agente criado por outro não herda autorização ilimitada.
- Rotinas têm agenda explícita e controles existentes de edição/pausa; dependem de autorização e Teto para execução automática. Definir responsabilidade não ativa uma Rotina.
- Preservar histórico e configurações existentes sem apagar ou replicar dados compartilhados para usuários indevidos. A implementação deve mapear titularidade legada antes de aplicar isolamento pessoal; dados sem titular inequívoco permanecem preservados sob acesso legado até uma transição segura.
- Registrar a mudança numa ADR nova (ADR-0035) antes do primeiro ticket que toque Especialidades. A ADR-0034 (31/10/2026) acabou de trazer as quatro Especialidades de volta depois da ADR-0033; a ADR-0035 precisa dizer o que mudou desde então e por que esta direção é diferente do "agente único" que a ADR-0034 retirou (Agentes pessoais com nome livre, vários por usuário, sem ocupar a tela inicial). Ela:
  - substitui por inteiro a ADR-0005 (catálogo fechado, nome "Especialidade · complemento", Agente padrão por Especialidade que não pode ser excluído);
  - substitui na ADR-0004 a dependência das quatro Especialidades: a Coordenação continua sem nome, sem página e sem agir sobre Integrações. Decidido em 07/11/2026: o composer manda o pedido ao Agente @mencionado ou, sem menção, ao primeiro Agente do usuário; dividir o pedido entre vários Agentes continua fora do escopo de lançamento;
  - substitui as decisões 1 (os quatro Agentes de volta), 2 (a `/` como página dos quatro, mantendo a mesma grade com os Agentes do usuário) e 5 (o Rhetor como único autor de Sequência) da ADR-0034. A decisão 6 já foi substituída pela spec `contexto-da-empresa`. As decisões 3, 4 e 7 continuam valendo;
  - recebe uma linha de remissão nas ADRs 0004, 0005 e 0034.
- Não mexer na ADR-0032. "Agente de Sinal" e "Agente de Contas" continuam nomes de experiências (Sinais e Contas e Contatos), não Agentes pessoais nem Modelos de Agente. Eles não entram na grade de Agentes nem na biblioteca.
- Mapear e migrar toda dependência de Especialidade antes de retirar o catálogo, num ticket próprio que vem primeiro. Pontos já conhecidos na `main`:
  - RPCs de Sequência que exigem `specialty = 'rhetor'`: a definição mais recente está em `20261219040000_sequencia_volta_ao_rhetor.sql`, depois de `20261217200000_sequencia_sem_exigir_o_rhetor.sql` ter tirado e devolvido essa regra. A ADR-0035 fecha essa oscilação: propor Sequência passa a depender da Permissão e da autorização do Agente, não da Especialidade;
  - as demais migrations que filtram por Especialidade (Aderência da Conta gravada, histórico e sugestões, Aprovações e guarda, coordenação de WhatsApp e Slack, Clay, análise de resposta, reserva de créditos e templates de Sequência), sempre redefinidas a partir da definição mais recente na `main`;
  - o filtro por Especialidade das ferramentas em `supabase/functions/_shared/ferramentas-dos-agentes.ts` e as personas por Especialidade do worker;
  - telas que chamam uma Especialidade pelo nome, como o cartão do kanban de prospecção que oferece pedir ao Ethos (ticket 04 de `kanban-de-prospeccao`). Decidido em 07/11/2026: oferecer o pedido ao Agente que o usuário escolher, com o primeiro Agente pré-selecionado.
  A coluna `specialty` e os dados antigos ficam no banco (migrations aditivas); um Agente que veio de uma Especialidade passa a ter o Modelo de Agente de origem só como referência. A Demonstração continua simulada e pode manter os quatro nomes; nada dela vai para o Workspace operacional.
- Atualizar o `CONTEXT.md`: Especialidade sai do vocabulário ativo (fica como histórico do Modelo de Agente de origem); redefinir Agente, Agente padrão (vira o primeiro Agente do usuário, que pode ser renomeado e não é obrigatório manter) e Agente criado (nome livre); incluir Modelo de Agente e tirar "modelo de agente" do _Avoid_ de Especialidade; manter o _Avoid_ de "agente de X" com as exceções da ADR-0032. Não reutilizar silenciosamente o conceito de Modelo de Sinal.

## Testing Decisions

- Concentrar os testes de comportamento no fluxo público **pedido do usuário → Execução → ferramentas/Aprovação → resultado persistido e visível**, reutilizando a entrada de Conversas e o contrato de Execuções existente. Não criar um ponto de teste novo para cada função.
- Um bom teste comprova comportamento observável e efeitos autorizados: resultado salvo, acesso negado, Aprovação pendente, operação não duplicada e informação acessível ao usuário correto. Não depender de redação exata da IA, detalhes privados de prompts ou sequência interna rígida de chamadas quando mais de um caminho for válido.
- Aproveitar os testes de integração existentes do worker Hermes com ferramentas e os testes de Conversas. Eles já substituem Hermes e dependências externas por dublês controlados e verificam eventos, resultado e limites. Ampliar esse padrão para criação por Conversa, instruções persistentes, consulta de fontes, falha e retomada.
- Nos testes do worker, cobrir os limites revisados: resultado de ferramenta maior que o limite avisa o corte e fica consultável inteiro; uma tarefa com mais chamadas do que o limite antigo conclui; Memória e instruções salvas do Agente chegam à chamada ao Hermes; um Agente de outro usuário ou Workspace nunca recebe essa Memória.
- Aproveitar os testes da raiz do aplicativo com Fontes e banco controlados para verificar criação, nomes livres, persistência entre sessões, configuração e uso de modelos. Há precedentes de Agentes no Workspace operacional, Aprovações reais e Rotinas recorrentes. Casos antigos refletem estados de implantação anteriores e não comprovam o estado atual de produção.
- Manter testes pgTAP na fronteira real de banco para isolamento, titularidade, Participação, criação por Membro, cópia sem vazamento, contexto compartilhado, Aprovações e limites. Os precedentes incluem Agentes e permissões, Playbook na Execução e aprendizado por feedback. Dublês de frontend não substituem essa cobertura.
- Na retirada das Especialidades, cobrir em pgTAP cada RPC migrada: um Agente sem a Especialidade antiga, com Permissão e autorização, consegue propor Sequência e as demais ações; um Agente sem Permissão continua barrado. Os testes antigos não são alterados; os novos ficam em arquivo próprio.
- Verificar que o Agente recebe o Contexto da empresa vigente e nunca o Playbook, e que um pedido na Conversa para mudar o contexto não grava nele.
- Realizar aceitação ponta a ponta com Hermes real e fontes/contas de validação: abrir um site, pesquisar informação atual, combinar contexto e arquivo, criar Agente, salvar instrução, copiar modelo, executar ação sujeita a Aprovação e configurar/pausar Rotina. Registrar evidência de ferramenta e persistência; não aceitar respostas simuladas como prova de capacidade.
- Verificar que repetir um pedido após reconexão não duplica criação ou efeito externo; que recusa, expiração ou revogação de acesso impedem o efeito; e que um site indisponível produz limitação específica ou alternativa adequada.
- Comparar visualmente as superfícies existentes antes e depois para comprovar preservação do layout, incluindo apresentação de ferramentas. A verificação é regressão visual, não autorização para redesign.
- Rodar os checks exigidos pelo projeto durante a implementação e os testes pertinentes às mudanças. Esta atividade de especificação não implementa a funcionalidade nem declara que esses testes já passaram.

## Out of Scope

- Redesenho do layout, navegação, identidade visual ou arquitetura de páginas.
- Novo CRM, alterações gerais do funil, cobrança, contrato ou das regras comerciais de Sequências.
- Treinamento de modelo próprio ou substituição desnecessária do motor Hermes.
- Marketplace público, compra e venda de modelos, rankings, curadoria ou publicação comunitária nesta versão.
- Agente único compartilhado por pessoas com Memória e Conversas conjuntas; compartilhar significa copiar uma configuração.
- Computador remoto visível, acesso irrestrito a sistemas ou autonomia sem autorização.
- Tornar Colaboração permanente e automática entre vários Agentes uma condição de lançamento. Criar um Agente por Conversa é obrigatório; uma nova plataforma de coordenação multiagente não foi especificada.
- Apagar dados legados, aplicar migrations remotas, realizar deploy ou alterar segredos nesta etapa de especificação.

## Further Notes

- Decisões de produto confirmadas na conversa em 6 de novembro de 2026. Nome correto: Althius. Termo de interface: Agentes. Os nomes individuais são livres.
- Primeira versão deve conter o fluxo completo; etapas internas de implementação não substituem esse aceite.
- Modelos de Agente usados pela comunidade são direção futura de expansão, sem inclusão no escopo atual.
- A referência é a experiência do Grok Bot, especialmente primeiro agente, atribuição de trabalho e biblioteca, adaptada à interface existente da Althius. Não há exigência de copiar seu layout.
- Snapshot inspecionado: commit daecc18887f25cb67be8a1aa76ba818c1d2c4be1. O levantamento não confirmou configuração do Hermes implantado, migrations remotas ou capacidades de produção. O mapa de limites da integração foi conferido no código em 07/11/2026; a configuração real do Hermes na máquina (o `~/.hermes/config.yaml` em uso) não foi conferida.
- Ordem entre specs: esta spec começa depois que `contexto-da-empresa` estiver na `main`. Aquela spec mantém as quatro Especialidades e deixa substituí-las fora do escopo dela; esta é a que as substitui, depois da ADR-0035.
- Antes de implementar, conferir a base atual, as definições vigentes de contratos e capacidades do Hermes, e o tratamento dos dados legados. São verificações técnicas, não exigências de conhecimento técnico do usuário.
- Medir conclusão de tarefas reais, recusas indevidas, interrupções desnecessárias, sucesso de criação/configuração, funcionamento de Aprovações e Rotinas, tempo até a primeira entrega e custo por tarefa. Metas numéricas não foram acordadas.
- Referências: [Grok Bot](https://docs.x.ai/grok-bot/overview), [primeiro uso](https://docs.x.ai/grok-bot/get-started), [Habilidades no Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/), pesquisa do motor em `.scratch/motor-hermes/pesquisa-hermes.md`.
