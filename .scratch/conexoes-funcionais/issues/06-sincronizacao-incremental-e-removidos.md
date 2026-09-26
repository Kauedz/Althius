# 06: Sincronização incremental e o que some do HubSpot

**What to build:** depois da primeira Sincronização completa, as seguintes trazem só o que mudou no HubSpot desde a última, e sincronizar de novo sem mudanças não altera nada. Uma Company apagada ou mesclada no HubSpot deixa a Conta-alvo como está, com a Identidade externa marcada como removida; um Contact que perdeu a associação mantém o Vínculo. O cartão mostra quando foi a última Sincronização do Workspace e quem a pediu.

**Blocked by:** 05 (Sincronizar Contatos e Vínculos do HubSpot).

**Status:** ready-for-agent

- [ ] A Sincronização guarda a marca d'água da última modificação lida e a usa na seguinte.
- [ ] Duas Sincronizações seguidas sem mudanças no HubSpot terminam sem nenhuma Conta-alvo, Contato ou Vínculo alterado.
- [ ] Uma Company apagada ou mesclada não apaga a Conta-alvo; a Identidade externa fica marcada como removida. Numa mescla, a Company resultante reencontra a Conta-alvo pela URL.
- [ ] Um Contact sem a associação no HubSpot mantém o Vínculo. Nada é encerrado pela Sincronização.
- [ ] O cartão mostra a data da última Sincronização e quem a pediu.
- [ ] pgTAP cobre a marca d'água, a idempotência e a marca de removido; os testes do app cobrem a última Sincronização no cartão.
