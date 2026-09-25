# 07: Notificações web de Aprovação e falha

**What to build:** Permitir ativar notificações do navegador e receber avisos demonstrativos relevantes sobre solicitações, decisões e falhas, respeitando a identidade e o papel no Workspace.

**Blocked by:** 05: ICP: revisão pelo Scopus, Aprovação e propagação; 06: Personas: revisão pelo Ethos, Aprovação e propagação

**Status:** closed

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 10–14.

## Acceptance criteria

- [x] Disponibilizar controle único “Ativar notificações do navegador”, inicialmente desligado, nas preferências pessoais.
- [x] Solicitar permissão somente após ação explícita; abrir Configurações não dispara pedido ao navegador.
- [x] Separar preferência persistida do usuário da permissão efetiva do navegador e representar desligado, ativado, bloqueado e não suportado.
- [x] Não declarar ativação concluída se a API estiver ausente ou a permissão não tiver sido concedida.
- [x] Desativar interrompe avisos dessa preferência, sem alegar revogar a permissão concedida pelo navegador.
- [x] Consumir eventos de Aprovação solicitada, ação aprovada ou recusada e falha de execução, inclusive dos fluxos de ICP e Personas.
- [x] Respeitar participação e papel: solicitação de decisão de contexto vai para Administradores; solicitante pode receber o resultado. Aviso não concede autorização de decisão.
- [x] Usar eventos simulados com o aplicativo aberto, sem push em segundo plano nem envio externo real.
- [x] Testar APIs concedida/negada/ausente, persistência da preferência, desativação, ausência de pedido automático e destinatários por papel.
- [x] Verificar que as notificações não criam Aprovações adicionais nem modificam o resultado das operações.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

## Comments

### 2026-09-25: implementação

Pré-requisitos: o ticket 01 está aprovado, e os tickets 05 (`1e1285b`) e 06 (`f2e5bec`) estão implementados.

**Fonte (contrato em `fonte/tipos.ts`):**
- `Preferencias { notificacoesDoNavegador }`, com `preferencias()` e `salvarPreferencias()`:
  - é a vontade da pessoa, associada à Conta de usuário (`althius:preferencias:<contaId>`), e começa desligada;
  - fica separada da permissão do navegador: desligar não a revoga;
  - a gravação é atômica: se o navegador não gravar, nada muda e a tela avisa.
- `observarAvisos(ouvinte)` entrega um `AvisoDoWorkspace` (`tipo`, `destinatarios`, `titulo`, `texto`, `para`) quando acontece, enquanto o aplicativo está aberto. Não há push em segundo plano nem envio externo.
- As regras de destinatário e texto ficam em `fonte/regras-avisos.ts`, pela Participação e pelo papel no momento do aviso:
  - Revisão da Memória do Workspace pedida (ICP ou Personas): vai aos Administradores ativos;
  - outra Aprovação pedida (Conversa, Coordenação, ativação de sequência): vai a todos os participantes ativos, porque qualquer participante decide essas categorias, como antes (a spec proíbe redefinir silenciosamente essa autorização);
  - Aprovação decidida: vai a quem pediu, se ainda participa, inclusive o Administrador que aprova o próprio pedido. Nas outras categorias, quem pediu é guardado só na instância, como as próprias Aprovações; as de exemplo e as vindas de Canal não têm a quem avisar;
  - falha (item da Atividade com `falhou: true`): vai a quem pediu o trabalho. Hoje toda falha nasce de um pedido da sessão; uma falha de Rotina ou de Canal precisaria de outro destinatário.
- O aviso não concede nada: decidir continua validado na operação. O erro de quem recebe o aviso não muda o resultado da operação que o gerou.
- `efeitoDaDecisao` e `ROTULO_DA_DECISAO_DA_REVISAO` (`fonte/regras-memoria.ts`) passam a ser compartilhados pela Atividade e pelo aviso.

**Aplicativo:**
- `notificacoes-do-navegador.ts` é o único ponto que fala com a API `Notification`:
  - lê a permissão a cada vez;
  - só pede a permissão quando chamado pelo clique em ativar;
  - mostra o aviso só com a permissão concedida e ignora a recusa do navegador em mostrá-lo.
- `components/avisos-do-navegador.tsx` fica montado no App, dentro do roteador. Com a preferência ligada, mostra os avisos em que a Conta de usuário da sessão é destinatária. Clicar leva ao assunto (Aprovações, a Memória do documento ou a Atividade).
- Preferências (`secao-preferencias.tsx`), como no mockup aprovado:
  - um único interruptor, "Ativar notificações do navegador", com os estados Desligadas, Ativadas, Bloqueadas pelo navegador e Não suportadas;
  - as mensagens de resultado;
  - a lista "Avisos que você recebe" pelo papel (`avisosQueRecebe`, junto das regras de destinatário).
  - A permissão é relida quando a aba volta ao foco, e o interruptor só aparece depois de carregar a preferência.
- Ficaram fora, como pede o ticket 01: "Ver como", o navegador simulado, o diálogo de permissão desenhado e "Simular um aviso". No aplicativo, o pedido é o do próprio navegador.
- Glossário: novas entradas "Aviso do Workspace" e "Notificação do navegador".

**Comportamento que segue o mockup, de propósito:**
- O interruptor mostra o estado efetivo. Se a pessoa ativou e depois bloqueou a Althius no navegador, ele aparece desligado, com "Bloqueadas pelo navegador", e nada é mostrado. A preferência continua ligada, e os avisos voltam quando o navegador liberar. Enquanto está bloqueado, não há como desligar só a preferência. Se isso incomodar, dá para desenhar esse caso à parte.

### 2026-09-25: verificação

- Testes novos em `src/paginas/configuracoes/notificacoes.test.tsx` (18 testes), com só a API `Notification` substituída (`src/test/notificacoes.ts`; sem ela, o navegador dos testes não suporta notificações):
  - Preferência:
    - começa desligada, e abrir Configurações não pede permissão, nem com a permissão já concedida;
    - permissão concedida ativa e persiste depois de remontar, sem novo pedido;
    - negada: mostra bloqueadas, não grava a preferência e não pergunta de novo;
    - pedido fechado sem resposta: continua desligada;
    - API ausente: mostra não suportadas;
    - a lista de avisos muda pelo papel;
    - bloqueio no site depois de ativar, e a volta sem novo pedido;
    - falha ao gravar.
  - Avisos pelo aplicativo:
    - o Administrador recebe o pedido de decisão, e clicar abre Aprovações;
    - quem pediu recebe o resultado;
    - pelo papel: o Membro que pede não recebe o pedido de decisão, o Administrador que decide o pedido de outra pessoa não recebe o resultado, e a preferência é de cada Conta de usuário;
    - desativar interrompe os avisos sem alegar revogar a permissão;
    - falha de execução;
    - nenhuma Aprovação a mais e o mesmo resultado, mesmo quando o navegador recusa mostrar o aviso.
  - Pelo contrato da fonte:
    - destinatários da revisão pedida por Membro e do resultado;
    - quem saiu do Workspace não recebe;
    - o aviso não concede a decisão a quem virou Membro;
    - as demais categorias vão a todos os participantes, e o resultado vai a quem conversou.
- Mutações conferidas:
  - entregar os avisos sem filtrar pelos destinatários derruba o teste de papel;
  - tirar as duas proteções contra o erro do navegador derruba o teste de resultado.
- Validação numa cópia de trabalho só com as mudanças deste ticket sobre `f2e5bec`, porque outra sessão tem mudanças de onboarding em andamento no mesmo checkout:
  - `tsc -b --force`: sem erros;
  - `vitest run`: 415 testes em 27 arquivos, todos passando;
  - `oxlint`: sem erros; os avisos são de arquivos que este ticket não toca;
  - `vite build`: concluído.
  - No checkout compartilhado, junto com o onboarding em andamento, a suíte também passou (422 testes).
- Inspeção visual no Chromium headless, desktop de 1440 px, temas claro e escuro, como Administrador:
  - desligadas, ativadas com a lista, bloqueadas (também depois do clique) e não suportadas;
  - o pedido ao Scopus criou a notificação "Revisão do ICP aguardando Aprovação";
  - o foco por teclado do interruptor usa o contorno global `:focus-visible`.
  - O headless-shell sempre responde `Notification.permission = "denied"` e não mostra notificações do sistema. Por isso, a página recebeu uma API `Notification` simulada, como nos testes, e o "não suportado" veio da remoção real da API. A notificação do sistema operacional num navegador comum não foi vista: para conferir, rode `npm run dev`, ative em Preferências, peça uma revisão ao Scopus e veja o aviso.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - "Aviso do Workspace" no glossário;
  - a lista "Avisos que você recebe" saiu da tela e foi para `regras-avisos.ts`, junto das regras de destinatário;
  - os testes passaram a conferir a tela em vez de ler a preferência na fonte, o que exigiu mostrar o interruptor só depois de carregar;
  - a frase do efeito da decisão compartilhada;
  - nomes mais claros (`registrarNaAtividade`, `emitirAvisoDeSolicitacao`, `resposta`, `decididaPor` como `Autor`);
  - saiu um utilitário de teste sem uso;
  - linhas longas quebradas.
- Ficaram como estão:
  - `abrir` e o pedido ao Scopus repetidos nos testes de Configurações, como em `memoria.test.tsx` e `personas.test.tsx`;
  - `<AvisosDoNavegador />` nos dois roteadores do App, para não reindentar as rotas;
  - `AvisoDoWorkspace.tipo`, que só os testes leem hoje, mas descreve o aviso no contrato;
  - clicar no aviso leva ao assunto, embora o mockup só tivesse "Dispensar";
  - os avisos das demais categorias de Aprovação, que o mockup não listava e o ticket pede ("Aprovação solicitada, ação aprovada ou recusada").

