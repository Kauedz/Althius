# 03: Alteração demonstrativa de senha

**What to build:** Disponibilizar o fluxo de alteração de senha em Meu perfil, com validação e conclusão explicitamente demonstrativas, sem alterar credenciais reais.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-agent (implementado; falta só a conferência visual em navegador, ver Comments)

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 6–7.

## Acceptance criteria

- [x] Exibir senha atual, nova senha e confirmação como campos mascarados; não mostrar nem preencher uma senha existente.
- [x] Validar campos obrigatórios e igualdade da confirmação antes de concluir.
- [x] Não persistir, registrar em logs ou enviar os valores de senha.
- [x] Cancelar limpa os campos e não altera nenhum dado do perfil.
- [x] Concluir limpa os campos e informa que se trata de demonstração, sem alegar troca real da credencial ou validação real da senha atual.
- [~] Manter estados de erro e foco acessíveis, coerentes com o mock aprovado. (comportamento testado; a conferência visual em navegador não foi feita, ver Comments.)
- [x] Testar pelo aplicativo validação, cancelamento, limpeza e mensagem demonstrativa; comprovar ausência de senha na persistência usada pela experiência.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.


## Comments

### 2026-09-24: implementação

Pré-requisito: o ticket 02 está implementado (`79b346f`) e só aguarda a própria conferência visual; o 01 está aprovado. A alteração de senha foi montada sobre esse código.

- `src/paginas/configuracoes/bloco-senha.tsx` (novo): bloco "Senha" em Meu perfil, seguindo o `Senha` do mockup aprovado. O botão "Alterar senha" abre o formulário com senha atual, nova senha e confirmação, todos `type="password"`, vazios e com `autoComplete="new-password"`. Os navegadores ignoram `off` em campos de senha e preencheriam a senha salva.
- Validação: os três campos são obrigatórios e a confirmação precisa ser igual à nova senha, com as mensagens do mockup. Cada erro fica ligado ao campo (`aria-invalid`, `aria-describedby`, `role="alert"`, como no formulário de perfil) e o foco vai para o primeiro campo com erro.
- Foco: abrir leva ao campo "Senha atual"; concluir ou cancelar devolve o foco ao botão "Alterar senha".
- Concluir limpa e fecha o formulário e anuncia numa região `role="status"` já presente na página: "Demonstração: nenhuma senha foi alterada e a senha atual não foi conferida. Os campos foram limpos e nada do que você digitou foi guardado." Cancelar limpa e fecha, sem tocar no perfil.
- Nenhuma operação nova na `FonteDeAgentes`: os valores só existem no estado do formulário e não são guardados, registrados nem enviados.

### 2026-09-24: verificação

- Testes novos em `src/paginas/configuracoes/configuracoes.test.tsx` ("Alteração de senha (demonstrativa)", 6 testes, pelo aplicativo completo):
  - campos mascarados e vazios;
  - campos obrigatórios com foco no primeiro erro;
  - confirmação diferente;
  - conclusão com limpeza, mensagem demonstrativa e sem alegar troca;
  - cancelamento sem alterar o perfil;
  - ausência das senhas em tudo o que a experiência grava no armazenamento demonstrativo e no `localStorage`, no `console` e em `fetch`. O teste salva o perfil na mesma sessão para provar que a persistência foi usada. Conferi que ele falha se o componente gravar a senha no `localStorage` ou registrá-la no console.
- Validação no snapshot isolado (`HEAD` mais só os arquivos deste ticket, sem o trabalho não commitado de outras sessões que estava no working tree):
  - `tsc -b --force`: sem erros;
  - `vitest run`: 329 testes em 23 arquivos, todos passando;
  - `oxlint`: sem erros, só avisos já existentes em outros arquivos;
  - `vite build`: concluído.
- No working tree, o `tsc` acusa erros em `src/paginas/onboarding.tsx`, vindos do trabalho em andamento de outra sessão no onboarding. Não têm relação com este ticket.
- Revisão (`/code-review`), com o que foi aplicado:
  - docstring de Meu perfil atualizada;
  - os três campos definidos uma única vez;
  - `role="alert"` nos erros;
  - `autoComplete="new-password"`;
  - espiões do console restaurados em `finally`;
  - aviso verificado pela árvore de acessibilidade;
  - checagem de `fetch`.
- Diferenças do mockup, mantidas de propósito: o Cancelar usa o estilo `ghost` do formulário de perfil do aplicativo (o mockup usa o contorno), e a mensagem é montada no próprio bloco, com o visual do `Mensagem tipo="info"`.
- **Não realizado:** conferência visual em navegador (claro/escuro). Este ambiente não tem navegador headless. Para fechar: `npm run dev`, abrir `/configuracoes/perfil`, abrir "Alterar senha" em ambos os temas e conferir os erros em vermelho, o foco visível nos campos e botões e o aviso demonstrativo depois de concluir. Se estiver certo, marcar o critério `[~]` como `[x]` e trocar o `Status:` para `closed`.

### 2026-09-25: merge com a `main` remota

A `main` remota trouxe outra implementação deste ticket (`54124db`, formulário `SenhaDemonstrativa` dentro de `secao-perfil.tsx`, com três testes). As duas cobrem os mesmos critérios, com os mesmos rótulos e mensagens do mockup. No merge ficou a de `bloco-senha.tsx`, sobre a qual o resto de Configurações já foi construído (cabeçalho compartilhado, `Mensagem` em `components/`, bloco "Seus Workspaces"). Os três testes da remota foram retirados: os seis de "Alteração de senha (demonstrativa)" cobrem validação, foco, cancelamento, conclusão, reabertura vazia e ausência das senhas na persistência, no console e na rede.
