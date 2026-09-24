# 01: Mockup de Configurações e aprovação visual

**What to build:** Criar um mockup navegável e descartável de todas as seções de Configurações, para o usuário aprovar a experiência antes de iniciar a implementação funcional. Representar as interações com dados locais do mock, sem integrar operações ao aplicativo.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 1–40 (representação visual).

## Acceptance criteria

- [ ] Apresentar Meu perfil, Preferências, Workspace / Pessoas e acesso, Memória do Workspace, Plano e Ajuda e informações, com navegação coerente e distinção entre dados pessoais e compartilhados.
- [ ] Seguir a identidade visual e os componentes de referência do aplicativo atual, em português, desktop e temas claro/escuro.
- [ ] Representar edição de nome/e-mail/foto, avatar por iniciais, formulário de senha, salvar/cancelar e mensagens de validação.
- [ ] Representar notificações desligadas, ativadas, bloqueadas e não suportadas, sem pedir permissão real ao navegador.
- [ ] Mostrar Administrador e Membro, convites pendentes, mudança de papel e remoção do Workspace com preservação da Conta de usuário; mostrar proteção do último Administrador.
- [ ] Mostrar ICP e Personas na Memória do Workspace e o fluxo de solicitação por Scopus/Ethos, proposta pendente e decisão exclusiva do Administrador.
- [ ] Demonstrar visualmente que aprovação substitui o contexto vigente e atualiza as configurações dependentes sem nova rodada de aprovações; recusa mantém o contexto. Não incluir histórico de versões.
- [ ] Mostrar plano atual, participantes, Execuções no período e upgrade “Em breve”, sem preços ou franquias inventadas.
- [ ] Apresentar ajuda básica, formulário de feedback, termos e privacidade com estrutura navegável e conteúdo provisório identificado.
- [ ] Disponibilizar o mock para revisão e registrar o retorno do usuário e os ajustes visuais aprovados no próprio ticket.
- [ ] Concluir este ticket somente depois de aprovação explícita do usuário ao mockup. Entrega do artefato, silêncio ou aprovação da lista de tickets não equivalem à aprovação do mockup.
- [ ] Não iniciar implementação funcional nem integrar o mock ao aplicativo neste ticket.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- Aprovação visual explícita é o critério de saída; não executar implementação funcional.
- Conferir navegação e estados do mock em ambos os temas.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.


## Comments

### 2026-09-24: mockup entregue para revisão (aguardando aprovação)

Mockup navegável e descartável, **fora do aplicativo**: entrada própria em `projeto-althius-frontend/mockups/configuracoes.html` (abrir `/mockups/configuracoes.html` no `npm run dev`). O código fica em `projeto-althius-frontend/src/mockups/configuracoes/`, com dados e estado locais, e não é importado pelo `App` nem entra no build. `?tema=claro` força o tema claro.

- **Casca:** réplica da barra lateral com o item Configurações em Workspace e o menu pessoal levando a Meu perfil e Preferências. Os demais itens aparecem esmaecidos, fora do mockup. Aprovações responde, com contador de pendentes.
- **Navegação:** grupos "Pessoal", "Workspace Databricks" e "Althius", e selo de alcance em cada seção ("Só você", "Compartilhado com o Workspace", "Althius").
- **Meu perfil:**
  - nome, e-mail e foto com validação, salvar e cancelar;
  - iniciais quando não há foto, e o nome e a foto refletem no menu pessoal;
  - "Seus Workspaces", mostrando as Participações da Conta de usuário;
  - senha mascarada com confirmação, que termina limpa e com aviso de demonstração.
- **Preferências:**
  - tema claro/escuro, guardado no navegador;
  - notificações desligadas, ativadas, bloqueadas e não suportadas, com o pedido de permissão do navegador simulado depois do clique. A API real não é chamada.
  - avisos simulados para Administradores (revisão aguardando decisão) e para quem pediu (resultado).
- **Pessoas e acesso:**
  - Administrador e Membro, convite pendente separado de participante, mudança de papel;
  - "Remover do Workspace" com o que encerra e o que continua (Conta de usuário e outro Workspace);
  - proteção do último Administrador (papel e remoção travados), também validada na operação;
  - visão de Membro sem ações administrativas.
- **Memória do Workspace:**
  - ICP (Scopus) e Personas (Ethos) vigentes, sem edição direta e sem histórico;
  - pedido de revisão por Conversa simulada com o Agente, proposta pendente em Aprovações com alterações e alcance;
  - decisão só de Administrador (também quem pediu);
  - aprovação substitui o documento e atualiza de uma vez as configurações dependentes (público recomendado de Sinais, Scopus, Rhetor…);
  - recusa mantém o contexto.
- **Plano:** "Demonstração", participantes, Execuções de Agentes em período explícito e upgrade "Em breve", sem preços nem franquias.
- **Ajuda e informações:** central de ajuda, formulário de feedback com validação e confirmação demonstrativa, termos e privacidade com seções, índice e faixa de conteúdo provisório.
- **Controles do mockup:** painel "Ver como" (troca a pessoa e o papel) e "Navegador" (simula a permissão). As ações "Simular aceite" e "Simular um aviso" ficam marcadas como do mockup. Nada disso deve migrar para o aplicativo.

Inspecionado no navegador (capturas headless, desktop, temas claro e escuro): perfil, preferências, pessoas, Memória, Conversa com o Scopus, Aprovações como Membro e como Administrador, aprovação concluída, Memória atualizada, plano e termos. Testes do mockup em `configuracoes.test.tsx`.

**Pendente: aprovação visual explícita do usuário.** O ticket continua aberto, e os tickets funcionais continuam bloqueados até essa aprovação.
