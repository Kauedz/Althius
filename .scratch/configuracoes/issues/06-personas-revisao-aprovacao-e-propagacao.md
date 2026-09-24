# 06: Personas: revisão pelo Ethos, Aprovação e propagação

**What to build:** Aplicar às definições de Personas o fluxo completo de revisão pelo Ethos e aprovação administrativa, compartilhando o contexto vigente com todas as áreas que o utilizam.

**Blocked by:** 05: ICP: revisão pelo Scopus, Aprovação e propagação

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 24, 26–33.

## Acceptance criteria

- [ ] Mostrar definições de Personas na Memória do Workspace, distintas de participantes e dos Contatos classificados por elas.
- [ ] Permitir a qualquer participante ativo solicitar revisão pelo Ethos em Conversa demonstrativa e gerar proposta na fila de Aprovações.
- [ ] Reutilizar o fluxo de contexto compartilhado do ticket 05, evitando segunda implementação independente de autorização ou decisão.
- [ ] Apresentar proposta e alcance; somente Administrador ativo pode aprovar ou recusar, inclusive a própria solicitação.
- [ ] Pendência e recusa preservam as Personas vigentes e todas as configurações dependentes.
- [ ] Aprovação substitui a definição alterada e atualiza automaticamente as configurações preexistentes que a utilizam, incluindo consumidores em Agentes e Contas e Contatos; não criar aprovações adicionais.
- [ ] Manter referência consistente às definições de Personas nos consumidores, sem criar cópias por tela nem apagar Contatos para propagar a revisão.
- [ ] Persistir somente a última definição aprovada, sem histórico/restauração, preservando ICP e definições não afetadas pela proposta.
- [ ] Manter a atualização consistente em caso de falha e preservar a semântica de Aprovação/Atividade existente.
- [ ] Testar solicitação como Membro, decisão exclusiva do Administrador, recusa, duas revisões sucessivas e propagação em consumidor preexistente; confirmar que a revisão de Persona não altera indevidamente o ICP.
- [ ] Disponibilizar os eventos correspondentes de solicitação, decisão e falha ao consumidor de notificações.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

