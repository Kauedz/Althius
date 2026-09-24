# 05: ICP: revisão pelo Scopus, Aprovação e propagação

**What to build:** Entregar o ciclo completo de consulta e revisão do ICP: qualquer participante solicita ao Scopus, somente Administrador decide e a aprovação atualiza a Memória do Workspace e configurações dependentes preexistentes.

**Blocked by:** 04: Workspace, participantes e papéis de acesso

**Status:** ready-for-human (implementado; falta só a conferência visual em navegador, ver Comments)

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 23, 25, 27–33.

## Acceptance criteria

- [x] Mostrar o ICP vigente na Memória do Workspace, separado da Memória individual do Agente, e permitir solicitar revisão pelo Scopus.
- [x] Produzir proposta por Conversa/roteiro demonstrativo, integrada à fila de Aprovações existente; não exigir IA real nem oferecer edição direta que dispense o fluxo.
- [x] Apresentar conteúdo proposto, origem e aviso de atualização automática das configurações dependentes.
- [x] Validar na operação de decisão que o usuário é Administrador ativo daquele Workspace. Membro pode solicitar, mas não aprovar nem recusar.
- [x] Permitir que um Administrador aprove a própria solicitação; uma única decisão basta.
- [x] Manter ICP e dependências intactos enquanto a proposta estiver pendente ou for recusada.
- [x] Aprovar substitui o ICP vigente e propaga automaticamente a alteração a todas as configurações existentes que dele dependem, incluindo o público recomendado de Sinais e o contexto usado pelos Agentes.
- [x] Usar uma referência compartilhada; não aceitar atualização apenas visual em Configurações, cópia manual, propagação só para novas configurações ou aprovações adicionais por módulo.
- [x] Completar atualização e propagação como mudança consistente; falha não deixa contexto publicado parcialmente entre áreas.
- [x] Persistir somente o último ICP aprovado, sem lista de versões ou restauração; proposta pendente não é versão aprovada.
- [x] Preservar Atividades e outros registros; decisão continua sendo ação da Execução de origem, sem contabilizar nova Execução. Não redefinir permissões das demais categorias de Aprovação.
- [x] Não transformar atualização de ICP em Sinal nem misturar Aderência com Quente; não repetir ações externas já realizadas.
- [x] Testar o ciclo Membro → Scopus → Administrador → atualização em configuração preexistente; testar bloqueio de Membro, recusa, pendência, falha consistente e duas revisões sucessivas.
- [x] Manter os eventos de solicitação, decisão e falha disponíveis para o consumidor de notificações, reutilizando os mecanismos existentes sem exigir que o ticket de notificações esteja pronto.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.



## Comments

### 2026-09-24: implementação

Pré-requisito: o ticket 01 está aprovado, e o 04 está implementado (`5293168`).

**Fonte (contrato em `fonte/tipos.ts`):**
- `MemoriaDoWorkspace { icp: IcpVigente }` guarda só o ICP vigente, com as seções, a data da aprovação e o autor, sem histórico. A proposta pendente é outro estado: uma Aprovação com `revisao` (`RevisaoDaMemoria`), que traz pedido, solicitante, ICP proposto, vigente no pedido e quem decidiu.
- Operações novas:
  - `memoriaDoWorkspace()`, a única referência que Configurações, Sinais e Agentes leem;
  - `solicitarRevisao('icp', pedido)`: qualquer participante ativo pede. O Scopus responde pelo roteiro demonstrativo (`roteiros.ts`, `revisoesDoIcp`, em ciclo), e a proposta entra na fila de Aprovações existente. São recusados quem não participa, o pedido vazio e um segundo pedido com outro pendente.
- `decidirAprovacao` (a mesma da fila):
  - numa revisão, exige Administrador ativo, validado na operação;
  - basta um Administrador, e pode ser quem pediu;
  - as demais categorias de Aprovação continuam como antes (um Membro ainda decide `ap1`).
- Aprovar troca o ICP vigente e a decisão numa gravação só (`fonte/simulada-memoria.ts`, `adotar`). Os dependentes derivam do documento vigente (`fonte/regras-memoria.ts`), sem cópia, então não há propagação parcial.
- Se a gravação falhar, o estado anterior continua valendo em todas as áreas e a proposta segue pendente. A falha entra na Atividade do Scopus com `falhou: true`, também quando o pedido não pôde ser registrado.
- Execução e Atividade:
  - pedir é uma Execução do Scopus (gatilho Conversa);
  - decidir é uma ação dessa Execução, sem contar outra Execução;
  - Atividades, Execuções e as Aprovações decididas são preservadas;
  - nenhuma ação externa é refeita, nenhum Sinal é criado e Aderência/Quente não mudam.
- Persistência: `althius:memoria:databricks` guarda o ICP vigente e as Aprovações de revisão, associados ao Workspace. Um estado salvo inválido volta aos dados de exemplo.
- Eventos para o futuro consumidor de notificações (ticket 07), com os mecanismos existentes (`observar`, Aprovações e Atividade):
  - solicitação: Aprovação pendente com `revisao.solicitante`, e a Execução na Atividade;
  - decisão: `estado` e `revisao.decididaPor`, e a ação na Atividade;
  - falha: item da Atividade com `falhou: true`.
- `Aprovacao.integracaoId` ficou opcional, porque uma revisão não passa por Integração. As telas de Conversa e de Canal só mostram a Integração quando ela existe.

**Telas:**
- `paginas/configuracoes/secao-memoria.tsx` (novo), Memória do Workspace, segue o mockup aprovado:
  - o ICP vigente com o selo "Vigente", "Aprovado em … por … · mantido pelo Scopus", e o aviso de que não há histórico nem edição direta;
  - "Onde este contexto é usado";
  - o diálogo "Revisão do ICP": a Conversa com o Scopus, "Preparando a proposta", a resposta e "Ver em Aprovações";
  - com proposta pendente: o aviso e "Ver proposta pendente"; aviso de recusa; aviso de substituição.
- `paginas/cartao-de-revisao.tsx` (novo), na fila de Aprovações:
  - pedido, solicitante, "Por quê", alterações propostas (vigente riscado e proposto) e o alcance com os dependentes;
  - Aprovar/Recusar só para Administrador;
  - o Membro vê a explicação e "Aguardando: …";
  - erro de decisão anunciado.
- Consumidores do ICP vigente, os três dependentes:
  - Sinais: o público recomendado do editor de Monitoramento, incluindo os preexistentes ("ICP do Workspace", porte · maturidade · regiões, com a data da aprovação). O nome fixo "ICP Enterprise dados e IA" (`PUBLICO_RECOMENDADO`) saiu.
  - Habilidade "Pontuar aderência ao ICP" dos Agentes do Scopus (`Habilidade.usaIcp`): mostra os segmentos, o porte e as regiões vigentes.
  - Memória de cada Agente: o bloco "Contexto do Workspace", separado dos Fatos do Agente.
- O roteiro da sugestão "Revise nosso ICP…" na Conversa do Scopus agora é só análise e aponta para o fluxo de revisão, em vez de anunciar mudanças que não passavam por Aprovação.
- Glossário: nova entrada "Revisão da Memória do Workspace" e nota em "Aprovação" (única categoria restrita a Administradores).

**Fora deste ticket, de propósito:**
- Personas (ticket 06): a seção mostra uma nota.
- A aba "Resumo da memória" do mockup: não pertence a nenhum ticket de 02 a 09, e a pendência do ticket 01 (registrar a regra na spec e no CONTEXT.md) continua aberta. Precisa de decisão do usuário.
- A rota ainda é `/configuracoes/memoria`, sem a subaba `/icp` do mockup. Criá-la exige mexer em `App.tsx`; fica para o ticket 06, junto com a aba Personas.
- Os cartões de revisão decididos continuam na fila com o texto antigo e o proposto, como no mockup, porque são o registro da Aprovação e a spec manda preservá-los. Não há lista de versões nem restauração. Se o usuário achar que isso parece histórico, basta passar a mostrar o comparativo só nas pendentes.

### 2026-09-24: verificação

- Testes novos em `src/paginas/configuracoes/memoria.test.tsx` (12 testes):
  - pelo aplicativo:
    - ICP vigente para Membro, sem edição direta;
    - pedido do Membro ao Scopus, com a proposta pendente e o cartão sem decisão para Membro;
    - ciclo Membro → Scopus → Administrador (remontando com o mesmo armazenamento), com a propagação para o Monitoramento preexistente de Sinais, o Contexto do Workspace do Ethos e a Habilidade do Scopus, sem segunda Aprovação;
    - recusa; pendência;
    - Administrador aprovando a própria solicitação e duas revisões sucessivas, sem versões nem restauração, sem Sinal novo e sem mudar Aderência ou Quente;
    - falha consistente com nova tentativa;
  - pelo contrato da fonte:
    - um Membro não aprova nem recusa;
    - as outras categorias não mudaram;
    - quem não participa não pede, e não há segundo pedido pendente;
    - Execução e ação na Atividade;
    - falha ao registrar o pedido.
- Mutação conferida: tirar a validação de Administrador de `decidir`, ou adotar o estado antes de gravar, derruba os testes de contrato e de falha.
- Testes de Sinais atualizados para o público recomendado lido do ICP ("ICP do Workspace").
- Validação no working tree:
  - `tsc -b --force`: sem erros;
  - `vitest run`: 380 testes em 25 arquivos, todos passando;
  - `oxlint`: sem erros; os avisos são de arquivos que este ticket não toca;
  - `vite build`: concluído.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - a Habilidade "Pontuar aderência ao ICP" como terceiro dependente;
  - `falhou: true` na Atividade, também para pedido não registrado;
  - a entrada "Revisão da Memória do Workspace" no glossário;
  - "Aguardando: …" e botões ilustrativos na visão de Membro, como no mockup;
  - `AgenteId` em `DOCUMENTOS_DA_MEMORIA`;
  - `dataDeHoje` em `formatar-data.ts`;
  - `mensagemDeErro` compartilhada;
  - a constante de erro reaproveitada no cartão.
- Ficaram como estão:
  - `integracaoId` opcional em vez de uma união discriminada de Aprovação: menos mudança nas telas existentes;
  - a checagem de pedido vazio no diálogo, além da fonte, para dar resposta imediata;
  - o pedido feito no diálogo de Configurações, e não na página de Conversa do Scopus, como no mockup aprovado.
- **Não realizado:** conferência visual em navegador (claro/escuro), porque este ambiente não tem navegador headless. Para fechar:
  1. rode `npm run dev` e abra `/configuracoes/memoria`;
  2. peça uma revisão ao Scopus e confira o diálogo, a fila `/aprovacoes` (cartão, alcance, decisão) e a Memória depois de aprovar e de recusar;
  3. confira o público recomendado em Sinais, a Habilidade do Scopus e o Contexto do Workspace na Memória de um Agente;
  4. se estiver certo, troque o `Status:` para `closed`.
