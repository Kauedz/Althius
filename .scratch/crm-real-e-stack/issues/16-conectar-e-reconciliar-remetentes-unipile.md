# 16: Conectar e reconciliar Contas remetentes pela Unipile

> **Ponteiro — não implementar neste ticket.**
>
> **Implementado por canais-03 (Conectar canais pessoais pela Unipile).**
> Fonte de verdade: [`../../canais-cadencia-backend/issues/03-conectar-canais-pessoais-unipile.md`](../../canais-cadencia-backend/issues/03-conectar-canais-pessoais-unipile.md).
> Unipile e ciclos de canal ficam em `.scratch/canais-cadencia-backend/`; o CRM não reimplementa.
>
> Conteúdo histórico abaixo mantido só como referência.

---

**What to build:** titular conecta sua Conta remetente pessoal por Hosted Auth da Unipile, acompanha estado confirmado e consegue reconciliar, reconectar ou revogar a conexão.

**Blocked by:** 03: Convidar e gerenciar participantes.

**Status:** superseded

- [ ] OAuth/Hosted Auth começa por operação autenticada no backend que valida Workspace, Participação e titular.
- [ ] Segredo Unipile não sai do backend; callbacks validam a conta retornada antes de persistir conexão.
- [ ] UI diferencia aguardando, conectando, pronta, reconciliação pendente, revogada e falha usando estado do provedor.
- [ ] Somente o titular acessa dados/credenciais privados; outros membros não tomam posse por papel administrativo.
- [ ] Reconexão, revogação e repetição de callbacks são idempotentes e auditadas.
- [ ] A conexão real e sua capacidade por canal são visíveis sem confundir demo com estado operacional.

