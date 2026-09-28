# 03: Conectar canais pessoais pela Unipile

**What to build:** permitir que cada usuário conecte suas próprias identidades de E-mail, WhatsApp e LinkedIn pela autenticação hospedada da Unipile v2, com estado real de sincronização, reconexão e desconexão. A Conta remetente pertence ao titular e nunca se torna uma conexão coletiva do Workspace.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** closed

- [x] O usuário autenticado inicia uma tentativa temporária de conexão vinculada ao seu usuário e Workspace, e o backend gera um link hospedado novo para cada tentativa.
- [x] Callback e ciclo de vida são validados no backend antes de associar a Conta remetente ao titular; o redirecionamento serve apenas para retornar à tela e não prova a conexão.
- [x] A interface existente diferencia conectando, sincronizando, pronta, requer reconexão e desconectada.
- [x] Apenas o titular pode consultar detalhes privados ou usar a Conta remetente; outro participante não consegue associá-la à própria Sequência.
- [x] Credenciais e segredos da Unipile ficam somente no backend e não aparecem no bundle, logs compartilhados ou respostas públicas.
- [x] Reconexão preserva a identidade do titular e não libera envios antes de reconciliar o período de indisponibilidade. O bloqueio de envio é critério do canais-04, que é onde o envio acontece.
- [x] A entrega usa contratos da Unipile v2 (host único, hosted auth por `POST /v2/auth/link`, webhook único assinado por HMAC) e não mistura payloads da v1.

## Implementação local

- Migrations: `supabase/migrations/20260925131500_contas_remetentes_unipile.sql` e `supabase/migrations/20260926000000_unipile_v2_outlook.sql` (Unipile v2 renomeou o provedor `MICROSOFT` para `OUTLOOK`).
- Edge Functions: `sender-accounts` (conecta/reconecta/desconecta) e `unipile-account-status` (único receptor de webhook, HMAC-SHA256).
- Segredos e configuração Unipile: `supabase/functions/README.md`.
- A integração visual e os fluxos de reconciliação ficam pendentes. O Supabase Auth real do ticket 01 já está na interface.
- Estado em 2026-09-26:
  - a conta Unipile criada pelo usuário veio em v2 (não v1); o backend foi reescrito para os contratos v2 antes de qualquer conta real ser conectada — ver o adendo em [ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md);
  - as migrations estão aplicadas no `ycbdilsmydvzezhlymty`;
  - o pgTAP `contas_remetentes_unipile.sql` passa 18/18 no banco remoto, numa transação desfeita no fim (inclui a rejeição do antigo nome `MICROSOFT`);
  - as 2 Edge Functions v2 estão publicadas (a antiga `unipile-hosted-auth-notify` foi removida: a v2 não tem callback de hosted-auth separado, só o webhook único);
  - `scripts/wizard-unipile.sh` obtém a chave de API, registra o Webhook Endpoint por API (capturando o segredo que a própria Unipile gera) e cola os 3 segredos; `npm run unipile:testar` conecta um canal de verdade de ponta a ponta;
  - a conta Unipile do teste grátis está configurada pelo wizard, com o Webhook Endpoint inscrito nos 7 eventos de conta;
  - primeira conexão real ponta a ponta pelo `npm run unipile:testar -- email`: link hospedado de `POST /v2/auth/link` → `account.add` assinado (HTTP 200) → Conta remetente de e-mail `GOOGLE` do Vendedor responsável. Ela ficou em `syncing` porque Google, Outlook e LinkedIn não fazem sincronização inicial na v2 e nunca mandam `account.initial_sync.completed`. Corrigido: a função aplica o `SYNC_SUCCESS` logo depois do `account.add` para esses provedores. A conta do teste está `ready`;
  - continuava em aberto o item "A interface existente diferencia...", porque `/conexoes` ainda mostra a tela de indisponível no Workspace operacional. O bloqueio de envio na reconexão foi resolvido em 2026-09-27 (abaixo).
- **Conta Unipile é infraestrutura descartável na pré-produção** ([ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o plano troca de conta Unipile pelo menos três vezes (teste grátis de 7 dias → conta paga de um sócio → conta oficial da empresa). Só os 3 segredos das Edge Functions mudam; nenhum Contato, Conta-alvo, Sequência ou Interação depende de qual conta está ativa. Rodar o wizard de novo a cada troca.

## Reconciliação depois da reconexão (2026-09-27)

- **O problema:** `reconciliation_required` virava `true` numa queda ou reconexão, e nada o limpava. A conta ficava em `syncing` e os envios, bloqueados para sempre.
- **A correção:** migration `supabase/migrations/20260927114500_reconciliacao_da_conta_remetente.sql`.
  - **Queda:** uma queda (`CREDENTIALS`, `ERROR`, `STOPPED`) ou uma reconexão pela autenticação hospedada exige reconciliação. Um gatilho recomeça a conferência do zero em toda queda.
  - **Volta:** a conta fica pronta para reconciliar (`reconciliation_ready_at`) quando a Unipile avisa que ela voltou e sincronizou (`SYNC_SUCCESS` ou `OK`). Num provedor sem sincronização inicial, já fica pronta na própria reconexão, na mesma operação do banco. Uma reconexão entregue depois do aviso de volta não o apaga.
  - **Contas presas antes da migration:** as que ficaram em `syncing` entram na fila.
  - **Quem roda:** o relógio do canais-05 chama o Executor também quando há conta esperando reconciliação.
  - **Conferência:**
    - O Executor reserva a conta por 5 minutos (`claim_sender_reconciliations`).
    - Pela mesma rotina usada antes de um envio (`checkConversation` em `_shared/send-step.ts`), confere a última conversa de cada Contato das Sequências que saíram pela conta, pausadas inclusive.
    - Vai em páginas de 25 (`conversations_to_reconcile`), guardando até onde foi (`record_reconciliation_progress`). Uma resposta perdida é gravada e pausa a Sequência.
    - A conferência tem até 60 s por rodada. O que faltar, ou o que falhar na Unipile, continua na rodada seguinte, a partir de onde parou.
    - Uma conversa que não existe mais (HTTP 404) conta como conferida.
  - **Liberação:** só com tudo conferido a conta volta a `ready` (`finish_sender_reconciliation`). Se ela caiu de novo durante a reconciliação, a rodada não grava nem libera nada.
- **Limites conhecidos:**
  - **Janela da queda:** a reconciliação relê as conversas da Althius, mas não varre a caixa de entrada no período fora do ar. Essa varredura é o próximo passo e depende de conferir na documentação da v2 como listar e-mails por data. O ambiente de desenvolvimento não alcança `developer.unipile.com`.
  - **LinkedIn e WhatsApp:** as contas desses canais são liberadas sem conferência, porque esses canais ainda não enviam passos. O canais-06/07 traz a conferência deles.
  - **Ordem dos avisos:** um `OK` que chega antes do fim da sincronização inicial (IMAP, WhatsApp) libera a conferência antes da hora. Não sei se a Unipile manda os avisos nessa ordem.
- **Testes:**
  - pgTAP `supabase/tests/reconciliacao_da_conta_remetente.sql` (25 asserções).
  - Deno `supabase/functions/sequence-runner/handler.test.ts`:
    - reconciliar e liberar;
    - a falha e a nova queda, que mantêm a conta bloqueada;
    - as páginas;
    - o limite de tempo;
    - o 404;
    - a conta sem conversas;
    - a reconciliação antes dos envios.
- **Falta no ticket:** a interface com os estados da conta, em Configurações → perfil, decidido em 2026-09-27. Fica fora de `/conexoes`, como combinado com a frente de Conexões.

## Dependências externas

- Conta/aplicação Unipile v2, endpoint fixo (`api.unipile.com`) e chave de API de backend.
- Contas pessoais de teste conectadas pelos respectivos titulares.

## Interface (2026-09-27)

- **Onde:** Configurações → Meu perfil, bloco "Minhas Contas remetentes", no Workspace operacional. Fica fora de `/conexoes`, como combinado com a frente de Conexões. O resto do perfil continua indisponível ali. Na Demonstração, o bloco só explica que nenhuma Conta remetente é conectada nela, sem botões.
- **Estados:** cada Canal (E-mail, WhatsApp, LinkedIn) mostra Não conectada, Conectando, Sincronizando, Conferindo respostas, Pronta, Requer reconexão ou Desconectada, como o backend registrou. Conferindo respostas é `syncing` com `reconciliation_required`: a Reconciliação da Conta remetente depois de uma queda. Ações: Conectar, Reconectar (a mesma conta) e Desconectar (com confirmação).
- **O retorno não prova a conexão:** o link hospedado abre em outra aba, e a tela avisa que o estado aparece ali quando o provedor confirmar, com o mesmo link à mão se o navegador bloquear a aba. A tela nunca mostra a conta como conectada antes do backend. O retorno da autenticação continua caindo em `/conexoes`, por acordo: a Edge Function `sender-accounts` é da outra frente e não mudou.
- **Atualização:** a lista é relida ao voltar para a aba, a cada 5 s com a aba à vista enquanto há conta conectando ou sincronizando ou uma autenticação aberta (até o link vencer, em 15 min), e pelo botão Atualizar.
- **Código:** `projeto-althius-frontend/src/fonte/supabase-contas-remetentes.ts` (RPC `list_owned_sender_accounts` e Edge Function `sender-accounts`) e `projeto-althius-frontend/src/paginas/configuracoes/bloco-contas-remetentes.tsx`.
- **Testes:** `src/fonte/supabase-contas-remetentes.test.ts` (7) e `src/paginas/configuracoes/contas-remetentes.test.tsx` (13), pelo Supabase falso.

- **QA manual (2026-09-28):** "Atualizar" em Minhas Contas remetentes mostra "Atualizando…" e "Lista atualizada às HH:MM" (ou o erro), e o bloco diz de qual Workspace são as contas: cada Workspace tem as suas.
