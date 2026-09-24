# 05: ICP: revisão pelo Scopus, Aprovação e propagação

**What to build:** Entregar o ciclo completo de consulta e revisão do ICP: qualquer participante solicita ao Scopus, somente Administrador decide e a aprovação atualiza a Memória do Workspace e configurações dependentes preexistentes.

**Blocked by:** 04: Workspace, participantes e papéis de acesso

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 23, 25, 27–33.

## Acceptance criteria

- [ ] Mostrar o ICP vigente na Memória do Workspace, separado da Memória individual do Agente, e permitir solicitar revisão pelo Scopus.
- [ ] Produzir proposta por Conversa/roteiro demonstrativo, integrada à fila de Aprovações existente; não exigir IA real nem oferecer edição direta que dispense o fluxo.
- [ ] Apresentar conteúdo proposto, origem e aviso de atualização automática das configurações dependentes.
- [ ] Validar na operação de decisão que o usuário é Administrador ativo daquele Workspace. Membro pode solicitar, mas não aprovar nem recusar.
- [ ] Permitir que um Administrador aprove a própria solicitação; uma única decisão basta.
- [ ] Manter ICP e dependências intactos enquanto a proposta estiver pendente ou for recusada.
- [ ] Aprovar substitui o ICP vigente e propaga automaticamente a alteração a todas as configurações existentes que dele dependem, incluindo o público recomendado de Sinais e o contexto usado pelos Agentes.
- [ ] Usar uma referência compartilhada; não aceitar atualização apenas visual em Configurações, cópia manual, propagação só para novas configurações ou aprovações adicionais por módulo.
- [ ] Completar atualização e propagação como mudança consistente; falha não deixa contexto publicado parcialmente entre áreas.
- [ ] Persistir somente o último ICP aprovado, sem lista de versões ou restauração; proposta pendente não é versão aprovada.
- [ ] Preservar Atividades e outros registros; decisão continua sendo ação da Execução de origem, sem contabilizar nova Execução. Não redefinir permissões das demais categorias de Aprovação.
- [ ] Não transformar atualização de ICP em Sinal nem misturar Aderência com Quente; não repetir ações externas já realizadas.
- [ ] Testar o ciclo Membro → Scopus → Administrador → atualização em configuração preexistente; testar bloqueio de Membro, recusa, pendência, falha consistente e duas revisões sucessivas.
- [ ] Manter os eventos de solicitação, decisão e falha disponíveis para o consumidor de notificações, reutilizando os mecanismos existentes sem exigir que o ticket de notificações esteja pronto.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

