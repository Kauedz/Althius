# 06: Personas: revisão pelo Ethos, Aprovação e propagação

**What to build:** Aplicar às definições de Personas o fluxo completo de revisão pelo Ethos e aprovação administrativa, compartilhando o contexto vigente com todas as áreas que o utilizam.

**Blocked by:** 05: ICP: revisão pelo Scopus, Aprovação e propagação

**Status:** closed

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 24, 26–33.

## Acceptance criteria

- [x] Mostrar definições de Personas na Memória do Workspace, distintas de participantes e dos Contatos classificados por elas.
- [x] Permitir a qualquer participante ativo solicitar revisão pelo Ethos em Conversa demonstrativa e gerar proposta na fila de Aprovações.
- [x] Reutilizar o fluxo de contexto compartilhado do ticket 05, evitando segunda implementação independente de autorização ou decisão.
- [x] Apresentar proposta e alcance; somente Administrador ativo pode aprovar ou recusar, inclusive a própria solicitação.
- [x] Pendência e recusa preservam as Personas vigentes e todas as configurações dependentes.
- [x] Aprovação substitui a definição alterada e atualiza automaticamente as configurações preexistentes que a utilizam, incluindo consumidores em Agentes e Contas e Contatos; não criar aprovações adicionais.
- [x] Manter referência consistente às definições de Personas nos consumidores, sem criar cópias por tela nem apagar Contatos para propagar a revisão.
- [x] Persistir somente a última definição aprovada, sem histórico/restauração, preservando ICP e definições não afetadas pela proposta.
- [x] Manter a atualização consistente em caso de falha e preservar a semântica de Aprovação/Atividade existente.
- [x] Testar solicitação como Membro, decisão exclusiva do Administrador, recusa, duas revisões sucessivas e propagação em consumidor preexistente; confirmar que a revisão de Persona não altera indevidamente o ICP.
- [x] Disponibilizar os eventos correspondentes de solicitação, decisão e falha ao consumidor de notificações.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

## Comments

### 2026-09-25: implementação

Pré-requisitos: o ticket 01 está aprovado, e o 05 está implementado (`1e1285b`).

**Fonte (contrato em `fonte/tipos.ts`):**
- `MemoriaDoWorkspace` guarda `icp` e `personas`, cada um como `DocumentoVigente`: seções, data da aprovação e quem aprovou, sem histórico. Nas Personas, cada seção é uma Persona, com o nome no título.
- `DocumentoDaMemoria` passou a ser `keyof MemoriaDoWorkspace` (`'icp' | 'personas'`). O fluxo do ticket 05 (`solicitarRevisao`, `decidirAprovacao` e `fonte/simulada-memoria.ts`) atende os dois documentos, sem uma segunda implementação de autorização ou decisão:
  - qualquer participante ativo pede; o Ethos responde pelo roteiro demonstrativo (`roteiros.ts`, `revisoesDaMemoria.personas`, em ciclo);
  - só um Administrador ativo decide, validado na operação; basta um, e pode ser quem pediu;
  - cada documento tem no máximo uma proposta pendente, e as propostas do ICP e das Personas são independentes;
  - aprovar troca só o documento da proposta, na mesma gravação da decisão, sem tocar no outro;
  - se a gravação falhar, nada muda, a proposta segue pendente e a falha entra na Atividade do Ethos com `falhou: true`.
- As frases que mudam por documento ("o ICP vigente", "as Personas vigentes" e a concordância) ficam em `frasesDo` (`fonte/regras-memoria.ts`).
- Persistência: `althius:memoria:databricks` passa a guardar também as Personas. Uma Memória gravada no formato do ticket 05, sem Personas, mantém o ICP aprovado e as revisões e começa pelas Personas de exemplo.
- Eventos para o consumidor de notificações (ticket 07), pelos mesmos mecanismos do ticket 05:
  - solicitação: Aprovação pendente com `revisao.solicitante`, e a Execução do Ethos na Atividade;
  - decisão: `estado` e `revisao.decididaPor`, e a ação na Atividade, sem contar outra Execução;
  - falha: item da Atividade com `falhou: true`.

**Telas:**
- Memória do Workspace (`paginas/configuracoes/secao-memoria.tsx`): abas ICP e Personas, como no mockup, em `/configuracoes/memoria/icp` e `/configuracoes/memoria/personas`. A rota sem documento abre o ICP.
  - A aba Personas mostra as definições vigentes, mantidas pelo Ethos, e avisa que elas classificam os Contatos e não são participantes do Workspace.
  - O diálogo de revisão, os avisos de pendência, recusa e substituição e "Onde este contexto é usado" são os do ICP, com o Ethos.
- O cartão de revisão em Aprovações é o do ICP, com as frases das Personas e o link para a aba do documento.
- Os três consumidores das Personas vigentes:
  - Contas e Contatos: na tabela de Contatos, o nome da Persona abre a definição vigente dela, num popover com link para a Memória. O Contato guarda só o nome; a revisão não copia nem apaga Contatos.
  - Rhetor: a Habilidade "Sequência por persona" (`Habilidade.usaPersonas`) mostra as Personas vigentes, também nos Agentes criados do Rhetor.
  - Agentes: o bloco "Contexto do Workspace" na Memória de cada Agente mostra o ICP e as Personas, cada um com link para a sua aba.
- Saiu a nota que adiava as Personas para este ticket.

**Diferenças em relação ao mockup e aos dados de exemplo, de propósito:**
- O terceiro dependente é o Contexto dos Agentes, e não "Rhetor · Anúncios Meta · Variações de anúncio". O ticket pede consumidores em Agentes e em Contas e Contatos, e o aplicativo não tem uma configuração de variações de anúncio.
- A classificação aparece no módulo "Contas e Contatos", onde ela é vista, e não "Ethos".
- As Personas de exemplo são 7, e não as 4 do mockup. Os Contatos de exemplo já usavam "Decisor comercial", "Campeão interno" e "Usuário-chave", e todo Contato com Persona precisa apontar para uma Persona definida.
- Pelo mesmo motivo, três Contatos de exemplo passaram de "Decisora técnica" e "Líder técnica" para os nomes das Personas, "Decisor técnico" e "Líder técnico". Os participantes sugeridos na Sequência pela Conversa continuam os mesmos.

**Fora deste ticket:**
- A aba "Resumo da memória" do mockup continua sem ticket, como registrado nos tickets 01 e 05.
- Renomear uma Persona: os roteiros da demonstração não renomeiam. Se um dia renomearem, os Contatos com o nome antigo mostram só o nome, sem a definição.

### 2026-09-25: verificação

- Testes novos em `src/paginas/configuracoes/personas.test.tsx` (11 testes):
  - pelo aplicativo:
    - Personas vigentes para Membro, sem edição direta e separadas do ICP;
    - pedido do Membro ao Ethos, com a proposta pendente e o cartão sem decisão para Membro;
    - ciclo Membro → Ethos → Administrador, remontando com o mesmo armazenamento, com a propagação para a Habilidade do Rhetor e de um Agente criado do Rhetor e para o Contexto do Workspace do Ethos, sem segunda Aprovação e sem mudar o ICP;
    - recusa; pendência;
    - Administrador aprovando a própria solicitação e duas revisões sucessivas. Os Contatos preexistentes mostram a definição anterior enquanto a proposta está pendente e a nova depois da aprovação, sem versões nem restauração e sem alterar os Contatos nem o ICP;
  - pelo contrato da fonte:
    - um Membro não aprova nem recusa;
    - ICP e Personas têm propostas independentes;
    - eventos de solicitação, decisão e falha;
    - a Memória salva no formato do ticket 05;
    - todo Contato com Persona aponta para uma Persona definida.
- `armazenamentoQueFalha` foi para `src/test/armazenamento.ts`, compartilhado com `memoria.test.tsx`.
- Validação numa cópia de trabalho só com as mudanças deste ticket sobre `6ca1431`, porque outra sessão tinha mudanças de onboarding em andamento no mesmo checkout:
  - `tsc -b --force`: sem erros;
  - `vitest run`: 397 testes em 26 arquivos, todos passando;
  - `oxlint`: sem erros; os avisos são de código que este ticket não mudou;
  - `vite build`: concluído.
- Inspeção visual no Chromium headless, desktop de 1440 px, temas claro e escuro, como Administrador:
  - aba Personas, diálogo com o Ethos, cartão em Aprovações, pendência, aprovação e Personas aprovadas;
  - Contexto do Workspace do Ethos, Habilidade do Rhetor e a definição da Persona na tabela de Contatos;
  - ajuste feito: a célula cortava o sublinhado do nome da Persona na tabela;
  - a visão de Membro ficou coberta pelos testes.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - a definição da Persona na tabela de Contatos, que era só um `title` ao passar o mouse, virou um popover acessível por teclado e leitor de tela, e o teste passou a lê-la pelo papel e pela descrição acessível;
  - a verificação de pendência também nos Contatos;
  - o texto da nota e de uma Persona sem os termos que o glossário evita ("papel" como sinônimo de Persona, "decisores");
  - `ehDocumentoDaMemoria` compartilhado, as frases repetidas em `frasesDo` e `femininoPlural` no lugar de `plural`;
  - o Contexto do Workspace percorre os documentos da Memória, com link para a aba de cada um.
- Ficaram como estão:
  - `Contato.persona` continua o nome da Persona, que é a referência, como define o glossário;
  - a tabela de Contatos lê a Memória por conta própria, para todas as telas que a usam mostrarem a definição vigente;
  - os ramos por documento (`dependentesDe` e a nota das Personas), porque são só dois documentos;
  - o teste do formato do ticket 05 usa a chave gravada no navegador, porque é esse formato que ele confere.
