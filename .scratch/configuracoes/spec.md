# Configurações pessoais e do Workspace

Status: ready-for-agent

## Problem Statement

Os usuários da Althius não dispõem de uma área central para cuidar do perfil, das preferências e das informações do Workspace. Hoje o aplicativo demonstra agentes e operações comerciais, mas não oferece gestão de participantes, papéis de acesso ou documentação compartilhada do ICP e das Personas. A preferência de tema existente não persiste após recarregar.

O usuário precisa compreender o que é pessoal e o que afeta toda a empresa. O ICP e as Personas precisam ser uma referência compartilhada pelos módulos, não textos independentes em cada tela. Revisar esse contexto deve ser acessível a todos os participantes, com decisão exclusiva dos Administradores e atualização automática das configurações dependentes.

Também faltam a apresentação do plano atual e pontos de acesso a ajuda, feedback, termos e privacidade. A primeira entrega deve ser completa como experiência demonstrativa, coerente com o aplicativo atual, sem exigir serviços reais de autenticação, cobrança ou envio externo.

## Solution

Criar uma área de Configurações integrada à navegação e à identidade visual atual, em português e para desktop, com seis seções:

- **Meu perfil:** nome, foto, e-mail e fluxo demonstrativo de alteração de senha.
- **Preferências:** tema e controle de notificações web do usuário.
- **Workspace / Pessoas e acesso:** informações do Workspace, participantes, convites e papéis Administrador/Membro.
- **Memória do Workspace:** documentação vigente do ICP e das Personas, com acesso aos respectivos Agentes para solicitar revisões.
- **Plano:** plano atual, participantes e Execuções de Agentes no período, com valores demonstrativos e upgrade “Em breve”.
- **Ajuda e informações:** orientações básicas, formulário de feedback, termos de serviço e política de privacidade, todos navegáveis e com conteúdo provisório substituível.

O fluxo central é: qualquer participante solicita uma revisão ao Scopus ou Ethos; o Agente propõe o novo contexto; um Administrador aprova ou recusa na área de Aprovações. A aprovação substitui a documentação vigente e atualiza automaticamente as configurações existentes que dependem dela, sem aprovações adicionais por área. A Memória do Workspace conserva somente a última versão aprovada.

## User Stories

1. Como usuário, quero acessar Configurações pela navegação do aplicativo, para encontrar minhas preferências e informações do Workspace em um lugar previsível.
2. Como usuário, quero distinguir dados pessoais de dados compartilhados, para entender o alcance de cada alteração.
3. Como usuário, quero consultar e editar meu nome, para me identificar corretamente no aplicativo.
4. Como usuário, quero adicionar, trocar ou remover minha foto, para personalizar meu perfil.
5. Como usuário, quero consultar e alterar meu e-mail no protótipo, para experimentar o fluxo de atualização dos meus dados.
6. Como usuário, quero acessar um formulário de alteração de senha, para compreender como cuidarei do meu acesso.
7. Como usuário, quero receber mensagens claras de validação e resultado, para saber se a operação demonstrativa foi concluída.
8. Como usuário, quero que meu nome e minha foto sejam consistentes entre perfil e menu pessoal, para não encontrar identidades divergentes.
9. Como usuário, quero escolher tema claro ou escuro e manter essa preferência ao recarregar, para usar o aplicativo com minha aparência preferida.
10. Como usuário, quero ativar ou desativar notificações do navegador, para controlar os avisos que recebo.
11. Como usuário, quero saber quando o navegador bloqueia ou não suporta notificações, para entender por que a ativação não funcionou.
12. Como Administrador, quero receber aviso de revisão de contexto aguardando Aprovação, para decidir se o Workspace deve adotar a proposta.
13. Como solicitante, quero ser avisado de que minha proposta foi aprovada ou recusada, para conhecer o resultado do pedido.
14. Como usuário, quero ser avisado sobre falhas de execução relevantes, para identificar situações que precisam de atenção.
15. Como participante, quero consultar as informações do meu Workspace, para reconhecer a empresa e o espaço em que estou trabalhando.
16. Como participante, quero ver quem participa e qual é o papel de cada pessoa, para entender quem pode administrar o Workspace.
17. Como Administrador, quero convidar uma pessoa com papel definido, para ampliar a equipe.
18. Como Administrador, quero alternar o papel de um participante entre Administrador e Membro, para ajustar suas responsabilidades.
19. Como Administrador, quero remover alguém do Workspace, para encerrar seu acesso a esse espaço.
20. Como pessoa removida, quero preservar minha Conta de usuário e vínculos com outros Workspaces, para não perder minha identidade na Althius.
21. Como Administrador, quero ser impedido de remover ou rebaixar o último Administrador, para o Workspace não ficar sem responsável.
22. Como Membro, quero ter acesso às informações sem poder executar ações administrativas, para que a separação de responsabilidades seja respeitada.
23. Como participante, quero consultar o ICP documentado na Memória do Workspace, para conhecer o perfil de cliente ideal vigente.
24. Como participante, quero consultar as Personas documentadas na Memória do Workspace, para conhecer os papéis comerciais definidos pelo Ethos.
25. Como participante, quero solicitar revisão do ICP pelo Scopus, para melhorar o contexto compartilhado.
26. Como participante, quero solicitar revisão das Personas pelo Ethos, para melhorar o entendimento dos públicos comerciais.
27. Como Membro, quero encaminhar uma proposta à decisão de um Administrador, para contribuir sem publicar alterações por conta própria.
28. Como Administrador, quero examinar a alteração proposta e seu alcance antes de decidir, para compreender seu efeito no aplicativo.
29. Como Administrador, quero aprovar ou recusar uma revisão, inclusive quando fui seu solicitante, para controlar a documentação vigente.
30. Como participante, quero que propostas pendentes ou recusadas não alterem o contexto vigente, para continuar trabalhando com informações aprovadas.
31. Como Administrador, quero que uma única aprovação atualize automaticamente as configurações dependentes já existentes, para evitar inconsistências e decisões repetidas por módulo.
32. Como participante, quero encontrar somente a última versão aprovada do ICP e das Personas, para saber qual contexto está em vigor.
33. Como participante, quero encontrar o mesmo contexto em Configurações e nos módulos que o utilizam, para não trabalhar com cópias divergentes.
34. Como participante, quero consultar o plano atual do Workspace, para entender sua situação comercial.
35. Como participante, quero ver o número de participantes e as Execuções de Agentes no período indicado, para compreender o uso demonstrativo.
36. Como participante, quero identificar a possibilidade futura de upgrade com “Em breve”, para entender que a contratação ainda não está disponível.
37. Como usuário, quero acessar orientações básicas de ajuda, para aprender a usar as funções demonstradas.
38. Como usuário, quero preencher um formulário de feedback e ver seu resultado demonstrativo, para experimentar como enviar sugestões.
39. Como usuário, quero acessar páginas estruturadas de termos e privacidade, para encontrar essas informações na navegação, com identificação de conteúdo provisório.
40. Como responsável pelo produto, quero substituir os conteúdos provisórios pelos finais sem redesenhar essas páginas, para completar a experiência posteriormente.

## Implementation Decisions

### Escopo e integração com o aplicativo

- Preservar a experiência frontend demonstrativa vigente, com fontes simuladas, marca e componentes existentes. Não introduzir serviços reais apenas para viabilizar esta entrega.
- Integrar Configurações à navegação do Workspace; o menu pessoal pode direcionar diretamente a Meu perfil. Reutilizar os padrões de navegação e formulários do aplicativo.
- Manter Conexões em sua área própria. O Notion foi somente uma referência de organização de Workspace, sem exigência de copiar seu layout e sem vínculo, armazenamento ou sincronização com ele.
- Reutilizar as fontes de dados e o fluxo de Aprovações existentes, estendendo seus contratos para perfil, preferências, participantes, plano e memória compartilhada. Não criar uma fonte independente por tela para o mesmo dado.
- Preservar a separação entre Aderência e condição Quente. A propagação de contexto não deve transformar uma revisão de ICP em disparo de Sinal nem alterar a semântica de Fit/Não fit.

### Identidade, Workspace e acesso

- Separar Conta de usuário, Workspace e Participação no Workspace. O papel pertence ao vínculo com o Workspace, não à identidade global da pessoa.
- Usar exatamente dois papéis: Administrador e Membro. Não adicionar papel Lead nem matriz de permissões individualizadas.
- Administradores administram participantes e informações do Workspace. Membros consultam os dados compartilhados, alteram preferências pessoais e solicitam revisões pelos Agentes.
- Administradores convidam, removem e alteram papéis. A simulação de convite exibe seu estado sem alegar envio real de e-mail; não confundir convite pendente com participante ativo.
- A ação de remoção deve se chamar “Remover do Workspace” e esclarecer que a Conta de usuário permanece. Encerrar somente o vínculo e o acesso ao Workspace selecionado, preservando outros vínculos.
- Não excluir a Conta de usuário, migrar plano ou criar Workspace automaticamente após remoção. A hipótese de plano gratuito não constituiu uma decisão comercial.
- Impedir remover ou rebaixar o último Administrador, também no contrato de operação da fonte simulada, não apenas ocultando o botão.
- A restrição de aprovação a Administradores nesta spec aplica-se às revisões de ICP e Personas. Não redefinir silenciosamente a autorização de todas as outras categorias de Aprovação existentes.

### Perfil e preferências: concretização da demonstração

- Perfil contém nome, e-mail e foto. Atualizar a apresentação do usuário na casca do aplicativo a partir da mesma fonte. Usar iniciais quando não houver foto.
- Validar nome não vazio, formato de e-mail e arquivo de imagem antes de salvar. Cancelar mantém os dados vigentes; salvar informa o resultado de forma acessível.
- O fluxo de senha não mostra a senha existente. Contém senha atual, nova senha e confirmação, com campos mascarados e confirmação compatível. Não armazenar os valores digitados, enviá-los ou alegar troca de credencial real; concluir com mensagem explícita de demonstração e limpar os campos.
- Adotar persistência local no navegador para dados demonstrativos não secretos e preferências. Preferências são associadas ao usuário; participantes, memória e plano são associados ao Workspace. A persistência local não é autenticação nem garantia de autorização de produção.
- Tema claro/escuro usa o mecanismo existente e permanece após recarregar. Nome, e-mail e foto demonstrativos também devem permanecer consistentes após navegação e recarga.
- Dados de exemplo e estado de teste devem ser isoláveis, para um cenário não contaminar o seguinte.

### Notificações

- Controle único “Ativar notificações do navegador”, inicialmente desligado. Solicitar permissão do navegador somente após ação explícita do usuário.
- Distinguir preferência do usuário de permissão concedida pelo navegador. Não mostrar ativação concluída se a permissão foi negada, ainda não concedida ou a API não está disponível.
- Representar os estados desligado, ativado, bloqueado e não suportado. Desativar interrompe os avisos desta preferência, sem alegar revogar a permissão do navegador.
- Eventos: Aprovação solicitada, ação aprovada ou recusada e falha de execução. Usar eventos simulados do aplicativo, sem infraestrutura de push em segundo plano.
- Respeitar o papel e a participação no Workspace: avisos para decidir revisão de contexto se destinam aos Administradores; o solicitante pode receber o resultado do seu pedido. A notificação não concede capacidade de aprovação.

### Memória compartilhada e revisão do contexto

- Memória do Workspace contém o ICP e as definições de Personas, distintos da Memória individual dos Agentes e da lista de participantes.
- Usar Scopus para revisão do ICP e Ethos para revisão das Personas. Qualquer participante ativo pode solicitar revisão; não oferecer edição direta que dispense esses Agentes e a Aprovação.
- Na demonstração, o Agente produz uma proposta por roteiro simulado, integrada à Conversa e à fila de Aprovações. Não exigir inferência real de IA.
- A proposta permite examinar o conteúdo proposto, sua origem e o alcance da alteração, informando que aprovar atualizará as configurações dependentes no Workspace.
- Somente Administradores ativos no Workspace podem aprovar ou recusar. Basta um Administrador; ele pode ter solicitado a revisão. A operação de decisão deve validar esse papel, não apenas a apresentação da interface.
- Enquanto pendente ou recusada, a proposta não muda a Memória do Workspace nem suas configurações dependentes.
- Aprovar substitui o contexto vigente e atualiza automaticamente todas as configurações existentes que dependem do contexto alterado. Não limitar a propagação aos próximos trabalhos ou às novas configurações; não gerar aprovações adicionais por módulo.
- Os módulos devem compartilhar a referência vigente. Abrir novamente uma área dependente depois da aprovação deve apresentar o novo contexto, sem exigir cópia manual ou nova configuração.
- Na experiência demonstrativa, a atualização do contexto e de suas dependências deve se completar como uma única mudança consistente; falha não pode deixar parte do aplicativo com a proposta publicada e parte com o contexto anterior.
- Manter somente a última versão aprovada do ICP e das definições de Personas. Não criar lista de versões, comparação histórica navegável ou restauração. O conteúdo vigente e uma proposta pendente são estados distintos, não um histórico de versões aprovadas.
- Essa regra não determina apagar Atividades, Execuções, Aprovações ou registros comerciais. A decisão aprovada trata de configurações dependentes; não autoriza refazer ações externas já executadas.
- Preservar a semântica de Aprovação e Atividade do aplicativo: decidir uma proposta é uma ação da Execução que a originou, não uma nova Execução de Agente.

### Plano, ajuda e informações

- Plano é informação do Workspace. Mostrar nome do plano atual, quantidade de participantes e Execuções de Agentes em um período explícito, com valores demonstrativos consistentes.
- Não inventar preços, franquias comerciais ou limites contratados. Reservar a apresentação de limites para dados comerciais futuros.
- Identificar upgrade como “Em breve”, sem navegar para página inexistente ou iniciar cobrança.
- Central de ajuda contém orientações curtas para funções existentes. Feedback contém formulário, validação e confirmação demonstrativa, sem alegar entrega externa.
- Termos de serviço e política de privacidade têm páginas completas em estrutura, com seções e conteúdo básico provisório claramente identificado e substituível. Não apresentar práticas de dados, identidade jurídica ou obrigações inventadas como documentos oficiais.
- Os acessos a ajuda, feedback, termos e privacidade devem funcionar no protótipo; não substituí-los por links quebrados ou “indisponível”.

## Testing Decisions

- Priorizar uma fronteira principal: o aplicativo renderizado com suas fontes simuladas, exercitado por navegação e ações de usuário. Reutilizar o suporte existente de renderização do App e interação por Testing Library/Vitest, sem montar um sistema paralelo de testes.
- Os testes existentes de navegação, contagem de Aprovações após decisões e criação de Sequências por Conversa já exemplificam fluxos entre telas com confirmação humana. Seguir esse padrão, verificando comportamentos observáveis por papéis, textos acessíveis e resultados visíveis.
- Um bom teste comprova o que o usuário consegue fazer e o que acontece com os dados exibidos. Não testar estrutura de componentes, nomes privados, quantidade de chamadas internas ou detalhes de armazenamento sem efeito observável.
- Estender o preparo do aplicativo para escolher identidade, participação e papel em cada cenário. Não construir um seletor de papéis acessível ao usuário de produção apenas para facilitar testes.
- Testar navegação até todas as seções, alteração de perfil e tema e manutenção dos valores após remontagem com o mesmo armazenamento demonstrativo.
- Testar o formulário de senha sem persistência dos campos e sem mensagem de alteração real de credencial.
- Testar convite demonstrativo, alteração de papel, remoção de vínculo preservando a Conta de usuário e outro vínculo, e bloqueio da remoção ou rebaixamento do último Administrador.
- Testar a jornada principal para ICP e Personas: Membro solicita pelo Agente correto; proposta fica pendente; tentativa de decisão como Membro é impedida; Administrador aprova; Memória e uma configuração dependente preexistente exibem o novo contexto; nenhuma segunda Aprovação é criada.
- Testar recusa e pendência mantendo o contexto e as dependências intactos; testar que o próprio Administrador solicitante pode aprovar.
- Testar duas atualizações aprovadas sucessivas: a segunda substitui a primeira e somente a última aparece como documentação vigente, sem lista de versões ou restauração.
- Testar propagação para as áreas existentes que consomem ICP/Personas, começando pelo público recomendado de Sinais e pelo contexto apresentado pelos Agentes. Não aceitar apenas um texto atualizado na tela de Configurações.
- Complementar a fronteira principal com poucos testes do contrato público de operações de autorização, quando necessários para provar que Membro não decide propostas e que o último Administrador não pode ser removido, mesmo sem passar pelo botão da interface.
- Substituir somente as APIs externas do navegador necessárias aos cenários de notificações e arquivos. Cobrir permissão concedida, negada e API ausente, e ausência de solicitação automática ao abrir a página.
- Verificar plano e consumo demonstrativos, upgrade “Em breve”, formulário de feedback e abertura das páginas de ajuda, termos e privacidade.
- Realizar inspeção visual em tema claro/escuro no desktop, conferindo foco, mensagens de erro, diálogos, leitura da documentação e comportamento de rolagem.
- Na implementação, executar os testes afetados, a suíte de regressão do aplicativo, lint e build. Esta publicação é documental e não constitui evidência de execução desses testes.

## Out of Scope

- Autenticação de produção, alteração real de senha/e-mail, verificação de e-mail, SSO e MFA.
- Backend real de usuários, convites enviados por e-mail e infraestrutura de autorização de produção.
- Integrações ou conectores dentro de Configurações, incluindo qualquer integração com Notion.
- Matriz de acesso individualizada ou papéis além de Administrador e Membro.
- Exclusão da Conta de usuário ao remover alguém do Workspace e migração automática para plano gratuito.
- Histórico ou restauração de versões do ICP e das Personas.
- IA real para elaborar as revisões e execução de ações externas a partir da propagação do contexto.
- Página de planos/preços, checkout, faturamento, cobrança, preços e franquias comerciais definitivos.
- Serviço real de suporte, envio externo de feedback e push quando o aplicativo está fechado.
- Conteúdo jurídico definitivo e definição de práticas de privacidade da empresa.
- Redesenho geral, aplicação mobile e alterações não relacionadas às configurações.

## Further Notes

- Esta spec consolida as decisões da conversa. “CP” foi normalizado para ICP; “pessoas” no contexto comercial foi confirmado como Personas. Participantes do Workspace e Personas permanecem conceitos distintos.
- A preferência final do usuário substitui as propostas anteriores de preservar versões e propagar contexto somente a trabalhos futuros: manter apenas a última versão aprovada e atualizar automaticamente as configurações dependentes existentes.
- As escolhas de persistência local, validação básica e representação dos estados demonstrativos são concretizações técnicas para tornar a primeira entrega executável; não criam obrigações comerciais ou serviços externos.
- Respeitar as decisões vigentes sobre protótipo simulado, Especialidades fixas com Agentes criados, Permissões por Integração e separação entre Aderência e Quente.
- O glossário já registra Conta de usuário, Participação no Workspace, Administrador, Membro, ICP e Memória do Workspace. Não usar “conta” isoladamente para confundir identidade pessoal, Workspace e Conta-alvo.
