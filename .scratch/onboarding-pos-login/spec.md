# Onboarding pós-login — wizard Day0 + checklist Norte

Status: ready-for-agent

## Problem Statement

Após o login, o Cliente da Althius precisa entrar num Workspace pronto para demonstrar o valor do Revenue OS sem configurar autenticação e sem seed de Contas-alvo, começando com uma base mínima sobre o próprio negócio em vez de campos em branco. Hoje não existe rota `/onboarding`: o protótipo assume um Workspace já povoado e não guia o criador nem o convidado pelas decisões mínimas de Day0 nem pelo caminho até o aha (mini-ICP e lógica de produto → Persona → Sinal → Conta-alvo com Sinal → Cadência → reunião).

O onboarding v1 precisa cobrir dois caminhos distintos (criador por padrão e convidado apenas via link de convite, sem perguntar ao usuário qual é o seu caso), um Day0 leve com pills de papel, empresa, domínio do site e HDYHAU, um passo de convite sempre pulável, navegação clara de wizard e um checklist de três itens alinhado ao Norte — sem cadência no checklist e sem trabalho de Clerk/auth/Google. A IA entra apenas numa leitura mínima do site do Cliente, que serve de base editável para o checklist; nenhuma outra etapa usa IA. O Workspace deve nascer automaticamente no estilo Notion para o criador; o nome da empresa no Day0 apenas sugere o nome do Workspace/Cliente e não semeia Contas-alvo, e o domínio do site fornece o logo do Workspace.

A entrega é um protótipo navegável com Fonte simulada (ADR 0003): UI + Fonte + stubs do checklist. Mini-ICP e Personas do Workspace ainda não existem no App (apenas mockups); Contato.persona não é Persona do Workspace; Memória do Agente não é Memória do Workspace; Sinais, Conta-com-sinal e Sequências já existem e devem ser reaproveitados onde couber.

## Solution

Introduzir a rota `/onboarding` fora da Casca (shell) da aplicação. Nela, o usuário pós-login percorre um wizard Day0 e, quando aplicável, um checklist de três itens. Ao concluir ou pular o fluxo permitido, aterra em `/` (home) já dentro da Casca.

O wizard tem indicador de progresso, botões Voltar e Continuar consistentes em todos os passos e nenhum beco sem saída.

Dois caminhos, sem pergunta "vai criar Workspace ou foi convidado?":
- **Criador (padrão)**: quem chega sem link de convite entra direto neste fluxo. Workspace criado automaticamente (estilo Notion). Day0 coleta papel (pills), empresa (sugere nome do Workspace/Cliente), domínio do site (o logo do Workspace vem do SVG ou favicon do site, com fallback para a inicial do nome) e HDYHAU; inclui passo de convite sempre pulável; segue para o checklist Norte.
- **Convidado**: só aparece quando o usuário chega por link de convite (no protótipo, simulado por um parâmetro de convite na URL). Ramo só de UI (sem token, sem Pessoas, sem membership real). Pula as etapas de empresa e domínio do site; convite permanece pulável; não cria Workspace novo nem dispara leitura do site.

Leitura mínima do site (única IA do onboarding): a partir do domínio informado pelo criador, a Fonte executa uma operação assíncrona de leitura do site ("ler site") que devolve o que a empresa vende, o ICP provável e as personas possíveis, considerando para quem ela vende. O resultado é só uma base editável: pré-preenche o item 1 do checklist (mini-ICP + lógica de produto) e o item 2 (Persona); o usuário pode editar ou descartar. Leitura lenta ou com falha não bloqueia o onboarding: os campos ficam vazios e editáveis. No protótipo, a Fonte simulada devolve uma leitura fixa após um carregamento curto; a implementação real com IA se conecta depois, com backend, à mesma interface. A UI do onboarding nunca chama um modelo diretamente.

Checklist v1 (somente estes três itens; Cadência fora dos itens):
1. Mini-ICP + lógica curta de produto (`miniIcp`, `oQueVende`, `porQueCompram`) — campos curtos na Fonte, pré-preenchidos pela leitura do site (não placeholders vazios quando a leitura existe); editáveis.
2. Persona — base editável com as personas possíveis vindas da leitura do site, alinhada ao Norte; sem módulo Mike Pono / ICP completo.
3. Configurar/entender Sinal de compra — abrir a experiência existente em `/sinais` é suficiente; não forçar criação de Monitoramento.

Depois do checklist, o onboarding guia os próximos passos na ordem sinal de compra → Contas-alvo indicadas → criar Cadência. Contas-alvo indicadas e Cadência aparecem como próximos passos guiados (dica e links para as experiências existentes de Conta-com-sinal e Sequências), não como novos itens do checklist nem motores reais.

Fora da leitura mínima do site, nada no onboarding usa IA. Persistência de estado do wizard, da leitura e do checklist apenas na Fonte simulada (único seam de teste). Estado e progresso permanecem coerentes ao reabrir. O aha completo do Norte (ICP+produto → Persona → Sinal → Conta-alvo com Sinal → Cadência → reunião) orienta a narrativa; nesta entrega a Cadência e a reunião ficam fora dos itens do checklist (reunião no App é só status de demo).

## User Stories

1. Como criador pós-login, quero ser levado a `/onboarding` fora da Casca, para concluir o Day0 sem ver a navegação principal ainda.
2. Como usuário pós-login sem link de convite, quero entrar direto no fluxo normal de criador, sem responder se vou criar um Workspace ou se fui convidado, para não enfrentar uma pergunta confusa logo no primeiro passo.
3. Como criador, quero que um Workspace seja criado automaticamente no estilo Notion, para começar a usar a Althius sem configurar tenant ou organização.
4. Como criador, quero que o nome da empresa informado no Day0 sugira o nome do Workspace/Cliente, para reconhecer meu espaço sem seed de Contas-alvo.
5. Como criador, quero que o Day0 não semeie Contas-alvo a partir da empresa, para manter o protótipo leve e alinhado à Fonte simulada.
6. Como criador, quero escolher meu papel em pills (Founder, Head de Vendas, SDR/BDR, AE, Marketing, RevOps, Outro), para personalizar o Day0 sem formulário longo.
7. Como criador, quero ver a pill RevOps disponível junto às demais, para representar operações de receita no Day0.
8. Como criador, quero informar a empresa no Day0, para sugerir o nome do Workspace/Cliente.
9. Como criador, quero digitar o domínio do site da minha empresa no Day0, para que a Althius reconheça meu negócio e personalize o Workspace.
10. Como criador, quero que o logo do Workspace venha do SVG ou favicon do meu site, com fallback para a inicial do nome, para reconhecer meu espaço desde o primeiro acesso.
11. Como criador, quero responder HDYHAU (“Como nos conheceu”) escolhendo entre Google Ads, Meta Ads, Instagram, LinkedIn, YouTube, X, TikTok, Influenciador, Indicação, Evento, Podcast, Busca no Google e Outro, para registrar o canal na Fonte simulada com opções reconhecíveis.
12. Como criador, quero ver um passo de convite no wizard, para convidar colegas se desejar.
13. Como criador, quero pular o passo de convite a qualquer momento, para não bloquear o onboarding se não quiser convidar ninguém.
14. Como usuário do wizard, quero ver um indicador de progresso e botões Voltar e Continuar consistentes em todos os passos, para saber onde estou e nunca cair num beco sem saída.
15. Como usuário do wizard, quero voltar a um passo anterior sem perder o que já preenchi, para corrigir respostas com segurança.
16. Como criador, quero que, a partir do domínio, a Althius faça com IA uma leitura mínima do site (o que a empresa vende, ICP provável e personas possíveis considerando para quem ela vende), para começar com uma base em vez de campos em branco.
17. Como criador, quero que a leitura do site pré-preencha o item 1 (mini-ICP e lógica de produto) e o item 2 (Persona) do checklist, para só revisar em vez de escrever do zero.
18. Como criador, quero editar ou descartar o que a leitura do site sugeriu, para que a base reflita meu negócio e não uma suposição da IA.
19. Como criador, quero ver um estado de carregamento claro enquanto a leitura do site acontece, para entender que a base está sendo preparada.
20. Como criador, quero que uma leitura do site lenta ou com falha não bloqueie o onboarding, seguindo com campos vazios e editáveis, para concluir o Day0 e o checklist mesmo sem a leitura.
21. Como convidado, quero que o ramo de convidado apareça apenas quando chego por um link de convite (no protótipo, um parâmetro de convite na URL), para entrar num Workspace já existente sem responder pergunta extra.
22. Como convidado, quero pular as etapas de empresa e domínio do site no Day0, para não redefinir o Cliente do Workspace que recebi.
23. Como convidado, quero que o ramo de convite seja só de interface, sem token, sem Pessoas e sem membership real, para demonstrar o fluxo sem backend de participação.
24. Como convidado, quero poder pular o passo de convite, para avançar ao checklist ou à home sem fricção.
25. Como usuário do onboarding, quero que não haja trabalho de Clerk, autenticação ou login Google nesta entrega, para focar só no pós-login.
26. Como usuário do onboarding, quero que a IA apareça apenas na leitura mínima do site, para que o restante do wizard e do checklist seja simulado e previsível.
27. Como usuário, quero um checklist Norte com exatamente três itens nesta v1, para avançar ao aha sem sobrecarga.
28. Como usuário, quero que o item 1 do checklist seja mini-ICP + lógica curta de produto (o que vende / por que compram), para registrar o essencial na Fonte.
29. Como usuário, quero que os campos `miniIcp`, `oQueVende` e `porQueCompram` venham pré-preenchidos pela leitura do site (no protótipo, a leitura fixa da Fonte simulada), para não começar com placeholders vazios.
30. Como usuário, quero editar esses campos curtos no item 1, para ajustar o mini-ICP e a lógica de produto antes de seguir.
31. Como usuário, quero marcar o item 1 como concluído após revisar ou editar os campos, para registrar progresso na Fonte.
32. Como usuário, quero que o item 2 do checklist seja Persona, para avançar no caminho Norte sem exigir o módulo completo de ICP.
33. Como usuário, quero que o item 2 mostre as personas possíveis sugeridas pela leitura do site como base editável, sem módulo completo de Personas do Workspace, para demonstrar o passo sem inventar um módulo que ainda não existe no App.
34. Como usuário, quero entender que Contato.persona não é Persona do Workspace, para não confundir classificação de Contato com definição compartilhada.
35. Como usuário, quero que o item 3 do checklist abra a experiência existente de `/sinais`, para configurar ou entender um Sinal de compra sem forçar Monitoramento.
36. Como usuário, quero que abrir `/sinais` conte como progresso suficiente do item 3, para não exigir criação de Monitoramento nesta v1.
37. Como usuário, quero que a Cadência fique fora dos itens do checklist v1, para manter o escopo alinhado às decisões travadas.
38. Como usuário, quero que, depois do checklist, o onboarding me guie para Contas-alvo indicadas e depois para criar a Cadência, como próximos passos com links para as experiências existentes, para seguir o caminho do aha sem novos motores nesta entrega.
39. Como usuário, quero que reunião continue sendo apenas status de demo no App, para não tratar o onboarding como agendamento real.
40. Como usuário, quero pular itens do checklist quando a UX permitir skip, para não ficar bloqueado se quiser explorar a home antes.
41. Como usuário, quero reabrir o onboarding ou o checklist com o progresso persistido na Fonte, para continuar de onde parei.
42. Como usuário, quero que o estado do wizard Day0 (papel, empresa e domínio quando aplicável, logo resolvido, HDYHAU, convite pulado) persista na Fonte simulada, para testes e reabertura coerentes.
43. Como usuário, quero que o estado do checklist (itens concluídos, campos mini-ICP/produto, Persona e resultado da leitura do site) persista na Fonte simulada, para leitura e escrita num único seam.
44. Como usuário, quero aterrar em `/` após concluir o wizard e o checklist (ou após skips permitidos), para entrar na home dentro da Casca.
45. Como usuário, quero que `/onboarding` não use a Casca, para isolar o primeiro uso da navegação principal.
46. Como usuário, quero reutilizar Sinais, Conta-com-sinal e Sequências já existentes no protótipo, para o checklist e os próximos passos não reinventarem módulos prontos.
47. Como usuário, quero que mini-ICP e Personas do Workspace permaneçam bases editáveis ligadas à Fonte de onboarding nesta v1, pois ainda não existem como módulos no App além de mockups.
48. Como usuário, quero que o módulo Mike Pono / ICP completo fique para depois, para não expandir o onboarding além do mini-ICP.
49. Como usuário do protótipo, quero dados coerentes com a Fonte simulada no estilo ADR 0003, para avaliar a experiência sem integrações reais.
50. Como usuário do protótipo, quero manter o selo de Demonstração onde já existe, para não parecer produto em produção.
51. Como criador, quero ver o nome sugerido do Workspace refletir a empresa do Day0, para confirmar a criação automática sem seed de Contas.
52. Como convidado, quero não criar um segundo Workspace ao passar pelo Day0, para permanecer no espaço ao qual fui convidado (simulado).
53. Como usuário, quero que HDYHAU seja coleta simples, fora do escopo da IA, para alimentar apenas estado simulado.
54. Como usuário, quero navegar do item 3 de volta ao checklist ou à home após abrir `/sinais`, para não ficar preso no módulo de Sinais.
55. Como usuário, quero que pular o convite não apague o restante do Day0 já preenchido, para preservar papel, empresa, domínio e HDYHAU.
56. Como usuário, quero que a leitura fixa da Fonte simulada não traga strings vazias nem “lorem”, para o protótipo já demonstrar conteúdo útil nos itens 1 e 2.
57. Como responsável pelo produto, quero um único seam de teste na Fonte de onboarding (Workspace/usuário), incluindo a operação de leitura do site, para ler e escrever wizard e checklist e obter a leitura sem outras fronteiras.
58. Como responsável pelo produto, quero que a implementação real de IA da leitura do site se conecte depois, com backend, à mesma interface da Fonte usada pelo protótipo, para trocar a leitura simulada pela real sem mudar a UI do onboarding.
59. Como responsável pelo produto, quero que testes não assumam uma única Fonte global para mocks de Sinais, para respeitar a realidade do código atual.
60. Como usuário, quero linguagem alinhada ao glossário (Workspace, Cliente, Conta-alvo, Persona, Sinal, Cadência, Administrador/Membro), para não ver “org”, “tenant” ou “lead”.
61. Como usuário, quero que Memória do Agente e Memória do Workspace não sejam tratadas como a mesma coisa no onboarding, para evitar confusão de domínio.
62. Como criador com papel Outro, quero concluir o Day0 sem campos extras obrigatórios, para o pill Outro não virar formulário aberto nesta v1.
63. Como usuário, quero que o checklist comunique a ordem Norte (produto/ICP → Persona → Sinal), seguida de Contas-alvo indicadas e Cadência como próximos passos, para aprender o caminho do aha.
64. Como usuário que reabre o onboarding já concluído, quero um comportamento claro (não reexecutar Day0 destrutivo), para não perder estado simulado.
65. Como usuário, quero que convites no passo pulável sejam só UI, sem e-mail real nem membership, para manter o protótipo front-end.
66. Como usuário, quero que após aterrar em `/` eu possa usar a Casca normalmente, para explorar Contas, Sinais e Sequências com o contexto do Workspace criado ou simulado.
67. Como convidado, quero pills de papel e HDYHAU no meu ramo, para completar o Day0 leve sem empresa nem domínio do site.
68. Como usuário, quero que o item 2 não confunda Persona do checklist com classificação de Contato existente, para as bases de Persona permanecerem explícitas.
69. Como usuário, quero que configurar Sinal no item 3 não exija Conta-alvo pré-semeada pelo Day0, para respeitar a regra de não seed de Contas.
70. Como usuário, quero ver o progresso dos três itens de forma explícita (pendente/concluído/pulado quando aplicável), para saber o que falta ao Norte desta v1.
71. Como responsável pela implementação, quero que a spec não imponha caminhos de arquivo concretos, para decidir módulos e interfaces no código existente.
72. Como usuário, quero que pular um item permitido do checklist ainda me permita aterrar em `/`, para explorar o produto e voltar depois.
73. Como usuário, quero que a persistência na Fonte sobreviva a refresh na rota `/onboarding`, para o protótipo refletir estado de onboarding do usuário/Workspace.
74. Como criador, quero que a criação automática do Workspace ocorra uma vez no fluxo de criador, para não duplicar Workspace a cada reabertura.
75. Como usuário, quero que a UI do onboarding nunca chame um modelo diretamente e que nenhuma outra etapa gere texto com IA (copy, HDYHAU, Cadência), para que a IA fique restrita à operação de leitura do site na Fonte.
76. Como usuário, quero que a narrativa do aha mencione Conta-alvo com Sinal e Cadência como passos seguintes ao checklist, para alinhar expectativa sem expandir escopo.

## Implementation Decisions

### Escopo do protótipo e rotas

- Entregar apenas pós-login: UI do wizard Day0, leitura mínima do site via Fonte, checklist de três itens, próximos passos guiados, Fonte simulada de estado de onboarding e integração de navegação com `/sinais` e aterrissagem em `/`.
- Expor `/onboarding` fora da Casca. Após conclusão ou skips permitidos, navegar para `/` dentro da Casca.
- Não implementar Clerk, auth, Google login, tokens de convite, Pessoas nem membership real.
- IA apenas na leitura mínima do site. Todo o resto (HDYHAU, copy, stubs, próximos passos) é conteúdo fixo/simulado na Fonte.

### Caminhos criador e convidado

- Sem pergunta "vai criar Workspace ou foi convidado?". Sem link de convite, o usuário entra direto no fluxo de criador. O ramo de convidado só é ativado quando o usuário chega por link de convite; no protótipo, simulado por um parâmetro de convite na URL de `/onboarding`.
- Criador: cria Workspace automaticamente (Notion-style); Day0 com pills de papel, empresa, domínio do site e HDYHAU; convite pulável; leitura do site; checklist; próximos passos guiados.
- Convidado: ramo só de UI; pula empresa e domínio do site; não dispara leitura do site; convite pulável; não cria Workspace; sem token/Pessoas/membership.
- Empresa no Day0 do criador apenas sugere nome de Workspace/Cliente. Não semear Contas-alvo nem listas.

### Day0

- Pills fixas: Founder, Head de Vendas, SDR/BDR, AE, Marketing, RevOps, Outro.
- Passo de domínio do site no Day0 do criador: o usuário digita o domínio; o logo do Workspace vem do SVG ou favicon do site, com fallback para a inicial do nome do Workspace quando não houver logo.
- Coletar HDYHAU de forma leve (sem IA), com as opções: Google Ads, Meta Ads, Instagram, LinkedIn, YouTube, X, TikTok, Influenciador, Indicação, Evento, Podcast, Busca no Google, Outro. Persistência na Fonte simulada.
- Passo de convite sempre opcional/pulável nos dois caminhos; UI only.

### Navegação do wizard

- Indicador de progresso visível em todos os passos do wizard.
- Botões Voltar e Continuar consistentes em posição e comportamento em todos os passos; Voltar preserva o que já foi preenchido.
- Nenhum beco sem saída: todo passo tem caminho para avançar, voltar ou pular quando permitido, e o fluxo sempre termina em `/`.

### Leitura mínima do site (IA)

- A leitura é uma operação da Fonte: uma leitura assíncrona de site ("ler site") que recebe um domínio e devolve o que a empresa vende, o ICP provável e as personas possíveis, considerando para quem ela vende.
- O resultado é só uma base editável: pré-preenche o item 1 do checklist (`miniIcp`, `oQueVende`, `porQueCompram`) e o item 2 (Persona). O usuário pode editar ou descartar; edições do usuário prevalecem sobre a leitura.
- A leitura começa quando o domínio é confirmado e não bloqueia o wizard: o usuário pode seguir enquanto ela carrega. Leitura lenta ou com falha resulta em campos vazios e editáveis, sem travar o onboarding.
- No protótipo, a Fonte simulada devolve uma leitura fixa após um carregamento curto. A implementação real com IA se conecta depois, com backend, à mesma interface da Fonte.
- A UI do onboarding nunca chama um modelo diretamente; só consome a operação de leitura da Fonte.

### Checklist Norte v1

- Exatamente três itens: (1) mini-ICP + lógica curta de produto; (2) Persona (base editável a partir da leitura); (3) abrir/entender Sinal de compra via experiência existente de Sinais.
- Campos do item 1 na Fonte: `miniIcp`, `oQueVende`, `porQueCompram`, pré-preenchidos pela leitura do site; vazios e editáveis se a leitura falhar.
- Item 2: personas possíveis vindas da leitura, editáveis; sem módulo de Personas do Workspace.
- Item 3: abrir `/sinais` é suficiente; não forçar criação de Monitoramento.
- Cadência fora dos itens do checklist v1. Reunião permanece status de demo. Mike Pono / ICP completo = módulo futuro.
- Distinguir Persona do Workspace (stub) de Contato.persona; Distinguir Memória do Workspace de Memória do Agente.

### Próximos passos guiados

- Depois da leitura e do checklist, o onboarding guia na ordem sinal de compra → Contas-alvo indicadas → criar Cadência.
- Contas-alvo indicadas e Cadência aparecem como próximos passos guiados (dica e links para as experiências existentes de Conta-com-sinal e Sequências), não como novos itens do checklist nem motores reais de indicação ou geração de Cadência.

### Fonte simulada (único seam)

- Um único seam de teste: Fonte de estado de onboarding do usuário/Workspace (wizard + checklist read/write + operação de leitura do site).
- Estilo ADR 0003: front-end, dados simulados, sem chamadas externas no protótipo; a leitura do site é simulada com resultado fixo pela mesma interface que a IA real vai usar.
- Não assumir uma única Fonte compartilhada com todos os mocks de Sinais; respeitar fronteiras já existentes no App.
- Reutilizar módulos já existentes (Sinais, Conta-com-sinal, Sequências) por navegação/interfaces públicas; não reinventá-los no onboarding.
- Mini-ICP e Personas do Workspace não existem no App além de mockups: implementar como bases editáveis ligadas à Fonte de onboarding, sem fingir módulo completo.

### Vocabulário

- Usar Workspace (não org/tenant), Cliente, Conta-alvo, Persona, Sinal, Cadência, Administrador/Membro conforme CONTEXT.md.
- Interface e conteúdo em pt-BR, desktop, coerentes com o selo de Demonstração onde aplicável.

## Testing Decisions

### Seam único

- Fronteira preferida: aplicativo renderizado com Fonte de onboarding injetada (estado de wizard + checklist + operação de leitura do site). Esse é o único seam desta entrega: leitura e escrita do progresso Day0, obtenção da leitura do site e dos três itens do checklist.
- Nos testes, a leitura simulada do site é determinística (resultado fixo e controlável, incluindo cenários de falha e de demora).
- Não introduzir seams extras (auth real, e-mail, membership, cliente de modelo). A UI nunca chama um modelo diretamente; só a operação de leitura da Fonte. Não acoplar testes à estrutura interna de outras Fontes de Sinais além do necessário para abrir `/sinais`.

### Cenários de aceitação

1. Usuário sem parâmetro de convite acessa `/onboarding` fora da Casca e entra direto no fluxo de criador, sem pergunta de criador/convidado; Workspace é criado automaticamente; empresa sugere nome sem seed de Contas-alvo.
2. Usuário com parâmetro de convite na URL entra no ramo de convidado: sem empresa, sem domínio, sem leitura do site, sem token/Pessoas/membership; pode pular convite.
3. Criador seleciona cada pill de papel relevante (inclui RevOps e Outro), preenche empresa e HDYHAU; HDYHAU oferece exatamente Google Ads, Meta Ads, Instagram, LinkedIn, YouTube, X, TikTok, Influenciador, Indicação, Evento, Podcast, Busca no Google e Outro; estado persiste na Fonte.
4. Criador digita o domínio do site; o logo do Workspace usa o SVG/favicon do site e cai para a inicial do nome quando não há logo.
5. Com a leitura simulada determinística, os campos do item 1 (`miniIcp`, `oQueVende`, `porQueCompram`) e o item 2 (Persona) chegam pré-preenchidos; edição ou descarte pelo usuário persistem na Fonte e prevalecem sobre a leitura.
6. Com a leitura simulada em falha ou demora, o onboarding não trava: o wizard avança e os itens 1 e 2 ficam vazios e editáveis.
7. A UI não chama modelo diretamente; a leitura do site só ocorre pela operação da Fonte.
8. Wizard mostra indicador de progresso; Voltar e Continuar funcionam em todos os passos, Voltar preserva dados e nenhum passo fica sem saída.
9. Criador vê passo de convite e o pula; Day0 permanece íntegro; avança ao checklist.
10. Checklist mostra três itens na ordem Norte; Cadência não aparece como item.
11. Item 2 apresenta Persona como base editável sem confundir com Contato.persona.
12. Item 3 navega para `/sinais`; abrir a experiência conta como progresso suficiente sem forçar Monitoramento.
13. Após o checklist, aparecem os próximos passos guiados (Contas-alvo indicadas → criar Cadência) como links para experiências existentes, não como itens do checklist.
14. Skip permitido de item ou de convite ainda permite aterrar em `/`.
15. Conclusão do fluxo aterra em `/` dentro da Casca.
16. Reabrir `/onboarding` restaura progresso da Fonte; criador não duplica Workspace.
17. Nenhuma integração Clerk/auth/Google no fluxo.
18. Refresh preserva estado simulado de wizard, leitura e checklist.
19. Vocabulário visível respeita Workspace/Cliente/Conta-alvo/Persona/Sinal.

### Verificações

- Inspecionar no navegador os dois ramos (criador sem convite / convidado via parâmetro de convite), a leitura do site com sucesso e com falha, o checklist, os próximos passos e a aterrissagem em `/`.
- Esta tarefa publica a spec; não implementa o onboarding nem executa a suíte.

## Out of Scope

- Clerk, autenticação, login Google, sessões reais e recovery de conta.
- Tokens de convite reais, módulo Pessoas, membership real, e-mail ou notificações de convite.
- Seed de Contas-alvo a partir da empresa do Day0.
- IA real além da leitura mínima do site: sem IA para copy, sem IA no HDYHAU, sem geração de Cadência por IA.
- Implementação real de IA da leitura do site e backend que a sustente (no protótipo a leitura é simulada pela Fonte).
- Cadência como item do checklist v1; execução real de sequências no onboarding; motores reais de indicação de Contas-alvo.
- Agendamento real de reunião; reunião além do status de demo existente.
- ICP profundo / módulo Mike Pono (fica para depois); Memória do Workspace completa; Personas do Workspace como módulo de produto.
- Monitoramento obrigatório no item 3; redesenho do módulo Sinais.
- Backend de produção, persistência remota, billing e limites.
- Trabalho dentro da Casca na rota `/onboarding`.
- Assumir Contato.persona = Persona do Workspace ou Memória do Agente = Memória do Workspace.
- Unificar à força todas as Fontes de mocks de Sinais num único store.
- Implementação do produto durante a publicação desta spec.

## Further Notes

- Norte do aha (narrativa): lógica de ICP+produto → Persona → Sinal → Conta-alvo com Sinal → Cadência → reunião. Nesta v1 o checklist cobre só os três primeiros elos práticos (mini-ICP/produto, Persona, abrir Sinais); Contas-alvo indicadas e Cadência aparecem como próximos passos guiados.
- ADR 0003 orienta o protótipo simulado: front-end, dados simulados, demonstração com cara de real e selo de Demonstração.
- Código atual: Sinais, Conta-com-sinal e Sequências existem; mini-ICP e Personas do Workspace não; reunião é demo; `/onboarding` ainda não existe.
- A leitura fixa da Fonte simulada deve ser conteúdo demonstrativo coerente com um Cliente B2B de exemplo, não texto vazio.
- Em caso de divergência entre entrevista e esta síntese, prevalecem as decisões travadas listadas nesta spec.
- 2026-09-24: decisão revisada, IA entra apenas na leitura mínima do site; demais ajustes vindos da revisão do mockup da issue 01.
