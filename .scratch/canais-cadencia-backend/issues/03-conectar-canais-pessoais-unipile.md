# 03: Conectar canais pessoais pela Unipile

**What to build:** permitir que cada usuário conecte suas próprias identidades de E-mail, WhatsApp e LinkedIn pela autenticação hospedada da Unipile v2, com estado real de sincronização, reconexão e desconexão. A Conta remetente pertence ao titular e nunca se torna uma conexão coletiva do Workspace.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** in-progress

- [x] O usuário autenticado inicia uma tentativa temporária de conexão vinculada ao seu usuário e Workspace, e o backend gera um link hospedado novo para cada tentativa.
- [x] Callback e ciclo de vida são validados no backend antes de associar a Conta remetente ao titular; o redirecionamento serve apenas para retornar à tela e não prova a conexão.
- [ ] A interface existente diferencia conectando, sincronizando, pronta, requer reconexão e desconectada.
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
  - continuam em aberto o item "A interface existente diferencia...", porque `/conexoes` ainda mostra a tela de indisponível no Workspace operacional, e o bloqueio de envio na reconexão.
- **Conta Unipile é infraestrutura descartável na pré-produção** ([ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o plano troca de conta Unipile pelo menos três vezes (teste grátis de 7 dias → conta paga de um sócio → conta oficial da empresa). Só os 3 segredos das Edge Functions mudam; nenhum Contato, Conta-alvo, Sequência ou Interação depende de qual conta está ativa. Rodar o wizard de novo a cada troca.

## Reconciliação depois da reconexão (2026-09-27)

- **O problema:** `reconciliation_required` virava `true` numa queda ou reconexão, e nada o limpava. A conta ficava em `syncing` e os envios, bloqueados para sempre.
- **A correção:** migration `supabase/migrations/20260927114500_reconciliacao_da_conta_remetente.sql`.
  - Uma queda (`CREDENTIALS`, `ERROR`, `STOPPED`) ou uma reconexão pela autenticação hospedada exige reconciliação.
  - Quando a Unipile avisa que a conta voltou e sincronizou (`SYNC_SUCCESS` ou `OK`), ela fica pronta para reconciliar (`reconciliation_ready_at`), ainda sem enviar.
  - O relógio do canais-05 chama o Executor também quando há conta nesse estado.
  - O Executor reserva a conta por 5 minutos (`claim_sender_reconciliations`). Depois confere na Unipile, pela mesma rotina usada antes de um envio (`checkConversation` em `_shared/send-step.ts`), a última conversa de cada Contato das Sequências ativas que saíram pela conta (`conversations_to_reconcile`). Uma resposta perdida no período é gravada e pausa a Sequência.
  - Só então a conta volta a `ready` (`finish_sender_reconciliation`). Se uma conversa não pôde ser conferida, a conta continua bloqueada e a próxima rodada tenta de novo. Se a conta caiu de novo durante a reconciliação, a rodada não a libera.
- **Testes:**
  - pgTAP `supabase/tests/reconciliacao_da_conta_remetente.sql` (21 asserções).
  - Deno `supabase/functions/sequence-runner/handler.test.ts`:
    - reconcilia e libera;
    - uma falha mantém a conta bloqueada;
    - uma conta sem conversas é liberada sem chamar a Unipile;
    - a reconciliação vem antes dos envios.
- **Falta no ticket:** a interface com os estados da conta, em Configurações → perfil, decidido em 2026-09-27. Fica fora de `/conexoes`, como combinado com a frente de Conexões.

## Dependências externas

- Conta/aplicação Unipile v2, endpoint fixo (`api.unipile.com`) e chave de API de backend.
- Contas pessoais de teste conectadas pelos respectivos titulares.

