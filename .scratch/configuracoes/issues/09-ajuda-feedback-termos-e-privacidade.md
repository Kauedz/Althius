# 09: Ajuda, feedback, termos e privacidade

**What to build:** Disponibilizar todas as superfícies de ajuda e informações institucionais, com conteúdo básico navegável e substituível, além do formulário demonstrativo de feedback.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** closed

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 37–40.

## Acceptance criteria

- [x] Entregar central de ajuda com orientações sucintas sobre as funções do protótipo, seguindo o mock aprovado.
- [x] Entregar formulário de feedback com campos identificados, validação, cancelamento e confirmação demonstrativa.
- [x] Não alegar envio de feedback a equipe externa; mensagens de conclusão deixam claro o caráter demonstrativo.
- [x] Disponibilizar páginas de termos e privacidade com seções e conteúdo básico provisório claramente identificado, em vez de links indisponíveis.
- [x] Não inventar identidade jurídica, obrigações contratuais ou práticas de dados como se fossem oficiais.
- [x] Organizar o conteúdo de modo que informações finais possam substituí-lo sem redesenhar as páginas.
- [x] Manter acesso e retorno à área de Configurações, leitura, foco e rolagem adequados nos temas claro/escuro.
- [x] Testar abertura de todas as superfícies, validação e conclusão do feedback; conferir ausência de links quebrados ou dependência de serviço externo.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

## Comments

### 2026-09-25: implementação

Pré-requisitos: o ticket 01 está aprovado, e o ticket 02 está implementado.

**Conteúdo (`paginas/configuracoes/conteudo-ajuda.ts`), separado das páginas:**
- O texto definitivo entra aqui, com a mesma forma, e as páginas não mudam.
- `CENTRAL_DE_AJUDA` tem `{ provisorio, orientacoes }`: oito orientações curtas, cada uma sobre uma função que existe no aplicativo.
- `TERMOS_DE_SERVICO` e `POLITICA_DE_PRIVACIDADE` são `DocumentoInstitucional`, com `{ titulo, versao, provisorio, secoes }`. Cada seção tem `id`, `titulo` e `paragrafos`.
- Enquanto `provisorio` for `true`, a página mostra a faixa "Conteúdo provisório". Os parágrafos provisórios só dizem o assunto da seção ("[Texto provisório] Assunto desta seção: …"). Nenhuma identidade jurídica, contato, obrigação ou prática de dados é afirmada.
- Não passa pela fonte simulada: é informação da Althius, igual para todos os Workspaces, e não dado do Workspace.

**Aplicativo (`paginas/configuracoes/secao-ajuda.tsx`), como no mockup aprovado:**
- O selo "Althius" e quatro abas, uma página cada: `/configuracoes/ajuda/central`, `/feedback`, `/termos` e `/privacidade`. Um endereço desconhecido leva à Central.
- As abas de Configurações continuam visíveis, e é por elas que se volta às outras seções.
- **Central de ajuda:** a faixa de conteúdo provisório e os cartões com as orientações.
- **Enviar feedback:**
  - campos "Tipo" (Sugestão, Problema ou Elogio) e "Mensagem", com rótulo;
  - mensagem vazia ou só com espaços mostra o erro no campo (`aria-invalid` e descrição), e o foco vai até o campo;
  - "Cancelar" descarta tipo, mensagem e erro;
  - concluir limpa o formulário e mostra "Obrigado! Demonstração: seu feedback não foi enviado a ninguém nem guardado, e o formulário foi limpo." O foco vai para "Enviar outro", e "Enviar outro" o devolve à mensagem. Abrir a página não tira o foco da aba.
- **Termos e privacidade:**
  - faixa provisória, título, "Versão provisória · sem data de vigência" e seções numeradas;
  - o índice "Nesta página" fica fixo ao lado. Os links dele rolam até a seção e levam o foco ao título dela, abaixo da barra de topo.
- O parâmetro de rota `:documento` passou a se chamar `:pagina`, porque também serve às páginas da Ajuda. A Memória do Workspace lê `pagina` como o documento.
- Saiu `secao-em-preparo.tsx`: todas as seis seções estão implementadas.
- `Mensagem` (`componentes.tsx`) fica montada e invisível quando não tem conteúdo, para o leitor de tela anunciar o resultado quando ele chegar. O bloco de senha e o feedback a usam assim.
- `FaixaProvisoria` passou a `componentes.tsx`.

**Diferenças do mockup, de propósito:**
- Introdução do feedback: sai "Quem constrói a Althius lê tudo". Confirmação: sai "Feedback registrado… Nada foi enviado para fora da Althius". As duas frases sugeriam entrega ou registro, e o ticket proíbe alegar envio.
- "Cancelar", que o mockup não tinha e o ticket pede.
- Os documentos dizem "O texto definitivo ainda será fornecido" em vez de "será fornecido pelo jurídico", para não presumir quem responde pelo texto.
- Textos da Central alinhados ao glossário:
  - Sequências sem "cadência";
  - Sinais distinguindo Monitoramento de Sinal;
  - Aprovações com "depois do seu aceite".
- Termos, "Descrição do serviço": "Conexões do Workspace" em vez de "Integrações conectadas".
- Parágrafo provisório: "Assunto desta seção: …" em vez de "Esta seção vai tratar de …", que gerava "de o" e "de a".
- A faixa da Central promete que o texto definitivo substitui as orientações. Não promete "artigos completos nesta mesma estrutura", que um cartão não comporta.
- O índice usa links com âncora, e não botões, e leva o foco à seção.

**Mockup:** `src/mockups/configuracoes/` e `mockups/configuracoes.html` continuam no repositório. A aba "Resumo da memória" ainda não tem ticket (tickets 01, 05 e 06), e o mockup é a referência visual dela.

### 2026-09-25: verificação

- Testes novos em `src/paginas/configuracoes/ajuda.test.tsx` (9 testes), pelo aplicativo renderizado:
  - a Central abre pela aba, com as orientações e a faixa provisória;
  - as quatro páginas abrem pelas abas, abrir o feedback mantém o foco na aba e a volta a Meu perfil funciona;
  - um endereço desconhecido leva à Central;
  - validação da mensagem vazia ou só com espaços: erro no campo e foco nele;
  - conclusão: confirmação demonstrativa, sem "equipe", "recebemos" ou "enviado com sucesso". Nada do texto digitado fica no armazenamento, no localStorage ou no console, e não há `fetch`. "Enviar outro" recomeça vazio;
  - cancelamento: descarta tipo, mensagem e erro, sem confirmação;
  - termos e privacidade: seções com "[Texto provisório]", faixa, versão provisória e índice que leva o foco à seção;
  - links: em todas as páginas, cada link leva a uma aba da Ajuda ou a uma âncora que existe. Não há `fetch`.
- Em `configuracoes.test.tsx`, o teste de navegação abre as seis seções pelas abas, em vez de conferir a seção em preparo. A observação de rastros da senha passou para `src/test/rastros.ts` (`observarRastros`), que o feedback também usa.
- Mutações conferidas: cada uma derruba ao menos um teste.
  - link de índice sem destino;
  - índice sem foco;
  - validação sem `trim`;
  - confirmação alegando envio à equipe;
  - feedback gravado no localStorage;
  - cancelar sem limpar o tipo;
  - sem foco em "Enviar outro" ou ao recomeçar;
  - foco na mensagem ao abrir a página;
  - Central sem a faixa provisória.
- Validação numa cópia de trabalho só com as mudanças deste ticket sobre `9ae4c0b`, porque o onboarding de outra sessão está em andamento no mesmo checkout:
  - `tsc -b --force`: sem erros;
  - `vitest run`: 433 testes em 29 arquivos, todos passando;
  - `oxlint`: termina sem erros; os avisos são de código que já existia;
  - `vite build`: concluído.
- Inspeção visual no Chromium headless, desktop de 1440 px, temas claro e escuro:
  - Central, feedback (erro, preenchido e concluído), termos (topo e depois do índice) e privacidade inteira;
  - a conclusão da senha, que passou a usar `Mensagem`, igual à de antes;
  - foco conferido: na mensagem depois do erro, em "Enviar outro" depois de concluir e no título da seção depois do índice. O índice fica fixo durante a rolagem.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - textos de Sinais e Sequências conforme o glossário;
  - a faixa da Central controlada pelo conteúdo (`provisorio`);
  - `Mensagem` com a região sempre montada, reaproveitada pela senha e pelo feedback, no lugar da marcação copiada;
  - foco do feedback por `autoFocus`, no lugar do efeito copiado do bloco de senha;
  - `observarRastros` em `src/test/`, no lugar do código repetido nos testes;
  - `TIPO_INICIAL`;
  - o parâmetro `:pagina`.
- Ficaram como estão:
  - a checagem de serviço externo observa só `fetch`, porque o jsdom não tem `sendBeacon`, e o conteúdo não tem nenhum endereço externo;
  - uma âncora do índice aberta direto, em nova aba, não rola até a seção, porque a página é montada depois do carregamento. O link não está quebrado;
  - `provisorio` e `paragrafos` como lista: são o encaixe do conteúdo definitivo que o ticket pede;
  - a "Versão provisória · sem data de vigência" repetida nos dois documentos, porque cada um terá a sua;
  - o teste de links confere o `href`, que é o que o ticket pede verificar.

