# 01: Mockup visual do módulo Sinais para aprovação

**What to build:** um mockup visual navegável que permita ao Cliente avaliar o módulo Sinais inteiro antes da implementação funcional. Usar dados simulados e estados ilustrativos para aprovar hierarquia, conteúdo, navegação e apresentação dos Monitoramentos, seguindo a especificação e o ADR 0007.

**Blocked by:** None (can start immediately).

**Status:** closed

- [x] Integrar Sinais à navegação existente, em pt-BR, desktop, com identidade visual da Althius e identificação de Demonstração.
- [x] Apresentar catálogo amplo de cards com nomes, descrições, quantidade ilustrativa de Monitoramentos ativos, busca e filtros Todos / Externos / Internos / Originados. Representar as doze famílias e seus exemplos acordados, sem reduzir cada família a um único card genérico.
- [x] Abrir configurações em páginas próprias, com retorno ao catálogo; não usar painel lateral. Mostrar campos adequados aos tipos, incluindo cargos, localização e períodos quando aplicáveis.
- [x] Demonstrar vários Monitoramentos do mesmo tipo, Novo monitoramento, edição e estados Rascunho, Ativo e Pausado, com revisão antes da ativação.
- [x] Demonstrar seleção de listas, descoberta por perfil e ambos, sempre com recomendação de público das configurações simuladas; não criar a área de configurações de público.
- [x] Destacar Criar sinal personalizado e demonstrar descrição livre, fonte opcional, Em preparação e critérios editáveis antes da ativação, sem exigir código ou API.
- [x] Alternar catálogo e Sinais encontrados na página principal por acesso discreto. Exibir empresa, sinal e data, com navegação à Conta-alvo e retorno.
- [x] Mostrar exemplos coerentes de Conta-alvo com um e dois sinais, foguinho separado de Fit / Não fit, Último sinal e histórico com evidência simulada. Não introduzir níveis de temperatura ou promessa de compra.
- [x] Representar carregamento, ausência de Monitoramentos, busca sem correspondência, ausência de resultados e falha recuperável com continuidade clara.
- [x] Inspecionar no navegador catálogo, configuração pronta, personalizado, resultados e contas com um e dois sinais. Avaliar hierarquia, espaçamento, legibilidade e densidade dos Monitoramentos; simplificar sua apresentação conforme o feedback.
- [x] Manter o escopo como mockup: os estados podem ser ilustrativos e as interações simuladas, sem implementar coleta real ou antecipar as regras funcionais dos demais tickets. Preservar a navegação existente de Contas, Contatos, Agentes e Sequências.
- [x] Apresentar o resultado ao usuário, incorporar ajustes e registrar sua aprovação visual explícita nos comentários deste ticket. Não considerar o ticket concluído nem liberar os tickets 02 e 03 antes dessa aprovação; a aprovação da divisão dos tickets não equivale à aprovação do mockup.


## Comments

### 2026-09-24: mockup entregue para revisão (aguardando aprovação)

Mockup navegável em `/sinais` (código em `projeto-althius-frontend/src/paginas/sinais/`), isolado em dados simulados, sem alterar o modelo de Contas:

- Catálogo com 51 tipos nas 12 famílias, busca, filtros Todos / Externos / Internos / Originados, contagem de ativos por card e destaque de Criar sinal personalizado.
- Página própria por tipo, com vários Monitoramentos, Novo monitoramento, edição, Rascunho / Ativo / Pausado, pausar e retomar, e revisão antes de ativar. Os valores iniciais são do próprio tipo.
- Público: listas, descoberta ou ambos, sempre com o público recomendado simulado (o histórico comercial só acompanha listas).
- Personalizado: descrição livre, fonte opcional, origem opcional, Em preparação e critérios editáveis. A preparação é simulada.
- Sinais encontrados (empresa, sinal, data), com prévia da Conta-alvo: foguinho com a contagem separado de Fit / Não fit / não avaliada, Último sinal, histórico com evidência simulada, sinal expirado e reencontro que não conta de novo. As contas mantêm a Aderência e a origem do módulo Contas.
- O seletor "Estado do mockup" mostra os estados de carregamento, falha recuperável, ausência de Monitoramentos e ausência de resultados. Deve sair antes dos tickets funcionais.
- Sinais fica depois de Agentes na navegação, para preservar a ordem Contas / Sequências / Agentes.

Inspecionado no navegador (capturas headless): catálogo, configuração pronta, personalizado, resultados e contas com um e dois sinais. **Pendente: aprovação visual explícita do usuário.** O ticket continua aberto e os tickets 02 e 03 continuam bloqueados até essa aprovação.

### 2026-09-24: ajustes incorporados e aprovação visual

Ajustes pedidos durante a revisão, já incorporados:

- Seta do card do catálogo continua visível no hover (`5499b57`).
- Público personalizado com perfil firmográfico (`569ccee`, `e095a72`):
  - no Brasil, várias UFs, grandes regiões, regiões intermediárias e cidade exata; fora do Brasil, só estados;
  - funcionários, faturamento (a partir dos limites de MEI, ME e EPP) e tempo de empresa em faixas de mínimo e máximo;
  - CNAE 2.3 completa em cinco níveis encadeados, com busca e a opção de CNAE principal ou secundário.

**Aprovação visual explícita do usuário em 2026-09-24: "mockup está aprovado".** Ticket encerrado; os tickets 02 e 03 estão liberados.

~~Pendência para os tickets funcionais: remover o seletor "Estado do mockup" do cabeçalho de Sinais.~~ Resolvida em 2026-09-24.
