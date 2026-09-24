# 03: Conectar canais pessoais pela Unipile

**What to build:** permitir que cada usuário conecte suas próprias identidades de E-mail, WhatsApp e LinkedIn pela autenticação hospedada da Unipile v1, com estado real de sincronização, reconexão e desconexão. A Conta remetente pertence ao titular e nunca se torna uma conexão coletiva do Workspace.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** ready-for-agent

- [ ] O usuário autenticado inicia uma tentativa temporária de conexão vinculada ao seu usuário e Workspace, e o backend gera um link hospedado novo para cada tentativa.
- [ ] Callback, redirecionamento e ciclo de vida são validados no backend antes de associar a Conta remetente ao titular.
- [ ] A interface existente diferencia conectando, sincronizando, pronta, requer reconexão e desconectada.
- [ ] Apenas o titular pode consultar detalhes privados ou usar a Conta remetente; outro participante não consegue associá-la à própria Sequência.
- [ ] Credenciais e segredos da Unipile ficam somente no backend e não aparecem no bundle, logs compartilhados ou respostas públicas.
- [ ] Reconexão preserva a identidade do titular e não libera envios antes de reconciliar o período de indisponibilidade.
- [ ] A entrega usa contratos da Unipile v1 e não mistura autenticação ou payloads da v2 beta.

## Dependências externas

- Instância Unipile v1, endpoint e credencial de backend.
- Contas pessoais de teste conectadas pelos respectivos titulares.

