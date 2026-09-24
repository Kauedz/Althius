# 09: Ajuda, feedback, termos e privacidade

**What to build:** Disponibilizar todas as superfícies de ajuda e informações institucionais, com conteúdo básico navegável e substituível, além do formulário demonstrativo de feedback.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 37–40.

## Acceptance criteria

- [ ] Entregar central de ajuda com orientações sucintas sobre as funções do protótipo, seguindo o mock aprovado.
- [ ] Entregar formulário de feedback com campos identificados, validação, cancelamento e confirmação demonstrativa.
- [ ] Não alegar envio de feedback a equipe externa; mensagens de conclusão deixam claro o caráter demonstrativo.
- [ ] Disponibilizar páginas de termos e privacidade com seções e conteúdo básico provisório claramente identificado, em vez de links indisponíveis.
- [ ] Não inventar identidade jurídica, obrigações contratuais ou práticas de dados como se fossem oficiais.
- [ ] Organizar o conteúdo de modo que informações finais possam substituí-lo sem redesenhar as páginas.
- [ ] Manter acesso e retorno à área de Configurações, leitura, foco e rolagem adequados nos temas claro/escuro.
- [ ] Testar abertura de todas as superfícies, validação e conclusão do feedback; conferir ausência de links quebrados ou dependência de serviço externo.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

