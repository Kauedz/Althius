# 03: Alteração demonstrativa de senha

**What to build:** Disponibilizar o fluxo de alteração de senha em Meu perfil, com validação e conclusão explicitamente demonstrativas, sem alterar credenciais reais.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-human

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 6–7.

## Acceptance criteria

- [x] Exibir senha atual, nova senha e confirmação como campos mascarados; não mostrar nem preencher uma senha existente.
- [x] Validar campos obrigatórios e igualdade da confirmação antes de concluir.
- [x] Não persistir, registrar em logs ou enviar os valores de senha.
- [x] Cancelar limpa os campos e não altera nenhum dado do perfil.
- [x] Concluir limpa os campos e informa que se trata de demonstração, sem alegar troca real da credencial ou validação real da senha atual.
- [x] Manter estados de erro e foco acessíveis, coerentes com o mock aprovado.
- [x] Testar pelo aplicativo validação, cancelamento, limpeza e mensagem demonstrativa; comprovar ausência de senha na persistência usada pela experiência.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

## Comments

### 2026-09-25: implementação e verificação

- Fluxo implementado em `projeto-althius-frontend/src/paginas/configuracoes/secao-perfil.tsx`, seguindo o formulário aprovado no mock. Os três campos são mascarados e iniciam vazios. A validação verifica preenchimento e confirmação; o foco vai ao primeiro erro. Cancelar e concluir limpam os valores. A conclusão informa que nenhuma senha foi alterada e que a senha atual não foi validada.
- Os valores existem somente no estado transitório do formulário: o fluxo não chama a fonte do aplicativo, persistência, rede ou logger. Testes pelo App confirmam cancelamento, conclusão, reabertura vazia e ausência de dado na chave persistente do perfil.
- Teste focal: `vitest run src/paginas/configuracoes/configuracoes.test.tsx` — 14 testes passaram. Regressão completa: `vitest run --maxWorkers=4 --reporter=dot` — 361 testes em 28 arquivos passaram.
- Lint (`oxlint .`) — exit 0, sem erros; warnings existentes de regras React e de variáveis não usadas em alterações paralelas de Sinais.
- Vite build (`vite build`) — passou; manteve o aviso de chunk acima de 500 kB. O typecheck (`tsc -b`) falhou com 8 erros em quatro arquivos de Sinais modificados em paralelo (`catalogo.ts`, `conta-com-sinais.tsx`, `dados-mock.ts`, `pagina-sinais.tsx`); nenhum erro foi apontado nos arquivos deste ticket. As alterações de Sinais foram preservadas e não fazem parte deste ticket.
- Revisão de código por Standards e Spec: nenhuma violação documentada nem falta de requisito. Uma sugestão de nome foi incorporada (`novosErros`).
