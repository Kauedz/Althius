# 04: Workspace, participantes e papéis de acesso

**What to build:** Permitir consultar o Workspace e administrar participantes com os papéis Administrador e Membro, mantendo a identidade das pessoas independente de seus vínculos.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-human (implementado; falta só a conferência visual em navegador, ver Comments)

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 15–22.

## Acceptance criteria

- [x] Consultar informações gerais e participantes do Workspace; Administradores podem administrar essas informações, Membros somente consultar.
- [x] Separar Conta de usuário, Workspace e Participação no Workspace na fonte compartilhada; o papel pertence à participação.
- [x] Disponibilizar convite demonstrativo com papel definido e estado pendente, sem alegar envio de e-mail real ou contar convite como participante ativo.
- [x] Permitir a Administradores alternar entre Administrador e Membro, sem introduzir outro papel ou matriz individualizada.
- [x] Apresentar “Remover do Workspace” com explicação de que a Conta de usuário será mantida.
- [x] Remover encerra somente acesso e vínculo naquele Workspace; preserva identidade e outros vínculos, sem excluir conta, mudar plano ou criar Workspace.
- [x] Impedir remoção ou rebaixamento do último Administrador tanto pela interface quanto pela operação pública da fonte.
- [x] Validar a participação e o papel atual nas operações administrativas; Membros não conseguem executá-las mesmo sem passar pelos botões.
- [x] Persistir estado demonstrativo do Workspace e refletir participantes/papéis em seus consumidores, sem cópias divergentes.
- [x] Permitir selecionar identidade/papel na preparação de testes, sem criar um seletor de privilégios na interface do produto.
- [x] Testar consulta como Membro, convite, mudança de papel, remoção com outro vínculo preservado e proteção do último Administrador, pelo aplicativo e pelo contrato público quando necessário.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.


## Comments

### 2026-09-24: implementação

Pré-requisito: o ticket 01 está aprovado; o 02 está implementado (`79b346f`) e só aguarda a própria conferência visual.

**Fonte (contrato em `fonte/tipos.ts`):**
- Conta de usuário, Workspace e Participação no Workspace ficam separados. `ContaDeUsuario` é a identidade, `InformacoesDoWorkspace` guarda as informações gerais, e o `Papel` (`administrador` | `membro`) pertence à Participação. `Workspace` (o que a Casca lê) ganhou `usuario.id` e `papel`.
- Operações novas na `FonteDeAgentes`:
  - `participantesDoWorkspace()` e `contaDeUsuario(contaId)`, esta com as Participações da Conta em qualquer Workspace;
  - `salvarDescricaoDoWorkspace`, `convidarParaWorkspace`, `cancelarConvite`, `mudarPapel` e `removerDoWorkspace`.
- `fonte/simulada-participacoes.ts` (novo) guarda o estado e as regras. Toda operação administrativa valida a Participação e o papel da sessão ("Só Administradores do Workspace podem fazer isso."; "Você não participa deste Workspace.") e recusa rebaixar ou remover o último Administrador. As telas não são a única barreira.
- Quem não participa do Workspace vê só as informações gerais, sem a lista de Participantes e sem os convites.
- O convite fica pendente, sem envio de e-mail e sem contar como Participante. São recusados e-mail inválido, quem já participa e convite repetido.
- Remover encerra só a Participação neste Workspace. A Conta de usuário e as outras Participações continuam (Thiago continua em "Evolut Trading"). A sessão, o plano e os Workspaces não mudam. A própria sessão não se remove por aqui, como no mockup.
- Persistência no mesmo `armazenamento` do perfil:
  - o Workspace fica em `althius:workspace:databricks`, com informações, Participações e convites; um estado salvo inválido, com entrada repetida ou sem Administrador volta aos dados de exemplo;
  - o perfil passou a ser por Conta de usuário (`althius:perfil:<contaId>`, antes `althius:perfil`), para outra sessão no mesmo navegador não herdar nome e e-mail alheios. Um perfil salvo com a chave antiga deixa de ser lido.
- O e-mail de uma Conta de usuário não pode repetir o de outra.
- Preparação dos testes: `criarFonteSimulada({ sessao: { contaId, papel? } })` escolhe a identidade e o papel. Não há seletor de papéis na interface.
  - O papel escolhido vale para os dados de exemplo; um Workspace já salvo prevalece, para a escolha não virar estado persistido.
  - Uma preparação que deixe o Workspace sem Administrador é recusada.

**Telas:**
- `paginas/configuracoes/secao-workspace.tsx` (novo) implementa "Pessoas e acesso" seguindo o mockup aprovado:
  - informações do Workspace, com o número de Participantes e o seu papel;
  - tabela de Participantes com o papel de cada um e seletor Administrador/Membro para Administradores; o último Administrador aparece travado, com o aviso "Último Administrador";
  - "Remover do Workspace" com diálogo do que encerra e do que continua, avisando que a Conta de usuário é mantida;
  - convites pendentes e diálogo "Convidar pessoa" com o papel.
- A visão de Membro não tem nenhuma ação administrativa e mostra um aviso.
- Ficaram fora, como pede o ticket 01: "Ver como" e "Simular aceite".
- Consumidores que leem da mesma fonte:
  - menu pessoal da Casca, com o papel ("Administrador neste Workspace");
  - "Seus Workspaces" em Meu perfil (do mockup), com as Participações da Conta e o selo "Atual";
  - o nome salvo em Meu perfil aparece na lista de Participantes;
  - a descrição do Workspace aparece no seletor de Workspace da Casca.
- `paginas/configuracoes/componentes.tsx` (novo): `Bloco` e `Mensagem` do aplicativo, no lugar dos do mockup.

**Decisão tomada na revisão:** o Administrador edita só a **descrição** do Workspace. Hoje o nome do Workspace é o do Cliente (`Workspace.cliente`). Ele aparece nos textos dos Agentes ("O que o Scopus aprendeu sobre a Databricks"), e o onboarding é dono dele. Renomear por aqui mudaria o Cliente e criaria mais uma cópia divergente da do onboarding.

**Divergência já existente, fora deste ticket:** com o onboarding concluído, a Casca mostra o nome e a descrição vindos do onboarding (`clienteDoOnboarding`/`checklist.oQueVende`), e não os da `FonteDeAgentes`. Unificar isso cabe ao onboarding.

### 2026-09-24: verificação

- Testes novos em `src/paginas/configuracoes/workspace.test.tsx` (21 testes):
  - pelo aplicativo: consulta como Membro, convite, recusas do convite, cancelamento, mudança de papel, proteção do último Administrador, auto-rebaixamento refletido na Casca, remoção preservando a Conta e o outro Workspace, persistência após remontagem, isolamento sem armazenamento e os consumidores;
  - pelo contrato da fonte: Membro não administra; último Administrador; papel escolhido na preparação; quem não participa; e-mail repetido; perfil por Conta de usuário; escolha do cenário que não persiste.
- Mutação conferida: tirar a validação de papel ou a proteção do último Administrador da fonte derruba os testes de contrato.
- `src/test/armazenamento.ts` (novo) passa a ser o armazenamento em memória compartilhado pelos testes de Configurações.
- Validação no snapshot isolado (`HEAD` mais só os arquivos deste ticket, sem o trabalho não commitado de outras sessões):
  - `tsc -b --force`: sem erros;
  - `vitest run`: 359 testes em 24 arquivos, todos passando;
  - `oxlint`: sem erros e sem avisos nos arquivos deste ticket;
  - `vite build`: concluído.
- No working tree, `tsc -b` também passa. O teste de navegação de `configuracoes.test.tsx` falha lá por causa da `EntradaNaCasca`, trabalho em andamento de outra sessão em `App.tsx`; no snapshot ele passa.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - perfil por Conta de usuário;
  - papel da preparação que não persiste e não deixa o Workspace sem Administrador;
  - quem não participa não vê a lista;
  - nome do Workspace fora da edição;
  - vocabulário do glossário (`ParticipantesDoWorkspace`, `contasDeUsuario`, `nomeDoWorkspace`, sem "pessoa" nem "conta" soltas no código);
  - `PAPEIS` e `ERRO_DE_EMAIL` compartilhados;
  - validação do convite só na fonte;
  - e-mail único por Conta de usuário;
  - Workspace salvo com entrada repetida recusado;
  - alias `ArmazenamentoDoPerfil` substituído por `ArmazenamentoDemonstrativo`;
  - helper de armazenamento compartilhado.
- Ficaram como estão:
  - `secao-workspace.tsx` usa `BOTAO_*`/`Opcao` de `paginas/sinais/componentes`, como o mockup aprovado. Mover para `components/` é uma refatoração à parte.
  - `Workspace { cliente, descricao }` repete parte de `InformacoesDoWorkspace`; o tipo `Workspace` já existia e é lido por várias telas.
- **Não realizado:** conferência visual em navegador (claro/escuro), porque este ambiente não tem navegador headless. Para fechar:
  1. rode `npm run dev` e abra `/configuracoes/workspace`;
  2. em ambos os temas, confira a tabela, o seletor de papel, o selo "Último Administrador", os diálogos de convite e de remoção (foco e leitura) e as mensagens de resultado;
  3. confira também o bloco "Seus Workspaces" em `/configuracoes/perfil`;
  4. se estiver certo, troque o `Status:` para `closed`.

