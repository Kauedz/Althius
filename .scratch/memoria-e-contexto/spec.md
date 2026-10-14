# PR-13 — Memória e contexto do Workspace

## GATE
1. Um só Contexto do Workspace, que é o Playbook. "Memória do Workspace" vira a visão de leitura desse contexto
   (o que os Agentes sabem hoje), com "Editar no Playbook" (Administrador), "Pedir revisão" (Membro, no Playbook,
   regra do PR-12) e "Ver histórico" (histórico de versões do Playbook). Sem dado novo, sem rota nova, sem migração.
2. Demonstração e operacional usam o mesmo componente (`SecaoMemoria`); a Demonstração só troca a fonte (o
   documento simulado da Memória) e mantém o pedido de revisão ao Agente pela Conversa demonstrativa.
3. Cabeçalho: nome, "Versão N, atualizada em <data> por <pessoa>", estados Vigente e Revisão pendente, ações à
   direita. Corpo com largura máxima de 720 px; vazio com um passo claro ("Ainda não há ICP. Importe o Playbook ou
   peça ao Scopus para montar.").
4. "Onde é usado" vira uma linha curta em linguagem de cliente (sem "módulos" nem nomes de Habilidades).
5. Memória do Agente: frase com a diferença ("o que este Agente aprendeu") e link para o Contexto do Workspace.
6. Testes Vitest: leitura, vazio, revisão pendente, edição pelo Administrador (link ao Playbook), pedido do Membro,
   mesma tela na Demonstração e no operacional.

## Fora do escopo
Conectores, Hermes, segredos, rotas, navegação e layout. Painel lateral com diferença entre versões: o histórico
com restauração já existe no Playbook; a Memória leva até ele ("Ver histórico").
Configurações › Workspace já tem os três blocos (Workspace, Participantes, Convites) com o mesmo espaçamento.
