# 07: Notificações web de Aprovação e falha

**What to build:** Permitir ativar notificações do navegador e receber avisos demonstrativos relevantes sobre solicitações, decisões e falhas, respeitando a identidade e o papel no Workspace.

**Blocked by:** 05: ICP: revisão pelo Scopus, Aprovação e propagação; 06: Personas: revisão pelo Ethos, Aprovação e propagação

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 10–14.

## Acceptance criteria

- [ ] Disponibilizar controle único “Ativar notificações do navegador”, inicialmente desligado, nas preferências pessoais.
- [ ] Solicitar permissão somente após ação explícita; abrir Configurações não dispara pedido ao navegador.
- [ ] Separar preferência persistida do usuário da permissão efetiva do navegador e representar desligado, ativado, bloqueado e não suportado.
- [ ] Não declarar ativação concluída se a API estiver ausente ou a permissão não tiver sido concedida.
- [ ] Desativar interrompe avisos dessa preferência, sem alegar revogar a permissão concedida pelo navegador.
- [ ] Consumir eventos de Aprovação solicitada, ação aprovada ou recusada e falha de execução, inclusive dos fluxos de ICP e Personas.
- [ ] Respeitar participação e papel: solicitação de decisão de contexto vai para Administradores; solicitante pode receber o resultado. Aviso não concede autorização de decisão.
- [ ] Usar eventos simulados com o aplicativo aberto, sem push em segundo plano nem envio externo real.
- [ ] Testar APIs concedida/negada/ausente, persistência da preferência, desativação, ausência de pedido automático e destinatários por papel.
- [ ] Verificar que as notificações não criam Aprovações adicionais nem modificam o resultado das operações.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

