# 02: Mock do layout da página de Agentes

**What to build:** um mock descartável da nova página de Agentes, para validar o layout antes de levá-lo ao app, como pede a spec. O mock mostra a grade de 3 colunas no molde da tela de agentes do Frontrunner, com a identidade do Manual da Marca: barra de topo com "Agentes" e "Novo agente", cartões com nome, selo de estado, descrição, quando roda, execuções e logos das Integrações. Abaixo da grade fica o composer, com o campo grande, a linha com o chip do Workspace, os ícones das Especialidades e o botão Enviar, e as sugestões de pedidos coordenados. O mock mostra as **duas versões** de onde aparece a resposta do composer: no próprio fio, abaixo do composer, ou na página da Conversa. O fundador escolhe uma.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] O mock mostra a grade com os 9 Agentes da demo (4 padrão e 5 criados) e o composer abaixo dela
- [x] O mock mostra uma resposta coordenada (passos por Agente e resposta consolidada) nas duas versões: no fio abaixo do composer e na página da Conversa
- [x] O mock segue o Manual da Marca (tokens, Oswald, raio 0 em botões e campos, 16px em cartões, cor em no máximo 10% da tela)
- [x] O mock não entra no app nem nos testes: é descartável
- [x] O fundador escolheu uma versão, e a decisão foi registrada na spec, no lugar da linha "será decidido no mock"

## Comments

**Decisão (23/09/2026):** o fundador aprovou a **versão B**: a resposta do composer abre na página da Conversa. No mesmo ciclo, também aprovou os componentes no molde do Frontrunner (logos oficiais das Integrações, ícones Lucide), o composer arredondado que cresce com a mensagem e a Conversa em fluxo contínuo (etapas ligadas por uma linha, resposta consolidada progressiva e a Aprovação como item da conversa). Os detalhes foram registrados na spec, em "Layout da página de Agentes", "Composer" e "Página da Conversa coordenada".

- Mock: branch `prototipo/pagina-de-agentes`, arquivo `.scratch/pagina-de-agentes/mock/pagina-de-agentes.html` (fora do app e dos testes)
- Página publicada do mock: https://claude.ai/artifact/EbQCFZP8aSRM2epqm4wDqm
