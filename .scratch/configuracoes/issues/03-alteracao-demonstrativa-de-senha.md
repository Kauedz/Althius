# 03: Alteração demonstrativa de senha

**What to build:** Disponibilizar o fluxo de alteração de senha em Meu perfil, com validação e conclusão explicitamente demonstrativas, sem alterar credenciais reais.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 6–7.

## Acceptance criteria

- [ ] Exibir senha atual, nova senha e confirmação como campos mascarados; não mostrar nem preencher uma senha existente.
- [ ] Validar campos obrigatórios e igualdade da confirmação antes de concluir.
- [ ] Não persistir, registrar em logs ou enviar os valores de senha.
- [ ] Cancelar limpa os campos e não altera nenhum dado do perfil.
- [ ] Concluir limpa os campos e informa que se trata de demonstração, sem alegar troca real da credencial ou validação real da senha atual.
- [ ] Manter estados de erro e foco acessíveis, coerentes com o mock aprovado.
- [ ] Testar pelo aplicativo validação, cancelamento, limpeza e mensagem demonstrativa; comprovar ausência de senha na persistência usada pela experiência.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

