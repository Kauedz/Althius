# 03: Conectar canais pessoais pela Unipile

**What to build:** permitir que cada usuário conecte suas próprias identidades de E-mail, WhatsApp e LinkedIn pela autenticação hospedada da Unipile v2, com estado real de sincronização, reconexão e desconexão. A Conta remetente pertence ao titular e nunca se torna uma conexão coletiva do Workspace.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** in-progress

- [x] O usuário autenticado inicia uma tentativa temporária de conexão vinculada ao seu usuário e Workspace, e o backend gera um link hospedado novo para cada tentativa.
- [x] Callback e ciclo de vida são validados no backend antes de associar a Conta remetente ao titular; o redirecionamento serve apenas para retornar à tela e não prova a conexão.
- [ ] A interface existente diferencia conectando, sincronizando, pronta, requer reconexão e desconectada.
- [x] Apenas o titular pode consultar detalhes privados ou usar a Conta remetente; outro participante não consegue associá-la à própria Sequência.
- [x] Credenciais e segredos da Unipile ficam somente no backend e não aparecem no bundle, logs compartilhados ou respostas públicas.
- [ ] Reconexão preserva a identidade do titular e não libera envios antes de reconciliar o período de indisponibilidade.
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
  - a conta Unipile em si ainda não foi configurada (falta rodar o wizard até o fim com uma conta real) e o item "A interface existente diferencia..." continua em aberto, porque `/conexoes` ainda mostra a tela de indisponível no Workspace operacional.
- **Conta Unipile é infraestrutura descartável na pré-produção** ([ADR-0015](../../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o plano troca de conta Unipile pelo menos três vezes (teste grátis de 7 dias → conta paga de um sócio → conta oficial da empresa). Só os 3 segredos das Edge Functions mudam; nenhum Contato, Conta-alvo, Sequência ou Interação depende de qual conta está ativa. Rodar o wizard de novo a cada troca.

## Dependências externas

- Conta/aplicação Unipile v2, endpoint fixo (`api.unipile.com`) e chave de API de backend.
- Contas pessoais de teste conectadas pelos respectivos titulares.

