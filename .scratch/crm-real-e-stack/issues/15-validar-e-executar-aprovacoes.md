# 15: Aplicar Aprovações antes de ações externas

**What to build:** propostas de Agentes que exigem aprovação aparecem numa fila real; uma decisão autorizada controla se o backend executa exatamente a ação revisada.

**Blocked by:** 14: Executar Conversas e Coordenação com estado recuperável.

**Status:** ready-for-agent

- [ ] Proposta e Aprovação persistem com autor, Workspace, integração, ação, payload, estado e timestamp.
- [ ] Ações com permissão Propor aguardam aprovação; Executar segue as permissões específicas definidas sem contornar controles.
- [ ] Backend valida papel, membership, permissão e estado da Aprovação imediatamente antes de executar.
- [ ] Payload alterado materialmente invalida a decisão anterior e requer nova aprovação.
- [ ] Aprovar, recusar, cancelar, expirar e falhar são estados visíveis e auditáveis.
- [ ] Fila e detalhe reaproveitam a experiência atual e não exibem roteiros de demonstração no Workspace real.

