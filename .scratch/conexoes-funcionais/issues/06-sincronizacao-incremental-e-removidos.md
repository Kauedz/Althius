# 06: Sincronização incremental e o que some do HubSpot

**What to build:** depois da primeira Sincronização completa, as seguintes trazem só o que mudou no HubSpot desde a última, e sincronizar de novo sem mudanças não altera nada. Uma Company apagada ou mesclada no HubSpot deixa a Conta-alvo como está, com a Identidade externa marcada como removida; um Contact que perdeu a associação mantém o Vínculo. O cartão mostra quando foi a última Sincronização do Workspace e quem a pediu.

**Blocked by:** 05 (Sincronizar Contatos e Vínculos do HubSpot).

**Status:** wontfix (substituído pelo caminho genérico dos conectores, ver Comments)

- [ ] A Sincronização guarda a marca d'água da última modificação lida e a usa na seguinte.
- [ ] Duas Sincronizações seguidas sem mudanças no HubSpot terminam sem nenhuma Conta-alvo, Contato ou Vínculo alterado.
- [ ] Uma Company apagada ou mesclada não apaga a Conta-alvo; a Identidade externa fica marcada como removida. Numa mescla, a Company resultante reencontra a Conta-alvo pela URL.
- [ ] Um Contact sem a associação no HubSpot mantém o Vínculo. Nada é encerrado pela Sincronização.
- [ ] O cartão mostra a data da última Sincronização e quem a pediu.
- [ ] pgTAP cobre a marca d'água, a idempotência e a marca de removido; os testes do app cobrem a última Sincronização no cartão.

## Comments

- 2026-10-02: substituído pelo caminho genérico dos conectores ([ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md), [ADR-0022](../../../docs/adr/0022-permissao-por-ferramenta-do-conector.md) e [ADR-0023](../../../docs/adr/0023-envio-ao-crm-pelas-ferramentas-do-conector.md)). Os Agentes já leem o HubSpot (e qualquer CRM conectado) pelas ferramentas do próprio servidor MCP, com `usar_conector`, sem uma Sincronização com código específico do app. O Nan decidiu que os conectores funcionam como os do Claude ("não existe conector especial"), por isso a Sincronização dedicada fica fechada como `wontfix`. O texto original fica acima, como registro.
