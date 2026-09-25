# 03: Conectar canais pessoais pela Unipile

**What to build:** permitir que cada usuário conecte suas próprias identidades de E-mail, WhatsApp e LinkedIn pela autenticação hospedada da Unipile v1, com estado real de sincronização, reconexão e desconexão. A Conta remetente pertence ao titular e nunca se torna uma conexão coletiva do Workspace.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** in-progress

- [x] O usuário autenticado inicia uma tentativa temporária de conexão vinculada ao seu usuário e Workspace, e o backend gera um link hospedado novo para cada tentativa.
- [x] Callback e ciclo de vida são validados no backend antes de associar a Conta remetente ao titular; o redirecionamento serve apenas para retornar à tela e não prova a conexão.
- [ ] A interface existente diferencia conectando, sincronizando, pronta, requer reconexão e desconectada.
- [x] Apenas o titular pode consultar detalhes privados ou usar a Conta remetente; outro participante não consegue associá-la à própria Sequência.
- [x] Credenciais e segredos da Unipile ficam somente no backend e não aparecem no bundle, logs compartilhados ou respostas públicas.
- [ ] Reconexão preserva a identidade do titular e não libera envios antes de reconciliar o período de indisponibilidade.
- [x] A entrega usa contratos da Unipile v1 e não mistura autenticação ou payloads da v2 beta.

## Implementação local

- Migration: `supabase/migrations/20260925120000_contas_remetentes_unipile.sql`.
- Edge Functions: `sender-accounts`, `unipile-hosted-auth-notify` e `unipile-account-status`.
- Segredos e configuração Unipile: `supabase/functions/README.md`.
- A integração visual e os fluxos de reconciliação ficam pendentes da integração real de Supabase Auth do ticket 01, atualmente descrita como ainda não integrada à interface. A migration não foi aplicada no projeto remoto; Unipile e contas de teste não foram configurados.

## Dependências externas

- Instância Unipile v1, endpoint e credencial de backend.
- Contas pessoais de teste conectadas pelos respectivos titulares.

