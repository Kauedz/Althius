# 16: Conectar e reconciliar Contas remetentes pela Unipile

**What to build:** titular conecta sua Conta remetente pessoal por Hosted Auth da Unipile, acompanha estado confirmado e consegue reconciliar, reconectar ou revogar a conexão.

**Blocked by:** 03: Convidar e gerenciar participantes.

**Status:** ready-for-agent

- [ ] OAuth/Hosted Auth começa por operação autenticada no backend que valida Workspace, membership e titular.
- [ ] Segredo Unipile não sai do backend; callbacks validam a conta retornada antes de persistir conexão.
- [ ] UI diferencia aguardando, conectando, pronta, reconciliação pendente, revogada e falha usando estado do provedor.
- [ ] Somente o titular acessa dados/credenciais privados; outros membros não tomam posse por papel administrativo.
- [ ] Reconexão, revogação e repetição de callbacks são idempotentes e auditadas.
- [ ] A conexão real e sua capacidade por canal são visíveis sem confundir demo com estado operacional.

